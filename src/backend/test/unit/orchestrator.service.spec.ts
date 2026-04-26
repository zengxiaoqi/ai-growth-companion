import { OrchestratorService } from "../../src/agent-framework/agents/orchestrator.service";
import type {
  AgentContext,
  AgentDefinition,
  ExecutionResult,
  LlmMessage,
} from "../../src/agent-framework/core";

type AgentType =
  | "child-companion"
  | "parent-advisor"
  | "course-designer"
  | "activity-generator";

function createDefinition(
  type: AgentType,
  allowedTools: string[],
): AgentDefinition {
  return {
    type,
    name: type,
    description: `${type} definition`,
    buildSystemPrompt: () => `system:${type}`,
    allowedTools,
    disallowedTools: [],
    allowedSkills: [],
    maxIterations: 4,
    canSpawnSubAgents: false,
    maxSubAgentDepth: 0,
  };
}

describe("OrchestratorService", () => {
  const definitions: Record<AgentType, AgentDefinition> = {
    "child-companion": createDefinition("child-companion", [
      "getRecommendations",
    ]),
    "parent-advisor": createDefinition("parent-advisor", ["getAbilities"]),
    "course-designer": createDefinition("course-designer", [
      "generateCoursePack",
    ]),
    "activity-generator": createDefinition("activity-generator", [
      "generateActivity",
    ]),
  };

  const allTools = [
    "getRecommendations",
    "getAbilities",
    "generateCoursePack",
    "generateActivity",
    "listChildren",
  ];

  let runLoopQueue: ExecutionResult[];
  let service: OrchestratorService;
  let conversationStore: {
    addMessage: jest.Mock;
    buildMessageArray: jest.Mock;
  };
  let executorService: {
    runLoop: jest.Mock;
    runLoopStream: jest.Mock;
    toolRegistry: {
      getToolDefinitions: jest.Mock;
    };
  };
  let agentRegistry: {
    select: jest.Mock;
    get: jest.Mock;
  };

  const baseContext: AgentContext = {
    ageGroup: "parent",
    conversationId: "conv-1",
    messages: [],
    depth: 0,
    metadata: {},
  };

  beforeEach(() => {
    runLoopQueue = [];

    conversationStore = {
      addMessage: jest.fn().mockResolvedValue(undefined),
      buildMessageArray: jest.fn().mockResolvedValue([] as LlmMessage[]),
    };

    executorService = {
      runLoop: jest.fn().mockImplementation(async (...args: any[]) => {
        const onToolCall = args[5];
        if (onToolCall) {
          await onToolCall({
            toolName: "mockTool",
            args: { ok: true },
            result: '{"ok":true}',
          });
        }
        const next = runLoopQueue.shift();
        return next || { response: "default", toolCalls: [] };
      }),
      runLoopStream: jest.fn(),
      toolRegistry: {
        getToolDefinitions: jest.fn((filter?: (tool: any) => boolean) => {
          const tools = allTools
            .map((name) => ({ metadata: { name } }))
            .filter((tool) => (filter ? filter(tool) : true));
          return tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.metadata.name,
              description: `tool:${tool.metadata.name}`,
              parameters: { type: "object", properties: {} },
            },
          }));
        }),
      },
    };

    agentRegistry = {
      select: jest.fn((_: string, ctx: AgentContext) => {
        if (ctx.ageGroup === "parent")
          return { definition: definitions["parent-advisor"] };
        return { definition: definitions["child-companion"] };
      }),
      get: jest.fn((type: AgentType) => {
        const def = definitions[type];
        return def ? { definition: def } : undefined;
      }),
    };

    service = new OrchestratorService(
      agentRegistry as any,
      executorService as any,
      conversationStore as any,
      { getSkillsForAgent: jest.fn().mockReturnValue([]) } as any,
      { renderSkillForPrompt: jest.fn() } as any,
    );
  });

  it("routes to single agent path for simple parent query", async () => {
    runLoopQueue.push({
      response: "single-result",
      toolCalls: [{ tool: "getAbilities", args: {}, resultSummary: "ok" }],
      wasFiltered: false,
    });

    const result = await service.route("帮我看看学习报告", baseContext);

    expect(result.response).toBe("single-result");
    expect(executorService.runLoop).toHaveBeenCalledTimes(1);

    const toolDefs = executorService.runLoop.mock.calls[0][2];
    expect(toolDefs.map((t: any) => t.function.name)).toEqual(["getAbilities"]);

    expect(conversationStore.addMessage).toHaveBeenCalledWith(
      "conv-1",
      "user",
      "帮我看看学习报告",
      undefined,
    );
    expect(conversationStore.addMessage).toHaveBeenCalledWith(
      "conv-1",
      "assistant",
      "single-result",
      undefined,
    );
  });

  it("coordinates course and activity specialists for composite parent query", async () => {
    runLoopQueue.push(
      {
        response: "course-output",
        toolCalls: [
          { tool: "generateCoursePack", args: {}, resultSummary: "course" },
        ],
      },
      {
        response: "activity-output",
        toolCalls: [
          { tool: "generateActivity", args: {}, resultSummary: "activity" },
        ],
      },
      {
        response: "final-parent-output",
        toolCalls: [
          { tool: "getAbilities", args: {}, resultSummary: "parent" },
        ],
      },
    );

    const logSpy = jest.spyOn((service as any).logger, "log");

    const result = await service.route(
      "请生成课程包并配套活动和练习",
      baseContext,
    );

    expect(result.response).toBe("final-parent-output");
    expect(executorService.runLoop).toHaveBeenCalledTimes(3);

    const firstTools = executorService.runLoop.mock.calls[0][2].map(
      (t: any) => t.function.name,
    );
    const secondTools = executorService.runLoop.mock.calls[1][2].map(
      (t: any) => t.function.name,
    );
    const thirdTools = executorService.runLoop.mock.calls[2][2].map(
      (t: any) => t.function.name,
    );

    expect(firstTools).toEqual(["generateCoursePack"]);
    expect(secondTools).toEqual(["generateActivity"]);
    expect(thirdTools).toEqual(["getAbilities"]);

    const resultLog = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((text) => text.includes("Route result:"));
    expect(resultLog).toBeTruthy();

    const jsonText = (resultLog || "").split("Route result: ")[1];
    const payload = JSON.parse(jsonText);
    expect(payload.mode).toBe("coordinated");
    expect(payload.executionChain).toEqual([
      "course-designer",
      "activity-generator",
      "parent-advisor",
    ]);
    expect(typeof payload.elapsedMs).toBe("number");
    expect(payload.toolCalls).toBe(3);
  });

  it("falls back to available agents when one collaborator is missing", async () => {
    agentRegistry.get.mockImplementation((type: AgentType) => {
      if (type === "activity-generator") return undefined;
      const def = definitions[type];
      return def ? { definition: def } : undefined;
    });

    runLoopQueue.push(
      {
        response: "course-only-output",
        toolCalls: [
          { tool: "generateCoursePack", args: {}, resultSummary: "course" },
        ],
      },
      {
        response: "parent-integration-output",
        toolCalls: [
          { tool: "getAbilities", args: {}, resultSummary: "parent" },
        ],
      },
    );

    const result = await service.route("需要课程包和活动练习", baseContext);

    expect(result.response).toBe("parent-integration-output");
    expect(executorService.runLoop).toHaveBeenCalledTimes(2);
  });

  it("uses assignment signal to coordinate drafting flow for parent requests", async () => {
    runLoopQueue.push(
      {
        response: "activity-draft-output",
        toolCalls: [
          { tool: "generateActivity", args: {}, resultSummary: "draft" },
        ],
      },
      {
        response: "parent-confirmation-output",
        toolCalls: [
          { tool: "getAbilities", args: {}, resultSummary: "parent" },
        ],
      },
    );

    const result = await service.route("请给孩子布置一份作业练习", baseContext);

    expect(result.response).toBe("parent-confirmation-output");
    expect(executorService.runLoop).toHaveBeenCalledTimes(2);

    const firstTools = executorService.runLoop.mock.calls[0][2].map(
      (t: any) => t.function.name,
    );
    const secondTools = executorService.runLoop.mock.calls[1][2].map(
      (t: any) => t.function.name,
    );
    expect(firstTools).toEqual(["generateActivity"]);
    expect(secondTools).toEqual(["getAbilities"]);
  });
});
