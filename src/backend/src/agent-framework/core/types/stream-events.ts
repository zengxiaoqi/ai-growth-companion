/**
 * Stream events for the agent execution pipeline.
 * Uses discriminated union pattern — always check `type` before accessing fields.
 */

import type { ToolCallInfo } from "./tool-metadata";

// --- Event types ---

export interface TokenEvent {
  type: "token";
  content: string;
}

export interface DoneEvent {
  type: "done";
  sessionId: string;
  wasFiltered: boolean;
  suggestions?: string[];
  toolCalls: ToolCallInfo[];
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface ThinkingEvent {
  type: "thinking";
  thinkingContent: string;
}

export interface ToolStartEvent {
  type: "tool_start";
  toolName: string;
  toolArgs: Record<string, any>;
}

export interface ToolResultEvent {
  type: "tool_result";
  toolName: string;
  toolArgs: Record<string, any>;
  toolResult: string;
}

export interface GameDataEvent {
  type: "game_data";
  activityType: string;
  gameData: string;
  domain?: string;
}

/** Discriminated union of all stream events */
export type StreamEvent =
  | TokenEvent
  | DoneEvent
  | ErrorEvent
  | ThinkingEvent
  | ToolStartEvent
  | ToolResultEvent
  | GameDataEvent;
