/**
 * LLM retry strategy with exponential backoff.
 * Eliminates the duplicated retry logic in llm-client.ts, agent-executor.ts, generate-activity.ts.
 */

import { Logger } from "@nestjs/common";

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

export class RetryStrategy {
  private readonly logger = new Logger(RetryStrategy.name);

  constructor(private readonly options: RetryOptions = DEFAULT_RETRY_OPTIONS) {}

  /**
   * Execute a function with retry and exponential backoff.
   * Returns the result on success, throws on final failure.
   */
  async execute<T>(
    fn: () => Promise<T>,
    label: string = "operation",
  ): Promise<T> {
    let lastError: any;
    let delay = this.options.baseDelayMs;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt === this.options.maxAttempts) {
          this.logger.error(
            `${label} failed after ${attempt} attempts: ${error.message}`,
          );
          break;
        }

        this.logger.warn(
          `${label} attempt ${attempt} failed: ${error.message}, retrying in ${delay}ms...`,
        );
        await this.sleep(delay);
        delay = Math.min(
          delay * this.options.backoffMultiplier,
          this.options.maxDelayMs,
        );
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
