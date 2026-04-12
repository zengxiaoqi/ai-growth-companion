/**
 * Typed error classes for the agent framework.
 * Each error type carries structured context for debugging.
 */

/** Base error for all agent-framework errors */
export class AgentFrameworkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AgentFrameworkError';
  }
}

/** Thrown when an agent exceeds its maximum loop iterations */
export class MaxIterationsError extends AgentFrameworkError {
  constructor(
    public readonly agentType: string,
    public readonly iterations: number,
  ) {
    super(`Agent ${agentType} exceeded max iterations (${iterations})`, 'MAX_ITERATIONS');
    this.name = 'MaxIterationsError';
  }
}

/** Thrown when a tool is not found in the registry */
export class ToolNotFoundError extends AgentFrameworkError {
  constructor(
    public readonly toolName: string,
  ) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

/** Thrown when a tool execution fails */
export class ToolExecutionError extends AgentFrameworkError {
  constructor(
    public readonly toolName: string,
    public readonly cause: unknown,
  ) {
    super(`Tool execution failed: ${toolName} — ${String(cause)}`, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}

/** Thrown when sub-agent depth exceeds the limit */
export class SubAgentDepthError extends AgentFrameworkError {
  constructor(
    public readonly depth: number,
    public readonly maxDepth: number,
  ) {
    super(`Sub-agent depth ${depth} exceeds max ${maxDepth}`, 'SUB_AGENT_DEPTH_EXCEEDED');
    this.name = 'SubAgentDepthError';
  }
}

/** Thrown when the LLM client is not configured */
export class LlmNotConfiguredError extends AgentFrameworkError {
  constructor() {
    super('LLM client is not configured', 'LLM_NOT_CONFIGURED');
    this.name = 'LlmNotConfiguredError';
  }
}

/** Thrown when an agent type is not found */
export class AgentNotFoundError extends AgentFrameworkError {
  constructor(
    public readonly agentType: string,
  ) {
    super(`Agent not found: ${agentType}`, 'AGENT_NOT_FOUND');
    this.name = 'AgentNotFoundError';
  }
}

/** Thrown when a skill is not found */
export class SkillNotFoundError extends AgentFrameworkError {
  constructor(
    public readonly skillId: string,
  ) {
    super(`Skill not found: ${skillId}`, 'SKILL_NOT_FOUND');
    this.name = 'SkillNotFoundError';
  }
}

/** Thrown when JSON extraction from LLM output fails */
export class JsonExtractionError extends AgentFrameworkError {
  constructor(
    public readonly rawLength: number,
  ) {
    super(`Failed to extract JSON from LLM output (${rawLength} chars)`, 'JSON_EXTRACTION_ERROR');
    this.name = 'JsonExtractionError';
  }
}
