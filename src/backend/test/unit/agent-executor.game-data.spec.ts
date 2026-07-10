import { AgentExecutor } from '../../src/modules/ai/agent/agent-executor';
import type { LlmMessage, LlmResponse } from '../../src/agent-framework/core';

/**
 * Unit tests for AgentExecutor game_data emission logic (commit 36b4faf).
 *
 * Verifies:
 * 1. generateQuiz tool calls emit game_data events
 * 2. generateActivity tool calls emit game_data events
 * 3. Invalid game_data payloads (error payloads, unparseable JSON) are skipped
 * 4. Non-game tools do NOT emit game_data events
 * 5. All 7 supported activity types are correctly inferred
 */
describe('AgentExecutor game_data emission', () => {
  let executor: AgentExecutor;
  let llmClient: { chatCompletion: jest.Mock };
  let toolRegistry: {
    getToolDefinitions: jest.Mock;
    execute: jest.Mock;
  };
  let conversationManager: {
    addMessage: jest.Mock;
    buildMessageArray: jest.Mock;
  };
  let contentSafetyService: {
    filterContent: jest.Mock;
    isContentSafe: jest.Mock;
  };

  /** Build a mock LlmResponse that triggers a single tool call */
  function toolCallResponse(toolName: string, args: Record<string, any>): LlmResponse {
    return {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function' as const,
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    };
  }

  /** Build a mock LlmResponse with a final text answer (no tool calls) */
  function finalResponse(text: string): LlmResponse {
    return { content: text, toolCalls: undefined };
  }

  /**
   * Collect all events from the async generator.
   * Calls executeStream with pre-configured mocks.
   */
  async function collectStreamEvents(
    llmResponses: LlmResponse[],
    toolResults: Record<string, string>,
  ): Promise<any[]> {
    llmClient.chatCompletion.mockReset();
    llmResponses.forEach((resp) => {
      llmClient.chatCompletion.mockResolvedValueOnce(resp);
    });
    // Safety fallback in case more iterations happen
    llmClient.chatCompletion.mockResolvedValue(finalResponse('done'));

    toolRegistry.execute.mockImplementation((toolName: string) => {
      return Promise.resolve(toolResults[toolName] ?? '{}');
    });

    conversationManager.addMessage.mockResolvedValue(undefined);
    conversationManager.buildMessageArray.mockResolvedValue([] as LlmMessage[]);
    contentSafetyService.filterContent.mockImplementation((content: string) => ({
      content,
      wasFiltered: false,
    }));
    contentSafetyService.isContentSafe.mockReturnValue(true);

    const events: any[] = [];
    for await (const event of executor.executeStream(
      'test-session',
      '生成一个测验',
      '5-6',
      '小明',
      { childId: 2 },
    )) {
      events.push(event);
    }
    return events;
  }

  beforeEach(() => {
    llmClient = { chatCompletion: jest.fn() };
    toolRegistry = {
      getToolDefinitions: jest.fn().mockReturnValue([]),
      execute: jest.fn(),
    };
    conversationManager = {
      addMessage: jest.fn().mockResolvedValue(undefined),
      buildMessageArray: jest.fn().mockResolvedValue([] as LlmMessage[]),
    };
    contentSafetyService = {
      filterContent: jest.fn().mockImplementation((content: string) => ({
        content,
        wasFiltered: false,
      })),
      isContentSafe: jest.fn().mockReturnValue(true),
    };

    executor = new AgentExecutor(
      llmClient as any,
      toolRegistry as any,
      conversationManager as any,
      contentSafetyService as any,
    );
  });

  describe('generateQuiz → game_data emission', () => {
    it('emits game_data when generateQuiz returns a valid quiz', async () => {
      const quizResult = JSON.stringify({
        type: 'quiz',
        questions: [{ question: '1+1=?', options: ['1', '2', '3'], answer: 1 }],
      });

      const events = await collectStreamEvents(
        [
          toolCallResponse('generateQuiz', { topic: '数学', count: 1 }),
          finalResponse('测验已生成！'),
        ],
        { generateQuiz: quizResult },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].activityType).toBe('quiz');
      expect(gameDataEvents[0].gameData).toBe(quizResult);
    });

    it('skips game_data when generateQuiz returns an error payload', async () => {
      const errorResult = JSON.stringify({ error: '生成失败' });

      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', { topic: '数学' }), finalResponse('抱歉，生成失败')],
        { generateQuiz: errorResult },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });

    it('skips game_data when generateQuiz returns non-JSON result', async () => {
      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', { topic: '数学' }), finalResponse('done')],
        { generateQuiz: 'This is not JSON' },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });
  });

  describe('generateActivity → game_data emission', () => {
    it('emits game_data when generateActivity returns a valid matching activity', async () => {
      const activityResult = JSON.stringify({
        type: 'matching',
        pairs: [
          { left: '苹果', right: 'apple' },
          { left: '香蕉', right: 'banana' },
        ],
      });

      const events = await collectStreamEvents(
        [toolCallResponse('generateActivity', { type: 'matching' }), finalResponse('活动已生成！')],
        { generateActivity: activityResult },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].activityType).toBe('matching');
    });

    it('infers activity type from tool args when result lacks explicit type', async () => {
      const activityResult = JSON.stringify({
        pairs: [{ left: 'a', right: 'b' }],
      });

      const events = await collectStreamEvents(
        [toolCallResponse('generateActivity', { type: 'matching' }), finalResponse('done')],
        { generateActivity: activityResult },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].activityType).toBe('matching');
    });

    it('skips game_data when generateActivity returns error payload', async () => {
      const errorResult = JSON.stringify({ error: '参数错误' });

      const events = await collectStreamEvents(
        [toolCallResponse('generateActivity', { type: 'quiz' }), finalResponse('done')],
        { generateActivity: errorResult },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });
  });

  describe('activity type inference from result payload', () => {
    const typeCases: Array<{ field: string; value: any; expected: string }> = [
      { field: 'questions', value: [], expected: 'quiz' },
      { field: 'statements', value: [], expected: 'true_false' },
      { field: 'sentences', value: [], expected: 'fill_blank' },
      { field: 'pairs', value: [], expected: 'matching' },
      { field: 'items', value: [], expected: 'sequencing' },
      { field: 'pieces', value: [], expected: 'puzzle' },
    ];

    typeCases.forEach(({ field, value, expected }) => {
      it(`infers "${expected}" from payload containing ${field}`, async () => {
        const result = JSON.stringify({ [field]: value });
        const events = await collectStreamEvents(
          [toolCallResponse('generateActivity', {}), finalResponse('done')],
          { generateActivity: result },
        );

        const gameDataEvents = events.filter((e) => e.type === 'game_data');
        expect(gameDataEvents).toHaveLength(1);
        expect(gameDataEvents[0].activityType).toBe(expected);
      });
    });

    it('infers "connection" from connections array', async () => {
      const result = JSON.stringify({ connections: [] });
      const events = await collectStreamEvents(
        [toolCallResponse('generateActivity', {}), finalResponse('done')],
        { generateActivity: result },
      );
      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].activityType).toBe('connection');
    });

    it('skips game_data when payload has no recognizable activity fields', async () => {
      const result = JSON.stringify({ someUnknownField: 'value' });
      const events = await collectStreamEvents(
        [toolCallResponse('generateActivity', {}), finalResponse('done')],
        { generateActivity: result },
      );
      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });
  });

  describe('non-game tools do NOT emit game_data', () => {
    it('does not emit game_data for getUserProfile tool', async () => {
      const events = await collectStreamEvents(
        [toolCallResponse('getUserProfile', { childId: 2 }), finalResponse('done')],
        { getUserProfile: JSON.stringify({ name: '小明' }) },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });

    it('does not emit game_data for getRecommendations tool', async () => {
      const events = await collectStreamEvents(
        [toolCallResponse('getRecommendations', { childId: 2 }), finalResponse('done')],
        { getRecommendations: JSON.stringify({ items: [] }) },
      );

      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(0);
    });
  });

  describe('JSON code block parsing in tool results', () => {
    it('parses JSON wrapped in ```json code blocks', async () => {
      const result = '```json\n{"type":"quiz","questions":[]}\n```';
      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', {}), finalResponse('done')],
        { generateQuiz: result },
      );
      const gameDataEvents = events.filter((e) => e.type === 'game_data');
      expect(gameDataEvents).toHaveLength(1);
      expect(gameDataEvents[0].activityType).toBe('quiz');
    });
  });

  describe('stream event ordering', () => {
    it('emits tool_start before tool_result before game_data', async () => {
      const quizResult = JSON.stringify({ type: 'quiz', questions: [] });
      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', {}), finalResponse('done')],
        { generateQuiz: quizResult },
      );

      const toolStartIdx = events.findIndex((e) => e.type === 'tool_start');
      const toolResultIdx = events.findIndex((e) => e.type === 'tool_result');
      const gameDataIdx = events.findIndex((e) => e.type === 'game_data');

      expect(toolStartIdx).toBeGreaterThanOrEqual(0);
      expect(toolResultIdx).toBeGreaterThan(toolStartIdx);
      expect(gameDataIdx).toBeGreaterThan(toolResultIdx);
    });

    it('includes domain from toolArgs in game_data event', async () => {
      const result = JSON.stringify({ type: 'quiz', questions: [] });
      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', { domain: 'science' }), finalResponse('done')],
        { generateQuiz: result },
      );
      const gameDataEvent = events.find((e) => e.type === 'game_data');
      expect(gameDataEvent).toBeDefined();
      expect(gameDataEvent.domain).toBe('science');
    });

    it('defaults domain to "language" when not specified', async () => {
      const result = JSON.stringify({ type: 'quiz', questions: [] });
      const events = await collectStreamEvents(
        [toolCallResponse('generateQuiz', {}), finalResponse('done')],
        { generateQuiz: result },
      );
      const gameDataEvent = events.find((e) => e.type === 'game_data');
      expect(gameDataEvent).toBeDefined();
      expect(gameDataEvent.domain).toBe('language');
    });
  });
});
