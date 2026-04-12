/**
 * buildTool() factory — creates tool instances from declarative definitions.
 *
 * Inspired by Claude Code's buildTool() pattern.
 * Useful for simple tools that don't need a full class.
 *
 * Usage:
 * ```typescript
 * const myTool = buildTool({
 *   metadata: { name: 'myTool', ... },
 *   execute: async (args, context) => { ... },
 * });
 * ```
 */

import type { ITool, ToolMetadata, ToolResult, ToolExecutionContext } from '../core';

export interface ToolDefinition<TInput = any, TOutput = unknown> {
  metadata: ToolMetadata;
  execute: (args: TInput, context: ToolExecutionContext) => Promise<ToolResult<TOutput>>;
}

/**
 * Factory function to create a tool from a plain object definition.
 * Provides default values for optional metadata fields.
 */
export function buildTool<TInput = any, TOutput = unknown>(
  definition: ToolDefinition<TInput, TOutput>,
): ITool<TInput, TOutput> {
  const { metadata, execute } = definition;

  // Fill in defaults for optional metadata fields
  const fullMetadata: ToolMetadata = {
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
    ...metadata,
  };

  return {
    metadata: fullMetadata,
    execute,
  } as ITool<TInput, TOutput>;
}
