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

      // 未通过校验的图直接丢弃，模板会退回单主体路径，而不是带着脏数据渲染
      const sceneGraph = normalizeSceneGraph(scene?.sceneGraph);
      if (!sceneGraph) {
        this.recordGraphSignal(topic, scene, scene?.sceneGraph ? 'invalid' : 'missing');
      }

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
        template,
        generatedVisual: animalConfig
          ? `${animalConfig.id}-${action}-${habitat}-${animalConfig.visualTerms.slice(0, 3).join('-')}`
          : `dynamic-${habitat}-${tags.slice(0, 4).join('-')}`,
        durationSec,
        durationFrames: durationSec * 30,
        accentColor: animalConfig?.accentColor || this.resolveSceneAccent(tags, index),
        sceneGraph: sceneGraph || undefined,
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
  graphIcons?: Record<string, string>;
  audioSrc?: string;
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

const ForestBackground: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const night = scene.habitat === "night";
  const river = scene.habitat === "river" || (scene.assetTags || []).includes("river");
  const sky = night ? "#13233f" : scene.habitat === "grassland" ? "#bfeaff" : "#a7e8ff";
  const ground = scene.habitat === "river" ? "#5bc0de" : "#69b66d";
  const sunPulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.94, 1.06]);
  const sceneDur = Math.max(90, scene.durationFrames || 180);
  const travel = interpolate(frame, [0, sceneDur], [0, 1], { extrapolateRight: "clamp" });
  const bgDrift = interpolate(travel, [0, 1], [-26, 26]);
  const treeDrift = interpolate(travel, [0, 1], [34, -34]);
  const cloudDrift = interpolate(travel, [0, 1], [-58, 58]);
  const breeze = Math.sin(frame / 26) * 5;

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
          <linearGradient id="dynamicSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={night ? "#101b36" : "#82ddff"} />
            <stop offset="100%" stopColor={night ? "#24385e" : "#d8f8ff"} />
          </linearGradient>
          <linearGradient id="dynamicRiver" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22b8cf" />
            <stop offset="100%" stopColor="#74d9ff" />
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#dynamicSky)" opacity={scene.visualAssets?.backgroundAssetSrc ? 0.22 : 1} />
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
        <path d="M0 780 C270 705 495 840 780 765 C1110 675 1380 848 1920 750 L1920 1080 L0 1080 Z" fill={ground} />
        {river && <path d="M0 915 C345 840 540 990 855 915 C1230 825 1470 975 1920 885 L1920 1080 L0 1080 Z" fill="url(#dynamicRiver)" opacity="0.95" />}
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
            opacity={night ? 0.18 : 0.74}
          >
            <ellipse cx="0" cy="0" rx="96" ry="42" fill="#ffffff" />
            <ellipse cx="58" cy="10" rx="66" ry="34" fill="#ffffff" />
            <ellipse cx="-62" cy="14" rx="58" ry="30" fill="#ffffff" />
          </g>
        ))}
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
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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

/** 字幕轨：按场景时长把旁白分成若干屏逐屏推进，替代整段堆在底部 */
const SubtitleTrack: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useCurrentFrame();
  const pages = splitNarration(scene.narration || "", 15, 2);
  const perPage = Math.max(1, duration / pages.length);
  const pageIndex = Math.min(pages.length - 1, Math.max(0, Math.floor(frame / perPage)));
  const local = frame - pageIndex * perPage;
  const opacity = interpolate(local, [0, Math.min(8, perPage * 0.3)], [0, 1], { extrapolateRight: "clamp" });
  const lift = interpolate(local, [0, Math.min(10, perPage * 0.35)], [12, 0], { extrapolateRight: "clamp" });
  const current = pages[pageIndex] || "";
  const font = current.length > 20 ? 36 : 42;

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
          opacity,
          transform: "translateY(" + lift + "px)",
        }}
      >
        {current}
      </div>
    </div>
  );
};

/** 落地阴影：把主体锚在地面上，避免悬空的贴纸感 */
const GroundShadow: React.FC<{ scene: GeneratedScene; duration: number }> = ({ scene, duration }) => {
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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
  const frame = useCurrentFrame();
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
}> = ({ item, iconSrc, accent, active, visited, storyProgress }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - item.delay,
    fps,
    config: { damping: 13, stiffness: 150, mass: 0.85 },
  });
  // 从远处飞进框里（group 聚拢 / split 散开）要比原地弹出更慢，用近乎无回弹的曲线
  const travel = item.enterFrom
    ? spring({ frame: frame - item.delay, fps, config: { damping: 26, stiffness: 62, mass: 1.1 } })
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
  const swellK = !item.grow
    ? item.node.swell === "grow"
      ? 1 + 0.28 * storyProgress
      : item.node.swell === "shrink"
        ? 1 - 0.28 * storyProgress
        : 1
    : 1;
  const pulse = active ? 1 + Math.sin(frame / 7) * 0.045 : 1;
  const scale = (item.grow ? 0.42 + growEase * 0.58 : 0.55 + enter * 0.45) * pulse * swellK;
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
        opacity: enter,
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
              opacity: 0.28 + Math.sin(frame / 7) * 0.08,
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

const SceneGraphStage: React.FC<{ scene: GeneratedScene; duration: number }> = ({
  scene,
  duration,
}) => {
  const frame = useCurrentFrame();
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
  const tokens = layout.flows.map((flow) => {
    if (flow.loop) {
      // 循环关系（水循环）本来就无止境，按固定周期一直转是对的
      const raw = (frame - warmup) / FLOW_PERIOD;
      const t = ((raw % 1) + 1) % 1;
      return { flow, t, alpha: 0.95, point: flowPoint(flow, t) };
    }
    // 单程关系（链式/生长）把整屏时长当作一次完整走程：讲解到哪儿，光点就在哪儿。
    // 用固定周期会算错——3 段 × 84 帧只有 252 帧的六成，光点早早停在终点等画面演完。
    const t = storyProgress;
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
      }
    });
  }
  // 没有路径的关系（compare）靠左右轮流点亮来做对照
  if (layout.flows.length === 0) {
    const half = Math.max(30, (duration - warmup) / 2);
    const index = frame < warmup ? 0 : Math.floor((frame - warmup) / half) % count;
    activeIds.add(graph.nodes[Math.min(count - 1, index)].id);
  }

  return (
    <AbsoluteFill>
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
        {layout.edges.map((edge, i) => (
          <GraphConnector key={"e" + i} edge={edge} accent={scene.accentColor} />
        ))}
        {tokens.map((token, i) => {
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
        />
      ))}
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
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{ scene: GeneratedScene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = Math.max(90, scene.durationFrames || 180);
  const fadeIn = interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [duration - 0.4 * fps, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110, mass: 0.9 } });
  const stageY = interpolate(enter, [0, 1], [74, 0]);
  const stageScale = interpolate(enter, [0, 1], [0.82, 1]);
  const titleY = interpolate(enter, [0, 1], [-28, 0]);
  const breath = 1 + Math.sin(frame / 24) * 0.008;
  const sway = Math.sin(frame / 40) * 0.9;
  // 有合法关系图就走关系渲染器：关系图自带节点标签，屏幕上再叠一行同义文字只会干扰阅读
  const hasGraph = !!(scene.sceneGraph && scene.sceneGraph.nodes && scene.sceneGraph.nodes.length >= 2);

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), backgroundColor: "#f7fff9", overflow: "hidden" }}>
      <ForestBackground scene={scene} />
      <GroundShadow scene={scene} duration={duration} />
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
      {hasGraph ? (
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
  );
};

export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({ title, topic, scenes }) => {
  const starts = sceneStarts(scenes);
  return (
    <AbsoluteFill style={{ backgroundColor: "#ecfff8" }}>
      {scenes.map((scene, index) => (
        <Sequence key={scene.id || index} from={starts[index]} durationInFrames={Math.max(90, scene.durationFrames || 180)} premountFor={30}>
          <SceneLayer scene={scene} index={index} />
          {scene.audioSrc ? <Audio src={staticFile(scene.audioSrc)} volume={0.94} /> : null}
        </Sequence>
      ))}
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
    const terms = new Set<string>(['dynamic', 'visual']);
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
