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
