/**
 * Agent interface — defines how agents are described and executed.
 *
 * An agent is a reasoning loop that:
 * 1. Receives a user message and context
 * 2. Selects and calls tools via the LLM function-calling loop
 * 3. Returns a final response (or streams events progressively)
 */

import type { AgeGroup } from '../types';
import type { StreamEvent } from '../types';
import type { ToolCallInfo } from '../types';

/** Describes an agent's static configuration */
export interface AgentDefinition {
  /** Unique agent type identifier (e.g. 'child-companion', 'parent-advisor') */
  type: string;
  /** Human-readable name */
  name: string;
  /** Description used for agent selection/routing */
  description: string;
  /** Build the system prompt for this agent given the current context */
  buildSystemPrompt: (context: AgentContext) => string;
  /** Whitelist of tool names this agent can use (empty = all registered) */
  allowedTools?: string[];
  /** Blacklist of tool names this agent cannot use */
  disallowedTools?: string[];
  /** Skills this agent can invoke */
  allowedSkills?: string[];
  /** LLM model override for this agent */
  model?: string;
  /** Maximum agent loop iterations (tool-call rounds) */
  maxIterations: number;
  /** Default age group when not specified */
  defaultAgeGroup?: AgeGroup;
  /** Whether this agent can spawn sub-agents */
  canSpawnSubAgents: boolean;
  /** Maximum sub-agent nesting depth */
  maxSubAgentDepth: number;
}

/** Message in the agent's conversation history */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
}

/** Full execution context passed to an agent */
export interface AgentContext {
  childId?: number;
  parentId?: number;
  childName?: string;
  parentName?: string;
  ageGroup: AgeGroup | 'parent';
  conversationId: string;
  /** Message history for this conversation */
  messages: AgentMessage[];
  /** Sub-agent nesting depth (0 = root agent) */
  depth: number;
  /** Cancellation signal */
  abortSignal?: AbortSignal;
  /** Arbitrary metadata */
  metadata: Record<string, any>;
}

/** Result of a completed agent execution */
export interface ExecutionResult {
  response: string;
  toolCalls: ToolCallInfo[];
  gameData?: unknown;
  tokenUsage?: { prompt: number; completion: number };
  wasFiltered?: boolean;
}

/** The agent interface — implemented by all agent types */
export interface IAgent {
  /** This agent's static definition */
  readonly definition: AgentDefinition;
  /** Execute synchronously, returning the full result */
  execute(input: string, context: AgentContext): Promise<ExecutionResult>;
  /** Execute with streaming, yielding events progressively */
  executeStream(input: string, context: AgentContext): AsyncGenerator<StreamEvent>;
}
