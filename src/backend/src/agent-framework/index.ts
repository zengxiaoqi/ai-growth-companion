/**
 * Agent Framework — public API.
 *
 * This is the main entry point for the agent framework.
 * Import AgentFrameworkModule in your NestJS app module to use it.
 */

// Root module
export { AgentFrameworkModule } from "./agent-framework.module";

// Core interfaces
export type { ITool } from "./core/interfaces/tool.interface";

export type {
  ToolResult,
  ToolExecutionContext,
} from "./core/types/tool-metadata";

export type {
  IAgent,
  AgentDefinition,
  AgentContext,
  AgentMessage,
  ExecutionResult,
} from "./core/interfaces/agent.interface";

export type {
  ISkill,
  SkillDefinition,
  SkillVariable,
  SkillRule,
  SkillExecutionContext,
} from "./core/interfaces/skill.interface";

export type {
  IToolRegistry,
  IAgentRegistry,
  ISkillRegistry,
} from "./core/interfaces/registry.interface";

export type {
  IPromptProvider,
  PromptContext,
} from "./core/interfaces/prompt.interface";

export type {
  ILlmClient,
  LlmMessage,
  LlmResponse,
  LlmToolDefinition,
  LlmConfig,
} from "./core/interfaces/llm.interface";

export type { IAgentExecutor } from "./core/interfaces/executor.interface";

// Core types
export type { AgeGroup, AgeGroupOrParent } from "./core/types/age-group";

export type {
  StreamEvent,
  TokenEvent,
  DoneEvent,
  ErrorEvent,
  ThinkingEvent,
  ToolStartEvent,
  ToolResultEvent,
  GameDataEvent,
} from "./core/types/stream-events";

export type {
  ToolMetadata,
  ToolCallInfo,
  ActivityType,
} from "./core/types/tool-metadata";

export { classifyAge, ageGroupLabel } from "./core/types/age-group";

export { ACTIVITY_TYPES, isActivityType } from "./core/types/tool-metadata";

// Core utilities
export {
  extractJsonObject,
  extractJsonArray,
  containsJson,
} from "./core/utils/json-extraction";

export {
  stripThinking,
  extractThinking,
  hasThinkingBlock,
} from "./core/utils/thinking-parser";

export {
  filterContent,
  filterProhibitedWords,
  redactPii,
  isContentSafe,
} from "./core/utils/content-safety";

export type { SafetyFilterResult } from "./core/utils/content-safety";

// Core errors
export {
  AgentFrameworkError,
  MaxIterationsError,
  ToolNotFoundError,
  ToolExecutionError,
  SubAgentDepthError,
  LlmNotConfiguredError,
  AgentNotFoundError,
  SkillNotFoundError,
  JsonExtractionError,
} from "./core/errors/agent-errors";

// Tool system
export { BaseTool } from "./tools/base-tool";
export { buildTool } from "./tools/tool-builder";
export {
  RegisterTool,
  isToolRegistered,
} from "./tools/decorators/register-tool";
export { ToolMeta, getToolMeta } from "./tools/decorators/tool-metadata";
export { ToolRegistryService } from "./tools/tool-registry.service";

// Agent system
export { AgentExecutorService } from "./agents/agent-executor.service";
export { AgentRegistryService } from "./agents/agent-registry.service";
export { OrchestratorService } from "./agents/orchestrator.service";
export { SubAgentFactory } from "./agents/sub-agent-factory";

// Agent definitions
export { childCompanionDefinition } from "./agents/definitions/child-companion.agent";
export { parentAdvisorDefinition } from "./agents/definitions/parent-advisor.agent";
export { courseDesignerDefinition } from "./agents/definitions/course-designer.agent";
export { activityGeneratorDefinition } from "./agents/definitions/activity-generator.agent";

// Skill system
export { SkillRegistryService } from "./skills/skill-registry.service";
export { SkillExecutor } from "./skills/skill-executor";
export { loadSkillsFromDirectory } from "./skills/markdown-skill-loader";

// Prompt system
export { PromptProviderService } from "./prompts/prompt-provider.service";

// Conversation
export { ConversationService } from "./conversation/conversation.service";
export { MessageBuilderService } from "./conversation/message-builder.service";
export { SessionCache } from "./conversation/session-cache";
export type { ActiveSession } from "./conversation/conversation.service";

// LLM
export { LlmClientService } from "./llm/llm-client.service";
export { RetryStrategy } from "./llm/retry.strategy";

// Safety
export { ContentSafetyService } from "./safety/content-safety.service";
