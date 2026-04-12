/**
 * SubAgentFactory — creates isolated sub-agent execution contexts.
 *
 * Manages sub-agent spawning with depth limits and fresh message history.
 * Each spawned agent gets its own conversation scope while inheriting
 * the parent's identity context (childId, parentId, ageGroup).
 */

import { Injectable, Logger } from '@nestjs/common';
import type { IAgent, AgentDefinition, AgentContext, AgentMessage } from '../core';
import { SubAgentDepthError } from '../core';
import type { IAgentRegistry } from '../core';

/** Maximum allowed sub-agent nesting depth across the entire system */
const SYSTEM_MAX_DEPTH = 4;

@Injectable()
export class SubAgentFactory {
  private readonly logger = new Logger(SubAgentFactory.name);

  constructor(private readonly agentRegistry: IAgentRegistry) {}

  /**
   * Spawn a sub-agent with an isolated execution context.
   *
   * The spawned agent:
   * - Inherits identity (childId, parentId, ageGroup) from parentContext
   * - Gets a fresh (empty) message history
   * - Receives a child AbortSignal linked to the parent's signal
   * - Has its depth incremented from the parent's depth
   *
   * @param definition - The agent definition to spawn
   * @param parentContext - The parent agent's execution context
   * @returns A new IAgent instance ready for execution
   * @throws SubAgentDepthError if depth exceeds limits
   */
  spawn(definition: AgentDefinition, parentContext: AgentContext): IAgent {
    const childDepth = parentContext.depth + 1;

    // Enforce system-wide max depth
    if (childDepth > SYSTEM_MAX_DEPTH) {
      throw new SubAgentDepthError(childDepth, SYSTEM_MAX_DEPTH);
    }

    // Enforce agent-specific max depth
    if (definition.maxSubAgentDepth > 0 && childDepth > definition.maxSubAgentDepth) {
      throw new SubAgentDepthError(childDepth, definition.maxSubAgentDepth);
    }

    // Check if agent type supports spawning
    if (!definition.canSpawnSubAgents && childDepth > 0) {
      throw new SubAgentDepthError(childDepth, 0);
    }

    // Look up the agent from registry
    const agent = this.agentRegistry.get(definition.type);
    if (!agent) {
      throw new Error(`Cannot spawn sub-agent: agent type "${definition.type}" not found in registry`);
    }

    this.logger.log(
      `Spawning sub-agent: ${definition.type} at depth ${childDepth} ` +
      `(parent: ${parentContext.conversationId})`,
    );

    return agent;
  }

  /**
   * Build a child AgentContext for the spawned sub-agent.
   *
   * Creates an isolated context with:
   * - Fresh empty message history
   * - Inherited identity fields
   * - New conversationId derived from parent
   * - Linked AbortSignal
   * - Incremented depth
   */
  buildChildContext(parentContext: AgentContext): AgentContext {
    const childDepth = parentContext.depth + 1;

    // Create a child abort controller linked to parent signal
    const childAbortController = new AbortController();

    if (parentContext.abortSignal) {
      parentContext.abortSignal.addEventListener('abort', () => {
        childAbortController.abort();
      });
    }

    return {
      childId: parentContext.childId,
      parentId: parentContext.parentId,
      childName: parentContext.childName,
      parentName: parentContext.parentName,
      ageGroup: parentContext.ageGroup,
      conversationId: `${parentContext.conversationId}-sub-${childDepth}`,
      messages: [] as AgentMessage[],
      depth: childDepth,
      abortSignal: childAbortController.signal,
      metadata: { ...parentContext.metadata, parentConversationId: parentContext.conversationId },
    };
  }

  /**
   * Build initial messages for a sub-agent from a parent's instruction.
   *
   * The sub-agent starts with the parent's instruction as its first user message.
   */
  buildInitialMessages(instruction: string): AgentMessage[] {
    return [
      {
        role: 'user',
        content: instruction,
      },
    ];
  }
}
