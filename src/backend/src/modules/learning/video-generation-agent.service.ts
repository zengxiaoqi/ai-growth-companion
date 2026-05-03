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

import { Injectable, Logger } from "@nestjs/common";
import { ToolRegistryService } from "../../agent-framework/tools/tool-registry.service";
import { AgentRegistryService } from "../../agent-framework/agents/agent-registry.service";
import { AgentExecutorService } from "../../agent-framework/agents/agent-executor.service";
import { SkillRegistryService } from "../../agent-framework/skills/skill-registry.service";
import { SkillExecutor } from "../../agent-framework/skills/skill-executor";
import type {
  AgentContext,
  AgentDefinition,
  LlmMessage,
  ToolExecutionContext,
} from "../../agent-framework/core";
import type { VideoStoryboard } from "../../agent-framework/tools/impl/generate-video-content";
import { videoGeneratorDefinition } from "../../agent-framework/agents/definitions/video-generator.agent";

export interface AgentVideoRequest {
  topic: string;
  domain?: string;
  ageGroup?: "3-4" | "5-6";
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
}

export type DynamicRemotionFile = {
  path: string;
  content: string;
};

export type DynamicRemotionSceneSummary = {
  title: string;
  generatedVisual: string;
  template?: string;
};

export type DynamicRemotionManifest = {
  compositionId: string;
  files: DynamicRemotionFile[];
  props: Record<string, any>;
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
    private readonly skillExecutor: SkillExecutor,
  ) {}

  /**
   * Run the video-generator agent for a given topic and context.
   *
   * This executes the agent's tool-calling loop: the LLM decides which tools
   * to call (generateVideoContent, reviewVideoQuality, etc.) and in what order.
   */
  async generateViaAgent(
    request: AgentVideoRequest,
  ): Promise<AgentVideoResult> {
    const { topic, domain, ageGroup, contentId, childId, payload } = request;

    this.logger.log(
      `[generateViaAgent] Starting agent pipeline: topic="${topic}", domain=${domain || "auto"}, ageGroup=${ageGroup || "5-6"}`,
    );

    const context = this.buildAgentContext(contentId, childId, ageGroup);
    const definition = videoGeneratorDefinition;
    const toolDefs = this.getFilteredToolDefinitions(definition);

    const userMessage = this.buildUserMessage(topic, domain, ageGroup, payload);

    const messages: LlmMessage[] = [{ role: "user", content: userMessage }];

    const toolCalls: AgentVideoResult["toolCalls"] = [];

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
        this.logger.log(
          `[generateViaAgent] Tool call: ${event.toolName} → ${event.result.slice(0, 100)}`,
        );
      },
    );

    this.logger.log(
      `[generateViaAgent] Agent completed: ${toolCalls.length} tool calls, response length=${result.response.length}`,
    );

    const storyboard = this.extractStoryboard(toolCalls);
    const quality = this.extractQuality(toolCalls);

    return {
      storyboard,
      qualityScore: quality.score,
      qualityPassed: quality.passed,
      issues: quality.issues,
      toolCalls,
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
  ): Promise<DynamicRemotionManifest> {
    const topic = this.toText(storyboard.topic || payload?.topic, "lesson");
    const compositionId = `GeneratedLesson-${this.slugForComposition(topic)}`;
    const scenes = this.buildDynamicSceneProps(storyboard, payload);
    const durationFrames = Math.max(
      180,
      scenes.reduce((sum, scene) => sum + scene.durationFrames, 0),
    );

    const props = {
      title: this.toText(storyboard.title || payload?.title, topic),
      topic,
      domain: this.toText(storyboard.domain || payload?.domain, "science"),
      durationFrames,
      scenes,
    };

    const files: DynamicRemotionFile[] = [
      {
        path: "index.ts",
        content: [
          'import { registerRoot } from "remotion";',
          'import { RemotionRoot } from "./Root";',
          "",
          "registerRoot(RemotionRoot);",
          "",
        ].join("\n"),
      },
      {
        path: "Root.tsx",
        content: this.buildGeneratedRootTsx(compositionId, durationFrames),
      },
      {
        path: "GeneratedLesson.tsx",
        content: this.buildGeneratedLessonTsx(),
      },
    ];

    const sceneAssetSummary = scenes.map((scene) => ({
      title: scene.title,
      template: scene.template,
      generatedVisual: scene.generatedVisual,
    }));

    const manifest: DynamicRemotionManifest = {
      compositionId,
      files,
      props,
      durationFrames,
      sceneAssetSummary,
    };

    this.validateGeneratedManifest(manifest, storyboard);
    this.logger.log(
      `[generateRemotionComposition] dynamic Remotion manifest ready: compositionId=${compositionId}, scenes=${scenes.length}, durationFrames=${durationFrames}, visuals=${sceneAssetSummary
        .map((s) => `${s.title}:${s.generatedVisual}`)
        .join(", ")}`,
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
    ageGroup?: "3-4" | "5-6",
  ): Promise<VideoStoryboard | null> {
    this.logger.log(
      `[generateStoryboard] topic="${topic}", domain=${domain || "auto"}, ageGroup=${ageGroup || "5-6"}`,
    );

    const tool = this.toolRegistry.get("generateVideoContent");
    if (!tool) {
      this.logger.warn("generateVideoContent tool not registered");
      return null;
    }

    const execContext: ToolExecutionContext = {
      ageGroup: ageGroup || "5-6",
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
      this.logger.warn(
        `[generateStoryboard] Tool failed: ${result.error || "no data"}`,
      );
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
    ageGroup?: "3-4" | "5-6",
  ): Promise<{
    passed: boolean;
    score: number;
    issues: string[];
    suggestions: string[];
  } | null> {
    const tool = this.toolRegistry.get("reviewVideoQuality");
    if (!tool) {
      this.logger.warn("reviewVideoQuality tool not registered");
      return null;
    }

    const narrations = scenes.map((s) => s.narration || "").filter(Boolean);

    const execContext: ToolExecutionContext = {
      ageGroup: ageGroup || "5-6",
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
      this.logger.warn(
        `[reviewQuality] Tool failed: ${result.error || "no data"}`,
      );
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
    ageGroup?: "3-4" | "5-6",
  ): AgentContext {
    return {
      childId: childId ?? undefined,
      parentId: undefined,
      ageGroup: ageGroup || "5-6",
      conversationId: `video-gen-${contentId}-${Date.now()}`,
      messages: [],
      depth: 0,
      abortSignal: undefined,
      metadata: { contentId },
    };
  }

  private buildSystemPrompt(
    definition: AgentDefinition,
    context: AgentContext,
  ): string {
    let prompt = definition.buildSystemPrompt(context);
    prompt = this.injectSkills(prompt, definition.allowedSkills);
    return prompt;
  }

  private buildUserMessage(
    topic: string,
    domain?: string,
    ageGroup?: "3-4" | "5-6",
    payload?: Record<string, any>,
  ): string {
    const parts = [
      `请为以下主题生成教学视频：${topic}`,
      `领域：${domain || "自动检测"}`,
      `年龄段：${ageGroup || "5-6"}`,
    ];

    if (payload?.title) {
      parts.push(`课程标题：${payload.title}`);
    }
    if (payload?.summary) {
      parts.push(`课程概要：${payload.summary}`);
    }

    parts.push(
      "",
      "请按以下步骤执行：",
      "1. 调用 generateVideoContent 生成分镜脚本",
      "2. 检查生成内容的质量（调用 reviewVideoQuality）",
      "3. 如果质量不达标，重新生成",
      "4. 返回最终的分镜脚本和质量评分",
    );

    return parts.join("\n");
  }

  private injectSkills(systemPrompt: string, allowedSkills?: string[]): string {
    if (!allowedSkills || allowedSkills.length === 0) return systemPrompt;

    const skills = this.skillRegistry.getSkillsForAgent(allowedSkills);
    if (skills.length === 0) return systemPrompt;

    const rendered = skills.map((skill) =>
      this.skillExecutor.renderSkillForPrompt(skill.definition),
    );

    return `${systemPrompt}\n\n## Skills\n\n${rendered.join("\n\n")}`;
  }

  private getFilteredToolDefinitions(
    definition: AgentDefinition,
  ): any[] | undefined {
    return this.toolRegistry.getToolDefinitions((tool: any) => {
      const { allowedTools, disallowedTools } = definition;
      if (
        allowedTools &&
        allowedTools.length > 0 &&
        !allowedTools.includes(tool.metadata.name)
      )
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name))
        return false;
      return true;
    });
  }

  private buildDynamicSceneProps(
    storyboard: VideoStoryboard,
    payload: Record<string, any>,
  ): Array<Record<string, any>> {
    const topic = this.toText(storyboard.topic || payload?.topic, "lesson");
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

    return sourceScenes.slice(0, 8).map((scene: any, index: number) => {
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
      const assetKey = tags.includes("tiger") ? "tiger" : "topic";
      const template =
        this.toText(scene?.animationTemplate?.id || scene?.animationTemplate) ||
        (assetKey === "tiger"
          ? `science.animal-${action === "rest" ? "habitat" : "abilities"}`
          : "dynamic.story-scene");

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
        generatedVisual:
          assetKey === "tiger"
            ? `tiger-${action}-${habitat}-stripe-forest-river`
            : `dynamic-${habitat}-${tags.slice(0, 4).join("-")}`,
        durationSec,
        durationFrames: durationSec * 30,
        accentColor: this.resolveSceneAccent(tags, index),
      };
    });
  }

  private buildGeneratedRootTsx(
    compositionId: string,
    fallbackDurationFrames: number,
  ): string {
    return [
      'import React from "react";',
      'import { Composition } from "remotion";',
      'import { GeneratedLesson } from "./GeneratedLesson";',
      "",
      "export const RemotionRoot: React.FC = () => {",
      "  const defaultProps = { title: \"\", topic: \"\", scenes: [], durationFrames: " +
        fallbackDurationFrames +
        " };",
      "  return (",
      "    <Composition",
      `      id=${JSON.stringify(compositionId)}`,
      "      component={GeneratedLesson}",
      "      fps={30}",
      "      width={1280}",
      "      height={720}",
      "      defaultProps={defaultProps}",
      "      calculateMetadata={({ props: currentProps }) => ({",
      "        durationInFrames: Number((currentProps as any).durationFrames) || defaultProps.durationFrames,",
      "        props: currentProps,",
      "      })}",
      "    />",
      "  );",
      "};",
      "",
    ].join("\n");
  }

  private buildGeneratedLessonTsx(): string {
    return String.raw`import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";

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
  audioSrc?: string;
};

type GeneratedLessonProps = {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
};

const TIGER_VISUAL_TERMS = "tiger stripe forest river swim roar claw teeth";

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
  const river = scene.habitat === "river" || scene.assetTags.includes("river");
  const sky = night ? "#13233f" : scene.habitat === "grassland" ? "#bfeaff" : "#a7e8ff";
  const ground = scene.habitat === "river" ? "#5bc0de" : "#69b66d";
  const sunPulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.94, 1.06]);

  return (
    <AbsoluteFill style={{ backgroundColor: sky, overflow: "hidden" }}>
      <svg width="1280" height="720" viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0 }}>
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
        <rect width="1280" height="720" fill="url(#dynamicSky)" />
        {night ? (
          Array.from({ length: 18 }).map((_, i) => (
            <circle key={i} cx={80 + i * 66} cy={44 + (i % 5) * 34} r={2 + (i % 3)} fill="#fff7b8" opacity={0.45 + (i % 4) * 0.1} />
          ))
        ) : (
          <g transform={"translate(1080 92) scale(" + sunPulse + ")"}>
            <circle r="46" fill="#ffd166" />
            <circle r="62" fill="#ffd166" opacity="0.2" />
          </g>
        )}
        <path d="M0 520 C180 470 330 560 520 510 C740 450 920 565 1280 500 L1280 720 L0 720 Z" fill={ground} />
        {river && <path d="M0 610 C230 560 360 660 570 610 C820 550 980 650 1280 590 L1280 720 L0 720 Z" fill="url(#dynamicRiver)" opacity="0.95" />}
        {Array.from({ length: 10 }).map((_, i) => {
          const x = 35 + i * 128;
          const h = 100 + (i % 3) * 28;
          return (
            <g key={i} transform={"translate(" + x + " " + (520 - h) + ")"}>
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

const TopicVisual: React.FC<{ scene: GeneratedScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 10), [-1, 1], [0.94, 1.04]);
  if (scene.assetKey === "tiger") return <TigerSvg scene={scene} />;
  return (
    <svg width="480" height="320" viewBox="0 0 480 320">
      <circle cx="240" cy="160" r={94 * pulse} fill={scene.accentColor} opacity="0.18" />
      <circle cx="240" cy="160" r="76" fill={scene.accentColor} opacity="0.9" />
      <text x="240" y="172" textAnchor="middle" fontSize="34" fontWeight="800" fill="#fff">{scene.onScreenText || scene.title}</text>
      {scene.assetTags.slice(0, 5).map((tag, i) => (
        <text key={tag + i} x={70 + i * 82} y={285 - (i % 2) * 18} fontSize="18" fontWeight="700" fill="#234">{tag}</text>
      ))}
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
  ): void {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,80}$/.test(manifest.compositionId)) {
      throw new Error("DYNAMIC_REMOTION_INVALID_COMPOSITION_ID");
    }
    if (!Array.isArray(manifest.files) || manifest.files.length < 3) {
      throw new Error("DYNAMIC_REMOTION_MISSING_FILES");
    }

    const joined = manifest.files.map((file) => file.content).join("\n");
    const forbidden =
      /\bfrom\s+["'](?:fs|child_process|http|https|net|tls)["']|require\s*\(|fetch\s*\(|XMLHttpRequest|eval\s*\(|new\s+Function|https?:\/\//;
    if (forbidden.test(joined)) {
      throw new Error("DYNAMIC_REMOTION_FORBIDDEN_CODE");
    }

    const source = `${storyboard.topic || ""} ${storyboard.title || ""} ${JSON.stringify(
      storyboard.scenes || [],
    )}`;
    const expected = this.expectedVisualTerms(source);
    const searchable = `${joined} ${JSON.stringify(manifest.props)} ${JSON.stringify(
      manifest.sceneAssetSummary,
    )}`.toLowerCase();
    const missing = expected.filter((term) => !searchable.includes(term));
    if (missing.length > 0) {
      throw new Error(
        `DYNAMIC_REMOTION_MISSING_VISUAL_TERMS:${missing.join(",")}`,
      );
    }
  }

  private expectedVisualTerms(source: string): string[] {
    const terms = new Set<string>(["dynamic", "visual"]);
    if (/老虎|tiger/i.test(source)) {
      ["tiger", "stripe", "forest"].forEach((term) => terms.add(term));
    }
    if (/森林|forest/i.test(source)) terms.add("forest");
    if (/河|溪|游泳|river|swim/i.test(source)) terms.add("river");
    return Array.from(terms);
  }

  private inferDynamicAssetTags(source: string): string[] {
    const tags = new Set<string>();
    const addIf = (regex: RegExp, values: string[]) => {
      if (regex.test(source)) values.forEach((value) => tags.add(value));
    };
    addIf(/老虎|tiger/i, ["tiger", "stripe", "claw", "forest"]);
    addIf(/条纹|stripe/i, ["stripe"]);
    addIf(/森林|树|forest|jungle/i, ["forest", "tree"]);
    addIf(/河|溪|水|游泳|river|swim/i, ["river", "water", "swim"]);
    addIf(/跑|奔跑|追|run/i, ["run", "legs"]);
    addIf(/吼|叫声|roar/i, ["roar", "sound"]);
    addIf(/夜|晚上|night/i, ["night", "moon"]);
    addIf(/牙|爪|本领|ability/i, ["claw", "teeth"]);

    const chineseTerms = source.match(/[\u4e00-\u9fff]{2,5}/g) || [];
    chineseTerms.slice(0, 4).forEach((term) => tags.add(term));
    if (tags.size === 0) tags.add("topic");
    return Array.from(tags).slice(0, 12);
  }

  private inferDynamicAction(source: string): string {
    if (/游泳|河|溪|swim|river/i.test(source)) return "swim";
    if (/跑|奔跑|追|run/i.test(source)) return "run";
    if (/吼|叫声|roar/i.test(source)) return "roar";
    if (/睡|休息|rest/i.test(source)) return "rest";
    if (/条纹|外形|样子|feature|stripe/i.test(source)) return "showFeatures";
    return "explore";
  }

  private inferDynamicHabitat(source: string): string {
    if (/夜|晚上|night/i.test(source)) return "night";
    if (/河|溪|水|游泳|river|swim/i.test(source)) return "river";
    if (/草地|草原|grass/i.test(source)) return "grassland";
    return "forest";
  }

  private resolveSceneAccent(tags: string[], index: number): string {
    if (tags.includes("tiger")) return "#f08c00";
    if (tags.includes("water") || tags.includes("river")) return "#00a6c8";
    const colors = ["#2f9e44", "#4d96ff", "#ff6b6b", "#845ef7"];
    return colors[index % colors.length];
  }

  private slugForComposition(value: string): string {
    const ascii = value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
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

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }

  private extractStoryboard(
    toolCalls: AgentVideoResult["toolCalls"],
  ): VideoStoryboard | null {
    for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
      const call = toolCalls[i];
      if (call.tool !== "generateVideoContent") continue;
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

  private extractQuality(toolCalls: AgentVideoResult["toolCalls"]): {
    passed: boolean;
    score: number;
    issues: string[];
  } {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const call = toolCalls[i];
      if (call.tool !== "reviewVideoQuality") continue;
      try {
        const parsed = this.parseToolResult(call.result);
        const data = this.unwrapToolData(parsed);
        if (data && typeof data === "object") {
          return {
            passed: Boolean((data as any).passed),
            score: Number((data as any).score) || 0,
            issues: Array.isArray((data as any).issues)
              ? (data as any).issues
              : [],
          };
        }
      } catch {
        // continue
      }
    }
    return { passed: false, score: 0, issues: ["no quality review performed"] };
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
    if (
      parsed &&
      typeof parsed === "object" &&
      "success" in parsed &&
      "data" in parsed
    ) {
      return (parsed as any).success ? (parsed as any).data : null;
    }
    return parsed;
  }

  private isVideoStoryboard(value: unknown): value is VideoStoryboard {
    return (
      !!value &&
      typeof value === "object" &&
      typeof (value as any).topic === "string" &&
      Array.isArray((value as any).scenes) &&
      (value as any).scenes.length > 0
    );
  }
}
