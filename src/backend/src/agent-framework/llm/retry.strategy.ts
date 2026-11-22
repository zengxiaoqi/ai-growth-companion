/**
 * LLM retry strategy with exponential backoff.
 * Eliminates the duplicated retry logic in llm-client.ts, agent-executor.ts, generate-activity.ts.
 */

import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/** 超时类错误不做指数退避重试，详见 RetryStrategy.isRetryable */

export class RetryStrategy {
  private readonly logger = new Logger(RetryStrategy.name);

  constructor(private readonly options: RetryOptions = DEFAULT_RETRY_OPTIONS) {}

  /**
   * 超时类错误不重试。
   *
   * 重试的前提是"这次失败是偶发的"（429、5xx、连接被重置）。超时不是：它是
   * "这个请求的规模在给定预算内做不完"，再发一次只会把等待时间乘以重试次数。
   * 实测分镜生成 max_tokens=32768 时稳定 300s 超时，三层重试叠起来单任务能拖
   * 45 分钟以上，队列后面的课全部干等——比失败本身更糟。
   *
   * 需要重试的责任交给上层（工具层的多轮 attempt 有独立的留优逻辑），语义也更清晰。
   */
  private isRetryable(error: any): boolean {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return false;
    if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNABORTED') return false;
    const message = String(error?.message ?? '');
    // "stalled" 是流式等待增量超时（连接可能还在，但已经不出字了）
    return !/timed? ?out|timeout|stalled/i.test(message);
  }

  /**
   * Execute a function with retry and exponential backoff.
   * Returns the result on success, throws on final failure.
   */
  async execute<T>(fn: () => Promise<T>, label: string = 'operation'): Promise<T> {
    let lastError: any;
    let delay = this.options.baseDelayMs;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (!this.isRetryable(error)) {
          this.logger.warn(`${label} failed (non-retryable): ${error.message}`);
          break;
        }
        if (attempt === this.options.maxAttempts) {
          this.logger.error(`${label} failed after ${attempt} attempts: ${error.message}`);
          break;
        }

        this.logger.warn(
          `${label} attempt ${attempt} failed: ${error.message}, retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
        delay = Math.min(delay * this.options.backoffMultiplier, this.options.maxDelayMs);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
