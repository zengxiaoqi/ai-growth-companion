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
    const agentRootTsx = agentFiles?.get('Root.tsx');
    const agentIndexTs = agentFiles?.get('index.ts');
    const usesAgentTsx = !!agentLessonTsx;

    if (usesAgentTsx) {
      this.logger.log(
        `[generateRemotionComposition] using agent-generated TSX (${agentLessonTsx.length} chars)`,
      );
    }

    const files: DynamicRemotionFile[] = [
      {
        path: 'index.ts',
        content:
          agentIndexTs ||
          [
            'import { registerRoot } from "remotion";',
            'import { RemotionRoot } from "./Root";',
            '',
            'registerRoot(RemotionRoot);',
            '',
          ].join('\n'),
      },
      {
        path: 'Root.tsx',
        content: agentRootTsx || this.buildGeneratedRootTsx(compositionId, durationFrames),
      },
      {
        path: 'GeneratedLesson.tsx',
        content: agentLessonTsx || this.buildGeneratedLessonTsx(),
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

    this.validateGeneratedManifest(manifest, storyboard, usesAgentTsx);
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

  async repairGeneratedRemotionComposition(
    storyboard: VideoStoryboard,
    payload: Record<string, any> = {},
    currentFiles: Map<string, string>,
    renderError: string,
  ): Promise<DynamicRemotionManifest> {
    const topic = this.toText(storyboard.topic || payload?.topic, 'lesson');
    this.logger.log(
      `[repairGeneratedRemotionComposition] repairing generated Remotion files for topic="${topic}"`,
    );

    const context = this.buildAgentContext(
      Number(payload?.contentId || 0),
      payload?.childId,
      payload?.ageGroup,
    );
    const definition = videoGeneratorDefinition;
    const toolDefs = this.getFilteredToolDefinitions(definition);
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: this.buildRepairUserMessage(storyboard, payload, currentFiles, renderError),
      },
    ];
    const toolCalls: AgentVideoResult['toolCalls'] = [];

    await this.executorService.runLoop(
      this.buildSystemPrompt(definition, context),
      messages,
      toolDefs,
      Math.min(definition.maxIterations, 6),
      context,
      (event) => {
        toolCalls.push({
          tool: event.toolName,
          args: event.args,
          result: event.result,
        });
        this.logger.log(
          `[repairGeneratedRemotionComposition] Tool call: ${event.toolName} -> ${event.result}`,
        );
      },
      16384,
    );

    const repairedFiles = this.extractAgentFiles(toolCalls);
    if (!repairedFiles.has('GeneratedLesson.tsx')) {
      throw new Error('DYNAMIC_REMOTION_REPAIR_MISSING_GENERATED_LESSON');
    }

    const mergedFiles = new Map(currentFiles);
    for (const [name, content] of repairedFiles.entries()) {
      mergedFiles.set(name, content);
    }

    return this.generateRemotionComposition(storyboard, payload, mergedFiles);
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
   * Step 5 only: Review quality of generated content via LLM tool.
   */
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
      '请严格按以下步骤执行（必须全部完成后才能停止）：',
      '1. 调用 loadSkill("remotion-video-creation") 获取 Remotion 技能指导',
      '2. 调用 generateVideoContent 生成分镜脚本',
      '3. 根据分镜和技能指导，通过 writeFile("GeneratedLesson.tsx", ...) 生成自定义 React 组件（内容通过内存传递，不写入磁盘源码目录）',
      '4. 调用 reviewVideoQuality 检查质量',
      '5. 如果质量不达标（score < 70），修改 TSX 后重试',
      '6. 只有当 writeFile 和 reviewVideoQuality 都完成后才能结束',
      '',
      '⚠️ 你必须调用 writeFile 生成 GeneratedLesson.tsx。不生成 TSX 组件就停止是不允许的。',
      '',
      '⚠️ 音频要求（关键）：每个 scene 的 props 中包含 audioSrc 字段（TTS 音频路径）。',
      '你必须在每个 <Sequence> 中添加 <Audio> 组件来播放旁白音频。',
      '导入方式：import { Audio } from "@remotion/media";',
      '使用方式：{scene.audioSrc ? <Audio src={staticFile(scene.audioSrc)} volume={0.94} /> : null}',
      '',
      '⚠️ SVG 语法：path d 属性中所有 JS 表达式必须在 ${} 内，禁止出现裸运算如 340 + headBob。',
      '⚠️ Hooks 规范：useCurrentFrame() 必须在组件顶部调用存为变量，禁止在 JSX 属性中直接调用。',
      '⚠️ 图片素材：如果 scene.visualAssets.characterAssetSrc 存在，优先用 <Img> 显示，不要手绘 SVG。',
    );

    return parts.join('\n');
  }

  private buildRepairUserMessage(
    storyboard: VideoStoryboard,
    payload: Record<string, any>,
    currentFiles: Map<string, string>,
    renderError: string,
  ): string {
    const files = Array.from(currentFiles.entries())
      .map(
        ([name, content]) =>
          `## ${name}\n\`\`\`tsx\n${this.truncateForPrompt(content, 12000)}\n\`\`\``,
      )
      .join('\n\n');

    return [
      'Repair the generated Remotion lesson component. The previous render failed.',
      '',
      'Rules:',
      '- Do not change the lesson topic, storyboard, narration, or educational intent.',
      '- Fix only generated React/Remotion code problems.',
      '- Call loadSkill("remotion-video-creation") before writing code.',
      '- Call writeFile("GeneratedLesson.tsx", ...) with the full repaired file content.',
      '- If Root.tsx or index.ts must change, also write the complete replacement file.',
      '- Do not use fs, child_process, network APIs, eval, CSS animations, or external URLs.',
      '',
      `Topic: ${this.toText(storyboard.topic || payload?.topic, 'lesson')}`,
      `Age group: ${this.toText(payload?.ageGroup, '5-6')}`,
      '',
      'Render error:',
      this.truncateForPrompt(renderError, 4000),
      '',
      'Storyboard JSON:',
      this.truncateForPrompt(JSON.stringify(storyboard, null, 2), 6000),
      '',
      'Current generated files:',
      files || '(none)',
    ].join('\n');
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
      };
    });

    if (!this.visualAssetService) {
      this.logger.warn('[buildDynamicSceneProps] visualAssetService 不可用，场景将没有素材解析');
      return builtScenes;
    }

    return Promise.all(
      builtScenes.map(async (scene) => {
        const plan = await this.visualAssetService!.resolveSceneVisualAssets(scene, topic);
        return {
          ...scene,
          visualAssets: this.toSceneVisualAssets(plan),
        };
      }),
    );
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
  const bgDrift = interpolate(frame, [0, 180], [-18, 18], { extrapolateRight: "clamp" });

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
        {Array.from({ length: 10 }).map((_, i) => {
          const x = 35 + i * 192;
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
  const domain = scene.domain || "science";
  const text = scene.onScreenText || scene.title;
  const bob = interpolate(Math.sin(frame / 14), [-1, 1], [-6, 6]);
  const scale = interpolate(Math.sin(frame / 18), [-1, 1], [0.96, 1.04]);

  if (domain === "math") {
    const count = Math.min(10, Math.max(1, Math.floor((frame % 180) / 18)));
    return (
      <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
        {Array.from({ length: count }).map((_, i) => {
          const angle = (i / Math.max(count, 1)) * Math.PI * 2;
          const r = 80 + interpolate(Math.sin(frame / 10 + i), [-1, 1], [-5, 5]);
          return <circle key={i} cx={240 + Math.cos(angle) * r} cy={140 + Math.sin(angle) * r} r="18" fill={scene.accentColor} opacity={0.5 + (i % 3) * 0.15} />;
        })}
        <text x="240" y="148" textAnchor="middle" fontSize="72" fontWeight="900" fill={scene.accentColor}>{text}</text>
        <text x="240" y="260" textAnchor="middle" fontSize="28" fontWeight="700" fill="rgba(0,0,0,0.5)">{"= " + count}</text>
      </svg>
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

  // science / social / default
  return (
    <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
      <g transform={"translate(0 " + bob + ")"}>
        <rect x="160" y="40" width="160" height="200" rx="12" fill={scene.accentColor} opacity="0.15" />
        <rect x="200" y="60" width="80" height="30" rx="6" fill={scene.accentColor} opacity="0.3" />
        <circle cx="240" cy="150" r="40" fill="none" stroke={scene.accentColor} strokeWidth="3" opacity="0.5" />
        <line x1="200" y1="150" x2="280" y2="150" stroke={scene.accentColor} strokeWidth="2" opacity="0.4" />
        <line x1="240" y1="110" x2="240" y2="190" stroke={scene.accentColor} strokeWidth="2" opacity="0.4" />
        <text x="240" y="158" textAnchor="middle" fontSize="28" fontWeight="800" fill={scene.accentColor}>{text.slice(0, 6)}</text>
      </g>
      <text x="240" y="275" textAnchor="middle" fontSize="22" fontWeight="700" fill="rgba(0,0,0,0.5)">{text}</text>
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
    return (
      <div style={{ position: "relative", width: 560, height: 370 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 36,
            background: "rgba(255, 255, 255, 0.16)",
            filter: "blur(0.2px)",
          }}
        />
        <Img
          src={staticFile(scene.visualAssets.characterAssetSrc)}
          style={{
            position: "absolute",
            left: 14 + drift,
            top: scene.action === "swim" ? 42 + bob : 6 + bob,
            width: 530,
            height: 330,
            objectFit: "contain",
            transform: "scale(" + roarScale + ")",
            filter: "drop-shadow(0 22px 24px rgba(23, 50, 20, 0.28))",
          }}
        />
        {scene.visualAssets.overlayAssetSrc?.map((src, index) => (
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
  if (scene.assetKey === "topic" && scene.domain && scene.domain !== "science") {
    return <DomainVisual scene={scene} />;
  }
  const emoji = ANIMAL_EMOJI_MAP[scene.assetKey] || ANIMAL_EMOJI_MAP[(scene.assetTags || []).find((t) => ANIMAL_EMOJI_MAP[t]) || ""] || "";
  const orbitR = interpolate(Math.sin(frame / 14), [-1, 1], [90, 110]);
  return (
    <svg width="480" height="320" viewBox="0 0 480 320" style={{ overflow: "visible" }}>
      <circle cx="240" cy="160" r={orbitR * pulse} fill={scene.accentColor} opacity="0.12" />
      <circle cx="240" cy="160" r="72" fill={scene.accentColor} opacity="0.22" />
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2 + frame * 0.02;
        const rx = 110 + interpolate(Math.sin(frame / 12 + i), [-1, 1], [-8, 8]);
        const ry = 80 + interpolate(Math.cos(frame / 10 + i), [-1, 1], [-6, 6]);
        const cx = 240 + Math.cos(angle) * rx;
        const cy = 160 + Math.sin(angle) * ry;
        return <circle key={i} cx={cx} cy={cy} r={16 + (i % 3) * 4} fill={scene.accentColor} opacity={0.15 + (i % 3) * 0.08} />;
      })}
      {emoji ? (
        <text x="240" y="175" textAnchor="middle" fontSize="120" dominantBaseline="central">{emoji}</text>
      ) : (
        <text x="240" y="172" textAnchor="middle" fontSize="48" fontWeight="800" fill="#fff">{scene.onScreenText || scene.title}</text>
      )}
      <text x="240" y="280" textAnchor="middle" fontSize="22" fontWeight="700" fill="rgba(0,0,0,0.6)">{scene.onScreenText || scene.title}</text>
    </svg>
  );
};

const SceneLayer: React.FC<{ scene: GeneratedScene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = Math.max(90, scene.durationFrames || 180);
  const fadeIn = interpolate(frame, [0, 0.45 * fps], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [duration - 0.45 * fps, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 0.7 * fps], [32, 0], { extrapolateRight: "clamp" });
  const visualX = interpolate(frame, [0, 0.9 * fps], [60, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), backgroundColor: "#f7fff9", overflow: "hidden" }}>
      <ForestBackground scene={scene} />
      <div style={{ position: "absolute", left: 70, top: 58, width: 520, color: "#113", transform: "translateY(" + titleY + "px)" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: scene.accentColor }}>Scene {index + 1}</div>
        <div style={{ fontSize: 62, lineHeight: 1.05, fontWeight: 900, marginTop: 8 }}>{scene.title}</div>
        <div style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 800, marginTop: 18 }}>{scene.onScreenText}</div>
      </div>
      <div style={{ position: "absolute", right: 90, top: 170, transform: "translateX(" + visualX + "px)" }}>
        <TopicVisual scene={scene} />
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 34, borderRadius: 22, background: "rgba(12, 27, 36, 0.76)", padding: "18px 28px", color: "white", fontSize: scene.narration.length > 72 ? 24 : 28, lineHeight: 1.35, fontWeight: 800 }}>
        {scene.narration}
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
    usesAgentTsx = false,
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

    // SVG template literal sanity check for agent-generated TSX
    if (usesAgentTsx) {
      const lessonFile = manifest.files.find((file) => file.path === 'GeneratedLesson.tsx');
      if (lessonFile) {
        const tsxContent = lessonFile.content;
        const hasBareArithmeticInD =
          /d=\{`[^}]*\b\d+\s*[+\-]\s*[a-zA-Z_]\w*\b/.test(tsxContent) && !tsxContent.includes('${');
        const hasMissingAudioImport =
          !tsxContent.includes('@remotion/media') && tsxContent.includes('audioSrc');
        if (hasBareArithmeticInD) {
          this.logger.warn(
            '[validateGeneratedManifest] detected bare arithmetic in SVG d attribute — video may render incorrectly',
          );
        }
        if (hasMissingAudioImport) {
          this.logger.warn(
            '[validateGeneratedManifest] audioSrc referenced but @remotion/media not imported — video will have no sound',
          );
        }
      }
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

    // When the agent generated custom TSX, it handles its own visuals — skip the
    // character-asset check that applies only to the hardcoded template fallback.
    if (usesAgentTsx) return;

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
