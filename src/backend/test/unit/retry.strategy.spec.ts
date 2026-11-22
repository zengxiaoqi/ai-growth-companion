/**
 * RetryStrategy unit tests — 重点是"什么时候不该重试"。
 *
 * 背景：分镜生成一度卡在 8% 四十多分钟，根因是三层重试叠乘（LLM 层 3 次 ×
 * 工具层 3 轮 × agent 4 轮），每层都对着同一个必然超时的 300s 请求再等一轮。
 * 超时不是偶发故障，重试它只是把失败时间乘以重试次数。
 */

import { RetryStrategy } from '../../src/agent-framework/llm/retry.strategy';

const FAST = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, backoffMultiplier: 1 };

describe('RetryStrategy', () => {
  it('returns the result on first success', async () => {
    const strategy = new RetryStrategy(FAST);
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(strategy.execute(fn, 'op')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures such as 429 / 5xx', async () => {
    const strategy = new RetryStrategy(FAST);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValue('ok');

    await expect(strategy.execute(fn, 'op')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxAttempts on retryable errors', async () => {
    const strategy = new RetryStrategy(FAST);
    const fn = jest.fn().mockRejectedValue(new Error('503 Service Unavailable'));

    await expect(strategy.execute(fn, 'op')).rejects.toThrow('503');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  describe('non-retryable timeouts', () => {
    it.each([
      ['plain timeout message', new Error('LLM call timed out (300000ms) for qwen3.8-max-0902')],
      ['stalled stream', new Error('LLM stream stalled for 300000ms (model x)')],
      ['AbortError name', Object.assign(new Error('aborted'), { name: 'AbortError' })],
      ['TimeoutError name', Object.assign(new Error('the operation timed out'), { name: 'TimeoutError' })],
      ['ETIMEDOUT code', Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })],
    ])('does not retry %s', async (_label, error) => {
      const strategy = new RetryStrategy(FAST);
      const fn = jest.fn().mockRejectedValue(error);

      await expect(strategy.execute(fn, 'op')).rejects.toThrow();
      // 只尝试一次：重试一个必然超时的请求只会再等一整轮
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
