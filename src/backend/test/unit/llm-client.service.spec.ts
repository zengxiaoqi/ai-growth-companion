/**
 * LlmClientService unit tests — legacy OpenAI SDK path only.
 *
 * We never call onModuleInit(), so piAiEnabled stays false and all code
 * flows through legacyChatCompletion / chatCompletionWithTokenLimit.
 */

import { LlmClientService } from '../../src/agent-framework/llm/llm-client.service';
import type { LlmMessage } from '../../src/agent-framework/core';

// Mock OpenAI SDK module so constructor-time dynamic import does not hit network
jest.mock('openai/index', () => ({
  default: jest.fn().mockImplementation(() => ({})),
}));

/* ── helpers ─────────────────────────────────────────────────────────── */

function makeConfigMap(map: Record<string, string | undefined>) {
  return {
    get: (key: string, def?: string) => map[key] ?? def,
  };
}

function createService(cfgMap: Record<string, string | undefined>) {
  const mockConfig = makeConfigMap(cfgMap);
  const svc = new LlmClientService(mockConfig as any);
  // Set up the OpenAI client mock directly (onModuleInit is NOT called)
  const mockCreate = jest.fn();
  (svc as any).client = { chat: { completions: { create: mockCreate } } };
  return { svc, mockCreate };
}

// Note: unused helper kept for potential future tests — actual mocks use direct resolvedValues below.

/* ── chatCompletion tests ────────────────────────────────────────────── */

describe('LlmClientService — legacy path', () => {
  describe('chatCompletion()', () => {
    it('passes max_tokens override when provided', async () => {
      const { svc, mockCreate } = createService({});
      const messages: LlmMessage[] = [{ role: 'user', content: 'hello' }];
      const responsePromise = Promise.resolve({
        choices: [{ message: { content: 'bye' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      });
      mockCreate.mockResolvedValueOnce(responsePromise);

      const result = await svc.chatCompletion(messages, undefined, 16384);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'qwen2.5:7b',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'hello' }),
          ]),
          max_tokens: 16384,
          temperature: 0.7,
        }),
        expect.any(Object),
      );
      expect(result.content).toBe('bye');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.promptTokens).toBe(5);
      expect(result.usage?.completionTokens).toBe(3);
    });

    it('uses config maxTokens (4096) when no override', async () => {
      const { svc, mockCreate } = createService({});
      const messages: LlmMessage[] = [{ role: 'user', content: 'hi' }];
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ho' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 2 },
      });

      await svc.chatCompletion(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4096 }),
        expect.any(Object),
      );
    });

    it('returns result shape with total tokens', async () => {
      const { svc, mockCreate } = createService({});
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'resp' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      const result = await svc.chatCompletion([{ role: 'user', content: 'test' }]);

      expect(result.content).toBe('resp');
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(20);
      // LlmResponse has promptTokens & completionTokens but NO totalTokens field
      expect((result as any).totalTokens).toBeUndefined();
    });
  });

  /* ── generate() tests ──────────────────────────────────────────────── */

  describe('generate()', () => {
    it('returns plain content stripped of thinking blocks', async () => {
      const { svc, mockCreate } = createService({});
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: '<think>reasoning</think>\n\nhello world' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      });

      const result = await svc.generate('hello');

      expect(result).toBe('hello world');
    });

    it('escalates token limit when finish_reason is length', async () => {
      const { svc, mockCreate } = createService({});
      // First call: truncated (length), second: normal
      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 5, completion_tokens: 4090 },
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'full response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 100 },
        });

      const result = await svc.generate('some long prompt');

      expect(mockCreate).toHaveBeenCalledTimes(2);
      // first call uses ESCALATING_TOKEN_LIMITS[0] = 4096
      const firstCallArgs = mockCreate.mock.calls[0][0] as any;
      expect(firstCallArgs.max_tokens).toBe(4096);
      // second call uses ESCALATING_TOKEN_LIMITS[1] = 8192
      const secondCallArgs = mockCreate.mock.calls[1][0] as any;
      expect(secondCallArgs.max_tokens).toBe(8192);
      expect(result).toBe('full response');
    });

    it('strips think blocks before returning in generate()', async () => {
      const { svc, mockCreate } = createService({});
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '<think>This is my reasoning process...</think>\n\n{\"key\": \"value\"}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      });

      const result = await svc.generate('generate json');

      expect(result).toBe('{"key": "value"}');
    });
  });

  /* ── estimateTokenCount tests ──────────────────────────────────────── */

  describe('estimateTokenCount()', () => {
    it('returns Math.ceil(text.length / 2)', () => {
      const { svc } = createService({});
      // "abc" → 3 chars → ceil(3/2) = 2
      expect(svc.estimateTokenCount('abc')).toBe(2);
      // "" → 0 chars → 0
      expect(svc.estimateTokenCount('')).toBe(0);
      // "abcd" → 4 chars → 2
      expect(svc.estimateTokenCount('abcd')).toBe(2);
    });
  });

  /* ── tryPartialJsonSalvage tests ───────────────────────────────────── */

  describe('tryPartialJsonSalvage()', () => {
    it('completes a truncated JSON object', () => {
      const { svc } = createService({});
      const fn = (svc as any).tryPartialJsonSalvage;
      const input = '{"a": 1, "b": {"c": 2}';
      const result = fn(input);
      // Should salvage by appending '}' to close the outer object
      expect(result).not.toBeNull();
      expect(() => JSON.parse(result!)).not.toThrow();
      const parsed = JSON.parse(result!);
      expect(parsed).toEqual({ a: 1, b: { c: 2 } });
    });

    it('returns the original text when already valid JSON', () => {
      const { svc } = createService({});
      const fn = (svc as any).tryPartialJsonSalvage;
      const input = '{"a": 1, "b": 2}';
      const result = fn(input);
      // Already valid — should return original text
      expect(result).toBe(input);
    });

    it('returns null for hopeless input without braces', () => {
      const { svc } = createService({});
      const fn = (svc as any).tryPartialJsonSalvage;
      const input = 'this is not json at all';
      expect(fn(input)).toBeNull();
    });

    it('returns null for deeply broken JSON that cannot be salvaged', () => {
      const { svc } = createService({});
      const fn = (svc as any).tryPartialJsonSalvage;
      // '{a: invalid, unclosed string"' — no valid JSON can be produced by simple fixes
      const result = fn('{a: invalid, unclosed string"');
      expect(result).toBeNull();
    });
  });

  /* ── Constructor / config tests ────────────────────────────────────── */

  describe('constructor / config reading', () => {
    it('reads custom base URL, API key, model, maxTokens, temperature', () => {
      const { svc } = createService({
        LLM_BASE_URL: 'https://api.example.com/v1',
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4',
        LLM_MAX_TOKENS: '8192',
        LLM_TEMPERATURE: '0.3',
      });
      const config = (svc as any).config;
      expect(config.baseUrl).toBe('https://api.example.com/v1');
      expect(config.apiKey).toBe('sk-test-key');
      expect(config.model).toBe('gpt-4');
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0.3);
    });

    it('returns isConfigured true even when piAi is disabled', () => {
      const { svc } = createService({});
      expect(svc.isConfigured).toBe(true);
    });
  });
});
