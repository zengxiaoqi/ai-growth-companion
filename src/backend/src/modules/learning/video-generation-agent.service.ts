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
  ageMotionProfile,
  beatWindows,
  enforceAgeProfile,
  sanitizeBeats,
  type Beat,
} from './video/choreography';
import {
  ANIMAL_SUBJECTS,
  ANIMAL_EMOJI_MAP,
  getInlineSvgAssetKeys,
  inferAnimalFromText,
} from './animal-subjects.config';
import {
  ACTION_KEYWORDS,
  HABITAT_KEYWORDS,
  ENVIRONMENT_TAG_KEYWORDS,
  matchKeyword,
} from './visual-keywords.config';

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

  private async buildDynamicSceneProps(
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
      const source = `${topic} ${title} ${narration} ${visualDescription} ${onScreenText}`;
      const tags = this.inferDynamicAssetTags(source);
      const action = this.inferDynamicAction(source);
      const habitat = this.inferDynamicHabitat(source);
      const animalResult = inferAnimalFromText(source);
      const animalConfig = animalResult?.config ?? null;
      const assetKey = animalResult?.id || 'topic';
      const template =
        this.toText(scene?.animationTemplate?.id || scene?.animationTemplate) ||
        (assetKey !== 'topic'
          ? `science.animal-${action === 'rest' ? 'habitat' : 'abilities'}`
          : 'dynamic.story-scene');

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

      return {
        id: `scene-${index + 1}`,
        title,
        narration,
        onScreenText,
        visualDescription,
        assetKey,
        assetTags: tags,
        action,
        habitat,
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

const ANIMAL_EMOJI_MAP: Record<string, string> = ${JSON.stringify(ANIMAL_EMOJI_MAP)};

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

type GeneratedScene = {
  id: string;
  title: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  assetKey: string;
  assetTags: string[];
  action: string;
  habitat: string;
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
 * 节奏来源：把这一屏的字按屏长铺满（每字 perPage/字数 帧）。屏长本来就由旁白长度
 * 决定，字念完的时刻应该落在屏末；按固定 5.5 帧/字念会"提前念完干等"，实测短句
 * 场景因此尾段静态 96 帧（3.2 秒）。上限 10 帧/字（3 字/秒），再慢就像卡住。
 * 局限：没有词级时间戳，节奏是估算值，和真实 TTS 语音会有 ±0.3s 级漂移。
 */
const SubtitleTrack: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useLocalFrame();
  const pages = splitNarration(scene.narration || "", 15, 2);
  const perPage = Math.max(1, duration / pages.length);
  const pageIndex = Math.min(pages.length - 1, Math.max(0, Math.floor(frame / perPage)));
  const local = frame - pageIndex * perPage;
  const enterRamp = interpolate(local, [0, Math.min(8, perPage * 0.3)], [0, 1], { extrapolateRight: "clamp" });
  // 换页时底板常驻、只让文字接上。底板跟着淡出会在每次换页留 1~6 帧"整屏没有字幕"，
  // 实测 33 秒里 55 帧（最长连段 9 帧）；底板不动之后观感是"上一句换成下一句"。
  const capsuleOpacity = pageIndex === 0 ? enterRamp : 1;
  const lift = pageIndex === 0 ? interpolate(local, [0, Math.min(10, perPage * 0.35)], [12, 0], { extrapolateRight: "clamp" }) : 0;
  const textOpacity = pageIndex === 0 ? 1 : interpolate(local, [0, 3], [0.3, 1], { extrapolateRight: "clamp" });
  const current = pages[pageIndex] || "";
  const font = current.length > 20 ? 36 : 42;
  const accent = scene.accentColor || "#4d96ff";

  const tokens = subtitleTokens(current);
  // 按屏长铺满：每字 perPage/字数 帧。封顶 10 帧/字（3 字/秒），再慢观众会以为卡住了。
  const beat = Math.min(10, perPage / Math.max(1, tokens.length));
  const spoken = Math.min(tokens.length, Math.floor(local / Math.max(1, beat)) + 1);

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
                  color: isCurrent ? accent : isSpoken ? "#fff" : "rgba(255,255,255,0.28)",
                  textShadow: isCurrent ? "0 0 22px " + accent + ", 0 0 6px rgba(255,255,255,0.5)" : "none",
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
  | { kind: "polygon"; points: string; fill: string; stroke?: string; strokeWidth?: number };

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
type GraphFlow = { edges: GraphEdge[]; loop: boolean; phase?: number; target: string[] };
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
    const cy = 508;
    const rx = 268;
    const ry = 202;
    const size = 186;
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
    const spacing = Math.min(400, 1460 / Math.max(1, n - 1));
    const startX = 960 - ((n - 1) * spacing) / 2;
    // 依次长大：每个节点占一段叙事窗口，前一个长完才轮到下一个，观众能看出先后
    const slot = 0.9 / Math.max(1, n);
    nodes.forEach((node, i) => {
      const size = 172 + i * 40;
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
    const size = 262;
    const left = nodes[0];
    const right = nodes[1] || nodes[0];
    items.push({ node: left, x: 528, y: 498, size, delay: 8 });
    items.push({ node: right, x: 1392, y: 498, size, delay: 18 });
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
    const parentSize = graph.relation === "group" ? 190 : 200;
    const parentY = graph.relation === "group" ? 306 : 300;
    items.push({ node: parent, x: 960, y: parentY, size: parentSize, delay: 8 });
    const spacing = Math.min(330, 1360 / Math.max(1, children.length));
    const startX = 960 - ((children.length - 1) * spacing) / 2;
    const childY = graph.relation === "group" ? 646 : 656;
    const flows: GraphFlow[] = [];
    children.forEach((node, i) => {
      const size = graph.relation === "group" ? 168 : 156;
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
      });
    });
    if (graph.relation === "group" && children.length > 0) {
      const left = startX - 132;
      const right = startX + (children.length - 1) * spacing + 132;
      // 高度要包住节点下方的标签胶囊，否则虚线框会从标签中间穿过
      return {
        items,
        edges,
        flows,
        container: { x: left, y: childY - 126, w: right - left, h: 312 },
      };
    }
    return { items, edges, flows };
  }

  // chain：横向依次推进，节点等距
  const size = 206;
  const spacing = Math.min(500, 1560 / Math.max(1, n - 1));
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
  /** beats 解释器给出的本拍状态；null/缺省 = 原路径（公式在 amp=1 时逐像素等价） */
  beat?: {
    motion: string;
    beatProgress: number;
    popFrame: number;
    amplitude: number;
    delayOverride?: number;
  } | null;
}> = ({ item, iconSrc, accent, active, visited, storyProgress, beat }) => {
  const frame = useLocalFrame();
  const { fps } = useVideoConfig();
  // 揭示 gating：被某拍 reveal 的节点推迟到那一拍才入场（stagger 拍内再错开）
  const enterDelay = beat && beat.delayOverride !== undefined ? beat.delayOverride : item.delay;
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
  const swellT = beat && beat.motion === "swell" ? beat.beatProgress : storyProgress;
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
              progress={storyProgress}
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

  const canvas = (
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

  // 光点沿箭头前进：走到哪个节点，哪个节点亮起来。这就是"状态变化"——
  // 画面不再是一次性排好版就静止，而是持续看得出"事情正在发生"。
  const flowCount = layout.flows.length;
  const tokens = layout.flows.map((flow, index) => {
    if (flow.loop) {
      // 循环关系（水循环）本来就无止境，按固定周期一直转是对的
      const raw = (frame - warmup) / FLOW_PERIOD;
      const t = ((raw % 1) + 1) % 1;
      return { flow, t, alpha: 0.95, point: flowPoint(flow, t) };
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
      alpha: t < 0.94 ? 1 : Math.max(0, (1 - t) / 0.06),
      point: flowPoint(flow, t),
    };
  });
  const activeIds = new Set<string>();
  const visitedIds = new Set<string>();
  if (frame >= warmup) {
    tokens.forEach((token) => {
      const seg = Math.max(0, Math.min(token.flow.target.length - 1, token.point.segment));
      // 走到一段的一半才把高亮交给下一个节点。不这么做的话，光点刚离开 A 就把 B 点亮，
      // 看起来像"还没讲到就抢先发光"
      const fromId = seg === 0 ? graph.nodes[0].id : token.flow.target[seg - 1];
      const toId = token.flow.target[seg];
      const target = token.point.local >= 0.5 ? toId : fromId;
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
  if (graph.relation === "split" || graph.relation === "group") {
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
    const activeNow: string[] = [];
    if (cur) {
      const fid = resolveFocusId(graph, cur.focus);
      if (fid) activeNow.push(fid);
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
    if (cur) {
      const curId = resolveFocusId(graph, cur.focus);
      const curItem = curId ? layout.items.find((it) => it.node.id === curId) : undefined;
      if (curItem) {
        const all = scene.choreography ? scene.choreography.beats : [];
        const prev = bs.idx > 0 ? all[bs.idx - 1] : null;
        const prevId = prev ? resolveFocusId(graph, prev.focus) : undefined;
        const prevItem = prevId ? layout.items.find((it) => it.node.id === prevId) : undefined;
        const corner = (it: GraphItem) => ({ x: it.x + it.size * 0.62, y: it.y - it.size * 0.62 });
        const from = corner(prevItem || curItem);
        const to = corner(curItem);
        const glide = Math.max(0, Math.min(1, (frame - cur.startFrame) / 18));
        const ease = glide * glide * (3 - 2 * glide);
        let x = from.x + (to.x - from.x) * ease;
        let y = from.y + (to.y - from.y) * ease;
        // orbit：光点绕主体小幅公转，表示"围着它看"（行星绕太阳这类）
        if (cur.motion === "orbit") {
          x += Math.cos(frame / 9) * 14;
          y += Math.sin(frame / 9) * 14;
        }
        beatDot = { x, y };
        // camera-push：整屏向焦点缓慢推近 5%×幅度，拍内持续推进
        if (cur.motion === "camera-push") {
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
  const hasGraph =
    !hasFigure && !!(scene.sceneGraph && scene.sceneGraph.nodes && scene.sceneGraph.nodes.length >= 2);
  const backgroundStyle = scene.backgroundStyle || "environment";

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
      ) : hasGraph ? (
        <SceneGraphStage scene={scene} duration={duration} />
      ) : (
        <>
          {scene.onScreenText ? (
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
              top: 330,
              display: "flex",
              justifyContent: "center",
              transform: "translateY(" + stageY + "px) scale(" + stageScale * breath * 1.4 + ") rotate(" + sway + "deg)",
            }}
          >
            <TopicVisual scene={scene} />
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
    const expected = this.expectedVisualTerms(source);
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

  private expectedVisualTerms(source: string): string[] {
    // 这里只放"必须真的出现在产物里的视觉词"，不要放 dynamic 这种拼 assetKey 用的前缀：
    // 它以前能命中，纯粹是因为模板里有个叫 dynamicSky 的渐变 id，属于指标造假。
    const terms = new Set<string>(['visual']);
    const animalResult = inferAnimalFromText(source);
    if (animalResult?.config) {
      animalResult.config.visualTerms.forEach((term) => terms.add(term));
    } else if (animalResult?.id) {
      terms.add(animalResult.id);
    }
    if (/森林|forest/i.test(source)) terms.add('forest');
    if (/河|溪|游泳|river|swim/i.test(source)) {
      terms.add('river');
    }
    return Array.from(terms);
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
