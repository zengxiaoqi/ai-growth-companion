/**
 * Tool metadata and shared types.
 */

/** Information about a tool call that occurred during agent execution */
export interface ToolCallInfo {
  tool: string;
  args: Record<string, any>;
  resultSummary: string;
}

/** Context passed to every tool execution */
export interface ToolExecutionContext {
  childId?: number;
  parentId?: number;
  ageGroup: string;
  conversationId: string;
  /** Additional context from the calling agent */
  extra: Record<string, any>;
}

/** Standard tool result envelope */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** Optional game data to emit as a stream event */
  gameData?: unknown;
}

/** Describes a tool's static capabilities and requirements */
export interface ToolMetadata {
  /** Tool name used by LLM function calling */
  name: string;
  /** Human-readable description */
  description: string;
  /** OpenAI function-calling parameter schema */
  inputSchema: Record<string, any>;
  /** Whether this tool can run concurrently with others */
  concurrencySafe: boolean;
  /** Whether this tool only reads data (no side effects) */
  readOnly: boolean;
  /** Auto-inject childId from context when missing */
  requiresChildId: boolean;
  /** Auto-inject parentId from context when missing */
  requiresParentId: boolean;
  /** Auto-inject ageGroup from context when missing */
  requiresAgeGroup: boolean;
}

/** Activity types supported by the activity generator */
export const ACTIVITY_TYPES = [
  "quiz",
  "true_false",
  "fill_blank",
  "matching",
  "connection",
  "sequencing",
  "puzzle",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_SET: ReadonlySet<string> = new Set<string>(
  ACTIVITY_TYPES,
);

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && ACTIVITY_TYPE_SET.has(value);
}
