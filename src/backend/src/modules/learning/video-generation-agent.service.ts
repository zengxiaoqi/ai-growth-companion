/**
 * VideoGenerationAgentService — bridges REST API endpoints to the video-generator agent.
 *
 * LessonVideoQueueService calls this service instead of directly invoking
 * HyperframesRenderService / RemotionRenderService. This service:
 * 1. Uses GenerateVideoContentTool for LLM storyboard generation
 * 2. Uses ReviewVideoContentTool for quality checks
 * 3. Falls back to legacy render services for actual rendering
 *
 * This keeps the REST API contract unchanged while routing through
 * the agent framework's tools.
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ToolRegistryService } from '../../agent-framework/tools/tool-registry.service';
import { AgentRegistryService } from '../../agent-framework/agents/agent-registry.service';
import { AgentExecutorService } from '../../agent-framework/agents/agent-executor.service';
import { SkillRegistryService } from '../../agent-framework/skills/skill-registry.service';
import type {
  AgentContext,
  AgentDefinition,
  LlmMessage,
  ToolExecutionContext,
} from '../../agent-framework/core';
import type { VideoStoryboard } from '../../agent-framework/tools/impl/generate-video-content';
import { videoGeneratorDefinition } from '../../agent-framework/agents/definitions/video-generator.agent';
import {
  VisualAssetService,
  type VisualAsset,
  type SceneVisualAssetPlan,
} from './visual-asset.service';
import { normalizeSceneGraph } from './video/scene-graph';
import { normalizeFigureSpec } from './video/figure-spec';
import {
  VERB_AS_MOTION,
  composePerformance,
  deriveInteractionFromText,
  hasAnyMotionCue,
  hasThreeMotionCue,
  normalizeSceneInteraction,
  normalizeScenePerformance,
  type InteractionVerb,
  type PuppetMotion,
  type SceneInteraction,
} from './video/scene-interaction';
import {
  MOTION_DEFAULTS,
  resolveAction3D,
  resolveActorRig,
  resolvePuppet,
  resolvePuppetSequence,
} from './video/action3d-registry';
import { STAGE_TEMPLATE_FILES } from './video/stage-template';
import {
  ageMotionProfile,
  beatWindows,
  enforceAgeProfile,
  sanitizeBeats,
  type Beat,
} from './video/choreography';
import {
  ANIMAL_SUBJECTS,
  ANIMAL_EMOJI_MAP,
  VECTOR_ANIMAL_IDS,
  getInlineSvgAssetKeys,
  inferAnimalFromText,
  findAnimalMentions,
} from './animal-subjects.config';
import {
  ACTION_KEYWORDS,
  HABITAT_KEYWORDS,
  ENVIRONMENT_TAG_KEYWORDS,
  matchKeyword,
} from './visual-keywords.config';

/**
 * 3D 舞台总开关。置 VIDEO_3D_STAGE=off 后，分镜不再挂 action3d，
 * 滑梯/拍球退回 ActionStage 的 2D 降级演出——线上出问题时的唯一回滚动作，
 * 不需要改代码或重部署。
 */
function is3dStageEnabled(): boolean {
  return String(process.env.VIDEO_3D_STAGE ?? 'on').trim().toLowerCase() !== 'off';
}

/**
 * 场景里点名的实物 → 别名。与矢量库 assets/vector 下的素材一一对应。 */
const SCENE_PROP_KEYWORDS: Record<string, string[]> = {
  ball: ['皮球', '足球', '球', 'ball'],
  cookie: ['饼干', 'cookie', '小饼干'],
  apple: ['苹果', 'apple'],
  banana: ['香蕉', 'banana'],
  book: ['书', '绘本', 'book'],
  block: ['积木', 'block'],
  table: ['桌子', '桌', 'table'],
  slide: ['滑梯', 'slide'],
  star: ['星星', 'star'],
  heart: ['爱心', 'heart'],
};
const SCENE_PROP_LABELS: Record<string, string> = {
  ball: '皮球',
  cookie: '饼干',
  apple: '苹果',
  banana: '香蕉',
  book: '书',
  block: '积木',
  table: '桌子',
  slide: '滑梯',
  star: '星星',
  heart: '爱心',
};

export interface AgentVideoRequest {
  topic: string;
  domain?: string;
  ageGroup?: '3-4' | '5-6';
  contentId: number;
  childId?: number;
  payload: Record<string, any>;
}

export interface AgentVideoResult {
  storyboard: VideoStoryboard | null;
  qualityScore: number;
  qualityPassed: boolean;
  issues: string[];
  toolCalls: Array<{ tool: string; args: Record<string, any>; result: string }>;
  agentFiles: Map<string, string>;
}

export type DynamicRemotionFile = {
  path: string;
  content: string;
};

export type DynamicRemotionSceneSummary = {
  title: string;
  generatedVisual: string;
  template?: string;
  assetProvider?: string;
  assetLicense?: string;
  assetQuality?: number;
  hasCharacterAsset?: boolean;
  characterProvider?: string;
  backgroundProvider?: string;
};

export type DynamicRemotionManifest = {
  compositionId: string;
  files: DynamicRemotionFile[];
  props: Record<string, any>;
  assets: VisualAsset[];
  durationFrames: number;
  sceneAssetSummary: DynamicRemotionSceneSummary[];
};

@Injectable()
export class VideoGenerationAgentService {
  private readonly logger = new Logger(VideoGenerationAgentService.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly executorService: AgentExecutorService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly visualAssetService: VisualAssetService,
  ) {}

  /**
   * Run the video-generator agent for a given topic and context.
   *
   * This executes the agent's tool-calling loop: the LLM decides which tools
   * to call (generateVideoContent, reviewVideoQuality, etc.) and in what order.
   */
  async generateViaAgent(request: AgentVideoRequest): Promise<AgentVideoResult> {
    const { topic, domain, ageGroup, contentId, childId, payload } = request;

    this.logger.log(
      `[generateViaAgent] Starting agent pipeline: topic="${topic}", domain=${domain || 'auto'}, ageGroup=${ageGroup || '5-6'}`,
    );

    const context = this.buildAgentContext(contentId, childId, ageGroup);
    const definition = videoGeneratorDefinition;
    const toolDefs = this.getFilteredToolDefinitions(definition);

    const userMessage = this.buildUserMessage(topic, domain, ageGroup, payload);

    const messages: LlmMessage[] = [{ role: 'user', content: userMessage }];

    const toolCalls: AgentVideoResult['toolCalls'] = [];

    const result = await this.executorService.runLoop(
      this.buildSystemPrompt(definition, context),
      messages,
      toolDefs,
      definition.maxIterations,
      context,
      (event) => {
        toolCalls.push({
          tool: event.toolName,
          args: event.args,
          result: event.result,
        });
        this.logger.log(`[generateViaAgent] Tool call: ${event.toolName} → ${event.result}`);
      },
      16384,
    );

    this.logger.log(
      `[generateViaAgent] Agent completed: ${toolCalls.length} tool calls, response length=${result.response.length}`,
    );

    const storyboard = this.extractStoryboard(toolCalls);
    const quality = this.extractQuality(toolCalls);
    const agentFiles = this.extractAgentFiles(toolCalls);

    return {
      storyboard,
      qualityScore: quality.score,
      qualityPassed: quality.passed,
      issues: quality.issues,
      toolCalls,
      agentFiles,
    };
  }

  /**
   * Build a per-task Remotion composition manifest from the final storyboard.
   *
   * The video-generator agent already receives the remotion-video-creation skill
   * in its prompt. This method turns the accepted storyboard into concrete
   * Remotion source files that follow those rules: frame-driven animation,
   * explicit sequences, inline SVG visuals, local static audio, and no runtime
   * filesystem/network/eval access.
   */
  async generateRemotionComposition(
    storyboard: VideoStoryboard,
    payload: Record<string, any> = {},
    agentFiles?: Map<string, string>,
  ): Promise<DynamicRemotionManifest> {
    const topic = this.toText(storyboard.topic || payload?.topic, 'lesson');
    const compositionId = `GeneratedLesson-${this.slugForComposition(topic)}`;
    const scenes = await this.buildDynamicSceneProps(storyboard, payload);
    const assets = this.collectManifestAssets(scenes);
    const durationFrames = Math.max(
      180,
      scenes.reduce((sum, scene) => sum + scene.durationFrames, 0),
    );

    const props = {
      title: this.toText(storyboard.title || payload?.title, topic),
      topic,
      domain: this.toText(storyboard.domain || payload?.domain, 'science'),
      durationFrames,
      scenes,
    };

    const agentLessonTsx = agentFiles?.get('GeneratedLesson.tsx');

    // 只走内置模板。模板是确定性组件：分层动画、字幕分页、舞台光都由帧驱动，
    // 同一主题每次产出稳定；画面风格由矢量素材库保证一致。
    // agent 现写 TSX 的路径已移除——两条并行代码路径会让校验、素材注入、
    // 版式修复都只能覆盖其中一条（此前 science 场景落到 emoji 兜底分支就是这么漏掉的）。
    if (agentLessonTsx) {
      this.logger.log(
        `[generateRemotionComposition] discarding agent-generated TSX (${agentLessonTsx.length} chars), built-in template is authoritative`,
      );
    }

    const files: DynamicRemotionFile[] = [
      {
        path: 'index.ts',
        content: [
          'import { registerRoot } from "remotion";',
          'import { RemotionRoot } from "./Root";',
          '',
          'registerRoot(RemotionRoot);',
          '',
        ].join('\n'),
      },
      {
        path: 'Root.tsx',
        content: this.buildGeneratedRootTsx(compositionId, durationFrames),
      },
      {
        path: 'GeneratedLesson.tsx',
        content: this.buildGeneratedLessonTsx(),
      },
      // 渲染层源码：姿态中枢 + 2D 角色 + 3D 舞台。
      // 单独成文件而不是塞进 GeneratedLesson 模板里：这几份是组件与运动学代码，
      // 混进模板串会让分镜层的改动极难定位。写入路径与源目录一致（character/、three/），
      // 相对 import 才能成立；任务目录在 src/video-remotion/.generated/ 下，
      // 因此能正常解析 remotion / three / @react-three/fiber / @remotion/three。
      ...STAGE_TEMPLATE_FILES,
    ];

    const sceneAssetSummary = scenes.map((scene) => ({
      title: scene.title,
      template: scene.template,
      generatedVisual: scene.generatedVisual,
      assetProvider: scene.visualAssets?.assetProvider,
      assetLicense: scene.visualAssets?.license,
      assetQuality: scene.visualAssets?.qualityScore,
      hasCharacterAsset: scene.visualAssets?.hasCharacterAsset,
      characterProvider: scene.visualAssets?.characterProvider,
      backgroundProvider: scene.visualAssets?.backgroundProvider,
    }));

    const manifest: DynamicRemotionManifest = {
      compositionId,
      files,
      props,
      assets,
      durationFrames,
      sceneAssetSummary,
    };

    this.validateGeneratedManifest(manifest, storyboard);
    this.logger.log(
      `[generateRemotionComposition] dynamic Remotion manifest ready: compositionId=${compositionId}, scenes=${scenes.length}, durationFrames=${durationFrames}, remotionSkillGuidance=${this.hasRemotionSkillGuidance() ? 'enabled' : 'missing'}, visuals=${sceneAssetSummary
        .map(
          (s) =>
            `${s.title}:${s.generatedVisual}:assetProvider=${s.assetProvider || 'svgFallback'}:characterProvider=${s.characterProvider || ''}:backgroundProvider=${s.backgroundProvider || ''}:license=${s.assetLicense || ''}:assetQuality=${s.assetQuality || 0}`,
        )
        .join(', ')}`,
    );
    return manifest;
  }


  /**
   * Step 1 only: Generate storyboard via LLM tool without running the full agent loop.
   * Use this when you only need the storyboard data but want the render service
   * to handle rendering independently.
   */
  async generateStoryboard(
    topic: string,
    domain?: string,
    ageGroup?: '3-4' | '5-6',
  ): Promise<VideoStoryboard | null> {
    this.logger.log(
      `[generateStoryboard] topic="${topic}", domain=${domain || 'auto'}, ageGroup=${ageGroup || '5-6'}`,
    );

    const tool = this.toolRegistry.get('generateVideoContent');
    if (!tool) {
      this.logger.warn('generateVideoContent tool not registered');
      return null;
    }

    const execContext: ToolExecutionContext = {
      ageGroup: ageGroup || '5-6',
      conversationId: `video-storyboard-${Date.now()}`,
      extra: {},
    };

    const result = await tool.execute(
      {
        topic,
        domain: domain || undefined,
        ageGroup: ageGroup || undefined,
        sceneCount: 5,
      },
      execContext,
    );

    if (!result.success || !result.data) {
      this.logger.warn(`[generateStoryboard] Tool failed: ${result.error || 'no data'}`);
      return null;
    }

    return result.data as VideoStoryboard;
  }

  /**
   * Generate a fallback storyboard using the video data tool directly (no agent loop).
   * Called when the full agent pipeline times out — provides a quick storyboard
   * so the engine renderers (especially dynamic-remotion) can still produce a video.
   */
  async generateFallbackStoryboard(
    topic: string,
    domain?: string,
    ageGroup?: string,
  ): Promise<VideoStoryboard | null> {
    const ageSanitized: '3-4' | '5-6' = ageGroup === '3-4' ? '3-4' : '5-6';
    try {
      if (typeof (this as any).generateVideoContentTool?.execute === 'function') {
        const result = await (this as any).generateVideoContentTool.execute(
          { topic, ageGroup: ageSanitized, slideCount: 5 },
          {} as any,
        );
        if (result?.data) {
          return result.data as VideoStoryboard;
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `[generateFallbackStoryboard] generateVideoContentTool failed: ${e.message}`,
      );
    }

    try {
      if (typeof (this as any).generateVideoDataTool?.execute === 'function') {
        const result = await (this as any).generateVideoDataTool.execute(
          { topic, ageGroup: ageSanitized, slideCount: 5 },
          {} as any,
        );
        if (result?.data?.slides) {
          const scenes = result.data.slides.map((slide: any, i: number) => ({
            sequence: i + 1,
            title: slide.title || `场景${i + 1}`,
            narration: slide.narration || `我们来学习${topic}的第${i + 1}个知识点`,
            onScreenText: slide.subtitle || slide.title || '',
            visualDescription: `${topic}场景：${slide.title || ''}，卡通教育风格`,
            durationSec: 6,
            accentColor: slide.accentColor || '#4D96FF',
            bgColor: slide.bgColor || '#EBF5FF',
          }));
          return {
            topic,
            title: result.data.title || `认识${topic}`,
            domain: domain || 'general',
            totalDurationSec: scenes.length * 6,
            sceneCount: scenes.length,
            scenes,
            visualTheme: {
              primaryPalette: '#4A90D9',
              accentColor: '#FF6B35',
              mood: 'playful' as const,
            },
            narrativeArc: `介绍和学习${topic}的相关知识`,
          };
        }
      }
    } catch (e: any) {
      this.logger.warn(`[generateFallbackStoryboard] generateVideoDataTool failed: ${e.message}`);
    }

    return null;
  }

  async reviewQuality(
    topic: string,
    scenes: Array<Record<string, any>>,
    ageGroup?: '3-4' | '5-6',
  ): Promise<{
    passed: boolean;
    score: number;
    issues: string[];
    suggestions: string[];
  } | null> {
    const tool = this.toolRegistry.get('reviewVideoQuality');
    if (!tool) {
      this.logger.warn('reviewVideoQuality tool not registered');
      return null;
    }

    const narrations = scenes.map((s) => s.narration || '').filter(Boolean);

    const execContext: ToolExecutionContext = {
      ageGroup: ageGroup || '5-6',
      conversationId: `video-review-${Date.now()}`,
      extra: {},
    };

    const result = await tool.execute(
      {
        topic,
        scenes,
        narrations,
        ageGroup: ageGroup || undefined,
      },
      execContext,
    );

    if (!result.success || !result.data) {
      this.logger.warn(`[reviewQuality] Tool failed: ${result.error || 'no data'}`);
      return null;
    }

    const data = result.data as any;
    return {
      passed: Boolean(data.passed),
      score: Number(data.score) || 0,
      issues: Array.isArray(data.issues) ? data.issues : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    };
  }

  private buildAgentContext(
    contentId: number,
    childId?: number,
    ageGroup?: '3-4' | '5-6',
  ): AgentContext {
    return {
      childId: childId ?? undefined,
      parentId: undefined,
      ageGroup: ageGroup || '5-6',
      conversationId: `video-gen-${contentId}-${Date.now()}`,
      messages: [],
      depth: 0,
      abortSignal: undefined,
      metadata: { contentId },
    };
  }

  private buildSystemPrompt(definition: AgentDefinition, context: AgentContext): string {
    let prompt = definition.buildSystemPrompt(context);
    prompt = this.injectSkills(prompt, definition.allowedSkills);
    return prompt;
  }

  private buildUserMessage(
    topic: string,
    domain?: string,
    ageGroup?: '3-4' | '5-6',
    payload?: Record<string, any>,
  ): string {
    const parts = [
      `请为以下主题生成教学视频：${topic}`,
      `领域：${domain || '自动检测'}`,
      `年龄段：${ageGroup || '5-6'}`,
    ];

    if (payload?.title) {
      parts.push(`课程标题：${payload.title}`);
    }
    if (payload?.summary) {
      parts.push(`课程概要：${payload.summary}`);
    }

    parts.push(
      '',
      '请按以下步骤执行：',
      '1. 调用 generateVideoContent 生成分镜脚本（场景、旁白、屏幕文字、画面主体）',
      '2. 调用 reviewVideoQuality 检查分镜质量',
      '3. 质量分低于 70 时，修改分镜文字后重新生成；不需要写任何代码',

      // 画面由内置模板 + 本地矢量素材库确定性渲染，模型只负责文字与结构。
      '画面由系统渲染，你不需要编写 React/TSX/SVG 代码，也没有相应工具。',

      '⚠️ 旁白里必须出现具体主体名词（老虎、苹果、小汽车、月亮……），素材库靠名词检索主体；',
      '只写「小动物」「这个东西」会导致检索落空，画面退回几何示意图。',
    );

    return parts.join('\n');
  }

  private truncateForPrompt(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
  }

  private injectSkills(systemPrompt: string, allowedSkills?: string[]): string {
    if (!allowedSkills || allowedSkills.length === 0) return systemPrompt;

    const skills = this.skillRegistry.getSkillsForAgent(allowedSkills);
    if (skills.length === 0) return systemPrompt;

    const index = skills
      .map((s) => {
        const d = s.definition;
        const vars = d.variables
          .filter((v) => v.required)
          .map((v) => v.name)
          .join(', ');
        return `- **${d.id}**: ${d.description}${vars ? ` (required: ${vars})` : ''}`;
      })
      .join('\n');

    this.logger.log(
      `[injectSkills] Injecting skill index: ${skills
        .map((skill) => `${skill.definition.id}@${skill.definition.sourceDir || 'unknown'}`)
        .join(', ')}`,
    );

    return `${systemPrompt}\n\n## Available Skills\n\nCall \`loadSkill\` with a skillId to get the full instructions when needed.\n\n${index}`;
  }

  private hasRemotionSkillGuidance(): boolean {
    const skill = this.skillRegistry.get?.('remotion-video-creation');
    if (!skill) return false;
    skill.ensureContentLoaded?.();
    const rules = skill.definition.rules || [];
    const searchable = `${skill.definition.body || ''}\n${rules
      .map((rule) => `${rule.name}\n${rule.content}`)
      .join('\n')}`;
    return searchable.includes('<Img') && searchable.includes('staticFile') && rules.length > 0;
  }

  private getFilteredToolDefinitions(definition: AgentDefinition): any[] | undefined {
    return this.toolRegistry.getToolDefinitions((tool: any) => {
      const { allowedTools, disallowedTools } = definition;
      if (allowedTools && allowedTools.length > 0 && !allowedTools.includes(tool.metadata.name))
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name)) return false;
      return true;
    });
  }

  /** 场景规范化 + 素材解析。dynamic-remotion 与 agent-remotion 共用，保证两引擎素材/图形口径一致。 */
  async buildDynamicSceneProps(
    storyboard: VideoStoryboard,
    payload: Record<string, any>,
  ): Promise<Array<Record<string, any>>> {
    const topic = this.toText(storyboard.topic || payload?.topic, 'lesson');
    const ageGroup = payload?.ageGroup === '3-4' ? '3-4' : '5-6';
    const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
    const sourceScenes =
      scenes.length > 0
        ? scenes
        : [
            {
              title: topic,
              narration: `Let's learn about ${topic}.`,
              visualDescription: topic,
              durationSec: 6,
            },
          ];

    /**
     * 整节课的场地：先算一次，再把同一份写进每一幕。
     *
     * 为什么在 lesson 层算：场地是"一个地方"，不是"每一幕的布景"。
     * 逐幕各推一次会出现"第 2 幕公园、第 3 幕森林"——孩子看到的不是转场而是
     * 瞬移；而滑梯这种大件只在需要它的两幕出现，也读不出"他爬的就是那座滑梯"。
     * 同一份 world 还意味着后续取景用同一个基准缩放，熊的大小不会逐幕变。
     */
    const lessonWorld = this.resolveLessonWorld(sourceScenes, topic);
    const builtScenes = sourceScenes.slice(0, 8).map((scene: any, index: number) => {
      const title = this.toText(
        scene?.title || scene?.scene || scene?.shot,
        `${topic} ${index + 1}`,
      ).slice(0, 32);
      const narration = this.toText(scene?.narration, title).slice(0, 260);
      const visualDescription = this.toText(
        scene?.visualDescription || scene?.imagePrompt || scene?.visualPrompt,
        `${topic} animated teaching scene`,
      );
      const onScreenText = this.toText(
        scene?.onScreenText || scene?.caption || scene?.concept,
        title,
      ).slice(0, 32);
      const durationSec = this.toInt(scene?.durationSec, 6, 4, 18);
      // 画面描述优先：旁白可能先提"兔兔"再讲"小熊把皮球递出去"，
      // 但这一幕真正要画的是视觉描述里的角色与物品。
      const source = `${topic} ${title} ${visualDescription} ${narration} ${onScreenText}`;
      const tags = this.inferDynamicAssetTags(source);
      const action = this.inferDynamicAction(source);
      const habitat = this.inferDynamicHabitat(source);
      const animalResult = inferAnimalFromText(source);
      const animalConfig = animalResult?.config ?? null;
      const assetKey = animalResult?.id || 'topic';
      // 台词/视觉描述里点名的实物（皮球、饼干…）也进画面，
      // 否则孩子听到"看看小熊手里的皮球"时画面只有一只动物站着。
      const props = this.inferSceneProps(`${visualDescription} ${narration} ${onScreenText}`);
      // 角色交互层：把"小熊把皮球递给小兔"这类关系变成结构化动作，
      // 让画面演出"谁对谁做什么"而不是只把角色和道具并排摆出来。
      // 分镜若已带 interaction（LLM 新输出）优先用校验后的版本，否则从文案确定性提取。
      // 旁白也要进角色识别：visualDescription 是英文（"a cheerful bear"），
      // 英文别名能认出角色但认不出"小熊乐乐"这种叫法；旁白才是孩子听到的名字，
      // 而且总结幕常常只有旁白提到角色（"小熊先玩滑梯，再拍皮球"）。
      const mentions = findAnimalMentions(`${visualDescription} ${narration} ${source}`);
      /**
       * 演出契约的读取顺序：performance（一幕多动作）→ interaction（兼容读）
       * → 文案确定性提取（旧分镜兜底）。
       *
       * 三级都不能省：performance 是新契约，模型可能整份写坏（动词不在白名单），
       * 这时必须退到 interaction 而不是直接掉到静态构图——退一步还有画面，
       * 全退就是白卡片。
       */
      const performance = normalizeScenePerformance(scene?.performance);
      const composed = performance ? composePerformance(performance) : null;
      const interaction =
        composed?.primary ||
        normalizeSceneInteraction(scene?.interaction) ||
        deriveInteractionFromText({
          visualDescription,
          narration,
          onScreenText,
          mentions,
          propIds: props.map((p) => p.id),
        });
      // 降级可观测。文案里明明在演一个动作，却没有 interaction 承载它——
      // 绝大多数是回顾/列举幕被主动拦掉（合理），剩下的是路由漏了（bug）。
      // 以前这类降级完全无声，只能靠人眼抽帧；整整两幕就是这样静默丢掉的。
      // 现在留一条 warn，跑完一遍日志就能看出"哪一幕该动却没动"。
      if (!interaction) {
        const cue = hasAnyMotionCue(`${visualDescription} ${narration}`);
        if (cue) {
          this.logger.warn(
            `[buildDynamicSceneProps] 场景${index + 1}「${title}」含动作线索 "${cue}" 但未产出 interaction，` +
              `该幕退回静态构图（回顾/列举幕可忽略，否则说明路由漏了）`,
          );
        }
      }
      // 写坏了与演不全，是两种不同的故障，分开记：
      //  - 整份 performance 不合法 → 契约/提示词问题，看这一条就知道模型写了什么；
      //  - 只是部分动作串不上 → 能力边界（多动作里有攀爬、双人动作），属正常取舍。
      if (scene?.performance && !performance) {
        this.logger.warn(
          `[buildDynamicSceneProps] 场景${index + 1}「${title}」的 performance 无可用动作，` +
            `已回落到 interaction/文案推导`,
        );
      }
      if (composed && composed.dropped.length) {
        this.logger.warn(
          `[buildDynamicSceneProps] 场景${index + 1}「${title}」的演出有 ${composed.dropped.length} 个动作` +
            `无法串演（${composed.dropped.join('/')}），只播「${composed.primary.verb}」及之前的地面动作`,
        );
      }
      const template =
        this.toText(scene?.animationTemplate?.id || scene?.animationTemplate) ||
        (assetKey !== 'topic'
          ? `science.animal-${action === 'rest' ? 'habitat' : 'abilities'}`
          : 'dynamic.story-scene');

      // 混色动画参数：storyboard 走 animationTemplate.params，course-pack 转来的
      // 分镜走 animationParams / visual.templateParams。三处都收，交给渲染模板
      // 画真实的「红+黄=橙」而不是通用单色同心圆。
      // 最后一档从 payload.watchScene 按场景索引兜底——agent 重写的 storyboard
      // 常常丢掉 params，但原始课程 JSON 里一定带着混色对。
      const payloadScene = Array.isArray(payload?.watchScene?.scenes)
        ? payload.watchScene.scenes[index]
        : undefined;
      const rawTemplateParams =
        (scene?.animationTemplate && typeof scene.animationTemplate === 'object'
          ? scene.animationTemplate.params
          : undefined) ||
        scene?.animationParams ||
        scene?.visual?.templateParams ||
        payloadScene?.visual?.templateParams ||
        payloadScene?.animationParams ||
        undefined;
      const mixPairs = this.normalizeMixPairs(rawTemplateParams);

      // QA 参数修复轮会往分镜写显式覆盖；旧分镜无这两个字段，推导行为不变
      const accentOverride =
        typeof scene?.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(scene.accentColor)
          ? scene.accentColor
          : null;
      const accentColor =
        accentOverride || animalConfig?.accentColor || this.resolveSceneAccent(tags, index);

      // 画板优先，且与关系图互斥：图形本身就是知识时，"节点+标签"是降级表达。
      // 校验不过就整份丢掉，退回关系图，绝不把脏几何带进渲染器。
      const figureResult = normalizeFigureSpec(scene?.figure, accentColor);
      const figure = figureResult.ok ? figureResult.spec : undefined;
      if (!figureResult.ok && scene?.figure) {
        this.recordFigureSignal(
          topic,
          scene,
          (figureResult as { reason?: string }).reason || 'invalid',
        );
      }

      // 未通过校验的图直接丢弃，模板会退回单主体路径，而不是带着脏数据渲染
      const sceneGraph = figure ? null : normalizeSceneGraph(scene?.sceneGraph);
      if (!figure && !sceneGraph) {
        this.recordGraphSignal(topic, scene, scene?.sceneGraph ? 'invalid' : 'missing');
      }

      // beats 是新增的编排层：只有分镜真的带了 beats 才启用解释器。
      // 旧分镜（无 beats 字段）走原路径，已缓存任务重渲逐像素不变——
      // 这也是"未改动场景零差异"回归的边界。
      const choreography =
        Array.isArray(scene?.beats) && scene.beats.length
          ? this.buildSceneChoreography(scene.beats, narration, durationSec, ageGroup, sceneGraph, figure)
          : undefined;

      // 三维动作：分镜只给"谁在什么道具上做什么"，坐标与资产在这里定死。
      // 解析失败（id 写错、动作与道具不匹配、场景太短）就整份丢掉，
      // 渲染层退回 2D 演出——绝不带着半截参数去建几何体。
      const action3d =
        interaction && is3dStageEnabled()
          ? resolveAction3D(interaction.action3d, {
              verb: interaction.verb,
              actorId: interaction.actors[0]?.id,
              propId: interaction.propId,
              sceneDurationFrames: Math.round(durationSec * 30),
            })
          : null;
      const { action3d: _declaredAction3d, ...interactionBase } = interaction ?? ({} as SceneInteraction);
      /**
       * 二维全身角色的动作。只在这一幕没有三维动作时才生成——3D 舞台能演连续接触，
       * 2D 演不了，两者同时存在时必须让 3D 赢，否则滑梯会被降级成"沿斜线平移"。
       *
       * 这是"能力匹配"的最小形态：不是按"哪个字段非空"级联，而是按
       * "这一幕的动作需求能不能被这个渲染器满足"来选。
       */
      /**
       * 二维全身角色的动作。两类来源：
       *  1) 文案里明确要求单人去哪（爬、走、入场）→ interaction.puppet
       *  2) 单人陈述幕：指着道具介绍、对着镜头讲。这类幕以前落进 ActionStage 的
       *     "大头像 + 一个小图标"分支——孩子看到的是一张会点头的贴图，不是
       *     一个正在做动作的角色。它们的动作需求只是"站着 + 一个手势"，2D 全身
       *     骨架完全能演，所以按"能力匹配"下沉到 Puppet2D。
       *
       * 多人交互（handover / lift-together）仍留在 ActionStage：那需要两个身体
       * 之间的接触关系，单角色骨架演不了——这才是真正的渲染器能力边界。
       */
      const singleActorGesture =
        interaction && !action3d && interaction.actors.length === 1
          ? (VERB_AS_MOTION[interaction.verb] ?? null)
          : null;
      /**
       * 一幕多动作：把可串演的地面动作按顺序分帧。
       *
       * 只在"确实有 2 个以上能演的动作"时才建序列，且 3D 幕不参与——
       * 序列播放器是 2D 骨架的播放表，3D 舞台有自己的连续轨迹（滑行/拍球），
       * 把两者混在一条时间线里会得到"滑到一半站起来再走"的空想动作。
       */
      const sequence =
        composed && !action3d && composed.motions.length > 1
          ? resolvePuppetSequence(composed.motions, {
              actorId: interaction?.actors[0]?.id,
              sceneDurationFrames: Math.round(durationSec * 30),
            })
          : null;
      /**
       * 双人幕：递给 / 一起抬。
       *
       * 这两种动词以前的归属是徽章分支（圆形头像 + 一条写死的屏幕弧线），
       * 于是同一节课里同一个角色在双人幕是头像、在单人幕是全身。人物语言不统一
       * 不是美术问题，是**渲染器只支持一个人**导致的：单角色骨架演不了"两个身体
       * 之间的接触"，那就把骨架扩成能演两个人，而不是给这两个动词另开一种画法。
       *
       * 两个人的动作都是 hold（双手在身前托着东西）：手的位置就是道具的挂点，
       * 于是"递到手里"和"两人一起托着"都落在同一套几何上，不需要额外的关键帧。
       */
      const duoPartner =
        !action3d &&
        interaction &&
        (interaction.verb === 'handover' || interaction.verb === 'lift-together') &&
        interaction.actors.length >= 2
          ? interaction.actors[1]
          : null;
      const duoMotion: PuppetMotion | null = duoPartner ? 'hold' : null;

      const puppetMotion: PuppetMotion | null =
        sequence?.[0]?.motion ?? interaction?.puppet?.motion ?? singleActorGesture ?? duoMotion;
      const puppet =
        !action3d && puppetMotion
          ? resolvePuppet(puppetMotion, {
              actorId: interaction?.puppet?.actorId || interaction?.actors[0]?.id,
              steps: interaction?.puppet?.steps,
              sceneDurationFrames: Math.round(durationSec * 30),
            })
          : null;
      /**
       * 串演幕的台词与道具挂在哪一节上，需要单独挑：
       * speech 取**最后一个**有台词的 action（说到最后一句时气泡里该是这句），
       * 道具取指向/举着那一步的 propId——主动作往往是"走过去"，没有道具，
       * 若沿用主动作的 propId，画面上就是"指着一片空白"。
       */
      const sequenceSpeech = sequence
        ? [...(performance?.actions ?? [])].reverse().find((a) => a.speech)?.speech
        : undefined;
      const sequencePropId = sequence
        ? (performance?.actions ?? []).find(
            (a) => a.propId && (a.verb === 'point' || a.verb === 'hold'),
          )?.propId
        : undefined;
      /**
       * 台词该在第几段出现（0..1）。
       * 多动作幕里气泡若从第一帧就挂着，"走过去→指一下→说话"的顺序在第一秒
       * 就被剧透了；按说话那一段的起点延迟出场，动作顺序才读得出来。
       */
      let speechAt: number | undefined;
      if (sequence && sequenceSpeech) {
        const actions = performance?.actions ?? [];
        let index = -1;
        for (let i = actions.length - 1; i >= 0; i -= 1) {
          if (actions[i].speech) {
            index = i;
            break;
          }
        }
        const total = sequence.reduce((sum, seg) => sum + seg.durationFrames, 0);
        if (index > 0 && index < sequence.length && total > 0) {
          const before = sequence
            .slice(0, index)
            .reduce((sum, seg) => sum + seg.durationFrames, 0);
          speechAt = before / total;
        }
      }
      const interactionForRender = interaction
        ? {
            ...interactionBase,
            ...(sequencePropId ? { propId: sequencePropId } : {}),
            ...(sequenceSpeech ? { speech: sequenceSpeech } : {}),
            ...(speechAt !== undefined ? { speechAt } : {}),
            ...(action3d
              ? { action3d: { ...action3d, rig: resolveActorRig(action3d.actorId) } }
              : {}),
            ...(puppet
              ? {
                  puppet: {
                    ...puppet,
                    ...(sequence ? { sequence } : {}),
                    rig: resolveActorRig(puppet.actorId),
                    ...(duoPartner
                      ? {
                          partner: {
                            motion: 'hold' as PuppetMotion,
                            actorId: duoPartner.id,
                            label: duoPartner.label,
                            rig: resolveActorRig(duoPartner.id),
                          },
                          /**
                           * 道具在哪只手里：递给=从主角色移到副角色；一起抬=停在两手之间。
                           * 只有真的给了道具才算——没有道具时"空手递出去"比徽章更糟。
                           */
                          ...(interaction.propId
                            ? {
                                carryBy:
                                  interaction.verb === 'handover' ? 'handover' : 'shared',
                              }
                            : {}),
                        }
                      : {}),
                  },
                }
              : {}),
          }
        : undefined;

      /**
       * 这一幕是不是在"用"场地里的滑梯（爬上去 / 滑下来 / 指着它）。
       *
       * 与 propId 的区别很重要：propId 让渲染层在角色旁边摆一个滑梯**图标**，
       * 而滑梯现在本来就在公园里。同一个画面里出现"真的滑梯 + 一个玩具图标"
       * 是最糟的叠加——所以用滑梯的幕只给 setpiece，不再给滑梯道具。
       */
      const usesSetpiece =
        !!interaction &&
        (interaction.verb === 'slide' ||
          interaction.propId === 'slide' ||
          interaction.action3d?.motion === 'slide' ||
          interaction.puppet?.motion === 'climb' ||
          (sequence ?? []).some((segment) => segment.motion === 'climb'));

      return {
        id: `scene-${index + 1}`,
        title,
        narration,
        onScreenText,
        visualDescription,
        assetKey,
        assetTags: tags,
        props,
        interaction: interactionForRender,
        action,
        habitat,
        /**
         * 场地：整节课同一份。渲染层用它算"基准缩放 + 镜头"，因此同一只熊
         * 在任何一幕里都是同一个大小，滑梯与熊的比例也只有一个。
         * 旧任务没有这个字段，渲染层会退回"按这一幕自己拟合"的老路径。
         */
        world: lessonWorld,
        ...(usesSetpiece ? { setpiece: 'slide' } : {}),
        // 画板是画面主体，背景必须退到幕后，否则图形和森林草地互相抢
        backgroundStyle: figure
          ? 'neutral'
          : ['environment', 'neutral', 'plain'].includes(scene?.backgroundStyle)
            ? scene.backgroundStyle
            : this.resolveBackgroundStyle({
                source,
                hasGraph: !!sceneGraph,
                hasAnimal: !!animalConfig,
              }),
        template,
        // 渲染模板据此选领域专用画板（art→混色动画），并拿到归一化后的混色对
        domain: this.toText(payload?.domain, '') || undefined,
        mixPairs,
        generatedVisual: animalConfig
          ? `${animalConfig.id}-${action}-${habitat}-${animalConfig.visualTerms.slice(0, 3).join('-')}`
          : `dynamic-${habitat}-${tags.slice(0, 4).join('-')}`,
        durationSec,
        durationFrames: durationSec * 30,
        accentColor,
        figure,
        sceneGraph: sceneGraph || undefined,
        choreography,
      };
    });

    if (!this.visualAssetService) {
      this.logger.warn('[buildDynamicSceneProps] visualAssetService 不可用，场景将没有素材解析');
      return builtScenes;
    }

    return Promise.all(
      builtScenes.map(async (scene) => {
        const [plan, graphIcons] = await Promise.all([
          this.visualAssetService!.resolveSceneVisualAssets(scene, topic),
          scene.sceneGraph
            ? this.visualAssetService!.resolveGraphIcons(scene.sceneGraph, topic)
            : Promise.resolve({} as Record<string, string>),
        ]);
        // 画板里的 subjectIcon 与关系图节点走同一条素材查找链（矢量库→生成层）
        if (scene.figure) {
          await this.visualAssetService!.resolveFigureIcons(scene.figure, topic);
        }
        return {
          ...scene,
          visualAssets: this.toSceneVisualAssets(plan),
          graphIcons,
        };
      }),
    );
  }

  /**
   * 把分镜 beats 编译成渲染层直接可解释的时间轴：每拍带上帧窗。
   * 时长分配与字幕同源（句字数比例），TTS 有词级时间戳后只需换这一处。
   */
  private buildSceneChoreography(
    rawBeats: unknown,
    narration: string,
    durationSec: number,
    ageGroup: '3-4' | '5-6',
    graph: ReturnType<typeof normalizeSceneGraph>,
    figure?: { labels?: Array<{ text: string }> },
  ) {
    const beats = sanitizeBeats(
      rawBeats,
      {
        narration,
        graph,
        figureLabels: (figure?.labels || []).map((l) => l.text).filter(Boolean),
      },
      ageGroup,
    );
    const profile = ageMotionProfile(ageGroup);
    const windows = enforceAgeProfile(beatWindows(beats, narration, durationSec), profile);
    return {
      profile,
      beats: windows.map((w) => {
        const startFrame = Math.round(w.startSec * 30);
        return {
          sentenceIndex: w.beat.sentenceIndex,
          ...(w.beat.span ? { span: w.beat.span } : {}),
          ...(w.beat.focus ? { focus: w.beat.focus } : {}),
          ...(w.beat.reveal?.length ? { reveal: w.beat.reveal } : {}),
          motion: w.beat.motion,
          ...(w.beat.params ? { params: w.beat.params } : {}),
          startFrame,
          endFrame: Math.max(startFrame + 1, Math.round(w.endSec * 30)),
        };
      }),
    };
  }

  /**
   * 画板被拒信号：LLM 给了 figure，但没过语法校验或几何校验。
   *
   * 和 recordGraphSignal 分开看：那条说明"关系语法不够用"，这条说明"画板要么
   * prompt 没讲清、要么几何阈值定得太死"。reason 决定下一步该改哪儿——
   * empty/coverage/no-main-shape 多半是 prompt 问题，off-center/label-cover 是
   * 模型的空间感问题，tiny-arc 是理解错了弧的尺度。
   */
  private recordFigureSignal(topic: string, scene: any, reason: string): void {
    const raw = scene?.figure;
    const line =
      JSON.stringify({
        at: new Date().toISOString(),
        topic,
        scene: this.toText(scene?.title, '').slice(0, 32),
        reason,
        shapeCount: Array.isArray(raw?.shapes) ? raw.shapes.length : 0,
        kinds: Array.isArray(raw?.shapes)
          ? Array.from(new Set(raw.shapes.map((s: any) => this.toText(s?.kind, '?')).filter(Boolean))).slice(0, 8)
          : [],
      }) + '\n';
    const file = path.resolve(__dirname, '../../../storage', 'storyboard-signals.jsonl');
    void fs
      .mkdir(path.dirname(file), { recursive: true })
      .then(() => fs.appendFile(file, line, 'utf-8'))
      .catch((error: any) => {
        this.logger.warn(`[figure-signal] 写入失败: ${error?.message || error}`);
      });
  }

  /**
   * 关系图退化信号：LLM 没给 sceneGraph，或给的图不合规被 normalizeSceneGraph 拒掉，
   * 这个场景就退回"单主体 + 讲解高亮"的老路径。
   *
   * 为什么要单独记：这是回答"六种关系够不够用"的唯一依据。miss 日志只说明素材缺，
   * 这里说明的是**语法缺**——如果 invalid 都集中在某一种 relation，说明该关系的节点
   * 约束设计得不合理；如果 missing 很多，说明 prompt 没被遵守。两条信号要分开看。
   */
  private recordGraphSignal(topic: string, scene: any, reason: 'missing' | 'invalid'): void {
    const raw = scene?.sceneGraph;
    const line =
      JSON.stringify({
        at: new Date().toISOString(),
        topic,
        scene: this.toText(scene?.title, '').slice(0, 32),
        reason,
        relation: typeof raw?.relation === 'string' ? raw.relation : null,
        nodeCount: Array.isArray(raw?.nodes) ? raw.nodes.length : 0,
      }) + '\n';
    const file = path.resolve(__dirname, '../../../storage', 'storyboard-signals.jsonl');
    void fs
      .mkdir(path.dirname(file), { recursive: true })
      .then(() => fs.appendFile(file, line, 'utf-8'))
      .catch((error: any) => {
        // 运营信号，写不进去不能拖垮出片
        this.logger.debug(`[recordGraphSignal] failed to append: ${error?.message || 'unknown'}`);
      });
  }

  private toSceneVisualAssets(plan: SceneVisualAssetPlan): Record<string, any> {
    return {
      characterAssetSrc: plan.mainCharacter?.staticPath,
      backgroundAssetSrc: plan.background?.staticPath,
      overlayAssetSrc: plan.overlays.map((asset) => asset.staticPath),
      assetProvider: plan.sourceProvider,
      license: plan.licenseInfo?.license,
      licenseUrl: plan.licenseInfo?.licenseUrl,
      creator: plan.licenseInfo?.creator,
      sourceUrl: plan.licenseInfo?.sourceUrl,
      landingUrl: plan.licenseInfo?.landingUrl,
      qualityScore: plan.qualityScore,
      hasCharacterAsset: Boolean(plan.mainCharacter?.staticPath),
      characterProvider: plan.mainCharacter?.provider,
      characterLicense: plan.mainCharacter?.license,
      backgroundProvider: plan.background?.provider,
      character: plan.mainCharacter,
      background: plan.background,
      overlays: plan.overlays,
    };
  }

  private collectManifestAssets(scenes: Array<Record<string, any>>): VisualAsset[] {
    const byPath = new Map<string, VisualAsset>();
    for (const scene of scenes) {
      const visualAssets = scene.visualAssets || {};
      const assets = [
        visualAssets.character,
        visualAssets.background,
        ...(Array.isArray(visualAssets.overlays) ? visualAssets.overlays : []),
      ].filter(Boolean) as VisualAsset[];
      for (const asset of assets) {
        if (asset.staticPath) byPath.set(asset.staticPath, asset);
      }
    }
    return Array.from(byPath.values());
  }

  private buildGeneratedRootTsx(compositionId: string, fallbackDurationFrames: number): string {
    return [
      'import React from "react";',
      'import { Composition } from "remotion";',
      'import { GeneratedLesson } from "./GeneratedLesson";',
      '',
      'export const RemotionRoot: React.FC = () => {',
      '  const defaultProps = { title: "", topic: "", scenes: [], durationFrames: ' +
        fallbackDurationFrames +
        ' };',
      '  return (',
      '    <Composition',
      `      id=${JSON.stringify(compositionId)}`,
      '      component={GeneratedLesson}',
      '      fps={30}',
      '      width={1920}',
      '      height={1080}',
      '      defaultProps={defaultProps}',
      '      calculateMetadata={({ props: currentProps }) => ({',
      '        durationInFrames: Number((currentProps as any).durationFrames) || defaultProps.durationFrames,',
      '        props: currentProps,',
      '      })}',
      '    />',
      '  );',
      '};',
      '',
    ].join('\n');
  }

  private buildGeneratedLessonTsx(): string {
    return String.raw`import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { ThreeActionStage } from "./three/ThreeActionStage";
import type { ThreeStageScene } from "./three/ThreeActionStage";
import { Puppet2D } from "./character/Puppet2D";
import { WorldLayer } from "./character/WorldLayer";
import { cameraForWorld, normalizeWorld } from "./character/world";
import type { MotionOp } from "./character/pose";
import { portraitFraming, propSlot } from "./character/stage-layout";

const ANIMAL_EMOJI_MAP: Record<string, string> = ${JSON.stringify(ANIMAL_EMOJI_MAP)};
const VECTOR_ANIMAL_IDS: string[] = ${JSON.stringify(VECTOR_ANIMAL_IDS)};
const PROP_LABELS: Record<string, string> = ${JSON.stringify(SCENE_PROP_LABELS)};

/**
 * 编排时间轴（后端 choreography.ts 编译产物）。
 * 每拍 = 旁白的一句（或合并的几句），带帧窗、焦点、揭示元素和动效预设。
 * 场景没有这份数据时，所有解释器返回 null，渲染走原路径——旧分镜像素级不变。
 */
type BeatView = {
  sentenceIndex: number;
  span?: number;
  focus?: string;
  reveal?: string[];
  motion: string;
  params?: Record<string, any>;
  startFrame: number;
  endFrame: number;
};

type ChoreographyView = {
  profile: { minBeatSec: number; amplitude: number; allowOverlapReveal: boolean; minCharsPerBeat: number };
  beats: BeatView[];
};

/**
 * 角色交互（后端 scene-interaction.ts 的渲染端镜像）。
 * verb 决定布局与动作：handover=递给、lift-together=一起抬、speak=说话气泡、
 * point=指向、hold=手持。演员与道具是开放数据，坐标由下面的布局函数确定。
 */
type InteractionActorView = { id: string; label: string; role: string };
/**
 * 三维动作视图（后端 action3d-registry.ts 的解析产物）。
 * 这里的每个数字都已经在后端定死：渲染层不做任何"再猜一次"的计算，
 * 保证同一份分镜在任何渲染批次里都得到同一画面。
 */
type Action3DView = {
  renderer: "3d-procedural" | "3d-glb";
  // 同理，从渲染层类型取，避免再出现"这里加了动作、那份联合没跟上"
  motion: ThreeStageScene["motion"];
  actorId: string;
  propId?: string;
  start: [number, number, number];
  end: [number, number, number];
  bounce?: { periodFrames: number; height: number };
  ballRestY?: number;
  durationFrames: number;
  contactFrame?: number;
  rig: {
    fur: string;
    belly: string;
    ears: "round" | "long" | "pointy" | "flap" | "none";
    tail: "stub" | "long" | "bushy";
    scale: number;
  };
};
/**
 * 二维全身角色的动作视图（后端 action3d-registry.ts 的 resolvePuppet 产物）。
 * 与 Action3DView 一样，坐标与帧数已在后端定死，渲染层只按帧取姿态。
 */
type PuppetView = {
  /**
   * 不要在这里手抄一份原语清单。
   *
   * 这里原本写着 "idle" | "speak" | "walk" | "enter" | "climb" | "cheer" | "sit"，
   * 后来 pose.ts 加了 point，这份手抄的联合忘了跟，于是生成出来的
   * GeneratedLesson.tsx 里 motion === "point" 直接是 TS2367（两个类型无交集），
   * 静态检查失败 → 整个 dynamic-remotion 引擎放弃 → 回退到 agent 引擎重建 →
   * 卡在 LLM 上 300 秒超时。一个漏抄的联合类型，最后表现为"出片卡死"。
   * 直接引用姿态中枢的类型，让编译器去保证一致。
   *
   * 注意：这段代码在模板字符串里，注释中不能出现反引号。
   */
  motion: MotionOp;
  actorId: string;
  start?: [number, number, number];
  end?: [number, number, number];
  steps?: number;
  durationFrames: number;
  rig: Action3DView["rig"];
  /**
   * 一幕多动作的播放表（按顺序）。仅当地面动作能串演时才存在，
   * 长度大于 1 时 Puppet2D 按它分段取姿态；缺省时仍按 motion 单动作播放。
   */
  sequence?: Array<{
    motion: MotionOp;
    durationFrames: number;
    start?: [number, number, number];
    end?: [number, number, number];
    steps?: number;
  }>;
};
type SceneInteractionView = {
  verb: string;
  actors: InteractionActorView[];
  propId?: string;
  speech?: string;
  /** 台词气泡的出场时刻（0..1 场景进度）；缺省从第一帧就显示 */
  speechAt?: number;
  caption?: string;
  /** 有它就按三维动作演出（三个条件同时满足：动作受支持、资源已登记、开关开启） */
  action3d?: Action3DView;
  /** 二维全身角色动作（爬/走/入场）。与 action3d 互斥，action3d 优先 */
  puppet?: PuppetView;
};

type GeneratedScene = {
  id: string;
  title: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  assetKey: string;
  assetTags: string[];
  props?: Array<{ id: string; label: string }>;
  /** 角色间的结构化动作关系；有它就按关系演出画面，见 scene-interaction.ts */
  interaction?: SceneInteractionView;
  action: string;
  habitat: string;
  /**
   * 场地：整节课同一份（venue + 滑梯的世界坐标）。
   * 渲染层据此算一次基准缩放、按幕只做变焦与平移，所以"熊与滑梯的比例"
   * 在每一幕都一样。旧分镜没有这个字段，渲染层退回按幕拟合的老路径。
   */
  world?: { venue: string; slide?: { start: number[]; end: number[] } };
  /**
   * 这一幕用到的世界装置（目前只有 "slide"）。它让渲染层把整座滑梯框进画面，
   * 并且**不再摆一个滑梯图标**——滑梯本来就在公园里，图标是重复的。
   */
  setpiece?: string;
  /**
   * 背景档位。background 决定画面"在哪里发生"，不决定"讲什么"：
   * environment=真实世界场景（动物/植物/自然），配森林、草原、河岸；
   * neutral=抽象内容（数数、时间、关系图、分类），只给柔和渐变，不放树和太阳；
   * plain=极简纯色。全都套森林背景是早期"只服务动物课"留下的坏习惯。
   */
  backgroundStyle?: 'environment' | 'neutral' | 'plain';
  generatedVisual: string;
  durationFrames: number;
  accentColor: string;
  domain?: string;
  /** 归一化后的混色对 [{ a, b, result, aName, bName, resultName }]，仅 art.color-mixing 场景有 */
  mixPairs?: Array<{ a: string; b: string; result: string; aName: string; bName: string; resultName: string }>;
  visualAssets?: {
    characterAssetSrc?: string;
    backgroundAssetSrc?: string;
    overlayAssetSrc?: string[];
    assetProvider?: string;
    license?: string;
    qualityScore?: number;
    hasCharacterAsset?: boolean;
    characterProvider?: string;
    characterLicense?: string;
  };
  sceneGraph?: { relation: string; caption?: string; nodes: GraphNodeView[] };
  /** 受控画板：图形本身就是知识时走这条（彩虹、太阳系、光路），与 sceneGraph 互斥 */
  figure?: FigureView;
  graphIcons?: Record<string, string>;
  audioSrc?: string;
  /**
   * 逐字时间轴：由后端用 TTS 词边界算好（每屏的 token 与"第几帧点亮"，场景内相对帧）。
   * 有它就按真实发音点亮；没有就回退按屏长均分估算（旧行为）。
   */
  subtitlePages?: { tokens: string[]; starts: number[] }[];
  /**
   * 语义动作的时间窗：节点 id → { start, end }（场景内相对帧）。
   * 后端按"这个名字在第几帧被念到、那句话到哪帧说完"算好，让"水汽上升"只在
   * 旁白讲水汽那一段发生，而不是从入场均摊到整屏结束。
   * 没有（无配音/词没命中）的节点回退 storyProgress，行为与旧版一致。
   */
  actionAnchors?: Record<string, { start: number; end: number }>;
  /**
   * 探针用开关：false = 忽略 actionAnchors 与光点挂词，回到整屏时钟驱动，供 A/B 对拍。
   * 光点另有独立开关（flowAnchors），这样才能把"节点动作挂词"和"光点挂词"分开量化，
   * 否则一次 A/B 里两件事一起变，无法判断是哪一件起了作用。
   */
  anchorSigns?: boolean;
  /** 探针用开关：false = 光点回退整屏时钟（节点动作仍挂词），用于单独量化光点挂词的效果 */
  flowAnchors?: boolean;
  choreography?: ChoreographyView;
};

type GeneratedLessonProps = {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
};

const sceneStarts = (scenes: GeneratedScene[]) => {
  let cursor = 0;
  return scenes.map((scene) => {
    const start = cursor;
    cursor += Math.max(90, scene.durationFrames || 180);
    return start;
  });
};

const SceneBackground: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const style = scene.backgroundStyle || "environment";
  const accent = scene.accentColor || "#4d96ff";
  const habitat = scene.habitat || "forest";
  const night = habitat === "night";
  const river = habitat === "river" || (scene.assetTags || []).includes("river");
  const meadow = habitat === "grassland";
  const sky = night ? "#13233f" : meadow ? "#bfeaff" : "#a7e8ff";
  // 夜晚的地面要跟着暗下去，否则白天草地直接铺在夜空下面
  const groundGrass = night ? "#2c4636" : meadow ? "#8ed47a" : "#69b66d";
  const ground = river ? (night ? "#1d3f56" : "#5bc0de") : groundGrass;
  const sunPulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.94, 1.06]);
  const sceneDur = Math.max(90, scene.durationFrames || 180);
  const travel = interpolate(frame, [0, sceneDur], [0, 1], { extrapolateRight: "clamp" });
  const bgDrift = interpolate(travel, [0, 1], [-26, 26]);
  const treeDrift = interpolate(travel, [0, 1], [34, -34]);
  const cloudDrift = interpolate(travel, [0, 1], [-58, 58]);
  const breeze = Math.sin(frame / 26) * 5;

  /**
   * 中性背景：抽象内容不发生在任何"地方"，所以不放树、不放太阳、不放地平线。
   * 只留一层跟着主题色走的柔光，再加一层按关系走的水印纹样——
   * 否则 8 个场景全是同一张白底，等于把"一排树"换成了"一块白"。
   */
  if (style === "neutral") {
    const sway = Math.sin(frame / 110) * 28;
    const relation = (scene.sceneGraph && scene.sceneGraph.relation) || "";
    return (
      <AbsoluteFill style={{ backgroundColor: "#fcfeff", overflow: "hidden" }}>
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id={"glow-" + scene.id} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <pattern id={"dots-" + scene.id} width="64" height="64" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="2.4" fill={accent} opacity="0.10" />
            </pattern>
          </defs>
          <rect width="1920" height="1080" fill={"url(#dots-" + scene.id + ")"} />
          <circle cx={360 + sway} cy={250} r="450" fill={"url(#glow-" + scene.id + ")"} />
          <circle cx={1630 - sway} cy={810} r="510" fill={"url(#glow-" + scene.id + ")"} />
          {/* 关系水印：极淡，只作为"这一屏讲的是哪种结构"的底噪 */}
          <g fill="none" stroke={accent} strokeWidth="2.5" opacity="0.13">
            {relation === "cycle"
              ? [430, 610, 790].map((r, i) => (
                  <circle key={"w" + i} cx={960} cy={512} r={r} strokeDasharray={i === 1 ? "10 16" : "none"} />
                ))
              : null}
            {relation === "chain"
              ? [0, 1, 2, 3, 4].map((i) => (
                  <line key={"w" + i} x1={140} y1={300 + i * 130} x2={1780} y2={300 + i * 130} strokeDasharray="14 22" />
                ))
              : null}
            {relation === "growth"
              ? [0, 1, 2, 3].map((i) => (
                  <circle key={"w" + i} cx={300 + i * 440} cy={700 - i * 126} r={110 + i * 34} strokeDasharray="12 18" />
                ))
              : null}
            {relation === "compare"
              ? [0, 1].map((i) => (
                  <g key={"w" + i}>
                    <line x1={960} y1={120} x2={960} y2={980} strokeDasharray="16 20" />
                    <circle cx={i === 0 ? 480 : 1440} cy={520} r="330" strokeDasharray="10 18" />
                  </g>
                ))
              : null}
            {relation === "group"
              ? [0, 1, 2, 3, 4, 5].map((i) => (
                  <line key={"w" + i} x1={160 + i * 320} y1={140} x2={160 + i * 320} y2={950} strokeDasharray="8 24" />
                ))
              : null}
            {relation === "split"
              ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return (
                    <line
                      key={"w" + i}
                      x1={960 + Math.cos(a) * 180}
                      y1={520 + Math.sin(a) * 180}
                      x2={960 + Math.cos(a) * 620}
                      y2={520 + Math.sin(a) * 620}
                      strokeDasharray="12 20"
                    />
                  );
                })
              : null}
          </g>
        </svg>
      </AbsoluteFill>
    );
  }

  if (style === "plain") {
    return <AbsoluteFill style={{ backgroundColor: "#ffffff" }} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: sky, overflow: "hidden" }}>
      {scene.visualAssets?.backgroundAssetSrc ? (
        <>
          <Img
            src={staticFile(scene.visualAssets.backgroundAssetSrc)}
            style={{
              position: "absolute",
              inset: -28,
              width: 2004,
              height: 1164,
              objectFit: "cover",
              transform: "translateX(" + bgDrift + "px) scale(1.04)",
              opacity: 0.98,
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: night ? "rgba(7, 18, 42, 0.26)" : "rgba(222, 255, 239, 0.14)" }} />
        </>
      ) : null}
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={"sky-" + scene.id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={night ? "#101b36" : "#82ddff"} />
            <stop offset="100%" stopColor={night ? "#24385e" : "#d8f8ff"} />
          </linearGradient>
          <linearGradient id={"water-" + scene.id} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22b8cf" />
            <stop offset="100%" stopColor="#74d9ff" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill={"url(#sky-" + scene.id + ")"} opacity={scene.visualAssets?.backgroundAssetSrc ? 0.22 : 1} />
        {night ? (
          Array.from({ length: 26 }).map((_, i) => (
            <circle key={i} cx={80 + i * 72} cy={44 + (i % 6) * 42} r={2 + (i % 3)} fill="#fff7b8" opacity={0.45 + (i % 4) * 0.1} />
          ))
        ) : (
          <g transform={"translate(1620 138) scale(" + sunPulse + ")"}>
            <circle r="69" fill="#ffd166" />
            <circle r="93" fill="#ffd166" opacity="0.2" />
          </g>
        )}
        {/* 夜晚用远山剪影代替太阳，画面才不会所有场景都是同一张白天 */}
        {night ? (
          <path d="M0 742 L250 566 L430 700 L650 512 L880 726 L1140 566 L1390 742 L1640 604 L1920 760 L1920 1080 L0 1080 Z" fill="#0d1a33" opacity="0.85" />
        ) : null}
        <path d="M0 780 C270 705 495 840 780 765 C1110 675 1380 848 1920 750 L1920 1080 L0 1080 Z" fill={ground} />
        {river && <path d="M0 915 C345 840 540 990 855 915 C1230 825 1470 975 1920 885 L1920 1080 L0 1080 Z" fill={"url(#water-" + scene.id + ")"} opacity="0.95" />}
        {[0, 1].map((i) => (
          <g
            key={"cloud" + i}
            transform={
              "translate(" +
              (cloudDrift * (i === 0 ? 1 : -0.7) + i * 640 - 130) +
              " " +
              (128 + i * 104 + Math.sin(frame / 34 + i) * 9) +
              ")"
            }
            opacity={night ? 0.09 : 0.74}
          >
            <ellipse cx="0" cy="0" rx="96" ry="42" fill="#ffffff" />
            <ellipse cx="58" cy="10" rx="66" ry="34" fill="#ffffff" />
            <ellipse cx="-62" cy="14" rx="58" ry="30" fill="#ffffff" />
          </g>
        ))}
        {/*
          植被按栖息地分开画。以前不分青红皂白排一排树，讲河边也长树、讲深夜也长树，
          结果所有课程共用同一条样板街。现在只有森林才长树：
          草原是草丘和野花，河岸是芦苇和波纹，夜晚是远山。
        */}
        {meadow ? (
          <g transform={"translate(" + (treeDrift + breeze) + " 0)"}>
            {Array.from({ length: 7 }).map((_, i) => {
              const x = -60 + i * 300;
              const h = 96 + (i % 3) * 34;
              return (
                <g key={"hill" + i}>
                  <ellipse cx={x} cy={806} rx={210} ry={h} fill={i % 2 ? "#7cc96a" : "#8fd47b"} />
                  {[0, 1, 2].map((k) => (
                    <g key={k} transform={"translate(" + (x - 70 + k * 68) + " " + (748 - (k % 2) * 22) + ")"}>
                      <rect x="-2" y="0" width="4" height="26" rx="2" fill="#4f9e42" />
                      <circle cx="0" cy="-4" r="9" fill={k % 2 ? "#ffd43b" : "#ff9ec4"} />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        ) : null}
        {river ? (
          <g transform={"translate(" + (treeDrift + breeze) + " 0)"}>
            {Array.from({ length: 14 }).map((_, i) => {
              const x = -40 + i * 148;
              const h = 130 + (i % 4) * 46;
              const lean = Math.sin(frame / 30 + i) * 4;
              return (
                <g key={"reed" + i} transform={"translate(" + x + " " + (900 - h) + ")"}>
                  <path
                    d={"M 0 " + h + " Q " + lean + " " + h * 0.55 + " " + lean * 2 + " 0"}
                    fill="none"
                    stroke="#3f8f4f"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                  <ellipse cx={lean * 2} cy="-6" rx="9" ry="24" fill="#7b4b2a" />
                </g>
              );
            })}
          </g>
        ) : null}
        {!meadow && !river && !night ? (
          <g transform={"translate(" + (treeDrift + breeze) + " 0)"}>
            {Array.from({ length: 11 }).map((_, i) => {
              const x = -80 + i * 192;
              const h = 150 + (i % 3) * 42;
              return (
                <g key={i} transform={"translate(" + x + " " + (780 - h) + ")"}>
                  <rect x="25" y={h - 28} width="22" height="74" rx="8" fill="#7b4f28" />
                  <circle cx="36" cy={h - 58} r="48" fill={i % 2 ? "#2f9e44" : "#37b24d"} />
                  <circle cx="10" cy={h - 36} r="34" fill="#51cf66" opacity="0.9" />
                  <circle cx="62" cy={h - 32} r="34" fill="#2b8a3e" opacity="0.9" />
                </g>
              );
            })}
          </g>
        ) : null}
        {Array.from({ length: 12 }).map((_, i) => {
          const fx = 90 + i * 156 + Math.sin(frame / 40 + i) * 26;
          const fy = 300 + ((i * 137) % 520) + Math.cos(frame / 32 + i * 1.7) * 18;
          const fo = 0.12 + (i % 4) * 0.06 + Math.sin(frame / 22 + i) * 0.06;
          return (
            <circle
              key={"spark" + i}
              cx={fx}
              cy={fy}
              r={3 + (i % 3) * 2.5}
              fill={night ? "#cfe6ff" : "#ffffff"}
              opacity={fo}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

const TigerSvg: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const run = scene.action === "run";
  const swim = scene.action === "swim";
  const roar = scene.action === "roar";
  const bob = interpolate(Math.sin(frame / (run ? 5 : 12)), [-1, 1], [-10, 10]);
  const leg = interpolate(Math.sin(frame / 4), [-1, 1], [-18, 18]);
  const mouth = roar ? interpolate(Math.sin(frame / 5), [-1, 1], [5, 18]) : 6;

  return (
    <svg width="520" height="350" viewBox="0 0 520 350" style={{ overflow: "visible" }}>
      <g transform={"translate(0 " + bob + ")"}>
        {swim && (
          <g opacity="0.75">
            <path d="M15 265 C90 230 160 300 235 260 C320 218 410 296 500 252" fill="none" stroke="#35c2f0" strokeWidth="18" strokeLinecap="round" />
            <path d="M25 300 C120 270 195 325 280 292 C365 260 430 315 505 285" fill="none" stroke="#95e8ff" strokeWidth="10" strokeLinecap="round" />
          </g>
        )}
        <ellipse cx="260" cy="178" rx="150" ry="78" fill="#f08c00" />
        <ellipse cx="260" cy="202" rx="118" ry="46" fill="#ffd08a" opacity="0.95" />
        <path d="M118 168 C56 124 45 80 78 60 C126 82 146 116 152 158" fill="#f08c00" stroke="#8a4b08" strokeWidth="7" />
        <path d="M395 152 C472 117 493 70 462 49 C413 78 392 111 382 154" fill="#f08c00" stroke="#8a4b08" strokeWidth="7" />
        {[150, 188, 226, 268, 310, 352].map((x, i) => (
          <path key={i} d={"M" + x + " 104 L" + (x - 18) + " 176 L" + (x + 8) + " 246"} fill="none" stroke="#1f1308" strokeWidth="11" strokeLinecap="round" opacity="0.9" />
        ))}
        <g transform="translate(102 62)">
          <circle cx="120" cy="82" r="78" fill="#f08c00" stroke="#8a4b08" strokeWidth="7" />
          <circle cx="68" cy="18" r="30" fill="#f08c00" stroke="#8a4b08" strokeWidth="6" />
          <circle cx="172" cy="18" r="30" fill="#f08c00" stroke="#8a4b08" strokeWidth="6" />
          <circle cx="92" cy="76" r="9" fill="#111" />
          <circle cx="148" cy="76" r="9" fill="#111" />
          <ellipse cx="120" cy="108" rx="28" ry={mouth} fill={roar ? "#5c1a12" : "#2b1608"} />
          <path d="M120 88 L108 104 L132 104 Z" fill="#25150b" />
          <path d="M82 38 L102 58 M118 25 L118 58 M158 38 L138 58" stroke="#111" strokeWidth="8" strokeLinecap="round" />
          <path d="M54 96 C20 88 18 75 51 68 M186 96 C220 88 222 75 189 68" stroke="#111" strokeWidth="3" fill="none" />
        </g>
        <g stroke="#8a4b08" strokeWidth="10" strokeLinecap="round">
          <line x1="175" y1="235" x2={165 - leg} y2="305" />
          <line x1="245" y1="242" x2={252 + leg} y2="312" />
          <line x1="322" y1="240" x2={312 - leg} y2="310" />
          <line x1="385" y1="225" x2={395 + leg} y2="295" />
        </g>
      </g>
      {roar && (
        <g fill="none" stroke="#ff922b" strokeWidth="8" strokeLinecap="round" opacity="0.8">
          <path d="M405 88 C470 55 490 55 520 70" />
          <path d="M410 122 C470 112 495 118 522 140" />
        </g>
      )}
    </svg>
  );
};

const RabbitSvg: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const jump = scene.action === "jump" || scene.action === "run";
  const eat = scene.action === "eat";
  const bob = interpolate(Math.sin(frame / (jump ? 5 : 13)), [-1, 1], [-14, 10]);
  const ear = interpolate(Math.sin(frame / 9), [-1, 1], [-5, 5]);
  const chew = eat ? interpolate(Math.sin(frame / 4), [-1, 1], [0, 8]) : 0;

  return (
    <svg width="540" height="360" viewBox="0 0 540 360" style={{ overflow: "visible" }}>
      <g transform={"translate(0 " + bob + ")"}>
        <ellipse cx="284" cy="224" rx="138" ry="72" fill="#f4f0e8" stroke="#b8ada2" strokeWidth="7" />
        <ellipse cx="190" cy="178" rx="78" ry="66" fill="#f7f3ec" stroke="#b8ada2" strokeWidth="7" />
        <g transform={"translate(" + ear + " 0)"}>
          <path d="M154 128 C112 42 126 8 162 14 C194 56 198 96 182 142" fill="#f7f3ec" stroke="#b8ada2" strokeWidth="7" />
          <path d="M194 126 C180 32 204 5 238 22 C252 76 244 112 218 148" fill="#f7f3ec" stroke="#b8ada2" strokeWidth="7" />
          <path d="M158 108 C136 52 145 34 163 36 C178 66 178 94 168 120" fill="#ffd6e0" opacity="0.9" />
          <path d="M204 108 C198 52 211 36 227 43 C231 76 224 98 212 120" fill="#ffd6e0" opacity="0.9" />
        </g>
        <circle cx="165" cy="170" r="8" fill="#3b2f2f" />
        <circle cx="215" cy="168" r="8" fill="#3b2f2f" />
        <ellipse cx="190" cy="192" rx="12" ry="8" fill="#ee8faa" />
        <path d={"M190 200 C180 " + (210 + chew) + " 168 208 154 204 M190 200 C202 " + (210 + chew) + " 214 208 226 204"} stroke="#6d5550" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="420" cy="210" r="30" fill="#fffaf2" stroke="#b8ada2" strokeWidth="6" />
        <g stroke="#b8ada2" strokeWidth="11" strokeLinecap="round">
          <line x1="242" y1="276" x2="210" y2={326 + (jump ? bob : 0)} />
          <line x1="324" y1="282" x2="372" y2={330 - (jump ? bob : 0)} />
        </g>
        {eat ? (
          <g transform="translate(92 226) rotate(-12)">
            <path d="M0 22 C42 0 88 2 128 18 C91 42 44 48 0 22 Z" fill="#ff922b" stroke="#c75b12" strokeWidth="5" />
            <path d="M119 16 C146 2 162 6 175 22 C150 31 133 30 119 16 Z" fill="#51cf66" />
          </g>
        ) : null}
      </g>
    </svg>
  );
};

const MonkeySvg: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const jump = scene.action === "jump" || scene.action === "run";
  const eat = scene.action === "eat";
  const climb = scene.action === "climb";
  const bob = interpolate(Math.sin(frame / (jump ? 5 : 13)), [-1, 1], [-12, 8]);
  const tail = interpolate(Math.sin(frame / 7), [-1, 1], [-8, 8]);
  const chew = eat ? interpolate(Math.sin(frame / 4), [-1, 1], [0, 6]) : 0;
  const armSwing = climb ? interpolate(Math.sin(frame / 4), [-1, 1], [-20, 20]) : 0;

  return (
    <svg width="520" height="350" viewBox="0 0 520 350" style={{ overflow: "visible" }}>
      <g transform={"translate(0 " + bob + ")"}>
        {climb && (
          <g opacity="0.6">
            <rect x="440" y="20" width="28" height="320" rx="10" fill="#8B5E3C" />
            <rect x="432" y="40" width="44" height="12" rx="4" fill="#6d3a1e" />
            <rect x="432" y="100" width="44" height="12" rx="4" fill="#6d3a1e" />
            <rect x="432" y="160" width="44" height="12" rx="4" fill="#6d3a1e" />
            <rect x="432" y="220" width="44" height="12" rx="4" fill="#6d3a1e" />
          </g>
        )}
        <ellipse cx="260" cy="210" rx="110" ry="62" fill="#A0522D" />
        <ellipse cx="260" cy="224" rx="82" ry="36" fill="#DEB887" opacity="0.9" />
        <path d={"M370 200 C410 " + (190 + tail) + " 430 " + (140 + tail) + " 440 " + (100 + tail) + " C445 " + (80 + tail) + " 435 " + (70 + tail) + " 420 " + (75 + tail)} fill="none" stroke="#A0522D" strokeWidth="14" strokeLinecap="round" />
        <circle cx="260" cy="120" r="72" fill="#A0522D" />
        <ellipse cx="260" cy="132" rx="48" ry="40" fill="#DEB887" opacity="0.95" />
        <circle cx="240" cy="114" r="10" fill="#fff" />
        <circle cx="280" cy="114" r="10" fill="#fff" />
        <circle cx="242" cy="116" r="6" fill="#1a1a1a" />
        <circle cx="282" cy="116" r="6" fill="#1a1a1a" />
        <circle cx="243" cy="114" r="2" fill="#fff" />
        <circle cx="283" cy="114" r="2" fill="#fff" />
        <ellipse cx="260" cy="140" rx="16" ry={8 + chew} fill="#6d3a1e" />
        <path d={"M260 " + (148 + chew) + " C250 " + (156 + chew) + " 240 " + (154 + chew) + " 230 " + (150 + chew) + " M260 " + (148 + chew) + " C270 " + (156 + chew) + " 280 " + (154 + chew) + " 290 " + (150 + chew)} stroke="#4a2a0a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="196" cy="120" rx="22" ry="26" fill="#A0522D" />
        <ellipse cx="196" cy="122" rx="14" ry="18" fill="#DEB887" opacity="0.7" />
        <ellipse cx="324" cy="120" rx="22" ry="26" fill="#A0522D" />
        <ellipse cx="324" cy="122" rx="14" ry="18" fill="#DEB887" opacity="0.7" />
        <g stroke="#A0522D" strokeWidth="12" strokeLinecap="round">
          <line x1="200" y1="258" x2={188 + armSwing} y2="310" />
          <line x1="320" y1="258" x2={332 - armSwing} y2="310" />
        </g>
        <g stroke="#8B5E3C" strokeWidth="10" strokeLinecap="round">
          <line x1="188" y1="310" x2={180 + armSwing} y2="340" />
          <line x1="332" y1="310" x2={340 - armSwing} y2="340" />
        </g>
        {eat && (
          <g transform="translate(130 200) rotate(-15)">
            <path d="M0 18 C22 0 56 2 78 14 C52 32 22 34 0 18 Z" fill="#FFD700" stroke="#DAA520" strokeWidth="3" />
            <path d="M68 12 C88 0 100 4 108 14 C90 22 80 22 68 12 Z" fill="#8BC34A" />
          </g>
        )}
      </g>
    </svg>
  );
};

const DomainVisual: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const { fps } = useVideoConfig();
  const domain = scene.domain || "science";
  const text = scene.onScreenText || scene.title;
  const bob = interpolate(Math.sin(frame / 14), [-1, 1], [-6, 6]);
  const scale = interpolate(Math.sin(frame / 18), [-1, 1], [0.96, 1.04]);

  if (domain === "math") {
    // 数数场景必须有「可以数的东西」。之前把整句标题当成大字号文本渲染，
    // 屏幕上只有一行字，孩子无从数起；这里改成逐个弹入的实物圆点 + 同步计数。
    const words: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const source = String(scene.onScreenText || "") + " " + String(scene.narration || "");
    let count = 0;
    const numHit = source.match(/[0-9]+/);
    if (numHit) count = Math.min(10, Number(numHit[0]) || 0);
    if (!count) {
      // 只认「N 个/只/颗…」这种量词结构，且 N >= 2；否则「一个一个数」会被当成 1 个
      const cnHit = source.match(/([一二两三四五六七八九十])\s*[个只颗朵条本张]/);
      if (cnHit) count = words[cnHit[1]] || 0;
    }
    if (count < 2) count = 5;

    const cols = count <= 5 ? count : Math.ceil(count / 2);
    const dot = 96;
    const shown = Math.min(count, Math.floor(frame / 7) + 1);

    return (
      <div style={{ position: "relative", width: 760, height: 430 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              borderRadius: 40,
              background: "rgba(255, 255, 255, 0.93)",
              padding: "30px 38px 18px",
              boxShadow: "0 20px 48px rgba(16, 42, 24, 0.18)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(" + cols + ", " + dot + "px)",
                gap: 20,
                justifyContent: "center",
              }}
            >
              {Array.from({ length: count }).map((_, i) => {
                const appear = spring({
                  frame: frame - i * 7,
                  fps,
                  config: { damping: 12, stiffness: 140 },
                });
                return (
                  <div
                    key={i}
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: "50%",
                      background: scene.accentColor,
                      opacity: appear,
                      transform: "scale(" + appear + ")",
                      boxShadow: "0 10px 16px rgba(16, 42, 24, 0.2)",
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                marginTop: 18,
                textAlign: "center",
                fontSize: 44,
                fontWeight: 900,
                color: scene.accentColor,
                letterSpacing: 2,
              }}
            >
              {shown + " 个"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (domain === "language") {
    const chars = text.split("").slice(0, 8);
    return (
      <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
        {chars.map((ch, i) => {
          const cx = 60 + i * 50;
          const cy = 140 + interpolate(Math.sin(frame / 12 + i * 0.5), [-1, 1], [-10, 10]);
          return (
            <g key={i} transform={"translate(" + cx + " " + cy + ")"}>
              <rect x="-22" y="-28" width="44" height="56" rx="8" fill={scene.accentColor} opacity="0.18" />
              <text textAnchor="middle" y="8" fontSize="32" fontWeight="800" fill={scene.accentColor}>{ch}</text>
            </g>
          );
        })}
        <text x="240" y="270" textAnchor="middle" fontSize="22" fontWeight="700" fill="rgba(0,0,0,0.5)">{scene.narration?.slice(0, 16) || text}</text>
      </svg>
    );
  }

  if (domain === "art") {
    const pairs = scene.mixPairs || [];
    if (pairs.length > 0) {
      // 真正的混色动画：每一对「色A + 色B = 结果」逐行出现，
      // 两颗原色先飞入、碰撞时结果色从中心绽开，颜色名直接标在下方。
      const rowGap = pairs.length > 3 ? 118 : 138;
      const top = 150 - ((pairs.length - 1) * rowGap) / 2;
      return (
        <svg width="520" height="330" viewBox="0 0 520 330" style={{ overflow: "visible" }}>
          {pairs.map((pair, i) => {
            const rowY = top + i * rowGap;
            const localFrame = frame - i * 22;
            const grow = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 120 } });
            const merge = interpolate(localFrame, [26, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const spread = 96 - merge * 74;
            const pop = merge > 0 ? spring({ frame: localFrame - 30, fps, config: { damping: 10, stiffness: 160 } }) : 0;
            const r = 30 * grow;
            return (
              <g key={i} opacity={grow}>
                <circle cx={260 - spread} cy={rowY} r={r} fill={pair.a} />
                <circle cx={260 + spread} cy={rowY} r={r} fill={pair.b} />
                <text x={260 - spread} y={rowY + r + 24} textAnchor="middle" fontSize="20" fontWeight="700" fill="#334155">{pair.aName}</text>
                <text x={260 + spread} y={rowY + r + 24} textAnchor="middle" fontSize="20" fontWeight="700" fill="#334155">{pair.bName}</text>
                {merge > 0 ? (
                  <g opacity={merge}>
                    <circle cx={260} cy={rowY} r={34 * pop} fill={pair.result} stroke="#fff" strokeWidth="3" />
                    <text x={260} y={rowY + 8} textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">{pair.resultName}</text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      );
    }
    // 无混色参数时的兜底：彩色圆点转圈（旧行为）
    const colors = ["#e91e63", "#9c27b0", "#2196f3", "#4caf50", "#ff9800", "#795548"];
    return (
      <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
        <g transform={"translate(240 150) scale(" + scale + ")"}>
          <circle r="80" fill="#fff" stroke={scene.accentColor} strokeWidth="3" />
          {colors.map((c, i) => {
            const angle = (i / colors.length) * Math.PI * 2;
            const cx = Math.cos(angle) * 55;
            const cy = Math.sin(angle) * 55;
            return <circle key={i} cx={cx} cy={cy} r="22" fill={c} opacity={0.7 + interpolate(Math.sin(frame / 8 + i), [-1, 1], [-0.15, 0.15])} />;
          })}
        </g>
        <text x="240" y="275" textAnchor="middle" fontSize="24" fontWeight="700" fill={scene.accentColor}>{text}</text>
      </svg>
    );
  }

  // science / social / default：白底教具卡片 + 深色字，保证任意背景下的可读性
  return (
    <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
      <rect x="80" y="30" width="320" height="250" rx="32" fill="rgba(255, 255, 255, 0.9)" />
      <g transform={"translate(0 " + bob + ")"}>
        <circle cx="240" cy="150" r="76" fill={scene.accentColor} opacity="0.12" />
        <circle cx="240" cy="150" r="76" fill="none" stroke={scene.accentColor} strokeWidth="4" opacity="0.45" strokeDasharray="14 12" />
        {Array.from({ length: 3 }).map((_, i) => {
          const a = frame / 26 + (i * Math.PI * 2) / 3;
          return <circle key={i} cx={240 + Math.cos(a) * 76} cy={150 + Math.sin(a) * 76} r="8" fill={scene.accentColor} opacity="0.75" />;
        })}
        <text x="240" y="176" textAnchor="middle" fontSize="76" fontWeight="900" fill="#12303a">{text.charAt(0)}</text>
      </g>
    </svg>
  );
};

/** 台词里点名的实物：画在角色两侧，让"看小熊手里的皮球"真的有皮球可看 */
const PropArt: React.FC<{ id: string; x: number; y: number; frame: number }> = ({ id, x, y, frame }) => {
  const wobble = Math.sin(frame / 9 + x) * 6;
  const common = { transform: "translate(" + x + " " + (y + wobble) + ")" } as const;
  if (id === "ball") {
    return (
      <g {...common}>
        <circle cx="0" cy="0" r="58" fill="#ff5252" stroke="#b71c1c" strokeWidth="5" />
        <path d="M-56 -16 Q0 8 56 -16 M-56 16 Q0 -8 56 16 M-16 -56 Q16 0 -16 56 M16 -56 Q-16 0 16 56" fill="none" stroke="#fff4e6" strokeWidth="5" />
      </g>
    );
  }
  if (id === "cookie") {
    return (
      <g {...common}>
        <circle cx="0" cy="0" r="52" fill="#e6a23c" stroke="#a86a1e" strokeWidth="5" />
        {[[-22,-14],[16,-24],[28,12],[-12,25],[2,2]].map(([cx,cy],i) => (
          <circle key={i} cx={cx} cy={cy} r="6" fill="#6d3f12" />
        ))}
      </g>
    );
  }
  if (id === "apple") {
    return (
      <g {...common}>
        <path d="M0 -36 C30 -58 58 -30 48 10 C40 44 12 58 0 50 C-12 58 -40 44 -48 10 C-58 -30 -30 -58 0 -36 Z" fill="#f44336" stroke="#a82017" strokeWidth="5" />
        <path d="M0 -38 Q6 -64 28 -66" fill="none" stroke="#5d4037" strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="22" cy="-56" rx="18" ry="9" fill="#4caf50" transform="rotate(-24 22 -56)" />
      </g>
    );
  }
  if (id === "banana") {
    return (
      <g {...common}>
        <path d="M-46 -34 C-44 30 -6 58 42 40 C56 34 60 18 50 12 C18 34 -18 16 -20 -36 C-22 -52 -46 -50 -46 -34 Z" fill="#ffd54f" stroke="#c79a00" strokeWidth="5" />
      </g>
    );
  }
  if (id === "book") {
    return (
      <g {...common}>
        <path d="M-58 -36 L-4 -28 L-4 42 L-58 34 Z" fill="#fff8e1" stroke="#8d6e63" strokeWidth="5" />
        <path d="M58 -36 L4 -28 L4 42 L58 34 Z" fill="#fff8e1" stroke="#8d6e63" strokeWidth="5" />
        <path d="M0 -28 L0 42" stroke="#8d6e63" strokeWidth="6" />
      </g>
    );
  }
  if (id === "block") {
    return (
      <g {...common}>
        <rect x="-52" y="-28" width="48" height="48" rx="8" fill="#42a5f5" stroke="#1565c0" strokeWidth="5" />
        <rect x="4" y="-18" width="48" height="48" rx="8" fill="#66bb6a" stroke="#2e7d32" strokeWidth="5" />
        <rect x="-28" y="18" width="48" height="48" rx="8" fill="#ffca28" stroke="#ef6c00" strokeWidth="5" />
      </g>
    );
  }
  if (id === "table") {
    return (
      <g {...common}>
        <rect x="-66" y="-30" width="132" height="22" rx="6" fill="#c98a4b" stroke="#8d5524" strokeWidth="5" />
        <rect x="-54" y="-8" width="12" height="60" rx="4" fill="#a86a34" stroke="#8d5524" strokeWidth="4" />
        <rect x="42" y="-8" width="12" height="60" rx="4" fill="#a86a34" stroke="#8d5524" strokeWidth="4" />
      </g>
    );
  }
  if (id === "slide") {
    return (
      <g {...common}>
        <path d="M-58 -44 L-58 12 L44 56" fill="none" stroke="#ff8a65" strokeWidth="18" strokeLinecap="round" />
        <path d="M-58 -44 L58 -44 M-58 12 L58 12" stroke="#4dd0e1" strokeWidth="12" strokeLinecap="round" />
        <path d="M-58 12 L-58 56 M58 12 L58 56" stroke="#26a69a" strokeWidth="10" strokeLinecap="round" />
      </g>
    );
  }
  if (id === "star") {
    return (
      <g {...common}>
        <path d="M0 -52 L15 -17 L53 -12 L26 15 L34 52 L0 33 L-34 52 L-26 15 L-53 -12 L-15 -17 Z" fill="#ffd54f" stroke="#f9a825" strokeWidth="5" />
      </g>
    );
  }
  if (id === "heart") {
    return (
      <g {...common}>
        <path d="M0 46 C-56 12 -54 -34 -26 -38 C-10 -40 0 -28 0 -20 C0 -28 10 -40 26 -38 C54 -34 56 12 0 46 Z" fill="#ff6b81" stroke="#c2185b" strokeWidth="5" />
      </g>
    );
  }
  return null;
};

/**
 * 矢量角色：优先用素材库的动物 SVG（32x32 viewBox 的精细 path，放大不失真），
 * 用纯代码驱动动画——入场弹性、呼吸起伏、身体前倾、手臂递出/接过/挥手。
 * 交互幕要同时出现两个不同角色，characterAssetSrc 每幕只解析一个主角，
 * 所以这里按 actor.id 直接拼矢量素材路径，两个角色各自加载各自的 SVG。
 * 没有矢量素材的角色（如北极熊）回退到 emoji，保证任何 id 都能出画面。
 */
const ActorFigure: React.FC<{
  actor: InteractionActorView;
  frame: number;
  facing: 1 | -1;
  gesture: "offer" | "receive" | "wave" | "idle";
  accent: string;
}> = ({ actor, frame, facing, gesture, accent }) => {
  const hasVector = VECTOR_ANIMAL_IDS.indexOf(actor.id) >= 0;
  const emoji = ANIMAL_EMOJI_MAP[actor.id] || "\u{1F43A}";
  // 入场弹性：每幕开头角色从小到大弹入
  const enter = spring({ frame, fps: 30, config: { damping: 13, stiffness: 140 } });
  const scale = 0.55 + enter * 0.45;
  // 呼吸起伏
  const bob = Math.sin(frame / 14) * 7;
  // 身体前倾：递出时向前探身，挥手时轻微摇摆
  const lean =
    gesture === "offer"
      ? interpolate(Math.sin(frame / 9), [-1, 1], [-9, 7])
      : gesture === "wave"
        ? interpolate(Math.sin(frame / 8), [-1, 1], [-6, 6])
        : 0;
  // 手臂摆动：代码绘制的手臂随手势摆动
  const armAngle =
    gesture === "offer"
      ? interpolate(Math.sin(frame / 9 + 0.7), [-1, 1], [-24, 18])
      : gesture === "receive"
        ? interpolate(Math.sin(frame / 11 + 1), [-1, 1], [-14, 20])
        : gesture === "wave"
          ? interpolate(Math.sin(frame / 5), [-1, 1], [-40, 32])
          : 0;
  return (
    <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", transform: "scale(" + scale + ")" }}>
      <div style={{ position: "relative", transform: "translateY(" + bob + "px) rotate(" + lean * facing + "deg)" }}>
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.95)",
            border: "8px solid " + accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 22px 40px rgba(0,0,0,0.16)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {hasVector ? (
            <Img
              src={staticFile("assets/vector/animals/" + actor.id + ".svg")}
              style={{ width: 288, height: 288, objectFit: "contain", transform: "scaleX(" + facing + ")" }}
            />
          ) : (
            <span style={{ fontSize: 194, lineHeight: 1, transform: "scaleX(" + facing + ")" }}>{emoji}</span>
          )}
        </div>
        {gesture !== "idle" ? (
          <div
            style={{
              position: "absolute",
              right: facing > 0 ? -40 : "auto",
              left: facing < 0 ? -40 : "auto",
              bottom: 26,
              width: 96,
              height: 96,
              transform: "rotate(" + armAngle * facing + "deg)",
              transformOrigin: "bottom center",
            }}
          >
            <svg width="96" height="96" viewBox="0 0 96 96" style={{ overflow: "visible" }}>
              <path d="M48 94 L48 42" stroke={accent} strokeWidth="24" strokeLinecap="round" />
              <circle cx="48" cy="34" r="22" fill="#F6C9A0" stroke={accent} strokeWidth="5" />
            </svg>
          </div>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 20,
          padding: "10px 30px",
          borderRadius: 999,
          background: accent,
          color: "#fff",
          fontSize: 40,
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
      >
        {actor.label}
      </div>
    </div>
  );
};

/** 说话气泡：挂在说话者头顶，尾巴朝向听者 */
const SpeechBubble: React.FC<{ text: string; side: "left" | "right"; accent: string; frame: number }> = ({
  text,
  side,
  accent,
  frame,
}) => {
  const pop = spring({ frame, fps: 30, config: { damping: 12, stiffness: 160 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: side === "left" ? 380 : "auto",
        right: side === "right" ? 380 : "auto",
        transform: "scale(" + pop + ")",
        transformOrigin: side === "left" ? "bottom left" : "bottom right",
        maxWidth: 620,
        padding: "26px 40px",
        borderRadius: 36,
        background: "#fff",
        border: "6px solid " + accent,
        boxShadow: "0 18px 34px rgba(0,0,0,0.14)",
        fontSize: 46,
        fontWeight: 900,
        color: "#12303a",
        textAlign: "center",
        lineHeight: 1.35,
      }}
    >
      {text}
      <div
        style={{
          position: "absolute",
          bottom: -30,
          left: side === "left" ? 70 : "auto",
          right: side === "right" ? 70 : "auto",
          width: 0,
          height: 0,
          borderLeft: "24px solid transparent",
          borderRight: "24px solid transparent",
          borderTop: "30px solid " + accent,
        }}
      />
    </div>
  );
};

/**
 * 按角色关系演出画面：把"谁对谁做什么"变成确定性的摆位与动作。
 * 这是画面与台词匹配的关键——不再只是"角色居中 + 道具两侧"。
 */
/**
 * 背景：任何"有人物"的幕都站在同一处场地里。
 *
 * 二维演员（Puppet2D）和三维舞台（ThreeActionStage）各自持有自己的相机——
 * 它们要用同一条投影画角色，所以相机不能从这里往下传。剩下两种舞台
 * （双人徽章、巨图特写）此前仍画旧 habitat 屏保，同一节课因此出现三种背景：
 * 只有全身木偶幕站在公园里，双人幕和特写幕站在"另一片草地"。
 *
 * 这里给它们补上同一个世界。景别固定 wide：这两种舞台本身是"特写/半身"的
 * 构图，背景要是也跟着推近，就只剩一堵围栏了。
 */
const SceneBackdrop: React.FC<{ scene: GeneratedScene; frame: number }> = ({ scene, frame }) => {
  if ((scene.backgroundStyle || "environment") !== "environment") return null;
  const world = normalizeWorld(scene.world);
  if (!world) return null;
  return <WorldLayer world={world} camera={cameraForWorld(world, "wide")} frame={frame} />;
};

const ActionStage: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useLocalFrame();
  const it = scene.interaction!;
  const accent = scene.accentColor || "#4d96ff";
  const actors = it.actors || [];
  const giver = actors.find((a) => a.role === "giver") || actors[0];
  const receiver = actors.find((a) => a.role === "receiver") || actors[1];
  const speaker = actors.find((a) => a.role === "speaker") || actors[0];
  const helperA = actors[0];
  const helperB = actors[1];

  /**
   * 2D 降级：三维舞台不可用时（three 依赖缺失、VIDEO_3D_STAGE=off、动作未登记）
   * 仍然要演出滑梯和拍球，否则这两个新动词会一路走到最后的 return null，
   * 整幕只剩背景和字幕。降级版只保留"位移 + 节奏"这两个孩子能看懂的信息，
   * 不假装有接触——接触是 3D 分支的职责。
   */
  if (it.verb === "slide" && helperA) {
    const t = interpolate(frame, [0, duration * 0.86], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const travel = Math.pow(t, 1.5);
    const x = 300 + travel * 980;
    const y = 250 + travel * 470;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
          <polygon points="250,210 1740,900 1740,986 250,296" fill="#ffb347" stroke="#e08b2f" strokeWidth={7} />
          <polygon points="250,210 1740,900 1740,930 250,240" fill="#ffd08a" opacity={0.7} />
          <rect x="120" y="180" width="150" height="18" rx="9" fill="#cf9a63" />
          <rect x="120" y="180" width="18" height={760} fill="#cf9a63" />
          <rect x="252" y="180" width="18" height="760" fill="#cf9a63" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="128" y={300 + i * 170} width="132" height="16" rx="8" fill="#cf9a63" />
          ))}
        </svg>
        <div style={{ position: "absolute", left: x, top: y, transform: "rotate(24deg)" }}>
          <ActorFigure actor={helperA} frame={frame} facing={1} gesture="wave" accent={accent} />
        </div>
      </AbsoluteFill>
    );
  }

  if (it.verb === "dribble" && helperA) {
    // 与 3D 分支同一套节奏：周期边界是球落地，熊掌在最高点搭上球顶
    const period = 18;
    const phase = (frame % period) / period;
    const lift = Math.abs(Math.sin(Math.PI * phase));
    const ballX = 1240;
    const ballY = 800 - lift * 300;
    const squash = 1 - 0.12 * Math.max(0, 1 - lift * 4);
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <div style={{ position: "absolute", left: 380, top: 430 }}>
          <ActorFigure actor={helperA} frame={frame} facing={1} gesture="offer" accent={accent} />
        </div>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={ballX} cy="905" rx={120 - lift * 50} ry={26 - lift * 10} fill="#1b2a33" opacity={0.16} />
          <g transform={"translate(" + ballX + " " + ballY + ") scale(" + (1 / squash).toFixed(3) + " " + squash.toFixed(3) + ")"}>
            <circle cx="0" cy="0" r="86" fill="#ef5f58" stroke="#c8443e" strokeWidth={6} />
            <path d="M -86 0 A 86 86 0 0 1 86 0" fill="none" stroke={accent} strokeWidth={14} opacity={0.85} />
            <path d="M 0 -86 A 86 86 0 0 1 0 86" fill="none" stroke={accent} strokeWidth={14} opacity={0.85} />
          </g>
        </svg>
      </AbsoluteFill>
    );
  }

  // 递给：左角色把道具沿弧线送到右角色手边
  if (it.verb === "handover" && giver && receiver) {
    const t = interpolate(frame, [duration * 0.18, duration * 0.72], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const ease = 1 - Math.pow(1 - t, 3);
    const propX = 640 + ease * 560;
    const propY = 590 - Math.sin(ease * Math.PI) * 96;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <div style={{ position: "absolute", left: 300, top: 430 }}><ActorFigure actor={giver} frame={frame} facing={1} gesture="offer" accent={accent} /></div>
        <div style={{ position: "absolute", left: 1300, top: 430 }}><ActorFigure actor={receiver} frame={frame} facing={-1} gesture="receive" accent={accent} /></div>
        {it.propId ? (
          <>
            <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
              <path
                d={"M 660 620 Q 960 440 1260 620"}
                fill="none"
                stroke={accent}
                strokeWidth={9}
                strokeDasharray="18 20"
                opacity={0.5}
              />
              <path d={"M 1240 596 L 1270 620 L 1240 644"} fill="none" stroke={accent} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ position: "absolute", left: propX - 90, top: propY - 90 }}>
              <svg width={180} height={180} viewBox="-80 -80 160 160" style={{ overflow: "visible", filter: "drop-shadow(0 14px 16px rgba(0,0,0,0.2))" }}>
                <PropArt id={it.propId} x={0} y={0} frame={frame} />
              </svg>
            </div>
          </>
        ) : null}
        {it.speech ? <SpeechBubble text={it.speech} side="right" accent={accent} frame={frame} /> : null}
      </AbsoluteFill>
    );
  }

  // 一起抬：两个角色并排，合力把道具抬起来（道具在中间上下起伏 + 闪光）
  if (it.verb === "lift-together" && helperA && helperB) {
    const lift = Math.sin(frame / 12) * 18;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <div style={{ position: "absolute", left: 260, top: 470 }}><ActorFigure actor={helperA} frame={frame} facing={1} gesture="wave" accent={accent} /></div>
        <div style={{ position: "absolute", left: 1360, top: 470 }}><ActorFigure actor={helperB} frame={frame} facing={-1} gesture="wave" accent={accent} /></div>
        {it.propId ? (
          <div style={{ position: "absolute", left: 810, top: 540 + lift }}>
            <svg width={300} height={300} viewBox="-80 -80 160 160" style={{ overflow: "visible", filter: "drop-shadow(0 18px 20px rgba(0,0,0,0.2))" }}>
              <PropArt id={it.propId} x={0} y={0} frame={frame} />
            </svg>
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  // 说话：说话者一侧 + 气泡；第二个角色作为听话对象
  if (it.verb === "speak" && speaker) {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <div style={{ position: "absolute", left: 1180, top: 430 }}><ActorFigure actor={speaker} frame={frame} facing={-1} gesture="wave" accent={accent} /></div>
        {actors[1] ? (
          <div style={{ position: "absolute", left: 300, top: 470 }}><ActorFigure actor={actors[1]} frame={frame} facing={1} gesture="idle" accent={accent} /></div>
        ) : null}
        {/* 说话者站在右侧，气泡必须挂在同一侧，否则看起来像左边角色在说 */}
        {it.speech ? <SpeechBubble text={it.speech} side="right" accent={accent} frame={frame} /> : null}
      </AbsoluteFill>
    );
  }

  // 指认 / 手持：单角色 + 道具，箭头从角色指向道具
  if ((it.verb === "point" || it.verb === "hold") && helperA) {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <SceneBackdrop scene={scene} frame={frame} />
        <div style={{ position: "absolute", left: 360, top: 430 }}><ActorFigure actor={helperA} frame={frame} facing={1} gesture={it.verb === "point" ? "wave" : "receive"} accent={accent} /></div>
        {it.propId ? (
          <div style={{ position: "absolute", left: 1300, top: 480 }}>
            <svg width={260} height={260} viewBox="-80 -80 160 160" style={{ overflow: "visible", filter: "drop-shadow(0 14px 16px rgba(0,0,0,0.2))" }}>
              <PropArt id={it.propId} x={0} y={0} frame={frame} />
            </svg>
            <div style={{ textAlign: "center", fontSize: 34, fontWeight: 900, color: accent }}>{PROP_LABELS[it.propId] || ""}</div>
          </div>
        ) : null}
        {it.speech ? <SpeechBubble text={it.speech} side="left" accent={accent} frame={frame} /> : null}
      </AbsoluteFill>
    );
  }

  return null;
};

const TopicVisual: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useLocalFrame();
  const pulse = interpolate(Math.sin(frame / 10), [-1, 1], [0.94, 1.04]);
  const drift = scene.action === "run"
    ? interpolate(frame, [0, Math.max(90, scene.durationFrames || 180)], [-90, 80], { extrapolateRight: "clamp" })
    : 0;
  const bob = interpolate(Math.sin(frame / (scene.action === "run" ? 5 : 14)), [-1, 1], [-8, 8]);
  const roarScale = scene.action === "roar" ? interpolate(Math.sin(frame / 6), [-1, 1], [1.0, 1.045]) : 1;
  if (scene.visualAssets?.characterAssetSrc) {
    const isVector = scene.visualAssets.assetProvider === "vector";
    const boxW = isVector ? 620 : 660;
    const boxH = isVector ? 470 : 420;
    const imgW = isVector ? 460 : 640;
    const imgH = isVector ? 470 : 400;
    return (
      <div style={{ position: "relative", width: boxW, height: boxH }}>
        <Img
          src={staticFile(scene.visualAssets.characterAssetSrc)}
          style={{
            position: "absolute",
            left: (boxW - imgW) / 2 + drift,
            bottom: scene.action === "swim" ? 26 + bob : bob,
            width: imgW,
            height: imgH,
            objectFit: "contain",
            transform: "scale(" + roarScale + ")",
            filter: isVector
              ? "drop-shadow(0 26px 32px rgba(18, 52, 22, 0.28))"
              : "drop-shadow(0 22px 24px rgba(23, 50, 20, 0.28))",
          }}
        />
        {!isVector && scene.visualAssets.overlayAssetSrc?.map((src, index) => (
          <Img
            key={src + index}
            src={staticFile(src)}
            style={{
              position: "absolute",
              left: 42,
              bottom: 14 + index * 18,
              width: 500,
              height: 120,
              objectFit: "contain",
              opacity: scene.action === "swim" ? 0.84 : 0.36,
              transform: "translateX(" + interpolate(Math.sin(frame / 8 + index), [-1, 1], [-18, 18]) + "px)",
            }}
          />
        ))}
        {scene.action === "roar" ? (
          <svg width="560" height="370" viewBox="0 0 560 370" style={{ position: "absolute", inset: 0 }}>
            <g fill="none" stroke="#ffb703" strokeWidth="8" strokeLinecap="round" opacity="0.75">
              <path d="M390 120 C455 82 508 86 548 108" />
              <path d="M394 160 C462 152 514 162 552 194" />
            </g>
          </svg>
        ) : null}
      </div>
    );
  }
  const knownInlineAnimals = ["tiger", "rabbit", "monkey"];
  const animalKey = knownInlineAnimals.includes(scene.assetKey)
    ? scene.assetKey
    : knownInlineAnimals.find((key) => (scene.assetTags || []).includes(key)) || null;
  if (animalKey === "tiger") return <TigerSvg scene={scene} />;
  if (animalKey === "rabbit") return <RabbitSvg scene={scene} />;
  if (animalKey === "monkey") return <MonkeySvg scene={scene} />;
  // Non-animal topics or unconfigured animals with no emoji
  if (scene.assetKey === "topic" && scene.domain) {
    return <DomainVisual scene={scene} />;
  }
  const emoji = ANIMAL_EMOJI_MAP[scene.assetKey] || ANIMAL_EMOJI_MAP[(scene.assetTags || []).find((t) => ANIMAL_EMOJI_MAP[t]) || ""] || "";
  const orbitR = interpolate(Math.sin(frame / 14), [-1, 1], [90, 110]);
  return (
    <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
      <rect x="26" y="10" width="428" height="300" rx="34" fill="rgba(255, 255, 255, 0.9)" />
      <circle cx="240" cy="150" r={orbitR * pulse} fill={scene.accentColor} opacity="0.12" />
      <circle cx="240" cy="150" r="72" fill={scene.accentColor} opacity="0.2" />
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2 + frame * 0.02;
        const rx = 110 + interpolate(Math.sin(frame / 12 + i), [-1, 1], [-8, 8]);
        const ry = 80 + interpolate(Math.cos(frame / 10 + i), [-1, 1], [-6, 6]);
        const cx = 240 + Math.cos(angle) * rx;
        const cy = 150 + Math.sin(angle) * ry;
        return <circle key={i} cx={cx} cy={cy} r={16 + (i % 3) * 4} fill={scene.accentColor} opacity={0.15 + (i % 3) * 0.08} />;
      })}
      {emoji ? (
        <text x="240" y="165" textAnchor="middle" fontSize="120" dominantBaseline="central">{emoji}</text>
      ) : (
        <text x="240" y="162" textAnchor="middle" fontSize="44" fontWeight="900" fill="#12303a">{scene.onScreenText || scene.title}</text>
      )}
    </svg>
  );
};

const CJK_BREAK = /[，。！？；：、,.!?;:]/;

/** 按标点切分旁白，保证每屏不超过 maxLines 行、每行不超过 maxChars 字 */
const splitNarration = (text: string, maxChars: number, maxLines: number): string[] => {
  const limit = maxChars * maxLines;
  const out: string[] = [];
  let rest = (text || "").trim();
  if (!rest) return [""];
  while (rest.length > 0) {
    if (rest.length <= limit) {
      out.push(rest);
      break;
    }
    let cut = -1;
    for (let i = Math.min(rest.length, limit); i > Math.floor(limit * 0.6); i--) {
      if (CJK_BREAK.test(rest.charAt(i - 1))) {
        cut = i;
        break;
      }
    }
    if (cut < 0) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return out.length > 0 ? out : [""];
};

/**
 * 帧冻结：场景放完后会多留一个转场窗口让下一场把它顶走。这段时间里子组件如果
 * 继续按真实帧跑，各自的"结尾淡出"会先把内容清空——那正是切换瞬间整屏只剩
 * 标题和字幕的来源。用 context 把子组件的帧钉在收尾淡出之前，画面保持"满"。
 */
const FrameOverride = React.createContext<number | null>(null);

const useLocalFrame = (): number => {
  const frame = useCurrentFrame(); // 真实帧：本函数自己不能走 useLocalFrame，会递归
  const frozen = React.useContext(FrameOverride);
  return frozen === null ? frame : Math.min(frame, frozen);
};

/**
 * beats 解释器：当前帧落在哪一拍、拍内进度、已揭示/已讲过的主体。
 * 没有编排数据返回 null——所有消费方据此走原路径，旧分镜像素级不变。
 * 拍与拍之间有空隙时保持上一拍（焦点不闪断），场景结尾停在最后一拍的终态。
 */
const beatStateAt = (scene: GeneratedScene, frame: number) => {
  const ch = scene.choreography;
  if (!ch || !ch.beats || ch.beats.length === 0) return null;
  const beats = ch.beats;
  let idx = -1;
  for (let i = 0; i < beats.length; i += 1) {
    if (frame >= beats[i].startFrame) idx = i;
    else break;
  }
  const current = idx >= 0 ? beats[idx] : null;
  const span = current ? Math.max(1, current.endFrame - current.startFrame) : 1;
  const beatProgress = current
    ? Math.max(0, Math.min(1, (frame - current.startFrame) / span))
    : 0;
  const revealed = new Set<string>();
  const spoken: string[] = [];
  for (const b of beats) {
    if (frame >= b.startFrame) {
      for (const r of b.reveal || []) revealed.add(r);
      if (b.focus) spoken.push(b.focus);
    }
  }
  return {
    current,
    idx,
    count: beats.length,
    beatProgress,
    revealed,
    spoken,
    amplitude: ch.profile && ch.profile.amplitude ? ch.profile.amplitude : 1,
    popFrame: current ? frame - current.startFrame : 0,
  };
};

/** focus/reveal 写的可能是节点 id、label 或 subject，统一解析成节点 id */
const resolveFocusId = (
  graph: SceneGraphView | undefined,
  focus?: string,
): string | undefined => {
  if (!focus || !graph) return undefined;
  for (const n of graph.nodes) {
    if (n.id === focus || n.label === focus || n.subject === focus) return n.id;
  }
  return undefined;
};

const SUB_PUNCT = /[，。！？；：、,.!?;:]/;

/** 有词级时间戳时，换页提前几帧露出下一句（0.2s），给观众预读的时间 */
const SUB_PRE_ROLL = 6;
/** 两屏之间至少隔多少帧，避免相邻两句挤在同一秒里来回翻 */
const SUB_MIN_PAGE = 12;

/** 把一屏文字切成"字+尾随标点"的 token，标点不单独占一拍 */
const subtitleTokens = (text: string): string[] => {
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    if (out.length > 0 && SUB_PUNCT.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
};

/**
 * 字幕轨：按场景时长把旁白分成若干屏逐屏推进，屏内逐字跟读（karaoke）。
 *
 * 为什么不再整屏刷出：整屏一次性出现后，接下来几秒画面没有任何视觉事件，观众
 * 只能盯着不动的字。实测（measure-motion.py）字幕带"有节奏"的帧只占 0.6 次/秒，
 * 最长 5.9 秒一个字都不动；逐字点亮后是 4.5 次/秒、最长空档 1.7 秒。
 *
 * 点亮时刻有两档：
 * 1. scene.subtitlePages 存在（后端拿到 TTS 词边界）→ 按真实发音帧点亮，误差 ≤1 帧。
 * 2. 不存在 → 按屏长均分估算（每字 perPage/字数，上限 10 帧/字）。
 *    估算口径与真实语音偏中位 0.56s、最大 1.36s，只作为拿不到时间戳时的兜底。
 */
const SubtitleTrack: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useLocalFrame();
  // 有时间戳就用真实的；结构不合法（长度对不上）时当作没有，别让字幕整轨消失
  const timed = Array.isArray(scene.subtitlePages)
    ? scene.subtitlePages.filter((p) => Array.isArray(p.tokens) && p.tokens.length > 0 && p.starts.length === p.tokens.length)
    : [];
  const useTimed = timed.length > 0;
  const fallbackPages = useTimed ? [] : splitNarration(scene.narration || "", 15, 2);
  const pageCount = Math.max(1, useTimed ? timed.length : fallbackPages.length);
  const perPage = Math.max(1, duration / pageCount);

  // 每屏起帧：timed 用第一个字的真实发音帧提前 SUB_PRE_ROLL 帧露出，
  // 让下一句先以暗字出现（观众能预读），也让换页不卡在"字已经念出来才出现"。
  const pageStarts: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    if (i === 0) {
      pageStarts.push(0);
      continue;
    }
    const raw = useTimed ? Math.max(0, timed[i].starts[0] - SUB_PRE_ROLL) : i * perPage;
    pageStarts.push(Math.max(pageStarts[i - 1] + SUB_MIN_PAGE, raw));
  }
  let pageIndex = 0;
  for (let i = 0; i < pageCount; i += 1) if (frame >= pageStarts[i]) pageIndex = i;
  const local = frame - pageStarts[pageIndex];
  const enterRamp = interpolate(local, [0, Math.min(8, perPage * 0.3)], [0, 1], { extrapolateRight: "clamp" });
  // 换页时底板常驻、只让文字接上。底板跟着淡出会在每次换页留 1~6 帧"整屏没有字幕"，
  // 实测 33 秒里 55 帧（最长连段 9 帧）；底板不动之后观感是"上一句换成下一句"。
  const capsuleOpacity = pageIndex === 0 ? enterRamp : 1;
  const lift = pageIndex === 0 ? interpolate(local, [0, Math.min(10, perPage * 0.35)], [12, 0], { extrapolateRight: "clamp" }) : 0;
  const textOpacity = pageIndex === 0 ? 1 : interpolate(local, [0, 3], [0.3, 1], { extrapolateRight: "clamp" });
  const accent = scene.accentColor || "#4d96ff";

  const tokens = useTimed ? timed[pageIndex].tokens : subtitleTokens(fallbackPages[pageIndex] || "");
  const current = tokens.join("");
  const font = current.length > 20 ? 36 : 42;

  // 已念到几个字：timed 直接比真实发音帧；否则按屏长均分算拍
  let spoken: number;
  if (useTimed) {
    const starts = timed[pageIndex].starts;
    spoken = 0;
    while (spoken < starts.length && frame >= starts[spoken]) spoken += 1;
  } else {
    // 按屏长铺满：每字 perPage/字数 帧。封顶 10 帧/字（3 字/秒），再慢观众会以为卡住了。
    const beat = Math.min(10, perPage / Math.max(1, tokens.length));
    spoken = Math.min(tokens.length, Math.floor(local / Math.max(1, beat)) + 1);
  }

  return (
    <div style={{ position: "absolute", left: 150, right: 150, bottom: 56, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: font * 16 + 84,
          borderRadius: 26,
          background: "rgba(11, 24, 33, 0.78)",
          padding: "22px 42px",
          color: "#fff",
          fontSize: font,
          lineHeight: 1.42,
          fontWeight: 800,
          textAlign: "center",
          letterSpacing: 1,
          opacity: capsuleOpacity,
          transform: "translateY(" + lift + "px)",
        }}
      >
        <span style={{ opacity: textOpacity }}>
          {tokens.map((tk, i) => {
            const isSpoken = i < spoken;
            // 未念到的字留 28% 亮度占位：布局不跳、观众能预判句子长短，
            // 点亮时是"变亮"而不是"凭空长出一块白"
            const isCurrent = i === spoken - 1;
            return (
              <span
                key={i}
                style={{
                  // 当前朗读字保持白色（笔画始终可读），用下划线而非实心染色+强光晕标记；
                  // 之前的 22px 蓝色光晕会把「色/蓝」这类字糊成一团彩色圆点，看起来像 emoji。
                  color: isSpoken ? "#fff" : "rgba(255,255,255,0.28)",
                  textShadow: isCurrent ? "0 0 8px rgba(255,255,255,0.45)" : "none",
                  textDecoration: isCurrent ? "underline" : "none",
                  textDecorationColor: isCurrent ? accent : "transparent",
                  textDecorationThickness: isCurrent ? 4 : 0,
                  textUnderlineOffset: isCurrent ? 8 : 0,
                }}
              >
                {tk}
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
};

/** 落地阴影：把主体锚在地面上，避免悬空的贴纸感 */
const GroundShadow: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useLocalFrame();
  const pulse = interpolate(Math.sin(frame / 16), [-1, 1], [0.96, 1.04]);
  const alpha = interpolate(frame, [0, 20, duration - 20, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, opacity: alpha }}>
      <ellipse cx={960} cy={768} rx={392 * pulse} ry={44 * pulse} fill="#1B4D2A" opacity="0.10" />
      <ellipse cx={960} cy={768} rx={262 * pulse} ry={28 * pulse} fill="#1B4D2A" opacity="0.22" />
    </svg>
  );
};

/**
 * 受控画板的类型镜像（渲染侧）。
 * 校验与契约在后端 figure-spec.ts，这里是模板自带的一份，改一处要改两处。
 */
const FIGURE_W = 1600;
const FIGURE_H = 640;

type FigureShapeView =
  | { kind: "arc"; cx: number; cy: number; r: number; from: number; to: number; stroke: string; width: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; strokeWidth?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | { kind: "curve"; x1: number; y1: number; c1x: number; c1y: number; c2x: number; c2y: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: "polygon"; points: string; fill: string; stroke?: string; strokeWidth?: number }
  | { kind: "subjectIcon"; subject: string; x: number; y: number; size: number; iconSrc?: string };

type FigureGlyphView = FigureShapeView & { reveal: number };
type FigureLabelView = { text: string; x: number; y: number; color?: string };
type FigureView = { shapes: FigureGlyphView[]; labels?: FigureLabelView[] };

type GraphNodeView = {
  id: string;
  label: string;
  subject: string;
  role: string;
  sign?: string;
  swell?: string;
};
type SceneGraphView = { relation: string; caption?: string; nodes: GraphNodeView[] };

type GraphItem = {
  node: GraphNodeView;
  x: number;
  y: number;
  size: number;
  delay: number;
  /** 入场起点（屏幕坐标）：group 从散落处聚拢、split 从整体里散开，都靠这一项 */
  enterFrom?: { x: number; y: number };
  /** growth 关系下节点要"现场长大"，入场从小比例缓慢放大而不是弹一下 */
  grow?: boolean;
  /**
   * 状态变化的窗口，取值是这一屏的叙事进度 0→1。
   * 和 delay 的区别：delay 是"入场在第几帧"，窗口是"这段内容讲到哪儿了才长出/涨满"。
   * 前者是装饰动画，讲完就停在原地；后者单调推进，画面跟着讲解一起走。
   */
  growWindow?: [number, number];
};
type GraphEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx?: number;
  my?: number;
  delay: number;
};
/**
 * 一段运动路径：复用已算好的连线，光点沿着箭头走，位置和画面上的箭头严格一致。
 * target 是光点"正走向"的节点——它决定此刻谁亮起来。
 */
type GraphFlow = {
  edges: GraphEdge[];
  loop: boolean;
  phase?: number;
  target: string[];
  /**
   * 这条路径"讲的是谁"——落点可能不是它。group 的箭头是"成员 → 类别"，
   * 光点全落在类别上，可旁白念的是成员（苹果、香蕉、葡萄…最后才是水果）。
   * 缺省与 target 相同；只有 group 会填成成员。
   */
  focus?: string[];
};
type GraphLayout = {
  items: GraphItem[];
  edges: GraphEdge[];
  flows: GraphFlow[];
  divider?: { x: number; y1: number; y2: number };
  container?: { x: number; y: number; w: number; h: number };
};

/**
 * 布局是纯函数：同一张图永远得到同一坐标。
 * 关系类型决定排布拓扑，节点只提供数据——这是"任意主题都能出片"的关键，
 * 因为新增主题不需要新增代码，只需要改数据。
 */
const layoutGraph = (graph: SceneGraphView): GraphLayout => {
  const nodes = graph.nodes || [];
  const n = nodes.length;
  const items: GraphItem[] = [];
  const edges: GraphEdge[] = [];

  if (graph.relation === "cycle") {
    const cx = 960;
    // 底部节点（含标签）必须留在字幕条上方：字幕条顶边在 y≈860，所以圆心+短轴 ≤ 714
    // 放大一档（卡 186→232、横半径 268→322）：原来整组只占 722×590，画面 62% 是空背景，
    // 任何局部动效都被空白稀释——实测中段活跃块只有 4.2%，而 4 张 186 卡全动也只够 6.7% 屏。
    // 顶部卡顶 188 仍在 caption 底边（≈174）之下，底部标签落到 856，都没越界。
    const cy = 500;
    const rx = 322;
    const ry = 196;
    const size = 232;
    nodes.forEach((node, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      items.push({
        node,
        x: cx + Math.cos(a) * rx,
        y: cy + Math.sin(a) * ry,
        size,
        delay: 8 + i * 9,
      });
    });
    for (let i = 0; i < n; i += 1) {
      const a1 = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const a2 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2;
      const mid = a1 + (a2 - a1) / 2;
      edges.push({
        x1: cx + Math.cos(a1) * (rx + 104),
        y1: cy + Math.sin(a1) * (ry + 104),
        x2: cx + Math.cos(a2) * (rx + 104),
        y2: cy + Math.sin(a2) * (ry + 104),
        mx: cx + Math.cos(mid) * (rx + 182),
        my: cy + Math.sin(mid) * (ry + 182),
        delay: 26 + i * 11,
      });
    }
    return {
      items,
      edges,
      flows: [{ edges, loop: true, target: nodes.map((_, i) => nodes[(i + 1) % n].id) }],
    };
  }

  if (graph.relation === "growth") {
    const baseline = 712;
    const spacing = Math.min(408, 1490 / Math.max(1, n - 1));
    const startX = 960 - ((n - 1) * spacing) / 2;
    // 依次长大：每个节点占一段叙事窗口，前一个长完才轮到下一个，观众能看出先后
    const slot = 0.9 / Math.max(1, n);
    nodes.forEach((node, i) => {
      // 末节点要"长成大树"，尺寸差是叙事本身；整体抬高 14% 让后段有生长空间
      const size = 196 + i * 44;
      items.push({
        node,
        x: startX + i * spacing,
        y: baseline - size / 2,
        size,
        delay: 8 + i * 12,
        grow: true,
        growWindow: [i * slot, (i + 1) * slot],
      });
    });
    for (let i = 0; i < n - 1; i += 1) {
      const a = items[i];
      const b = items[i + 1];
      edges.push({
        x1: a.x + a.size / 2 + 12,
        y1: a.y,
        x2: b.x - b.size / 2 - 12,
        y2: b.y,
        delay: 20 + i * 12,
      });
    }
    return { items, edges, flows: [{ edges, loop: false, target: nodes.slice(1).map((v) => v.id) }] };
  }

  if (graph.relation === "compare") {
    // 对照组是"两块并排比大小"，卡太小就看不出差别；放大到 300，
    // 左右各占 1/6 屏宽，中间留出分隔线两侧的气口
    const size = 300;
    const left = nodes[0];
    const right = nodes[1] || nodes[0];
    items.push({ node: left, x: 520, y: 492, size, delay: 8 });
    items.push({ node: right, x: 1400, y: 492, size, delay: 18 });
    return {
      items,
      edges: [],
      flows: [],
      divider: { x: 960, y1: 318, y2: 706 },
    };
  }

  if (graph.relation === "group" || graph.relation === "split") {
    const parent = nodes[0];
    const children = nodes.slice(1);
    // 整体放大一档：父卡 190/200→216/228、子卡 168/156→192/180。
    // 父卡下移 14px、子卡下移 14px，两者间距没变，但整组更靠近画面中心的安全区，
    // 子卡标签底边仍在字幕条（y≈860）之上。
    const parentSize = graph.relation === "group" ? 216 : 228;
    const parentY = graph.relation === "group" ? 292 : 286;
    items.push({ node: parent, x: 960, y: parentY, size: parentSize, delay: 8 });
    const spacing = Math.min(350, 1420 / Math.max(1, children.length));
    const startX = 960 - ((children.length - 1) * spacing) / 2;
    const childY = graph.relation === "group" ? 660 : 672;
    const flows: GraphFlow[] = [];
    children.forEach((node, i) => {
      const size = graph.relation === "group" ? 192 : 180;
      const x = startX + i * spacing;
      // 起点要落在"类别/整体"的标签胶囊下面，否则三条箭头会在标签上糊成一团
      const top = parentY + parentSize / 2 + 58;
      const bottom = childY - size / 2 - 6;
      items.push({
        node,
        x,
        y: childY,
        size,
        delay: 20 + i * 10,
        // split：部件从整体里"散开"；group：成员从散落处"聚拢"到类别下
        enterFrom:
          graph.relation === "split"
            ? { x: 960, y: parentY }
            : { x: 960 + Math.cos(0.5 + i * 1.35) * 620, y: 470 + Math.sin(0.5 + i * 1.35) * 330 },
      });
      edges.push(
        graph.relation === "group"
          ? // 归类是"成员 → 类别"，箭头朝上，光点也跟着往回流
            { x1: x, y1: bottom, x2: 960, y2: top, delay: 16 + i * 10 }
          : { x1: 960, y1: top, x2: x, y2: bottom, delay: 16 + i * 10 },
      );
      flows.push({
        edges: [edges[edges.length - 1]],
        loop: false,
        phase: i * 0.22,
        // 光点即将到达的那一端：split 是部件，group 是类别
        target: [graph.relation === "group" ? parent.id : node.id],
        // 而这条路径讲的对象永远是成员自己——group 的类别要等旁白最后点名，
        // 不能因为它在地理上是箭头终点，就让它从入场起一直霸占高亮。
        focus: [node.id],
      });
    });
    if (graph.relation === "group" && children.length > 0) {
      const left = startX - 148;
      const right = startX + (children.length - 1) * spacing + 148;
      // 高度要包住节点下方的标签胶囊，否则虚线框会从标签中间穿过
      return {
        items,
        edges,
        flows,
        container: { x: left, y: childY - 132, w: right - left, h: 320 },
      };
    }
    return { items, edges, flows };
  }

  // chain：横向依次推进，节点等距
  // 卡 206→244、步距 500→528：环形排布放大后，链条也得跟上，
  // 否则同一支片子里"水循环"那张满屏、"食物链"那张缩在中间，观感不连续。
  const size = 244;
  const spacing = Math.min(528, 1600 / Math.max(1, n - 1));
  const startX = 960 - ((n - 1) * spacing) / 2;
  nodes.forEach((node, i) => {
    items.push({ node, x: startX + i * spacing, y: 500, size, delay: 8 + i * 11 });
  });
  for (let i = 0; i < n - 1; i += 1) {
    edges.push({
      x1: startX + i * spacing + size / 2 + 14,
      y1: 500,
      x2: startX + (i + 1) * spacing - size / 2 - 14,
      y2: 500,
      delay: 22 + i * 11,
    });
  }
  return { items, edges, flows: [{ edges, loop: false, target: nodes.slice(1).map((v) => v.id) }] };
};

/**
 * 光点沿路径取点：把每段连线的长度累加，先定位落在哪一段，再在段内插值。
 * 曲线段用二次贝塞尔公式，和 GraphConnector 画的路径完全重合，所以光点看起来
 * 就是"贴着箭头在走"，而不是另走一条看不见的线。
 */
const edgeLength = (edge: GraphEdge): number => {
  const chord = Math.sqrt((edge.x2 - edge.x1) ** 2 + (edge.y2 - edge.y1) ** 2);
  if (edge.mx === undefined || edge.my === undefined) return chord;
  const leg1 = Math.sqrt((edge.mx - edge.x1) ** 2 + (edge.my - edge.y1) ** 2);
  const leg2 = Math.sqrt((edge.x2 - edge.mx) ** 2 + (edge.y2 - edge.my) ** 2);
  return (leg1 + leg2 + chord) / 2;
};

const pointOnEdge = (edge: GraphEdge, u: number): { x: number; y: number } => {
  if (edge.mx === undefined || edge.my === undefined) {
    return { x: edge.x1 + (edge.x2 - edge.x1) * u, y: edge.y1 + (edge.y2 - edge.y1) * u };
  }
  const k = 1 - u;
  return {
    x: k * k * edge.x1 + 2 * k * u * edge.mx + u * u * edge.x2,
    y: k * k * edge.y1 + 2 * k * u * edge.my + u * u * edge.y2,
  };
};

/** t ∈ [0,1) 在全路径上的位置；loop=true 时首尾相接，否则到头即定住（配合透明度淡出重来） */
const flowPoint = (
  flow: GraphFlow,
  t: number,
): { x: number; y: number; segment: number; local: number } => {
  const lengths = flow.edges.map(edgeLength);
  const total = lengths.reduce((sum, v) => sum + v, 0) || 1;
  let remain = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remain <= lengths[i] || i === lengths.length - 1) {
      const u = lengths[i] > 0 ? Math.min(1, remain / lengths[i]) : 0;
      const point = pointOnEdge(flow.edges[i], u);
      return { ...point, segment: i, local: u };
    }
    remain -= lengths[i];
  }
  return { x: flow.edges[0].x1, y: flow.edges[0].y1, segment: 0, local: 0 };
};

/**
 * 抽象概念的示意符号。水蒸气、力气、时间没有实体形状，但"看不见的东西"只有
 * 六种画法：能数的、会上升的、有高低的、在流动的、跟时间有关的、说不清的其他。
 * 六种都是画法而不是主题，所以任何抽象概念都能落到其中一种，不会出现空占位。
 */
const AbstractSign: React.FC<{
  sign: string;
  size: number;
  accent: string;
  /** 这一屏的叙事进度 0→1：count/rise/level/time 跟着它单调推进，讲完就停在终态 */
  progress: number;
}> = ({ sign, size, accent, progress }) => {
  const frame = useLocalFrame();
  const box = { width: size * 0.74, height: size * 0.74 };
  const at = Math.max(0, Math.min(1, progress));

  if (sign === "count") {
    // 数到第几个就亮几个：已经数过的不熄灭，讲完停在满格
    const shown = Math.round(at * 9);
    return (
      <svg viewBox="0 0 100 100" style={box}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
          const lit = i < shown;
          const newest = i === shown - 1;
          return (
            <circle
              key={i}
              cx={24 + (i % 3) * 26}
              cy={24 + Math.floor(i / 3) * 26}
              r={lit ? (newest ? 9.2 : 8) : 6}
              fill={accent}
              opacity={lit ? 0.95 : 0.2}
            />
          );
        })}
      </svg>
    );
  }

  if (sign === "rise") {
    // 珠子真的从底部升到顶部，升上去的留在上面不回落——这才是"水蒸气跑上去了"
    const columns = [28, 50, 72];
    return (
      <svg viewBox="0 0 100 100" style={box}>
        {columns.map((x, i) => (
          <path
            key={"g" + i}
            d={"M " + x + " 92 Q " + (x + 9) + " 74 " + x + " 56 Q " + (x - 9) + " 38 " + x + " 18"}
            fill="none"
            stroke={accent}
            strokeWidth="4"
            strokeDasharray="6 8"
            opacity="0.26"
          />
        ))}
        {columns.map((x, i) => {
          const begin = i * 0.16;
          const local = Math.max(0, Math.min(1, (at - begin) / Math.max(0.12, 1 - begin)));
          return (
            <circle
              key={"d" + i}
              cx={x + Math.sin(local * Math.PI * 1.6 + i) * 6}
              cy={92 - local * 74}
              r={7.5 - local * 2.5}
              fill={accent}
              opacity={0.22 + local * 0.7}
            />
          );
        })}
      </svg>
    );
  }

  if (sign === "level") {
    // 液面上升：单调往上，只用极小的呼吸量避免看起来像贴图
    const level = 0.1 + at * 0.78 + Math.sin(frame / 40) * 0.008;
    return (
      <svg viewBox="0 0 100 100" style={box}>
        <rect x="34" y="12" width="32" height="76" rx="16" fill="none" stroke={accent} strokeWidth="5" opacity="0.35" />
        <rect x="40" y={84 - 70 * level} width="20" height={70 * level} rx="10" fill={accent} opacity="0.85" />
        <line x1="72" y1="28" x2="82" y2="28" stroke={accent} strokeWidth="4" opacity="0.5" />
        <line x1="72" y1="50" x2="82" y2="50" stroke={accent} strokeWidth="4" opacity="0.5" />
        <line x1="72" y1="72" x2="82" y2="72" stroke={accent} strokeWidth="4" opacity="0.5" />
      </svg>
    );
  }

  if (sign === "flow") {
    return (
      <svg viewBox="0 0 100 100" style={box}>
        {[0, 1, 2].map((i) => {
          const p = ((frame * 1.5 + i * 30) % 90) / 90;
          const x = 6 + p * 64;
          return (
            <path
              key={i}
              d={"M " + x + " 33 L " + (x + 17) + " 50 L " + x + " 67"}
              fill="none"
              stroke={accent}
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.18 + p * 0.75}
            />
          );
        })}
      </svg>
    );
  }

  if (sign === "time") {
    // 表针随讲解走完一圈，停下时指向终点，而不是永远匀速空转
    const angle = at * Math.PI * 2 - Math.PI / 2;
    return (
      <svg viewBox="0 0 100 100" style={box}>
        <circle cx="50" cy="50" r="34" fill="none" stroke={accent} strokeWidth="6" opacity="0.75" />
        <line
          x1="50"
          y1="50"
          x2={50 + Math.cos(angle) * 26}
          y2={50 + Math.sin(angle) * 26}
          stroke={accent}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="50" cy="50" r="5" fill={accent} />
      </svg>
    );
  }

  const spin = frame * 0.9;
  return (
    <svg viewBox="0 0 100 100" style={box}>
      <circle
        cx="50"
        cy="50"
        r="32"
        fill="none"
        stroke={accent}
        strokeWidth="4"
        strokeDasharray="9 11"
        opacity="0.5"
        transform={"rotate(" + spin + " 50 50)"}
      />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (frame / 70) * Math.PI * 2 + (i / 6) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 32} cy={50 + Math.sin(a) * 32} r="4.5" fill={accent} opacity="0.8" />;
      })}
      <circle cx="50" cy="50" r={9 + Math.sin(frame / 9) * 1.6} fill={accent} opacity="0.9" />
    </svg>
  );
};

const GraphConnector: React.FC<{ edge: GraphEdge; accent: string }> = ({ edge, accent }) => {
  const frame = useLocalFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - edge.delay,
    fps,
    config: { damping: 22, stiffness: 88, mass: 1 },
  });
  if (progress <= 0.002) return null;

  const curved = edge.mx !== undefined && edge.my !== undefined;
  const d = curved
    ? "M " + edge.x1 + " " + edge.y1 + " Q " + edge.mx + " " + edge.my + " " + edge.x2 + " " + edge.y2
    : "M " + edge.x1 + " " + edge.y1 + " L " + edge.x2 + " " + edge.y2;
  const length = curved
    ? 520
    : Math.sqrt((edge.x2 - edge.x1) * (edge.x2 - edge.x1) + (edge.y2 - edge.y1) * (edge.y2 - edge.y1));
  const angle = curved
    ? Math.atan2(edge.y2 - (edge.my as number), edge.x2 - (edge.mx as number))
    : Math.atan2(edge.y2 - edge.y1, edge.x2 - edge.x1);
  const deg = (angle * 180) / Math.PI;

  return (
    <g opacity={progress}>
      <path
        d={d}
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - progress)}
        opacity={0.72}
      />
      <polygon
        points="-3,-10 17,0 -3,10"
        transform={"translate(" + edge.x2 + "," + edge.y2 + ") rotate(" + deg + ")"}
        fill={accent}
        opacity={0.8}
      />
    </g>
  );
};

const GraphBadge: React.FC<{
  item: GraphItem;
  iconSrc?: string;
  accent: string;
  active: boolean;
  /** 光点已经走过这个节点：留一道细边，表示"这一步讲完了" */
  visited?: boolean;
  storyProgress: number;
  /** 这个名字被念到的那一段（场景内相对帧）；缺省 = 没有配音/词没命中，回退整屏均摊 */
  cueWindow?: { start: number; end: number } | null;
  /**
   * 入场帧覆盖：卡片要在这个词被念到之前落位。
   * 只在"按固定阶梯排队会晚于点名"时才会传（星形拓扑的成员卡），
   * 其余关系保持既定的入场节奏不变。
   */
  enterAt?: number;
  /** beats 解释器给出的本拍状态；null/缺省 = 原路径（公式在 amp=1 时逐像素等价） */
  beat?: {
    motion: string;
    beatProgress: number;
    popFrame: number;
    amplitude: number;
    delayOverride?: number;
  } | null;
}> = ({ item, iconSrc, accent, active, visited, storyProgress, cueWindow, enterAt, beat }) => {
  const frame = useLocalFrame();
  const { fps } = useVideoConfig();
  /**
   * 语义动作的时间基。有锚点就只在"念到这个词 → 这句话说完"之间推进：
   * 锚点之前停在起点（旁白还没提它，不该先演），窗口结束停在终态。
   * 没有锚点退回整屏均摊，与旧行为逐像素一致。
   */
  const actionProgress = cueWindow
    ? Math.max(0, Math.min(1, (frame - cueWindow.start) / Math.max(1, cueWindow.end - cueWindow.start)))
    : storyProgress;
  // 揭示 gating：被某拍 reveal 的节点推迟到那一拍才入场（stagger 拍内再错开）
  // enterAt 只做"提前"，不推迟——它解决的是"话已经说了、卡片还没飞到"，
  // 不是"还没讲到就不要出现"，后者会改掉 split 的"整体摊开给人看"。
  const enterDelay =
    beat && beat.delayOverride !== undefined
      ? beat.delayOverride
      : enterAt !== undefined
        ? Math.min(enterAt, item.delay)
        : item.delay;
  const enter = spring({
    frame: frame - enterDelay,
    fps,
    config: { damping: 13, stiffness: 150, mass: 0.85 },
  });
  // 从远处飞进框里（group 聚拢 / split 散开）要比原地弹出更慢，用近乎无回弹的曲线
  const travel = item.enterFrom
    ? spring({ frame: frame - enterDelay, fps, config: { damping: 26, stiffness: 62, mass: 1.1 } })
    : enter;
  // growth 要"现场长大"：尺寸由这一屏的叙事进度决定，讲到它才撑起来，讲过了保持满格。
  // 用 smoothstep 而不是 spring，是因为 spring 会在入场时一冲就没，与讲解位置脱钩。
  const growLocal = item.growWindow
    ? Math.max(
        0,
        Math.min(
          1,
          (storyProgress - item.growWindow[0]) / Math.max(0.001, item.growWindow[1] - item.growWindow[0]),
        ),
      )
    : 0;
  const growEase = growLocal * growLocal * (3 - 2 * growLocal);
  // 体量变化（云越积越厚、冰块化掉）：幅度固定 28%，够看出变化又不会挤到邻居。
  // growth 关系已经有逐节点长大，不再叠一层，否则同一张卡片会长两次。
  // beats 路径下 swell 拍的体量跟着「本拍进度」走，讲到哪涨到哪，而不是整屏均摊。
  const swellT = beat && beat.motion === "swell" ? beat.beatProgress : actionProgress;
  const swellK = !item.grow
    ? item.node.swell === "grow"
      ? 1 + 0.28 * swellT
      : item.node.swell === "shrink"
        ? 1 - 0.28 * swellT
        : 1
    : 1;
  // 焦点分三档：讲到的推到前面并持续呼吸，讲过的归位，还没讲到的退到后面。
  // 改之前只有被点亮的那张卡在动（占画面约 4%），其余 96% 面积完全静止，
  // 实测中段 99% 的相邻帧几乎没有像素变化——不是没有动效，是动的那块太小。
  // 呼吸幅度 4%、周期约 36 帧：180px 的卡每帧位移约 1.2px，刚好过"看得出在动"的阈值。
  // 再快会像心跳，再慢就回到亚像素。
  // 年龄幅度：amp=1（原路径）时 1+0.16=1.16、呼吸 0.05，与旧公式完全一致；
  // 3-4 岁 amp=1.25 → 焦点更大、呼吸更明显，5-6 岁 amp=1.12 → 稍快稍收敛。
  const amp = beat ? beat.amplitude : 1;
  const focusK = active ? 1 + 0.16 * amp + Math.sin(frame / 5.7) * 0.05 * amp : visited ? 0.97 : 0.86;
  // spring-pop 拍：焦点主体带弹性过冲地弹出（低阻尼 spring 天然有过冲），
  // 落定后回到呼吸档。只在 beats 路径且本拍 motion=spring-pop 时生效。
  const popK =
    beat && beat.motion === "spring-pop" && active
      ? 0.62 + 0.38 * spring({ frame: beat.popFrame, fps, config: { damping: 8, stiffness: 170, mass: 0.7 } })
      : 1;
  const scale = (item.grow ? 0.42 + growEase * 0.58 : 0.55 + enter * 0.45) * focusK * swellK * popK;
  const dx = item.enterFrom ? (item.enterFrom.x - item.x) * (1 - travel) : 0;
  const dy = item.enterFrom ? (item.enterFrom.y - item.y) * (1 - travel) : 0;
  const role = item.node.role;
  const radius = role === "subject" || role === "abstract" ? "50%" : 34;
  // 抽象节点靠内部符号表达"看不见"，卡框就和其他节点统一成实线，两种虚线叠在一起太乱
  const border = active
    ? "4px solid " + accent
    : visited
      ? "3px solid " + accent
      : "3px solid rgba(255,255,255,0.9)";
  const size = item.size;
  // 没图标时用标签文字顶上：两个字才能看出是什么，一个字会被误读（「水果」变「水」）
  const glyph = item.node.label.slice(0, 2);
  const glyphSize = glyph.length > 1 ? size * 0.3 : size * 0.46;

  return (
    <div
      style={{
        position: "absolute",
        left: item.x - size / 2,
        top: item.y - size / 2,
        width: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // 退后的节点同时降透明度：只缩小不降透明度，看起来像"画小了"而不是"退到后面"。
        // 保留下限 0.84——5-6 岁看的画面，未讲到的词也得看得清，不能淡到读不出。
        opacity: enter * (active ? 1 : visited ? 0.92 : 0.82),
        // 位移留在外层，缩放只作用在图形盒上：标签不跟着缩放，
        // 否则小尺寸时「幼苗」缩到 13px 根本看不清
        transform: "translate(" + dx + "px, " + dy + "px)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          transform: "scale(" + scale + ")",
          // 以底边为锚：长大的时候是"往上顶"，底部始终踩在地面线上
          transformOrigin: "center bottom",
        }}
      >
        {active ? (
          <div
            style={{
              position: "absolute",
              left: -12,
              top: -12,
              width: size + 24,
              height: size + 24,
              borderRadius: radius === "50%" ? "50%" : 46,
              border: "5px solid " + accent,
              // 光环跟着同一个呼吸周期走：两处不同频会互相打架，看起来像抖动而不是呼吸
              opacity: 0.3 + Math.sin(frame / 5.7) * 0.12 * amp,
            }}
          />
        ) : null}
        <div
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            background: "rgba(255,255,255,0.95)",
            border,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 30px rgba(18, 48, 24, 0.18)",
            overflow: "hidden",
          }}
        >
          {iconSrc ? (
            <Img
              src={staticFile(iconSrc)}
              style={{ width: size * 0.84, height: size * 0.84, objectFit: "contain" }}
            />
          ) : role === "abstract" ? (
            <AbstractSign
              sign={item.node.sign || "orb"}
              size={size}
              accent={accent}
              progress={actionProgress}
            />
          ) : (
            <div
              style={{
                fontSize: glyphSize,
                fontWeight: 900,
                color: accent,
                lineHeight: 1,
                letterSpacing: 2,
              }}
            >
              {glyph}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          borderRadius: 14,
          background: active ? accent : "rgba(255,255,255,0.9)",
          color: active ? "#ffffff" : "#12303a",
          padding: "4px 16px",
          fontSize: 30,
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
      >
        {item.node.label}
      </div>
    </div>
  );
};

/** 一颗光点走完一整条路径的帧数：让它慢到能看清"经过了哪个概念" */
const FLOW_PERIOD = 84;
/**
 * 一条边挂词后的最短时长（帧）。旁白把两个概念连着念时（"水汽·云"），
 * 边只有五六帧就走完，肉眼只看到闪烁——这种段不挂词，整条路径回退时钟。
 */
const FLOW_MIN_SEG = 12;

/** 数学角 → 屏幕坐标点（y 轴翻转）。与后端 figure-spec.ts 的 shapeBounds 用同一套约定 */
const figurePointAt = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
};

/**
 * 圆弧路径。
 *
 * 方向这件事踩过坑：数学角增大在 SVG（y 向下）里是逆时针，对应 sweep-flag 0。
 * 写反的话 ∩ 会变成 ∪ —— 彩虹的弧顶跑到画面外，看着像"彩虹埋在地里"，
 * 而在代码和设计文档上都完全看不出问题，只有渲染出来才知道。
 */
const figureArcPath = (s: Extract<FigureShapeView, { kind: "arc" }>) => {
  let from = s.from;
  let to = s.to;
  let sweep = 0;
  if (to < from) {
    from = s.to;
    to = s.from;
    sweep = 1;
  }
  const start = figurePointAt(s.cx, s.cy, s.r, from);
  const end = figurePointAt(s.cx, s.cy, s.r, to);
  const largeArc = to - from > 180 ? 1 : 0;
  return "M " + start.x + " " + start.y + " A " + s.r + " " + s.r + " 0 " + largeArc + " " + sweep + " " + end.x + " " + end.y;
};

/** 单个图元。生长动画按图元类型给不同写法：线用描边生长，面用展开 */
const FigureShapePart: React.FC<{ glyph: FigureGlyphView; p: number }> = ({ glyph, p }) => {
  if (p <= 0.001) return null;

  if (glyph.kind === "subjectIcon") {
    // 有素材时由 FigureStage 的 <Img> 叠层渲染（SVG <image> 不走 delayRender，
    // 会在图片加载完成前截帧）；这里只画"没找到素材"的占位圆
    if (glyph.iconSrc) return null;
    const r = glyph.size / 2;
    return (
      <g opacity={Math.min(1, p * 2)}>
        <circle cx={glyph.x} cy={glyph.y} r={r * (0.7 + p * 0.3)} fill="#E8F0F8" stroke="#8B9AA8" strokeWidth={6} />
        <text
          x={glyph.x}
          y={glyph.y + glyph.size * 0.14}
          textAnchor="middle"
          fontSize={glyph.size * 0.42}
          fontWeight={900}
          fill="#5A6B7B"
        >
          {glyph.subject.slice(0, 1)}
        </text>
      </g>
    );
  }

  if (glyph.kind === "arc") {
    const len = glyph.r * Math.abs(glyph.to - glyph.from) * (Math.PI / 180);
    // 整圈弧（0→360）用 path 画不出来：起点终点重合，A 命令退化成一个点。
    // 实测太阳系的 8 条轨道只剩几段虚线，整张图像"什么都没画"。
    // 整圈一律走 <circle>。
    if (Math.abs(glyph.to - glyph.from) >= 355) {
      return (
        <circle
          cx={glyph.cx}
          cy={glyph.cy}
          r={glyph.r}
          fill="none"
          stroke={glyph.stroke}
          strokeWidth={glyph.width}
          strokeDasharray={len}
          strokeDashoffset={len * (1 - p)}
        />
      );
    }
    return (
      <path
        d={figureArcPath(glyph)}
        fill="none"
        stroke={glyph.stroke}
        strokeWidth={glyph.width}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
    );
  }

  if (glyph.kind === "line") {
    const len = Math.hypot(glyph.x2 - glyph.x1, glyph.y2 - glyph.y1);
    return (
      <line
        x1={glyph.x1}
        y1={glyph.y1}
        x2={glyph.x2}
        y2={glyph.y2}
        stroke={glyph.stroke}
        strokeWidth={glyph.width}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
    );
  }

  if (glyph.kind === "curve") {
    // 贝塞尔弧长没有解析解，用起/中/终三点折线近似足够驱动描边生长
    const midX = (glyph.x1 + 3 * glyph.c1x + 3 * glyph.c2x + glyph.x2) / 8;
    const midY = (glyph.y1 + 3 * glyph.c1y + 3 * glyph.c2y + glyph.y2) / 8;
    const len =
      (Math.hypot(midX - glyph.x1, midY - glyph.y1) + Math.hypot(glyph.x2 - midX, glyph.y2 - midY)) * 1.04;
    return (
      <path
        d={
          "M " + glyph.x1 + " " + glyph.y1 + " C " + glyph.c1x + " " + glyph.c1y + " " + glyph.c2x + " " + glyph.c2y + " " + glyph.x2 + " " + glyph.y2
        }
        fill="none"
        stroke={glyph.stroke}
        strokeWidth={glyph.width}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
    );
  }

  if (glyph.kind === "circle") {
    // 圆从中心长出来，比淡入更像"画上去的"
    const grow = 0.45 + p * 0.55;
    return (
      <circle
        cx={glyph.cx}
        cy={glyph.cy}
        r={glyph.r * grow}
        fill={glyph.fill}
        // 校验层只给"离底色太近"的图元补轮廓（纯白雨珠、月亮），其余为 undefined
        stroke={glyph.stroke}
        strokeWidth={glyph.strokeWidth}
        opacity={Math.min(1, p * 2.2)}
      />
    );
  }

  if (glyph.kind === "rect") {
    const grow = 0.86 + p * 0.14;
    return (
      <rect
        x={glyph.x + (glyph.w * (1 - grow)) / 2}
        y={glyph.y + (glyph.h * (1 - grow)) / 2}
        width={glyph.w * grow}
        height={glyph.h * grow}
        rx={glyph.rx}
        fill={glyph.fill}
        stroke={glyph.stroke}
        strokeWidth={glyph.strokeWidth}
        opacity={Math.min(1, p * 2)}
      />
    );
  }

  return (
    <polygon
      points={glyph.points}
      fill={glyph.fill}
      stroke={glyph.stroke}
      strokeWidth={glyph.strokeWidth}
      opacity={Math.min(1, p * 2)}
    />
  );
};

/**
 * 受控画板渲染。
 *
 * 这一层只做三件事：坐标不出界、图元白名单、按 reveal 顺序生长。
 * "画得好不好看"不在代码里判断 —— 那是 LLM 交上来的几何本身的质量，
 * 由后端几何校验（覆盖率/居中/弧半径/标签压图）先拦一道。
 */
const FigureStage: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useLocalFrame();
  const figure = scene.figure as FigureView;
  const accent = scene.accentColor || "#3E63DD";
  const bs = beatStateAt(scene, frame);

  // 扣掉入场和收尾，剩下的就是"讲到哪儿了"，与字幕同一条时间轴
  const linearProgress = Math.max(0, Math.min(1, (frame - 10) / Math.max(20, duration - 22)));
  // beats 路径：画到第几笔由「第几拍」决定——旁白讲到哪，颜色就长到哪，
  // 而不是整屏按固定斜率匀速生长（旧路径，无 beats 时保留）。
  const progress = bs
    ? bs.idx < 0
      ? 0
      : Math.max(0, Math.min(1, (bs.idx + bs.beatProgress) / bs.count))
    : linearProgress;
  const maxReveal = Math.max(0.0001, ...figure.shapes.map((s) => s.reveal));
  // 最后一个图元必须留够生长窗口，且要在讲解说完之前画完 —— 否则字幕讲完七种颜色，
  // 最内两圈还在长。可用区间收到 0.78，窗口 0.14，最后一道在 0.92 收笔。
  const waveSize = 0.14;
  const revealAt = (value: number) => (value / maxReveal) * (1 - waveSize - 0.08);
  const shapeProgress = (value: number) => Math.max(0, Math.min(1, (progress - revealAt(value)) / waveSize));
  const labelProgress = Math.max(0, Math.min(1, (progress - 0.6) / 0.2));

  // 标签跟拍：被某拍 reveal/focus 点名的标签，在那一拍开始后 12 帧内浮现；
  // 没被编排点名的沿用旧的 0.6 阈值（无 beats 时全部走这条，逐像素不变）。
  const labelBeat: Record<string, number> = {};
  if (bs && scene.choreography) {
    for (const b of scene.choreography.beats) {
      const names = (b.reveal || []).slice();
      if (b.focus) names.push(b.focus);
      for (const name of names) {
        if (labelBeat[name] === undefined) labelBeat[name] = b.startFrame;
      }
    }
  }
  const labelAt = (text: string) => {
    const at = labelBeat[text];
    if (at === undefined) return labelProgress;
    return Math.max(0, Math.min(1, (frame - at) / 12));
  };
  const focusedLabel = bs && bs.current ? bs.current.focus : undefined;
  const pushK =
    bs && bs.current && bs.current.motion === "camera-push" ? 0.05 * bs.amplitude * bs.beatProgress : 0;

  // subjectIcon 素材层：<Img> 走 delayRender，截帧前保证图片已加载
  const iconGlyphs = figure.shapes.filter(
    (g): g is Extract<FigureGlyphView, { kind: "subjectIcon" }> => g.kind === "subjectIcon" && !!g.iconSrc
  );

  const canvas = (
    <>
    <svg
      width={FIGURE_W}
      height={FIGURE_H}
      viewBox={"0 0 " + FIGURE_W + " " + FIGURE_H}
      style={{
        position: "absolute",
        left: (1920 - FIGURE_W) / 2,
        // 画布底边必须落在字幕条（顶边约 845）之上，否则弧的落脚点被字幕吃掉
        top: 196,
        overflow: "visible",
      }}
    >
      {figure.shapes.map((glyph, i) => (
        <FigureShapePart key={"f" + i} glyph={glyph} p={shapeProgress(glyph.reveal)} />
      ))}
      {(figure.labels || []).map((label, i) => {
        const lp = labelAt(label.text);
        if (lp <= 0) return null;
        const focused = focusedLabel === label.text;
        const boxW = label.text.length * 34 + 20;
        return (
          <g key={"fl" + i}>
            {focused ? (
              <rect
                x={label.x - boxW / 2}
                y={label.y - 36}
                width={boxW}
                height={50}
                rx={12}
                fill="none"
                stroke={accent}
                strokeWidth={4}
                opacity={0.85 * lp}
              />
            ) : null}
            <text
              x={label.x}
              y={label.y + (1 - lp) * 14}
              textAnchor="middle"
              fontSize={34}
              fontWeight={900}
              fill={label.color || accent}
              // 白色描边垫底：实测"太阳"这种两字标签会正好落在太阳圆面上，
              // 颜色关系和图形撞在一起就读不出来。文字的可读性由模板兜住，不指望模型摆准。
              stroke="#FFFFFF"
              strokeWidth={9}
              strokeLinejoin="round"
              paintOrder="stroke"
              opacity={lp}
            >
              {label.text}
            </text>
          </g>
        );
      })}
    </svg>
    {iconGlyphs.map((glyph, i) => {
      const p = shapeProgress(glyph.reveal);
      if (p <= 0.001) return null;
      const grow = 0.6 + p * 0.4;
      return (
        <Img
          key={"fi" + i}
          src={staticFile(glyph.iconSrc as string)}
          style={{
            position: "absolute",
            left: (1920 - FIGURE_W) / 2 + glyph.x - glyph.size / 2,
            top: 196 + glyph.y - glyph.size / 2,
            width: glyph.size,
            height: glyph.size,
            objectFit: "contain",
            opacity: Math.min(1, p * 2),
            transform: "scale(" + grow + ")",
          }}
        />
      );
    })}
    </>
  );

  if (pushK <= 0) return canvas;
  const focusLabel = (figure.labels || []).find((l) => l.text === focusedLabel);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: "scale(" + (1 + pushK) + ")",
        transformOrigin: focusLabel
          ? (1920 - FIGURE_W) / 2 + focusLabel.x + "px " + (196 + focusLabel.y) + "px"
          : "center center",
      }}
    >
      {canvas}
    </div>
  );
};

const SceneGraphStage: React.FC<{ scene: GeneratedScene; duration: number }> = ({
  scene,
  duration,
}) => {
  const frame = useLocalFrame();
  const graph = scene.sceneGraph as SceneGraphView;
  const icons = scene.graphIcons || {};
  const layout = layoutGraph(graph);
  const count = Math.max(1, graph.nodes.length);
  const warmup = 18;
  /**
   * 这一屏的叙事进度 0→1：扣掉入场和收尾，中间的才是"讲解"发生的时间。
   * 它单调推进、不回头、有终态，所以符号和尺寸能跟着讲解走完，
   * 而不是播完入场动画就停在原地空转。
   */
  const storyStart = warmup;
  const storyEnd = Math.max(storyStart + 40, duration - 28);
  const storyProgress = Math.max(0, Math.min(1, (frame - storyStart) / (storyEnd - storyStart)));
  // 每个节点自己的动作时间窗（后端按词边界算好）。缺省或探针关掉时退回整屏均摊。
  const cueWindows: Record<string, { start: number; end: number }> =
    scene.anchorSigns === false ? {} : scene.actionAnchors || {};

  // 光点沿箭头前进：走到哪个节点，哪个节点亮起来。这就是"状态变化"——
  // 画面不再是一次性排好版就静止，而是持续看得出"事情正在发生"。
  //
  // 它原来挂在 storyProgress 上：光点按整屏时钟匀速走，"到达某节点"的那一帧与旁白
  // 念到这个词没有任何关系。挂词之后一条边 = "从 A 说到 B 的那段话"，走到 B 的那一帧
  // 正好是念到 B 的那一帧。这件事比节点自己的动作更要紧：光点决定谁亮着，
  // 而"亮着"就是孩子在看的那个概念——提前亮就是提前把注意力搬走。
  //
  // 三条边界：
  // 1. 边的时间窗由节点的 cueWindows 反推；任一环节缺词就整条路径回退时钟驱动，
  //    不做部分下发——半条挂词、半条挂钟，画面上会出现两套节奏。
  // 2. 一段短于 FLOW_MIN_SEG 帧（0.4s）看不清"经过了什么"，同样回退。
  // 3. 循环关系的最后一段（回到起点）在旁白里没有对应的"到达"，落在本屏收尾帧上。
  const flowCueOn = scene.flowAnchors !== false;
  const cueSpokenFrames = flowCueOn
    ? Object.keys(cueWindows)
      .map((id) => cueWindows[id].start)
      .sort((a, b) => a - b)
    : [];
  /** 旁白在这帧之前最后念到的是哪一帧——它是"这一条边从哪里动身"的起点 */
  const spokenBefore = (f: number): number | null => {
    let prev: number | null = null;
    for (let i = 0; i < cueSpokenFrames.length; i += 1) {
      if (cueSpokenFrames[i] < f - 1) prev = cueSpokenFrames[i];
      else break;
    }
    return prev;
  };
  /** 一条路径的到达时刻表：stops[0] 动身，stops[i+1] 到达 target[i]。任一环不成立返回 null */
  const flowStops = (flow: GraphFlow): number[] | null => {
    if (!flowCueOn) return null;
    const targets = flow.target;
    if (!targets || targets.length === 0) return null;
    // 路径段数与到达节点数必须一一对应，否则 t 与 stops 无法逐段对齐
    if (flow.edges.length !== targets.length) return null;
    const arrive = (id: string): number | null => (cueWindows[id] ? cueWindows[id].start : null);
    const first = arrive(targets[0]);
    if (first === null) return null;
    // group 是"归入"：成员被点名的那一刻从成员出发，飞到类别被点名的那一刻落地。
    // split（散开）、chain/cycle（推进）是另一个方向：上一个被念到的节点就是出发地，
    // 到达帧由落点自己的词给出。两者不能共用一个 depart 推导——
    // group 的落点（类别）在旁白末尾才出现，按"上一个被念到的节点"推，
    // 三条路径会全部挤到同一帧出发、同一帧到达，错开走的收益被整块抹掉。
    if (flow.focus && flow.focus[0] && flow.focus[0] !== targets[0]) {
      const depart = arrive(flow.focus[0]);
      const land = arrive(targets[0]);
      if (depart === null || land === null) return null;
      if (land - depart < FLOW_MIN_SEG) return null;
      return [depart, land];
    }
    const depart = spokenBefore(first);
    if (depart === null) return null;
    const stops: number[] = [depart];
    for (let i = 0; i < targets.length; i += 1) {
      if (flow.loop && i === targets.length - 1) {
        stops.push(Math.max(stops[stops.length - 1] + FLOW_MIN_SEG, storyEnd));
        continue;
      }
      const at = arrive(targets[i]);
      if (at === null) return null;
      stops.push(at);
    }
    for (let i = 1; i < stops.length; i += 1) {
      if (stops[i] - stops[i - 1] < FLOW_MIN_SEG) return null;
    }
    return stops;
  };
  /**
   * 帧 → 路径参数 t。按每条边的时长分段、边内线性，所以"一条边正好走完一段话"；
   * t 的区间边界按边长归一，光点仍贴着箭头走，不另走一条看不见的线。
   */
  const tAtStops = (flow: GraphFlow, stops: number[]): number => {
    const lengths = flow.edges.map(edgeLength);
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    const bounds: number[] = [0];
    let acc = 0;
    for (let i = 0; i < lengths.length; i += 1) {
      acc += lengths[i];
      bounds.push(acc / total);
    }
    if (frame <= stops[0]) return 0;
    for (let i = 0; i < stops.length - 1; i += 1) {
      if (frame <= stops[i + 1]) {
        const span = Math.max(1, stops[i + 1] - stops[i]);
        const u = (frame - stops[i]) / span;
        return bounds[i] + u * (bounds[i + 1] - bounds[i]);
      }
    }
    // 走完一整条路径：循环关系继续一圈一圈转，其余停在终点
    if (flow.loop) {
      return (1 + (frame - stops[stops.length - 1]) / FLOW_PERIOD) % 1;
    }
    return 1;
  };

  const flowCount = layout.flows.length;
  const tokens = layout.flows.map((flow, index) => {
    const stops = flowStops(flow);
    if (stops) {
      const t = tAtStops(flow, stops);
      // 讲完之后循环关系还会继续转（"一圈又一圈"），但高亮不能再跟着转：
      // 转一圈 2.8 秒，被点亮的节点每 21 帧换一个，孩子会以为刚讲完的概念又开始了。
      // 转完第一圈就把焦点钉在最后讲到的那个概念上，光点继续绕只是"还在循环"的提示。
      const done = flow.loop && frame >= stops[stops.length - 1];
      return {
        flow,
        t,
        anchored: true,
        done,
        finalId: done ? flow.target[flow.target.length - 2] || flow.target[0] : "",
        alpha: flow.loop ? 0.95 : t < 0.94 ? 1 : Math.max(0, (1 - t) / 0.06),
        point: flowPoint(flow, t),
      };
    }
    if (flow.loop) {
      // 循环关系（水循环）本来就无止境，按固定周期一直转是对的
      const raw = (frame - warmup) / FLOW_PERIOD;
      const t = ((raw % 1) + 1) % 1;
      return { flow, t, anchored: false, done: false, finalId: "", alpha: 0.95, point: flowPoint(flow, t) };
    }
    // 多条独立路径（split 散开 / group 聚拢）必须错开走。
    // 原来所有路径共用一个 storyProgress：5 条光点同时出发、同时到达，
    // 5 个部件在同一帧一起亮起来——整屏从头到尾只有 1 个视觉事件。
    // 实测中段 140 帧里只有 1 帧有明显变化，这就是"呆板"的直接来源。
    // 单条路径（chain，一环扣一环）保持原来的"整屏一次走完"，不能被切开。
    const spread = flowCount > 1 ? 0.58 : 0;
    const slot = flowCount > 1 ? spread / flowCount : 0;
    const begin = index * slot;
    const span = Math.max(0.3, 1 - spread);
    const t = Math.max(0, Math.min(1, (storyProgress - begin) / span));
    return {
      flow,
      t,
      anchored: false,
      done: false,
      finalId: "",
      alpha: t < 0.94 ? 1 : Math.max(0, (1 - t) / 0.06),
      point: flowPoint(flow, t),
    };
  });
  const activeIds = new Set<string>();
  const visitedIds = new Set<string>();
  /**
   * 星形拓扑（split/group）里，"谁亮着"不能由光点推断——一屏上是 N 条互不相交的路径，
   * 每条只管自己那一个成员。
   *
   * group 的箭头是"成员 → 类别"，光点全部落在类别上，于是实测出来：
   * 三个成员（苹果、香蕉、葡萄）从头到尾 0 帧被点亮过，而"水果"从入场结束第 18 帧
   * 就亮着，比旁白念到它（第 71 帧）早 53 帧——整整 1.8 秒的注意力挂在一个还没讲的词上。
   *
   * 这里的口径改成"旁白念到谁，谁就亮"：按被念到的先后排一次序，取本帧之前最后一次点名。
   * 光点退回它本来的职责——"归入/散开"的手势，不再兼任焦点调度。
   * 只有全部节点都能锚定时才这样走；有节点没被念到（旧缓存）就整体回退光点推导，
   * 不做部分下发：半屏挂词半屏挂钟，画面上是两种节奏同时存在。
   */
  const starRelation = graph.relation === "split" || graph.relation === "group";
  /**
   * 节点按"被念到的先后"排好的表；覆盖率不够时是 null。
   * 星形拓扑用它决定谁亮着；带拍的分镜用它决定焦点落在谁身上（见下面的 beats 分支）。
   *
   * 门槛是"能不能定位到词"，不是"一个不漏"：单字节点（云、风、雨）在旁白里出现
   * 两次以上时，逐字匹配会静默挂错位置，锚点建设本来就跳过它——要求全命中等于让
   * 这类场景永远用不上按词调度。所以按覆盖率放行：70% 以上的节点能定位就按词走，
   * 定位不到的那个保持"没被讲到"的状态（旁白里确实没有它，亮它才是错的）。
   */
  const anchoredNodes = graph.nodes.filter((node) => cueWindows[node.id]);
  const anchorOrder =
    flowCueOn &&
    anchoredNodes.length >= 2 &&
    anchoredNodes.length >= Math.ceil(graph.nodes.length * 0.7)
      ? anchoredNodes
          .map((node) => ({ id: node.id, at: cueWindows[node.id].start }))
          .sort((a, b) => a.at - b.at)
      : null;
  const starSpoken = starRelation ? anchorOrder : null;
  /**
   * 星形成员"同时被点名"的合并。
   *
   * 旁白并列列举（「苹果、香蕉和葡萄」）时，词与词只隔 15-22 帧——逐个交棒的话
   * 每个成员只亮半秒，孩子还没看清就换人了，看起来只是闪了一下。这类写法提示词
   * 压不住（实测规则上线前后"间隔 <36 帧"的相邻对都是 27-28%，见
   * scripts/probe-star-cadence.ts），所以在画面上兜：连着念出来的一组名字一起亮，
   * 这更接近"孩子听到的是一串名字"这件事本身。
   *
   * 阈值 26 帧（0.87 秒）：真实配音下"纯名单"的相邻间隔是 15-23 帧、"每项带半句"是
   * 30-36 帧、"每项整句"是 73-83 帧。26 帧落在两档之间的空档里，只吃纯名单那一档。
   * 取 20 帧会漏：s5「苹果、香蕉和葡萄」里苹果@1、香蕉@24 相隔 23 帧，第一个名字
   * 仍会单独闪 23 帧才轮到另外两个。
   */
  const STAR_MERGE_GAP = 26;
  const starGroups = starSpoken
    ? starSpoken.reduce<Array<{ ids: string[]; at: number; lastAt: number }>>((groups, item) => {
        const prev = groups[groups.length - 1];
        // 跟"组里上一个名字"比，不是跟组首比：三个名字依次隔 23/16 帧时，跟组首比
        // 会让第三个掉出组去（40-1=39），结果第一个名字单独亮、后两个一起亮。
        if (prev && item.at - prev.lastAt < STAR_MERGE_GAP) {
          prev.ids.push(item.id);
          prev.lastAt = item.at;
        } else {
          groups.push({ ids: [item.id], at: item.at, lastAt: item.at });
        }
        return groups;
      }, [])
    : null;
  /**
   * 成员卡片的入场帧：按"这个词被念到"倒推，而不是按 8/20/30/40 的固定阶梯排队。
   * 实测「都是水果」：香蕉第 24 帧被念到，卡片第 30 帧才起步、飞到落位在第 48 帧——
   * 这个词整句讲完了，画面上还没有这张卡（测量里连一次亮起都读不到）；
   * 葡萄晚 17 帧；苹果的作品在第 1 帧，卡片第 20 帧才入场，一次都没亮过。
   * 只在会晚于点名时才提前（min 比较），split 那种"先把整体摊开"的节奏不变。
   */
  const cueEnterAt: Record<string, number> = {};
  if (starRelation && flowCueOn) {
    const span = 20; // 从远处飞入的 spring 约 20 帧落位
    layout.items.forEach((item, index) => {
      const cue = cueWindows[item.node.id];
      // 第一个节点是这一屏的主题（整体/类别），画面得先立起来
      if (!cue || index === 0) return;
      const at = Math.max(0, cue.start - span);
      if (at < item.delay) cueEnterAt[item.node.id] = at;
    });
  }
  if (starGroups) {
    let spokenGroup = -1;
    for (let i = 0; i < starGroups.length; i += 1) {
      if (starGroups[i].at <= frame) spokenGroup = i;
      else break;
    }
    // 不套入场门槛（warmup）：星形拓扑的第一个词往往就是全片第一个字
    // （"苹果、香蕉和葡萄…"里「苹果」在旁白第 1 帧），等入场结束再点亮，
    // 第一个成员只剩几帧亮着就交棒了。这里提前点亮不会露馅——
    // 卡片自己还在飞入，亮着的胶囊只会跟着卡片一起进场。
    // 连着念出来的一组（间隔 <20 帧）整组一起亮：这段声音是一口气说完的，
    // 画面上分成三次闪烁反而不对。
    if (spokenGroup >= 0) {
      starGroups[spokenGroup].ids.forEach((id) => activeIds.add(id));
    }
    // 点过名的退到"讲过了"档：成员一个个沉下去，画面能看出"已经归进去几个"
    for (let i = 0; i < Math.max(0, spokenGroup); i += 1) {
      starGroups[i].ids.forEach((id) => visitedIds.add(id));
    }
  } else if (frame >= warmup) {
    tokens.forEach((token) => {
      if (token.done) {
        // 第一圈已经走完：焦点钉在最后讲到的概念上，光点继续转但不改高亮
        if (token.finalId) activeIds.add(token.finalId);
        return;
      }
      const seg = Math.max(0, Math.min(token.flow.target.length - 1, token.point.segment));
      // 时钟驱动时走到一段的一半才把高亮交给下一个节点：不这么做，光点刚离开 A
      // 就把 B 点亮，看起来像"还没讲到就抢先发光"。
      // 挂词驱动时改成"到达才点亮"——到达那一刻就是这个词被念出来的那一刻，
      // 提前半段点亮等于把注意力提前搬到一个还没讲的概念上。
      // 高亮的对象取 focus（这条路径讲的是谁），不是 target（箭头落在哪）：
      // group 两者相反，用 target 会让类别一路霸屏、成员一次不亮。
      // 只在挂词驱动时才换口径——时钟驱动必须与改动前逐像素一致（老任务重渲不变）。
      const focusIds = token.anchored && token.flow.focus ? token.flow.focus : token.flow.target;
      const fromId = seg === 0 ? graph.nodes[0].id : focusIds[seg - 1];
      const toId = focusIds[seg];
      const handoff = token.anchored ? 0.999 : 0.5;
      const target = token.point.local >= handoff ? toId : fromId;
      if (target) activeIds.add(target);
      // 走过的节点留一道细边：画面能累积出"已经讲到第几步"
      if (!token.flow.loop) {
        token.flow.target.slice(0, seg).forEach((id) => visitedIds.add(id));
        // split/group 的路径只有一段（target 只有一个元素），seg 恒为 0，
        // 上面那句永远不触发。补一条"走到终点即讲完"，否则每次切换都像从头开始。
        if (token.t >= 0.995) visitedIds.add(toId);
      }
    });
  }
  // 没有路径的关系（compare / split）靠逐个点亮来做对照。
  // 原来这里写死除以 2：200 帧的场景 5 个节点只有前 2 个被点亮过，
  // 后 3 个从头到尾停在"没讲到"的状态——一半内容没被强调过，画面也自然停住了。
  if (layout.flows.length === 0) {
    const half = Math.max(30, (duration - warmup) / Math.max(1, count));
    const index = frame < warmup ? 0 : Math.floor((frame - warmup) / half) % count;
    const current = Math.min(count - 1, index);
    activeIds.add(graph.nodes[current].id);
    // 讲过的留一道细边，画面能累积出"讲到第几个了"；否则每一拍都像重新开始
    for (let i = 0; i < current; i += 1) visitedIds.add(graph.nodes[i].id);
  }
  // split/group 的第一个节点是这一屏的主题（「大树由这些组成」里的"大树"）。
  // 焦点转到部件之后它会落到"还没讲到"那一档，跟着一起缩到 0.86——
  // 主题跟着配角退场是错的，至少保住"讲过了"的档位。
  // 挂词驱动时这条兜底反而错：group 的类别排在旁白最后（"它们都是水果"），
  // 还没念到就先标成"讲过了"等于提前给它降档。交给上面的顺序判定即可。
  if (!starSpoken && (graph.relation === "split" || graph.relation === "group")) {
    visitedIds.add(graph.nodes[0].id);
  }

  // ---- beats 解释器分支 ----
  // 分镜带句级编排时，焦点/揭示/入场全部改由拍驱动；上面的光点推导只服务
  // 无 beats 的旧分镜（已缓存任务重渲逐像素不变的回归边界）。
  const bs = beatStateAt(scene, frame);
  const beatDelays: Record<string, number> = {};
  const edgeGate = new Map<GraphEdge, number>();
  let beatDot: { x: number; y: number } | null = null;
  let pushK = 0;
  let pushOrigin = "center center";
  if (bs) {
    activeIds.clear();
    visitedIds.clear();
    const cur = bs.current;
    /**
     * 这一帧旁白念到的是谁。拍解释器只拿它决定"谁亮着、光点停哪"：
     * 一拍往往覆盖好几句话，而 beat.focus 只能写一个主体——
     * 实测 a1（8 句 / 2 拍）的第 2 拍覆盖 5 句、focus 写的是「雨滴」，
     * 于是「水汽」「白云」从头到尾 0 帧亮起，而「雨滴」在旁白第 126 帧就亮、
     * 一直到第 244 帧才真的念到它。
     * 拍仍然负责怎么演（动效、揭示、入场、相机），只是不再兼任焦点调度。
     */
    let spokenNow: string | null = null;
    if (anchorOrder) {
      for (const item of anchorOrder) {
        if (item.at <= frame) spokenNow = item.id;
        else break;
      }
    }
    const activeNow: string[] = [];
    if (cur) {
      const fid = spokenNow || resolveFocusId(graph, cur.focus);
      if (fid) activeNow.push(fid);
      // reveal 是"这一拍新出现的东西"，与焦点是两件事：按词走时也要保留
      for (const r of cur.reveal || []) {
        const rid = resolveFocusId(graph, r);
        if (rid && activeNow.indexOf(rid) < 0) activeNow.push(rid);
      }
    }
    activeNow.forEach((id) => activeIds.add(id));
    // 讲过/揭示过的退到"已讲"档，但当前拍正在讲的不算讲过
    bs.spoken.forEach((name) => {
      const id = resolveFocusId(graph, name);
      if (id && !activeIds.has(id)) visitedIds.add(id);
    });
    bs.revealed.forEach((name) => {
      const id = resolveFocusId(graph, name);
      if (id && !activeIds.has(id)) visitedIds.add(id);
    });
    // 按词走时，"已经念过的"由词决定：念过但此刻不是焦点的退到"已讲"档
    if (spokenNow && anchorOrder) {
      for (const item of anchorOrder) {
        if (item.at <= frame && item.id !== spokenNow) visitedIds.add(item.id);
      }
    }
    if (graph.relation === "split" || graph.relation === "group") {
      visitedIds.add(graph.nodes[0].id);
    }
    // 入场 gating：节点第一次被 reveal/focus 的那一拍才弹出来。
    // stagger 拍内再按序错开 7 帧——"一个接一个"而不是"一起亮"。
    // 没被任何拍提到的节点不写 delay，沿用 item.delay 正常入场（当背景陪衬）。
    for (const b of scene.choreography ? scene.choreography.beats : []) {
      const names = (b.reveal || []).slice();
      if (b.focus) names.push(b.focus);
      names.forEach((name, i) => {
        const id = resolveFocusId(graph, name);
        if (!id) return;
        const at = b.startFrame + (b.motion === "stagger" ? i * 7 : 0);
        if (beatDelays[id] === undefined || at < beatDelays[id]) beatDelays[id] = at;
      });
    }
    // 焦点滑移点： replaces 多条流光。讲到谁，光点就从上一个主体滑到谁身上，
    // 18 帧 smoothstep——比瞬移看得清"焦点转移"，比沿边流光更贴旁白。
    // 停靠在卡片右上角而不是中心：中心会被卡片自己盖住，光点等于没画。
    // 有锚点时"讲到谁"就是旁白此刻念到的那个词（spokenNow），不是拍里写的 focus——
    // 一拍覆盖多句时，focus 只能写一个，光点会一路停在一个还没被念到的节点上。
    if (cur || spokenNow) {
      const curId = spokenNow || (cur ? resolveFocusId(graph, cur.focus) : undefined);
      const curItem = curId ? layout.items.find((it) => it.node.id === curId) : undefined;
      if (curItem) {
        const all = scene.choreography ? scene.choreography.beats : [];
        const prev = cur && bs.idx > 0 ? all[bs.idx - 1] : null;
        // 出发地：上一个被念到的节点（按词）或上一拍的焦点（按拍）
        let prevId: string | undefined;
        if (spokenNow && anchorOrder) {
          const at = anchorOrder.findIndex((item) => item.id === spokenNow);
          prevId = at > 0 ? anchorOrder[at - 1].id : undefined;
        } else {
          prevId = prev ? resolveFocusId(graph, prev.focus) : undefined;
        }
        const prevItem = prevId ? layout.items.find((it) => it.node.id === prevId) : undefined;
        const corner = (it: GraphItem) => ({ x: it.x + it.size * 0.62, y: it.y - it.size * 0.62 });
        const from = corner(prevItem || curItem);
        const to = corner(curItem);
        // 滑移窗口：按词时从"这个词被念到"起算，按拍时从拍开场起算
        const glideFrom = spokenNow && cueWindows[spokenNow] ? cueWindows[spokenNow].start : cur ? cur.startFrame : 0;
        const glide = Math.max(0, Math.min(1, (frame - glideFrom) / 18));
        const ease = glide * glide * (3 - 2 * glide);
        let x = from.x + (to.x - from.x) * ease;
        let y = from.y + (to.y - from.y) * ease;
        // orbit：光点绕主体小幅公转，表示"围着它看"（行星绕太阳这类）
        if (cur && cur.motion === "orbit") {
          x += Math.cos(frame / 9) * 14;
          y += Math.sin(frame / 9) * 14;
        }
        beatDot = { x, y };
        // camera-push：整屏向焦点缓慢推近 5%×幅度，拍内持续推进
        if (cur && cur.motion === "camera-push") {
          pushK = 0.05 * bs.amplitude * bs.beatProgress;
          pushOrigin = curItem.x + "px " + curItem.y + "px";
        }
      }
    }
    // 连线跟揭示走：两端都入场了箭头才画出来，否则箭头指向一片空白
    for (const flow of layout.flows) {
      let gate = 0;
      for (const id of flow.target) {
        const it = layout.items.find((x) => x.node.id === id);
        const at = beatDelays[id] !== undefined ? beatDelays[id] : it ? it.delay : 0;
        if (at > gate) gate = at;
      }
      for (const e of flow.edges) edgeGate.set(e, gate);
    }
  }

  const stage = (
    <>
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0 }}
      >
        {layout.container ? (
          <rect
            x={layout.container.x}
            y={layout.container.y}
            width={layout.container.w}
            height={layout.container.h}
            rx={40}
            fill="rgba(255,255,255,0.28)"
            stroke={scene.accentColor}
            strokeWidth={3}
            strokeDasharray="18 14"
            opacity={0.7}
          />
        ) : null}
        {layout.divider ? (
          <line
            x1={layout.divider.x}
            y1={layout.divider.y1}
            x2={layout.divider.x}
            y2={layout.divider.y2}
            stroke="rgba(18, 48, 24, 0.42)"
            strokeWidth={6}
            strokeDasharray="18 18"
          />
        ) : null}
        {layout.edges.map((edge, i) =>
          bs ? (
            <g
              key={"e" + i}
              opacity={Math.max(0, Math.min(1, (frame - (edgeGate.get(edge) || 0)) / 12))}
            >
              <GraphConnector edge={edge} accent={scene.accentColor} />
            </g>
          ) : (
            <GraphConnector key={"e" + i} edge={edge} accent={scene.accentColor} />
          ),
        )}
        {bs
          ? null
          : tokens.map((token, i) => {
            const head = token.point;
            const trail = [1, 2, 3].map((k) => flowPoint(token.flow, Math.max(0, token.t - k * 0.04)));
            return (
              <g key={"t" + i} opacity={token.alpha}>
                {trail.map((p, k) => (
                  <circle key={k} cx={p.x} cy={p.y} r={11 - k * 2.2} fill={scene.accentColor} opacity={0.3 - k * 0.08} />
                ))}
                <circle cx={head.x} cy={head.y} r={20} fill={scene.accentColor} opacity={0.16} />
                <circle cx={head.x} cy={head.y} r={12} fill="#ffffff" opacity={0.95} />
                <circle cx={head.x} cy={head.y} r={7} fill={scene.accentColor} />
              </g>
            );
          })}
      </svg>
      {layout.items.map((item) => (
        <GraphBadge
          key={item.node.id}
          item={item}
          iconSrc={icons[item.node.id]}
          accent={scene.accentColor}
          active={activeIds.has(item.node.id)}
          visited={visitedIds.has(item.node.id)}
          storyProgress={storyProgress}
          cueWindow={cueWindows[item.node.id] || null}
          enterAt={cueEnterAt[item.node.id]}
          beat={
            bs && bs.current
              ? {
                motion: activeIds.has(item.node.id) ? bs.current.motion : "focus-ring",
                beatProgress: bs.beatProgress,
                popFrame: bs.popFrame,
                amplitude: bs.amplitude,
                delayOverride: beatDelays[item.node.id],
              }
              : null
          }
        />
      ))}
      {bs && beatDot ? (
        // 顶层光点：画在卡片之上才不会被焦点卡自己盖住（停靠在卡片右上角外）
        <svg
          width={1920}
          height={1080}
          viewBox="0 0 1920 1080"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <circle cx={beatDot.x} cy={beatDot.y} r={20} fill={scene.accentColor} opacity={0.16} />
          <circle cx={beatDot.x} cy={beatDot.y} r={12} fill="#ffffff" opacity={0.95} />
          <circle cx={beatDot.x} cy={beatDot.y} r={7} fill={scene.accentColor} />
        </svg>
      ) : null}
      {graph.caption ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 132,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background: "rgba(255,255,255,0.82)",
              padding: "6px 28px",
              fontSize: 32,
              fontWeight: 900,
              color: scene.accentColor,
            }}
          >
            {graph.caption}
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <AbsoluteFill>
      {pushK > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "scale(" + (1 + pushK) + ")",
            transformOrigin: pushOrigin,
          }}
        >
          {stage}
        </div>
      ) : (
        stage
      )}
    </AbsoluteFill>
  );
};

/** 转场时长：12 帧 = 0.4s，短到不打断讲解，长到能看清是"推上来" */
const SCENE_SLIDE_FRAMES = 12;

const SceneLayer: React.FC<{ scene: GeneratedScene; index: number; isLast: boolean }> = ({ scene, index, isLast }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = Math.max(90, scene.durationFrames || 180);
  // 转场：新场景从画面下方推上来，把上一场整块顶走。
  // 试过"整层淡出到根底色"（原方案，实测每处切换亮度从 235 冲到 249、画面内容
  // 归零 3~4 帧）和"圆形遮罩从中心展开"（教学画面的主体就在中心，圆一开先把
  // 主体盖掉）。平移不挑内容位置，全程满屏，也不会两套标题/字幕叠在一起。
  const enterFade = index === 0 ? interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const tailFade = isLast
    ? interpolate(frame, [duration - 0.4 * fps, duration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  const slide = index === 0 ? 1 : interpolate(frame, [0, SCENE_SLIDE_FRAMES], [0, 1], { extrapolateRight: "clamp" });
  // 起手快、收尾稳：位移不匀才像"推上来"，匀速滑动会显得像掉帧
  const slideY = (1 - Math.pow(slide, 0.55)) * 1080;
  // 自己放完后被下一场顶上：屏内内容同步上移一屏，和下一场的入场拼成一次完整滚动
  const exitP = isLast
    ? 0
    : interpolate(frame, [duration, duration + SCENE_SLIDE_FRAMES], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const offsetY = Math.round(slideY - exitP * 1080);
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110, mass: 0.9 } });
  const stageY = interpolate(enter, [0, 1], [74, 0]);
  const stageScale = interpolate(enter, [0, 1], [0.82, 1]);
  const titleY = interpolate(enter, [0, 1], [-28, 0]);
  const breath = 1 + Math.sin(frame / 24) * 0.008;
  const sway = Math.sin(frame / 40) * 0.9;
  // 关系图自带节点标签，屏幕上再叠一行同义文字只会干扰阅读。
  // 画板优先级最高：图形本身就是知识时，任何"节点+标签"的表达都是降级。
  const hasFigure = !!(scene.figure && scene.figure.shapes && scene.figure.shapes.length > 0);
  // 角色交互优先于概念关系图：有"小熊把皮球递给小兔"这种明确动作时，
  // 就该演出这个动作，而不是退回抽象节点图。
  const hasInteraction = !hasFigure && !!scene.interaction && (scene.interaction.actors || []).length > 0;
  // 三维舞台的准入：动作受支持，且后端已把坐标/资产解析成确定值。
  // 命中就取代 2D 演出；关掉（VIDEO_3D_STAGE=off 或依赖缺失）时同一分镜
  // 仍走 ActionStage 的降级分支，内容不变、只是没有接触关系。
  const action3d = hasInteraction ? scene.interaction!.action3d : undefined;
  const use3d = !!action3d && (action3d.motion === "slide" || action3d.motion === "dribble");
  /**
   * 二维全身角色的准入。判断依据是"这一幕的动作需求有没有渲染器能演"，
   * 不是"哪个字段非空"：
   *  - 有 action3d 且受支持 → 3D（能演接触，优先）
   *  - 有 puppet → 2D 全身骨架（爬/走/入场，3D 没有实现也不需要）
   *  - 都没有但有人物交互 → 旧的徽章分支（handover/point，逐步淘汰）
   * 这条顺序改错就会出现"滑梯被降级成沿斜线平移"或"爬楼变成 emoji 卡片"。
   */
  const puppet = hasInteraction && !use3d ? scene.interaction!.puppet : undefined;
  const accent = scene.accentColor || "#4d96ff";
  // 3D 用冻结后的局部帧：收尾窗口里画面要钉住，不能自己继续动
  const stageFrame = useLocalFrame();
  const hasGraph =
    !hasFigure && !hasInteraction && !!(scene.sceneGraph && scene.sceneGraph.nodes && scene.sceneGraph.nodes.length >= 2);
  const backgroundStyle = scene.backgroundStyle || "environment";
  // 头像分支的取景盒子：贴地用底、离地 92%。徽章没有脚也没有地面，
  // 不算世界坐标，但它同样不能侵入标题带——位置与缩放都从这里来。
  const portrait = portraitFraming();
  // 指认幕的道具槽位：站哪边就把道具放另一边，别挡住角色。坐标与尺寸都不再手写
  const pointSlot = propSlot(
    puppet && puppet.start && puppet.end && puppet.end[0] < puppet.start[0] ? -1 : 1,
  );

  return (
    // 冻结在"子组件开始收尾淡出"之前（各组件都在 duration 前 ~12 帧起淡出）。
    // 钉在最后一帧反而会停在淡出的末态上，画面是半透明的。
    <FrameOverride.Provider value={isLast ? null : Math.max(0, duration - 14)}>
    <AbsoluteFill
      style={{
        opacity: Math.min(enterFade, tailFade),
        transform: offsetY !== 0 ? "translateY(" + offsetY + "px)" : undefined,
        backgroundColor: backgroundStyle === "environment" ? "#f7fff9" : "#fcfeff",
        overflow: "hidden",
      }}
    >
      <SceneBackground scene={scene} />
      {/* 地面阴影只在有地面的环境背景里成立；中性背景没有地面，投影会变成"悬空的黑影" */}
      {backgroundStyle === "environment" ? <GroundShadow scene={scene} duration={duration} /> : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 42,
          display: "flex",
          justifyContent: "center",
          transform: "translateY(" + titleY + "px)",
        }}
      >
        <div
          style={{
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.88)",
            padding: "12px 36px",
            fontSize: 42,
            fontWeight: 900,
            color: "#12303a",
          }}
        >
          {scene.title}
        </div>
      </div>
      {hasFigure ? (
        <FigureStage scene={scene} duration={duration} />
      ) : use3d && action3d ? (
        <ThreeActionStage
          frame={stageFrame}
          world={scene.world}
          scene={{
            motion: action3d.motion,
            actorId: action3d.actorId,
            rig: action3d.rig,
            start: action3d.start,
            end: action3d.end,
            bounce: action3d.bounce,
            ballRestY: action3d.ballRestY,
            durationFrames: action3d.durationFrames,
            accent,
            label: scene.interaction!.actors[0] ? scene.interaction!.actors[0].label : undefined,
          }}
        />
      ) : puppet ? (
        <Puppet2D
          frame={stageFrame}
          scene={{
            motion: puppet.motion,
            // 场地随"这一幕的数据"一起传：它是场景的一部分（这一幕发生在哪个
            // 世界的哪个位置），不是渲染器的全局配置。
            world: scene.world,
            setpiece: scene.setpiece,
            rig: puppet.rig,
            start: puppet.start,
            end: puppet.end,
            steps: puppet.steps,
            sequence: puppet.sequence,
            // 用场景的真实帧数（已按旁白音频拉长），不用分镜时的估算：
            // 差 20~30 帧就是"动作演完了人还僵在那儿"。
            durationFrames: duration,
            accent,
            label: scene.interaction!.actors[0] ? scene.interaction!.actors[0].label : undefined,
            // 指认幕必须把被指的东西画出来，否则"指着空气"比原来的小图标更差。
            // 道具由这里渲染（PropArt 只在这个文件里），Puppet2D 只负责摆位置。
            // 串演幕同理：point 可能不在第一段，光看 puppet.motion 会漏掉道具。
            // 第二个人：与主角色共用一台相机、各自的播放表（见 Puppet2D 的 coStar）
            coStar:
              puppet.partner && puppet.partner.rig
                ? {
                    rig: puppet.partner.rig,
                    motion: puppet.partner.motion,
                    durationFrames: duration,
                  }
                : undefined,
            // 手里的东西：位置由两人的手算出来（Puppet2D 的 carry），
            // 所以"递到手里"不是一条写死的屏幕弧线，而是两只手的距离在变
            carry:
              puppet.partner && puppet.carryBy && scene.interaction!.propId
                ? {
                    node: (
                      <PropArt id={scene.interaction!.propId} x={0} y={0} frame={stageFrame} />
                    ),
                    size: 0.36,
                    by: puppet.carryBy,
                  }
                : undefined,
            props:
              scene.interaction!.propId &&
              // 用滑梯的幕不摆滑梯图标：公园里已经有一座真的了，
              // 再摆一张小图标就是"同一画面两个滑梯"，孩子会以为有两座。
              scene.setpiece !== "slide" &&
              (puppet.motion === "point" ||
                (puppet.sequence || []).some((step) => step.motion === "point"))
                ? [
                    {
                      ...pointSlot,
                      label: PROP_LABELS[scene.interaction!.propId] || "",
                      node: (
                        <PropArt id={scene.interaction!.propId} x={0} y={0} frame={stageFrame} />
                      ),
                    },
                  ]
                : undefined,
            overlay: scene.interaction!.speech ? (
              <SpeechBubble
                text={scene.interaction!.speech}
                side={puppet.motion === "point" ? "left" : "right"}
                accent={accent}
                frame={stageFrame}
              />
            ) : undefined,
            overlayFrom: scene.interaction!.speechAt,
          }}
        />
      ) : hasInteraction ? (
        <ActionStage scene={scene} duration={duration} />
      ) : hasGraph ? (
        <SceneGraphStage scene={scene} duration={duration} />
      ) : (
        <>
          {/* 巨图特写幕也要站在同一处场地里：不然"森林里的小松鼠"这一屏是旧屏保，
              下一屏（全身木偶）才是森林，孩子看到的是两个地方。 */}
          <SceneBackdrop scene={scene} frame={frame} />
          {scene.onScreenText && scene.onScreenText !== scene.title ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 124, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  borderRadius: 16,
                  background: "rgba(255, 255, 255, 0.76)",
                  padding: "6px 26px",
                  fontSize: 32,
                  fontWeight: 900,
                  color: scene.accentColor,
                }}
              >
                {scene.onScreenText}
              </div>
            </div>
          ) : null}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              // 景别：徽章是"特写"这一档，位置与缩放都由取景定律给出。
              // 原来写死 top: 330 / scale 1.4，与标题带没有任何关系，
              // 换字号或换容器尺寸就会压到标题上去。
              // transform-origin 在底边中点：放大只往上长，下沿永远贴地。
              top: portrait.top,
              transformOrigin: "50% 100%",
              display: "flex",
              justifyContent: "center",
              transform:
                "translateY(" + stageY + "px) scale(" + stageScale * breath * portrait.scale + ") rotate(" + sway + "deg)",
            }}
          >
            <div style={{ position: "relative", width: 760, height: 470 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", justifyContent: "center" }}>
                <TopicVisual scene={scene} />
              </div>
              {(scene.props || []).map((prop, i) => {
                const side = i % 2 === 0 ? -1 : 1;
                const slot = Math.floor(i / 2);
                return (
                  <div key={prop.id + i} style={{ position: "absolute", left: side < 0 ? 8 + slot * 116 : 596 - slot * 116, top: 168 + slot * 34 }}>
                    <svg width="150" height="150" viewBox="-80 -80 160 160" style={{ overflow: "visible", filter: "drop-shadow(0 12px 14px rgba(0,0,0,0.18))" }}>
                      <PropArt id={prop.id} x={0} y={0} frame={frame} />
                    </svg>
                    <div style={{ marginTop: -4, textAlign: "center", fontSize: 28, fontWeight: 900, color: scene.accentColor }}>
                      {PROP_LABELS[prop.id] || prop.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <SubtitleTrack scene={scene} duration={duration} />
      <div style={{ position: "absolute", left: 56, top: 48, fontSize: 26, fontWeight: 800, color: "rgba(0, 0, 0, 0.26)" }}>
        {"0" + (index + 1)}
      </div>
    </AbsoluteFill>
    </FrameOverride.Provider>
  );
};

export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({ title, topic, scenes }) => {
  const starts = sceneStarts(scenes);
  return (
    <AbsoluteFill style={{ backgroundColor: "#ecfff8" }}>
      {scenes.map((scene, index) => {
        const sceneDur = Math.max(90, scene.durationFrames || 180);
        const isLast = index === scenes.length - 1;
        return (
          <Sequence
            key={scene.id || index}
            from={starts[index]}
            // 除最后一场外都多留一个转场窗口：自己放完后"站"12 帧，让下一场
            // 有东西可以顶走，而不是顶在空底色上
            durationInFrames={sceneDur + (isLast ? 0 : SCENE_SLIDE_FRAMES)}
            premountFor={30}
          >
            <SceneLayer scene={scene} index={index} isLast={isLast} />
            {scene.audioSrc ? <Audio src={staticFile(scene.audioSrc)} volume={0.94} /> : null}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", top: 18, right: 24, color: "rgba(0,0,0,0.38)", fontSize: 18, fontWeight: 700 }}>
        {title || topic}
      </div>
    </AbsoluteFill>
  );
};
`;
  }

  private validateGeneratedManifest(
    manifest: DynamicRemotionManifest,
    storyboard: VideoStoryboard,
  ): void {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,80}$/.test(manifest.compositionId)) {
      throw new Error('DYNAMIC_REMOTION_INVALID_COMPOSITION_ID');
    }
    if (!Array.isArray(manifest.files) || manifest.files.length < 3) {
      throw new Error('DYNAMIC_REMOTION_MISSING_FILES');
    }

    const joined = manifest.files.map((file) => file.content).join('\n');
    const forbidden =
      /\bfrom\s+["'](?:fs|child_process|http|https|net|tls)["']|require\s*\(|fetch\s*\(|XMLHttpRequest|eval\s*\(|new\s+Function|https?:\/\//;
    if (forbidden.test(joined)) {
      throw new Error('DYNAMIC_REMOTION_FORBIDDEN_CODE');
    }

    const source = `${storyboard.topic || ''} ${storyboard.title || ''} ${JSON.stringify(
      storyboard.scenes || [],
    )}`;
    // 按「实际选中的角色」校验，而不是文本里随便出现过的动物：
    // 台词同时提到兔兔和小熊时主角是视觉描述里的小熊，不该反过来要求画面出现兔子特征。
    const expected = this.expectedVisualTerms(
      source,
      ((manifest.props as any)?.scenes || []) as Array<Record<string, any>>,
    );
    const searchable = `${joined} ${JSON.stringify(manifest.props)} ${JSON.stringify(
      manifest.sceneAssetSummary,
    )}`.toLowerCase();
    const missing = expected.filter((term) => !searchable.includes(term));
    if (missing.length > 0) {
      throw new Error(`DYNAMIC_REMOTION_MISSING_VISUAL_TERMS:${missing.join(',')}`);
    }

    // 模板是唯一渲染路径，因此角色素材检查对每个场景都成立，不再有豁免分支。
    const inlineSvgKeys = getInlineSvgAssetKeys();
    const animalScenes = ((manifest.props as any)?.scenes || []).filter(
      (scene: any) => String(scene?.assetKey || '') !== 'topic',
    );
    const missingCharacters = animalScenes.filter(
      (scene: any) =>
        !scene?.visualAssets?.characterAssetSrc &&
        !inlineSvgKeys.has(String(scene?.assetKey || '')),
    );
    if (missingCharacters.length > 0) {
      throw new Error(
        `DYNAMIC_REMOTION_MISSING_CHARACTER_ASSET:${missingCharacters
          .map((scene: any) => scene.title || scene.id || 'scene')
          .join(',')}`,
      );
    }
  }

  private expectedVisualTerms(
    source: string,
    scenes: Array<Record<string, any>> = [],
  ): string[] {
    // 这里只放"必须真的出现在产物里的视觉词"，不要放 dynamic 这种拼 assetKey 用的前缀：
    // 它以前能命中，纯粹是因为模板里有个叫 dynamicSky 的渐变 id，属于指标造假。
    const terms = new Set<string>(['visual']);
    for (const scene of scenes) {
      const assetKey = String(scene?.assetKey || '');
      if (!assetKey || assetKey === 'topic') continue;
      const config = ANIMAL_SUBJECTS.find((subject) => subject.id === assetKey);
      if (config) {
        config.visualTerms.forEach((term) => terms.add(term));
      } else {
        terms.add(assetKey);
      }
    }
    if (/森林|forest/i.test(source)) terms.add('forest');
    if (/河|溪|游泳|river|swim/i.test(source)) {
      terms.add('river');
    }
    return Array.from(terms);
  }

  /** 从视觉描述/旁白里识别点名的实物，交给模板画在角色身边 */
  private inferSceneProps(source: string): Array<{ id: string; label: string }> {
    const props: Array<{ id: string; label: string }> = [];
    for (const [id, keywords] of Object.entries(SCENE_PROP_KEYWORDS)) {
      if (keywords.some((kw) => source.toLowerCase().includes(kw.toLowerCase()))) {
        props.push({ id, label: SCENE_PROP_LABELS[id] || id });
      }
    }
    return props.slice(0, 3);
  }

  private inferDynamicAssetTags(source: string): string[] {
    const tags = new Set<string>();

    const animalResult = inferAnimalFromText(source);
    if (animalResult) {
      tags.add(animalResult.id);
      if (animalResult.config) {
        animalResult.config.visualTerms.forEach((term) => tags.add(term));
      } else {
        tags.add(animalResult.id);
        tags.add('animal');
      }
    }

    for (const mapping of ENVIRONMENT_TAG_KEYWORDS) {
      if (mapping.keywords.some((kw) => source.toLowerCase().includes(kw.toLowerCase()))) {
        tags.add(mapping.value);
      }
    }

    const chineseTerms = source.match(/[一-鿿]{2,5}/g) || [];
    chineseTerms.slice(0, 4).forEach((term) => tags.add(term));
    if (tags.size === 0) tags.add('topic');
    return Array.from(tags).slice(0, 12);
  }

  private inferDynamicAction(source: string): string {
    return matchKeyword(source, ACTION_KEYWORDS) || 'explore';
  }

  private inferDynamicHabitat(source: string): string {
    return matchKeyword(source, HABITAT_KEYWORDS) || 'forest';
  }

  /**
   * 整节课的场地（见 buildDynamicSceneProps 的说明）。
   *
   * 两个判断，顺序不能换：
   *  1. 只要这节课出现过滑梯（滑 / 爬 / 提到滑梯），就是游乐园。不能只按
   *     habitat 关键词判——"小熊先爬楼梯再滑滑梯"这句里没有"公园"二字，
   *     但它显然发生在公园里。有滑梯却没有公园，正是"梯子孤零零"的来源。
   *  2. 否则按 habitat 关键词推（草地 / 河边 / 森林 / 夜里）。
   *
   * venue 与 slide 一起下发：滑梯的位置来自 MOTION_DEFAULTS（三维舞台建 mesh
   * 用的同一组数字），所以二维场地画出来的滑梯就是三维里那座。
   */
  private resolveLessonWorld(
    sourceScenes: any[],
    topic: string,
  ): { venue: string; slide?: { start: number[]; end: number[] } } {
    const text = [
      topic,
      ...sourceScenes.map(
        (scene: any) =>
          `${scene?.title ?? ''} ${scene?.visualDescription ?? scene?.imagePrompt ?? scene?.visualPrompt ?? ''} ${scene?.narration ?? ''}`,
      ),
    ].join(' ');
    const deck = sourceScenes.some((scene: any) => this.sceneUsesSlide(scene));
    const hasSlide = deck || hasThreeMotionCue(text) === 'slide';
    if (!hasSlide) return { venue: this.inferDynamicHabitat(text) };
    return {
      venue: 'playground',
      slide: {
        start: [...MOTION_DEFAULTS.slide.start],
        end: [...MOTION_DEFAULTS.slide.end],
      },
    };
  }

  /** 这一幕是否用到了滑梯（滑下去 / 爬上去 / 指着滑梯） */
  private sceneUsesSlide(scene: any): boolean {
    const performance = normalizeScenePerformance(scene?.performance);
    const actions = performance
      ? performance.actions
      : scene?.interaction
        ? [scene.interaction]
        : [];
    return actions.some(
      (action: any) =>
        action?.verb === 'slide' ||
        action?.propId === 'slide' ||
        action?.action3d?.motion === 'slide' ||
        action?.puppet?.motion === 'climb',
    );
  }

  /**
   * 背景分档。
   *
   * 以前所有场景都长着同一片草地、一排树、一个太阳，是因为背景只按 habitat 选，
   * 而 habitat 又默认 'forest'——讲数数、讲时间、讲情绪也配一片森林。树成了片头水印。
   *
   * 正确的分界不是学科，而是"这个画面发生在真实世界里吗"：
   * - 有具体动物/人物，或文本点名了森林/河边/夜晚 → 环境背景，背景参与叙事（老虎待在林子里）
   * - 关系图（循环/链式/对比/分类/拆解）、抽象概念 → 中性背景，什么环境元素都不放，
   *   把注意力整块让给节点本身
   */
  private resolveBackgroundStyle(input: {
    source: string;
    hasGraph: boolean;
    hasAnimal: boolean;
  }): 'environment' | 'neutral' | 'plain' {
    if (input.hasGraph) return 'neutral';
    if (input.hasAnimal) return 'environment';
    if (matchKeyword(input.source, HABITAT_KEYWORDS)) return 'environment';
    return 'neutral';
  }

  private resolveSceneAccent(tags: string[], index: number): string {
    const animalConfig = ANIMAL_SUBJECTS.find((s) => tags.includes(s.id));
    if (animalConfig) return animalConfig.accentColor;
    if (tags.includes('water') || tags.includes('river')) return '#00a6c8';
    // Generate a stable color from animal id if present
    const animalId = tags.find((t) => t !== 'animal' && t !== 'topic' && /^[a-z]/.test(t));
    if (animalId) {
      let hash = 0;
      for (const ch of animalId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const hue = hash % 360;
      return `hsl(${hue}, 65%, 45%)`;
    }
    const colors = ['#2f9e44', '#4d96ff', '#ff6b6b', '#845ef7'];
    return colors[index % colors.length];
  }

  private slugForComposition(value: string): string {
    const ascii = value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
    if (ascii) return ascii;
    let hash = 0;
    for (const char of value) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return `topic-${hash.toString(16)}`;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }

  private toText(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }

  /**
   * 归一化混色对：把 course-pack / storyboard 的多种 params 形态统一成
   * [{ a, b, result }]，颜色名换成渲染层可直接用的十六进制色值。
   * 认不出来的颜色名保留原文，交给渲染层的兜底色板。
   */
  private normalizeMixPairs(params: any): Array<{ a: string; b: string; result: string; aName: string; bName: string; resultName: string }> {
    if (!params || typeof params !== 'object') return [];
    const colorHex: Record<string, string> = {
      红: '#ef4444', 红色: '#ef4444', red: '#ef4444',
      黄: '#facc15', 黄色: '#facc15', yellow: '#facc15',
      蓝: '#3b82f6', 蓝色: '#3b82f6', blue: '#3b82f6',
      橙: '#fb923c', 橙色: '#fb923c', orange: '#fb923c',
      绿: '#22c55e', 绿色: '#22c55e', green: '#22c55e',
      紫: '#a855f7', 紫色: '#a855f7', purple: '#a855f7',
      靛: '#6366f1', 靛色: '#6366f1', indigo: '#6366f1',
    };
    const toHex = (v: any): string => {
      const s = this.toText(v);
      if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
      return colorHex[s.toLowerCase()] || colorHex[s] || '';
    };
    const toName = (v: any): string => this.toText(v).slice(0, 6);

    // 形态一：pairs: [[色A, 色B, 结果], ...]
    const pairs = Array.isArray(params.pairs) ? params.pairs : null;
    if (pairs) {
      return pairs
        .filter((p: any) => Array.isArray(p) && p.length >= 3)
        .slice(0, 4)
        .map((p: any) => ({
          a: toHex(p[0]) || '#ef4444',
          b: toHex(p[1]) || '#3b82f6',
          result: toHex(p[2]) || '#a855f7',
          aName: toName(p[0]),
          bName: toName(p[1]),
          resultName: toName(p[2]),
        }));
    }

    // 形态二：color1 / color2 / resultLabel（单对）
    if (params.color1 || params.color2 || params.resultLabel) {
      return [{
        a: toHex(params.color1) || '#ef4444',
        b: toHex(params.color2) || '#facc15',
        result: toHex(params.resultLabel) || '#fb923c',
        aName: toName(params.color1) || '红',
        bName: toName(params.color2) || '黄',
        resultName: toName(params.resultLabel) || '橙',
      }];
    }
    return [];
  }

  private extractStoryboard(toolCalls: AgentVideoResult['toolCalls']): VideoStoryboard | null {
    for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
      const call = toolCalls[i];
      if (call.tool !== 'generateVideoContent') continue;
      try {
        const parsed = this.parseToolResult(call.result);
        const storyboard = this.unwrapToolData(parsed);
        if (this.isVideoStoryboard(storyboard)) {
          return storyboard;
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  private extractQuality(toolCalls: AgentVideoResult['toolCalls']): {
    passed: boolean;
    score: number;
    issues: string[];
  } {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const call = toolCalls[i];
      if (call.tool !== 'reviewVideoQuality') continue;
      try {
        const parsed = this.parseToolResult(call.result);
        const data = this.unwrapToolData(parsed);
        if (data && typeof data === 'object') {
          return {
            passed: Boolean((data as any).passed),
            score: Number((data as any).score) || 0,
            issues: Array.isArray((data as any).issues) ? (data as any).issues : [],
          };
        }
      } catch {
        // continue
      }
    }
    return { passed: false, score: 0, issues: ['no quality review performed'] };
  }

  private parseToolResult(result: string): unknown {
    return JSON.parse(result);
  }

  /**
   * AgentExecutorService stores tool callback results as JSON.stringify(result.data).
   * Older bridge code expected the full ToolResult wrapper ({ success, data }), so
   * keep both shapes here for tests and any direct callers that still use wrappers.
   */
  private unwrapToolData(parsed: unknown): unknown {
    if (parsed && typeof parsed === 'object' && 'success' in parsed && 'data' in parsed) {
      return (parsed as any).success ? (parsed as any).data : null;
    }
    return parsed;
  }

  private isVideoStoryboard(value: unknown): value is VideoStoryboard {
    return (
      !!value &&
      typeof value === 'object' &&
      typeof (value as any).topic === 'string' &&
      Array.isArray((value as any).scenes) &&
      (value as any).scenes.length > 0
    );
  }

  /**
   * Extract files written by the agent via writeFile tool calls.
   * Returns a Map from filename (basename) to file content.
   */
  private extractAgentFiles(toolCalls: AgentVideoResult['toolCalls']): Map<string, string> {
    const files = new Map<string, string>();
    for (const call of toolCalls) {
      if (call.tool !== 'writeFile') continue;
      try {
        const filePath = call.args?.path || call.args?.filePath || '';
        const content = call.args?.content || '';
        if (!filePath || !content) continue;
        const basename = filePath.split('/').pop() || filePath;
        files.set(basename, content);
        this.logger.log(
          `[extractAgentFiles] captured agent file: ${basename} (${content.length} chars)`,
        );
      } catch {
        // continue
      }
    }
    return files;
  }
}
