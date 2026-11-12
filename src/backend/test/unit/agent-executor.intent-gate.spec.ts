import { AgentExecutorService } from '../../src/agent-framework/agents/agent-executor.service';
import type {
  IToolRegistry,
  ILlmClient,
  LlmToolDefinition,
  LlmResponse,
  StreamEvent,
  AgentContext,
} from '../../src/agent-framework/core';

function toolCallResponse(toolName: string, args: Record<string, any>): LlmResponse {
  return {
    content: '',
    toolCalls: [
      { id: 'call_1', type: 'function' as const, function: { name: toolName, arguments: JSON.stringify(args) } },
    ],
  };
}
function finalResponse(text: string): LlmResponse {
  return { content: text, toolCalls: undefined };
}
function def(name: string): LlmToolDefinition {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {} } },
  };
}

describe('AgentExecutorService — intent hard gate + slot binding', () => {
  let executor: AgentExecutorService;
  let llmClient: { chatCompletion: jest.Mock; chatCompletionStream: jest.Mock };
  let toolRegistry: { execute: jest.Mock; get: jest.Mock; getToolDefinitions: jest.Mock };
  let context: AgentContext;

  const musicResult = {
    success: true,
    data: { count: 1, tracks: [{ title: '全部都给你', artist: 'x', duration_s: 100 }] },
    musicData: { tracks: [{ title: '全部都给你', url: '/music/audio/tok' }] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    llmClient = {
      chatCompletion: jest.fn(),
      chatCompletionStream: jest.fn().mockImplementation(async function* () {}),
    };
    toolRegistry = {
      execute: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockReturnValue({
        metadata: { requiresChildId: false, requiresParentId: false, requiresAgeGroup: false },
      }),
      getToolDefinitions: jest.fn().mockReturnValue([]),
    };
    context = { ageGroup: '5-6', childId: 2, conversationId: 's', messages: [], depth: 0, metadata: {} };
    executor = new AgentExecutorService(toolRegistry as unknown as IToolRegistry, llmClient as unknown as ILlmClient);
  });

  async function collect(defs: LlmToolDefinition[], ctx: AgentContext): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const e of executor.runLoopStream('sys', [], defs, 3, ctx)) events.push(e);
    return events;
  }

  it('rejects a tool outside the offered set (stream) without executing it', async () => {
    context.metadata = { intentGated: true };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateActivity', { type: 'quiz' }));
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('好的'));
    llmClient.chatCompletionStream.mockImplementation(async function* () { yield '好的'; });

    const events = await collect([def('playMusic')], context);

    expect(toolRegistry.execute).not.toHaveBeenCalled();
    const rejected = events.find((e) => e.type === 'tool_result') as any;
    expect(rejected.toolResult).toContain('本轮不可用');
    expect(events.some((e) => e.type === 'game_data')).toBe(false);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('executes a tool inside the offered set (stream)', async () => {
    context.metadata = { intentGated: true };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('playMusic', { query: '全部都给你' }));
    toolRegistry.execute.mockResolvedValueOnce(musicResult);
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('给你放'));
    llmClient.chatCompletionStream.mockImplementation(async function* () { yield '给你放'; });

    const events = await collect([def('playMusic')], context);

    expect(toolRegistry.execute).toHaveBeenCalledTimes(1);
    expect(toolRegistry.execute.mock.calls[0][0]).toBe('playMusic');
    expect(events.some((e) => e.type === 'music_data')).toBe(true);
  });

  it('plain_chat (gated, no tools) rejects any hallucinated tool call in runLoop', async () => {
    context.metadata = { intentGated: true };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('generateActivity', { type: 'quiz' }));
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('陪你聊聊天～'));

    const result = await executor.runLoop('sys', [], [], 3, context);

    expect(toolRegistry.execute).not.toHaveBeenCalled();
    expect(result.response).toBe('陪你聊聊天～');
  });

  it('binds the verbatim song_title slot over the model query (stream)', async () => {
    context.metadata = { intentGated: true, intentSlots: { song_title: '全部都给你' } };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('playMusic', { query: '小星星' }));
    toolRegistry.execute.mockResolvedValueOnce(musicResult);
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('给你放《全部都给你》'));
    llmClient.chatCompletionStream.mockImplementation(async function* () { yield '给你放'; });

    await collect([def('playMusic')], context);

    expect(toolRegistry.execute.mock.calls[0][1].query).toBe('全部都给你');
  });

  it('binds the verbatim slot in runLoop too', async () => {
    context.metadata = { intentGated: true, intentSlots: { song_title: '孤勇者' } };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('playMusic', { query: '儿歌' }));
    toolRegistry.execute.mockResolvedValueOnce(musicResult);
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('给你放'));

    await executor.runLoop('sys', [], [def('playMusic')], 3, context);

    expect(toolRegistry.execute.mock.calls[0][1].query).toBe('孤勇者');
  });

  it('does not override the query when no slot was captured', async () => {
    context.metadata = { intentGated: true };
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('playMusic', { query: '小星星' }));
    toolRegistry.execute.mockResolvedValueOnce(musicResult);
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('给你放'));
    llmClient.chatCompletionStream.mockImplementation(async function* () { yield '给你放'; });

    await collect([def('playMusic')], context);

    expect(toolRegistry.execute.mock.calls[0][1].query).toBe('小星星');
  });

  it('keeps legacy soft behaviour when the turn is NOT intent-gated', async () => {
    // No intentGated flag: an out-of-list tool still executes (unchanged path
    // used by coordinated / casual / english / fallback).
    context.metadata = {};
    llmClient.chatCompletion.mockResolvedValueOnce(toolCallResponse('playMusic', { query: '小星星' }));
    toolRegistry.execute.mockResolvedValueOnce(musicResult);
    llmClient.chatCompletion.mockResolvedValueOnce(finalResponse('给你放'));
    llmClient.chatCompletionStream.mockImplementation(async function* () { yield '给你放'; });

    await collect([def('generateQuiz')], context);

    expect(toolRegistry.execute).toHaveBeenCalledTimes(1);
    expect(toolRegistry.execute.mock.calls[0][0]).toBe('playMusic');
  });
});