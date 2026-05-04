import { Injectable, Logger } from "@nestjs/common";
import { AgentExecutorService } from "../../agent-framework/agents/agent-executor.service";
import { courseDesignerDefinition } from "../../agent-framework/agents/definitions/course-designer.agent";
import { ToolRegistryService } from "../../agent-framework/tools/tool-registry.service";
import { SkillRegistryService } from "../../agent-framework/skills/skill-registry.service";
import { SkillExecutor } from "../../agent-framework/skills/skill-executor";
import { extractJsonObject } from "../../agent-framework/core";
import type { AgentContext, LlmMessage } from "../../agent-framework/core";

type CourseAgentArgs = {
  topic: string;
  ageGroup: "3-4" | "5-6";
  domain?: "language" | "math" | "science" | "art" | "social";
  focus?: "literacy" | "math" | "science" | "mixed";
  difficulty?: number;
  durationMinutes?: number;
  includeGame?: boolean;
  includeAudio?: boolean;
  includeVideo?: boolean;
  parentPrompt?: string;
  contentId?: number;
};

@Injectable()
export class CourseGenerationAgentService {
  private readonly logger = new Logger(CourseGenerationAgentService.name);

  constructor(
    private readonly executorService: AgentExecutorService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  async generateCoursePack(
    args: CourseAgentArgs,
  ): Promise<Record<string, any> | null> {
    if (!this.toolRegistry.has("generateCoursePack")) {
      this.logger.warn(
        "[course-designer] generateCoursePack tool is not registered",
      );
      return null;
    }

    const context: AgentContext = {
      ageGroup: args.ageGroup,
      conversationId: `course-designer-${args.contentId || "draft"}-${Date.now()}`,
      messages: [],
      depth: 0,
      metadata: {
        contentId: args.contentId,
        domain: args.domain,
        focus: args.focus,
      },
    };

    const systemPrompt = this.buildSystemPrompt(context);
    const messages: LlmMessage[] = [
      {
        role: "user",
        content: this.buildUserMessage(args),
      },
    ];
    const toolDefinitions = this.toolRegistry.getToolDefinitions(
      (tool) => tool.metadata.name === "generateCoursePack",
    );
    const toolResults: Array<{ tool: string; result: string }> = [];

    this.logger.log(
      `[course-designer] starting course pack generation: topic="${args.topic}", domain=${args.domain || "auto"}, ageGroup=${args.ageGroup}`,
    );

    await this.executorService.runLoop(
      systemPrompt,
      messages,
      toolDefinitions,
      Math.min(courseDesignerDefinition.maxIterations, 4),
      context,
      (event) => {
        toolResults.push({ tool: event.toolName, result: event.result });
        this.logger.log(
          `[course-designer] tool call: ${event.toolName}, resultPreview=${event.result.slice(0, 120)}`,
        );
      },
    );

    const coursePack = this.extractCoursePack(toolResults);
    if (!coursePack) {
      this.logger.warn(
        `[course-designer] no course pack returned for topic="${args.topic}"`,
      );
      return null;
    }

    return coursePack;
  }

  private buildSystemPrompt(context: AgentContext): string {
    let prompt = courseDesignerDefinition.buildSystemPrompt(context);
    const skills = this.skillRegistry.getSkillsForAgent(
      courseDesignerDefinition.allowedSkills,
    );
    if (skills.length > 0) {
      prompt = `${prompt}\n\n## Skills\n\n${skills
        .map((skill) =>
          this.skillExecutor.renderSkillForPrompt(skill.definition),
        )
        .join("\n\n")}`;
    }
    return prompt;
  }

  private buildUserMessage(args: CourseAgentArgs): string {
    return [
      "请作为课程设计师生成一套结构化课程包。",
      `主题：${args.topic}`,
      `年龄段：${args.ageGroup}`,
      `领域：${args.domain || "自动判断"}`,
      `重点：${args.focus || "mixed"}`,
      `难度：${args.difficulty || 2}`,
      `时长：${args.durationMinutes || 20}分钟`,
      `家长要求：${args.parentPrompt || args.topic}`,
      "",
      "必须调用 generateCoursePack 工具一次，并传入上述 topic、ageGroup、domain、focus、difficulty、durationMinutes、includeGame、includeAudio、includeVideo、parentPrompt。",
      "返回时只总结工具生成结果，不要自行编造课程内容。",
    ].join("\n");
  }

  private extractCoursePack(
    toolResults: Array<{ tool: string; result: string }>,
  ): Record<string, any> | null {
    for (let i = toolResults.length - 1; i >= 0; i -= 1) {
      const call = toolResults[i];
      if (call.tool !== "generateCoursePack") continue;
      const parsed = extractJsonObject(call.result);
      if (parsed && typeof parsed === "object" && !parsed.error) {
        return parsed;
      }
    }
    return null;
  }
}
