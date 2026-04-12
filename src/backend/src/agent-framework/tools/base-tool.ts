/**
 * Abstract base class for tools implementing the ITool interface.
 *
 * Provides sensible defaults and helper methods so concrete tools
 * only need to implement execute() and provide metadata.
 */

import { Injectable } from '@nestjs/common';
import type { ITool, ToolMetadata, ToolResult, ToolExecutionContext } from '../core';

/**
 * Abstract base tool with default implementations.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * @RegisterTool()
 * export class MyTool extends BaseTool<MyInput, MyOutput> {
 *   readonly metadata: ToolMetadata = { ... };
 *   async execute(args, context) { ... }
 * }
 * ```
 */
@Injectable()
export abstract class BaseTool<TInput = any, TOutput = unknown> implements ITool<TInput, TOutput> {
  abstract readonly metadata: ToolMetadata;

  abstract execute(args: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;

  /** Helper: create a success result */
  protected ok(data: TOutput, gameData?: unknown): ToolResult<TOutput> {
    return { success: true, data, ...(gameData ? { gameData } : {}) };
  }

  /** Helper: create an error result (never throws) */
  protected fail(error: string): ToolResult<TOutput> {
    return { success: false, error };
  }

  /** Helper: safely parse and return a typed result from JSON */
  protected parseJsonResult(jsonString: string): ToolResult<TOutput> {
    try {
      const data = JSON.parse(jsonString);
      if (data && typeof data === 'object' && data.error) {
        return this.fail(data.error);
      }
      return this.ok(data);
    } catch {
      return this.fail(`JSON 解析失败: ${jsonString.slice(0, 80)}`);
    }
  }
}
