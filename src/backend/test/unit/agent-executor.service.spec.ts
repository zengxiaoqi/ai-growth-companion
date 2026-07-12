import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';
import type {
  IToolRegistry,
  ILlmClient,
  LlmMessage,
  LlmToolDefinition,
  LlmResponse,
  StreamEvent,
  AgentContext,
} from '../../src/agent-framework/core';

/** Build a mock LlmResponse that triggers a single tool call */
function toolCallResponse(
  toolName: string,
  args: Record<string, any>,
  extra?: Partial<LlmResponse>,
): LlmResponse {
  return {
    content: '',
    toolCalls: [
      {
        id: 'call_1',
        type: 'function' as const,
        function: { name: toolName, arguments: JSON.stringify(args) },
      },
    ],
    ...extra,
  };
}

/** Build a mock LlmResponse with a final text answer (no tool calls) */
function finalResponse(text: string, extra?: Partial<LlmResponse>): LlmResponse {
  return { content: text, toolCalls: undefined, ...extra };
}

/** Build a text-only response (no tool calls, has content) — simulates LLM ignoring tools */
function textOnlyResponse(content: string): LlmResponse {
  return { content, toolCalls: [] };
}

describe('AgentExecutorService runLoopStream', () => {
  let executor: AgentExecutorService;
  let llmClient: { chatCompletion: jest.Mock; chatCompletionStream: jest.Mock };
  let toolRegistry: {
    execute: jest.Mock;
    getToolDefinitions: jest.Mock;
    getAll: jest.Mock;
    get: jest.Mock;
    register: jest.Mock;
    registerAll: jest.Mock;
    has: jest.Mock;
  };
  let toolDefinitions: LlmToolDefinition[];
  let context: AgentContext;

  beforeEach(() => {
    jest.clearAllMocks();

    llmClient = {
      chatCompletion: jest.fn(),
      chatCompletionStream: jest.fn().mockImplementation(async function* () {}),
    };

    toolRegistry = {
      execute: jest.fn().mockResolvedValue({ data: {} }),
      getToolDefinitions: jest.fn().mockReturnValue([]),
      getAll: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(undefined),
      register: jest.fn(),
      registerAll: jest.fn(),
      has: jest.fn(),
    };

    // Tool definitions the agent sees
    toolDefinitions = [
      {
        type: 'function',
        function: {
          name: 'generateQuiz',
          description: 'Generate a quiz',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generateActivity',
          description: 'Generate an activity',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ];

    context = {
      ageGroup: '5-6',
      childId: 1,
      conversationId: 'test-session',
      messages: [],
      depth: 0,
      metadata: {},
    };

    executor = new AgentExecutorService(
      toolRegistry as unknown as IToolRegistry,
      llmClient as unknown as ILlmClient,
    );
  });

  /** Collect all events from the async generator */
  async function collectEvents(): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of executor.runLoopStream(
      'You are a teaching assistant.',
      [],
      toolDefinitions,
      3,
      context,
    )) {
      events.push(event);
    }
    return events;
  }

  describe('basic streaming flow', () => {
    it('yields tool_start → tool_result → token → done for a tool-call then text path', async () => {
      const quizResult = JSON.stringify({
        type: 'quiz',
        questions: [{ question: '1+1=?', options: ['1', '2'], answer: 1 }],
      });

      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学', count: 1 }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(quizResult) });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('测验已生成！'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '测验已完成';
      });

      const events = await collectEvents();

      // Should have: thinking(no), token(from game_data? no), tool_start, tool_result, token, done
      const types = events.map((e) => e.type);
      expect(types).toContain('tool_start');
      expect(types).toContain('tool_result');
      expect(types).toContain('token');
      expect(types).toContain('done');

      // Verify done event
      const doneEvent = events.find((e) => e.type === 'done') as any;
      expect(doneEvent).toBeDefined();
      expect(doneEvent.sessionId).toBe('test-session');
    });

    it('yields error + returns early when abort signal is set', async () => {
      const abortController = new AbortController();
      abortController.abort();
      const abortedContext = { ...context, abortSignal: abortController.signal as any };

      for await (const event of executor.runLoopStream(
        'system prompt',
        [],
        toolDefinitions,
        3,
        abortedContext,
      )) {
        expect(event.type).toBe('error');
        if ((event as any).message === 'Agent execution aborted') break;
      }

      // Since the generator yields once and returns, we need to exhaust it
      const events: StreamEvent[] = [];
      for await (const event of executor.runLoopStream(
        'system prompt',
        [],
        toolDefinitions,
        3,
        abortedContext,
      )) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
    });
  });

  describe('forceToolChoice logic', () => {
    it('passes forceToolChoice=false on iteration 0', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateQuiz', {}));
      toolRegistry.execute.mockResolvedValueOnce({ data: {} });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('final'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      await collectEvents();

      // First call should have forceToolChoice=false (or undefined, which coerces to false)
      const firstCallArgs = llmClient.chatCompletion.mock.calls[0];
      expect(firstCallArgs[3]).toBe(false);
    });

    it('passes forceToolChoice=true on iteration >0 when last iteration had NO tool call', async () => {
      // Iteration 0: text-only response (no tool calls)
      // → lastIterationHadToolCall=false, so iteration 1 should forceToolChoice=true
      llmClient.chatCompletion.mockResolvedValueOnce(textOnlyResponse('我只是想跟你聊聊天。'));
      // After prompt nudge, iteration 1 gets forced tool choice
      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: { type: 'quiz', questions: [] } });
      // Iteration 2: final
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      await collectEvents();

      // Second chatCompletion call (after nudge retry, still iteration 0 effectively)
      // Actually, after the nudge, the next call is still within iteration 0 because the code loops back.
      // So forceToolChoice is still false on the first "real" tool-calling round.
      // Let me check: the loop continues without incrementing iteration for the nudge retry.
      // Wait — the code does `continue` which goes back to the top of the for loop, incrementing iteration.
      // No! `continue` in a `for` loop with `let iteration = 0; iteration < maxIterations; iteration++`
      // will increment iteration BEFORE executing the body again.
      // So: iteration 0 → text-only → continue → iteration becomes 1 → forceToolChoice=true ✓

      // Check second call (the nudge retry): forceToolChoice should be true since iteration became 1
      const calls = llmClient.chatCompletion.mock.calls;
      // First call: iteration 0, forceToolChoice=false
      expect(calls[0][3]).toBe(false);
      // Second call: iteration 1 (after nudge continue), forceToolChoice=true
      expect(calls[1][3]).toBe(true);
    });

    it('passes forceToolChoice=false when last iteration DID have a tool call', async () => {
      // Iteration 0: tool call → iteration 1: forceToolChoice=false (because lastIterationHadToolCall=true)
      llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateQuiz', {}));
      toolRegistry.execute.mockResolvedValueOnce({ data: { type: 'quiz', questions: [] } });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('final'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      await collectEvents();

      const calls = llmClient.chatCompletion.mock.calls;
      // First call: iteration 0, forceToolChoice=false
      expect(calls[0][3]).toBe(false);
      // Second call: iteration 1, lastIterationHadToolCall=true → forceToolChoice=false
      expect(calls[1][3]).toBe(false);
    });
  });

  describe('prompt nudge on iteration 0', () => {
    it('pushes assistant message + ⚠️ user message when tools available and no tool calls but content exists', async () => {
      // Iteration 0: LLM responds with text only (ignoring tool usage)
      const initialContent = '我理解你的需求，但让我先用文字回答你。';
      llmClient.chatCompletion.mockResolvedValueOnce(textOnlyResponse(initialContent));
      // After nudge, iteration 1: LLM follows instructions with tool call
      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: { type: 'quiz', questions: [] } });
      // Final
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      await collectEvents();

      // Verify that the second chatCompletion call received the nudged messages
      const calls = llmClient.chatCompletion.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      const secondCallMessages = calls[1][0] as LlmMessage[];
      // Last two messages should be the nudged assistant + user messages
      expect(secondCallMessages.length).toBeGreaterThan(1);

      const assistantMsg = secondCallMessages.find(
        (m: LlmMessage) => m.role === 'assistant' && m.content === initialContent,
      );
      expect(assistantMsg).toBeDefined();

      const userNudgeMsg = secondCallMessages.find(
        (m: LlmMessage) =>
          m.role === 'user' && typeof m.content === 'string' && m.content.includes('⚠️'),
      );
      expect(userNudgeMsg).toBeDefined();
      expect(userNudgeMsg!.content).toContain('没有调用任何工具');
    });

    it('does NOT push nudge when tools list is empty', async () => {
      const emptyDefs: LlmToolDefinition[] = [];
      const events: StreamEvent[] = [];

      llmClient.chatCompletion.mockResolvedValueOnce(textOnlyResponse('Hello world'));
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('final'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      for await (const event of executor.runLoopStream(
        'system prompt',
        [],
        emptyDefs,
        3,
        context,
      )) {
        events.push(event);
      }

      // Only one chatCompletion call should happen (text-only → immediate finish, no nudge)
      expect(llmClient.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('does NOT push nudge when response content is empty', async () => {
      // Empty content, no tool calls → code breaks immediately at line ~283
      llmClient.chatCompletion.mockResolvedValueOnce({ content: null, toolCalls: [] });

      const events: StreamEvent[] = [];
      for await (const event of executor.runLoopStream(
        'system prompt',
        [],
        toolDefinitions,
        3,
        context,
      )) {
        events.push(event);
      }

      expect(llmClient.chatCompletion).toHaveBeenCalledTimes(1);
      // No tokens or done because there was nothing to stream
    });
  });

  describe('game_data extraction', () => {
    describe('generateActivity → direct payload', () => {
      it('emits game_data with the full resultPayload for generateActivity', async () => {
        const activityResult = JSON.stringify({
          type: 'matching',
          pairs: [{ left: '苹果', right: 'apple' }],
        });

        llmClient.chatCompletion.mockResolvedValueOnce(
          toolCallResponse('generateActivity', { type: 'matching', domain: 'science' }),
        );
        toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(activityResult) });
        llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('活动已生成！'));
        llmClient.chatCompletionStream.mockImplementation(async function* () {
          yield '';
        });

        const events = await collectEvents();

        const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data') as any[];
        expect(gameDataEvents).toHaveLength(1);
        expect(gameDataEvents[0].activityType).toBe('matching');
        // For generateActivity, gameData should be the FULL payload directly
        expect(gameDataEvents[0].gameData).toBe(activityResult);
        expect(gameDataEvents[0].domain).toBe('science');
      });
    });

    describe('generateQuiz → direct payload', () => {
      it('emits game_data with the full resultPayload for generateQuiz', async () => {
        const quizResult = JSON.stringify({
          type: 'quiz',
          questions: [{ question: '1+1=?', options: ['1', '2'], answer: 1 }],
        });

        llmClient.chatCompletion.mockResolvedValueOnce(
          toolCallResponse('generateQuiz', { topic: '数学' }),
        );
        toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(quizResult) });
        llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
        llmClient.chatCompletionStream.mockImplementation(async function* () {
          yield '';
        });

        const events = await collectEvents();

        const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data') as any[];
        expect(gameDataEvents).toHaveLength(1);
        expect(gameDataEvents[0].activityType).toBe('quiz');
        // For generateQuiz, gameData should be the FULL payload directly
        expect(gameDataEvents[0].gameData).toBe(quizResult);
      });
    });

    describe('assignActivity → nested draft.activityData', () => {
      it('extracts activityData from resultPayload.draft.activityData for assignActivity', async () => {
        const innerGame = {
          type: 'quiz',
          questions: [{ question: '猜谜', options: ['A', 'B'], answer: 0 }],
        };
        const _assignResult = JSON.stringify({
          status: 'draft_ready',
          draft: {
            activityData: innerGame,
          },
        });

        llmClient.chatCompletion.mockResolvedValueOnce(
          toolCallResponse('assignActivity', { activityType: 'quiz', domain: 'math' }),
        );
        toolRegistry.execute.mockResolvedValueOnce({
          data: { status: 'draft_ready', draft: { activityData: innerGame } },
        });
        llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('分配成功'));
        llmClient.chatCompletionStream.mockImplementation(async function* () {
          yield '';
        });

        const events = await collectEvents();

        const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data') as any[];
        expect(gameDataEvents).toHaveLength(1);
        expect(gameDataEvents[0].activityType).toBe('quiz');
        // For assignActivity, gameData should be ONLY the nested activityData, not the wrapper
        const parsedGameData = JSON.parse(gameDataEvents[0].gameData);
        expect(parsedGameData).toEqual(innerGame);
        expect(parsedGameData).not.toHaveProperty('status');
        expect(parsedGameData).not.toHaveProperty('draft');
        expect(gameDataEvents[0].domain).toBe('math');
      });

      it('uses top-level activityData fallback for assignActivity', async () => {
        const innerGame = { type: 'true_false', statements: [] };
        const _assignResultWithTopLevel = JSON.stringify({
          status: 'draft_ready',
          activityData: innerGame,
        });

        llmClient.chatCompletion.mockResolvedValueOnce(
          toolCallResponse('assignActivity', { activityType: 'true_false' }),
        );
        toolRegistry.execute.mockResolvedValueOnce({
          data: { status: 'draft_ready', activityData: innerGame },
        });
        llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
        llmClient.chatCompletionStream.mockImplementation(async function* () {
          yield '';
        });

        const events = await collectEvents();

        const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data') as any[];
        expect(gameDataEvents).toHaveLength(1);
        expect(gameDataEvents[0].activityType).toBe('true_false');
        expect(JSON.parse(gameDataEvents[0].gameData)).toEqual(innerGame);
      });

      it('skips game_data when assignActivity has no activityData', async () => {
        llmClient.chatCompletion.mockResolvedValueOnce(
          toolCallResponse('assignActivity', { activityType: 'quiz' }),
        );
        toolRegistry.execute.mockResolvedValueOnce({
          data: { status: 'failed', error: 'Something went wrong' },
        });
        llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('失败'));
        llmClient.chatCompletionStream.mockImplementation(async function* () {
          yield '';
        });

        const events = await collectEvents();

        const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data');
        expect(gameDataEvents).toHaveLength(0);
      });
    });

    it('defaults domain to "language" when toolArgs lacks domain', async () => {
      const quizResult = JSON.stringify({ type: 'quiz', questions: [] });

      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '随便' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(quizResult) });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data') as any[];
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].domain).toBe('language');
    });
  });

  describe('skip invalid game_data', () => {
    it('skips game_data when tool returns error payload', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({
        data: { error: '生成失败：参数不正确' },
      });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('错误'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });

    it('skips game_data when tool returns non-parseable JSON', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: 'This is not valid JSON at all' });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });

    it('does NOT emit game_data for non-game tools like getUserProfile', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('getUserProfile', { childId: 1 }),
      );
      toolRegistry.execute.mockResolvedValueOnce({
        data: { name: '小明', age: 7 },
      });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('用户信息获取完成'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const gameDataEvents = events.filter((e: StreamEvent) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });
  });

  describe('stream event ordering', () => {
    it('emits tool_start before tool_result before game_data before token before done', async () => {
      const quizResult = JSON.stringify({ type: 'quiz', questions: [] });

      llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateQuiz', {}));
      toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(quizResult) });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('测验完成'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '测验结果来了';
      });

      const events = await collectEvents();

      const types = events.map((e) => e.type);
      const toolStartIdx = types.indexOf('tool_start');
      const toolResultIdx = types.indexOf('tool_result');
      const gameDataIdx = types.indexOf('game_data');
      const tokenIdx = types.indexOf('token');
      const doneIdx = types.indexOf('done');

      expect(toolStartIdx).toBeGreaterThanOrEqual(0);
      expect(toolResultIdx).toBeGreaterThan(toolStartIdx);
      expect(gameDataIdx).toBeGreaterThan(toolResultIdx);
      expect(tokenIdx).toBeGreaterThan(gameDataIdx);
      expect(doneIdx).toBeGreaterThan(tokenIdx);
    });

    it('emits token events for non-ascii streamed content', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('最终回答'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '最';
        yield '终';
        yield '回';
        yield '答';
      });

      // Use empty tool definitions to bypass prompt-nudge logic
      const events: StreamEvent[] = [];
      for await (const event of executor.runLoopStream(
        'You are a teaching assistant.',
        [],
        [],
        3,
        context,
      )) {
        events.push(event);
      }
      const tokenEvents = events.filter((e: StreamEvent) => e.type === 'token') as any[];
      expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('max iterations reached', () => {
    it('yields MAX_ITERATIONS_FALLBACK token + done when max iterations exhausted', async () => {
      // Keep returning tool calls for every iteration (simulate endless tool calls)
      for (let i = 0; i < 3; i++) {
        llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('getUserProfile', {}));
        toolRegistry.execute.mockResolvedValueOnce({ data: {} });
      }
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const tokenEvents = events.filter((e: StreamEvent) => e.type === 'token') as any[];
      const doneEvent = events.find((e: StreamEvent) => e.type === 'done') as any;

      expect(doneEvent).toBeDefined();
      expect(tokenEvents.length).toBe(1);
      expect(tokenEvents[0].content).toContain('暂时想不出好的回答');
    });
  });

  describe('thinking block emission', () => {
    it('emits thinking event when response contains <think>...</think> before tool calls', async () => {
      llmClient.chatCompletion.mockResolvedValueOnce({
        ...toolCallResponse('generateQuiz', {}),
        content: '<think>让我想想这个问题</think>',
      });
      toolRegistry.execute.mockResolvedValueOnce({ data: { type: 'quiz', questions: [] } });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events = await collectEvents();
      const thinkingEvents = events.filter((e: StreamEvent) => e.type === 'thinking') as any[];
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
      expect(thinkingEvents[0].thinkingContent).toContain('让我想想这个问题');
    });
  });

  describe('onToolCall callback', () => {
    it('invokes onToolCall with toolName, args, and result for each tool call', async () => {
      const quizResult = JSON.stringify({ type: 'quiz', questions: [] });
      const onToolCall = jest.fn();

      llmClient.chatCompletion.mockResolvedValueOnce(
        toolCallResponse('generateQuiz', { topic: '数学' }),
      );
      toolRegistry.execute.mockResolvedValueOnce({ data: JSON.parse(quizResult) });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      const events: StreamEvent[] = [];
      for await (const event of executor.runLoopStream(
        'system prompt',
        [],
        toolDefinitions,
        3,
        context,
        onToolCall,
      )) {
        events.push(event);
      }

      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolCall).toHaveBeenCalledWith({
        toolName: 'generateQuiz',
        args: { topic: '数学' },
        result: quizResult,
      });
    });
  });

  describe('normalized tool args with context metadata', () => {
    it('adds childId, parentId, ageGroup from context when tool requires them', async () => {
      const mockTool = {
        metadata: {
          requiresChildId: true,
          requiresParentId: true,
          requiresAgeGroup: true,
        },
      };
      toolRegistry.get.mockReturnValue(mockTool);

      llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateQuiz', {}));
      toolRegistry.execute.mockResolvedValueOnce({ data: { type: 'quiz', questions: [] } });
      llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('done'));
      llmClient.chatCompletionStream.mockImplementation(async function* () {
        yield '';
      });

      await collectEvents();

      const execContext = toolRegistry.execute.mock.calls[0][2];
      expect(execContext.childId).toBe(1);
      expect(execContext.ageGroup).toBe('5-6');
    });
  });
});
