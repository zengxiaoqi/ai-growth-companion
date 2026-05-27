/**
 * Tool interface — the core abstraction for all agent-callable tools.
 * Every tool must implement this interface and provide static metadata
 * describing its capabilities and requirements.
 */

import type { ToolMetadata, ToolResult, ToolExecutionContext } from '../types';

/**
 * The universal tool interface.
 *
 * Tools are the building blocks of agent capabilities. Each tool:
 * - Has a unique name and OpenAI-compatible input schema
 * - Declares whether it's read-only, concurrency-safe, and what context it needs
 * - Returns a structured ToolResult (not a raw string)
 */
export interface ITool<TInput = any, TOutput = unknown> {
  /** Static metadata describing this tool's capabilities */
  readonly metadata: ToolMetadata;

  /**
   * Execute the tool with validated arguments and execution context.
   * Returns a structured result envelope — never throws for business errors.
   */
  execute(args: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
}
