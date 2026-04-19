/**
 * BaseAgent — abstract base class implementing IAgent.
 *
 * Provides shared utilities for all concrete agent implementations:
 * - Tool definition filtering (allowed/disallowed)
 * - Tool argument normalization (inject childId, parentId, ageGroup)
 * - Tool execution context building
 *
 * Concrete agents extend this and implement execute() and executeStream().
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  IAgent,
  AgentDefinition,
  AgentContext,
  ExecutionResult,
  IToolRegistry,
  ILlmClient,
  StreamEvent,
  ToolExecutionContext,
} from "../core";

@Injectable()
export abstract class BaseAgent implements IAgent {
  protected readonly logger = new Logger(this.constructor.name);
  abstract readonly definition: AgentDefinition;

  constructor(
    protected readonly toolRegistry: IToolRegistry,
    protected readonly llmClient: ILlmClient,
  ) {}

  abstract execute(
    input: string,
    context: AgentContext,
  ): Promise<ExecutionResult>;
  abstract executeStream(
    input: string,
    context: AgentContext,
  ): AsyncGenerator<StreamEvent>;

  /** Build tool definitions filtered by agent's allowed/disallowed tools */
  protected getFilteredToolDefinitions() {
    const { allowedTools, disallowedTools } = this.definition;
    return this.toolRegistry.getToolDefinitions((tool) => {
      if (
        allowedTools &&
        allowedTools.length > 0 &&
        !allowedTools.includes(tool.metadata.name)
      )
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name))
        return false;
      return true;
    });
  }

  /** Normalize tool args — inject childId, parentId, ageGroup based on tool metadata */
  protected normalizeToolArgs(
    toolName: string,
    args: Record<string, any>,
    context: AgentContext,
  ): Record<string, any> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) return args;

    const normalized = { ...args };
    const meta = tool.metadata;

    if (
      meta.requiresChildId &&
      !normalized.childId &&
      context.childId != null
    ) {
      normalized.childId = context.childId;
    }
    if (
      meta.requiresParentId &&
      !normalized.parentId &&
      context.parentId != null
    ) {
      normalized.parentId = context.parentId;
    }
    if (
      meta.requiresAgeGroup &&
      !normalized.ageGroup &&
      context.ageGroup !== "parent"
    ) {
      normalized.ageGroup = context.ageGroup;
    }
    return normalized;
  }

  /** Build the ToolExecutionContext from AgentContext */
  protected buildToolExecutionContext(
    context: AgentContext,
  ): ToolExecutionContext {
    return {
      childId: context.childId,
      parentId: context.parentId,
      ageGroup: context.ageGroup,
      conversationId: context.conversationId,
      extra: context.metadata,
    };
  }
}
