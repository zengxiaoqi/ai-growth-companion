/**
 * OrchestratorService — the top-level agent orchestrator.
 *
 * Responsibilities:
 * - Route incoming requests to the appropriate agent
 * - Manage conversation persistence (save user/assistant messages)
 * - Apply content safety filtering
 * - Coordinate between agent registry, executor, and conversation storage
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  IAgentRegistry,
  AgentContext,
  ExecutionResult,
  StreamEvent,
  LlmMessage,
  LlmToolDefinition,
} from '../core';
import { filterContent } from '../core';
import { AgentExecutorService } from './agent-executor.service';
import { SkillRegistryService } from '../skills/skill-registry.service';
import { SkillExecutor } from '../skills/skill-executor';

/** Interface for conversation persistence — implemented externally */
export interface IConversationStore {
  /** Save a message to the conversation */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    meta?: Record<string, any>,
  ): Promise<void>;

  /** Build the LLM message array for a conversation */
  buildMessageArray(sessionId: string): Promise<LlmMessage[]>;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly agentRegistry: IAgentRegistry,
    private readonly executorService: AgentExecutorService,
    private readonly conversationStore: IConversationStore,
    private readonly skillRegistry: SkillRegistryService,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  /**
   * Route a user input to the appropriate agent and execute synchronously.
   *
   * Steps:
   * 1. Select agent based on input + context
   * 2. Persist user message
   * 3. Build system prompt and load history
   * 4. Run the agent execution loop
   * 5. Persist assistant response
   * 6. Return result
   */
  async route(input: string, context: AgentContext): Promise<ExecutionResult> {
    // 1. Select agent
    const agent = this.agentRegistry.select(input, context);
    this.logger.log(`Routed to agent: ${agent.definition.type}`);

    // 2. Persist user message
    await this.conversationStore.addMessage(context.conversationId, 'user', input);

    // 3. Build system prompt and load history
    let systemPrompt = agent.definition.buildSystemPrompt(context);
    systemPrompt = this.injectSkills(systemPrompt, agent.definition.allowedSkills);
    const history = await this.conversationStore.buildMessageArray(context.conversationId);

    // 4. Get filtered tool definitions
    const { allowedTools, disallowedTools } = agent.definition;
    const toolDefinitions = this.executorService['toolRegistry'].getToolDefinitions(tool => {
      if (allowedTools && allowedTools.length > 0 && !allowedTools.includes(tool.metadata.name))
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name)) return false;
      return true;
    }) as LlmToolDefinition[] | undefined;

    // 5. Run execution loop with persistence callback
    const result = await this.executorService.runLoop(
      systemPrompt,
      history,
      toolDefinitions,
      agent.definition.maxIterations,
      context,
      async (event) => {
        await this.conversationStore.addMessage(
          context.conversationId,
          'tool',
          event.result,
          { toolName: event.toolName },
        );
      },
    );

    // 6. Persist assistant response
    await this.conversationStore.addMessage(
      context.conversationId,
      'assistant',
      result.response,
    );

    return result;
  }

  /**
   * Route a user input with streaming execution.
   *
   * Same routing logic as route(), but yields StreamEvents progressively.
   * Conversation persistence happens during the stream via callbacks.
   */
  async *routeStream(input: string, context: AgentContext): AsyncGenerator<StreamEvent> {
    // 1. Select agent
    const agent = this.agentRegistry.select(input, context);
    this.logger.log(`[STREAM] Routed to agent: ${agent.definition.type}`);

    // 2. Persist user message
    await this.conversationStore.addMessage(context.conversationId, 'user', input);

    // 3. Build system prompt and load history
    let systemPrompt = agent.definition.buildSystemPrompt(context);
    systemPrompt = this.injectSkills(systemPrompt, agent.definition.allowedSkills);
    const history = await this.conversationStore.buildMessageArray(context.conversationId);

    // 4. Get filtered tool definitions
    const { allowedTools, disallowedTools } = agent.definition;
    const toolDefinitions = this.executorService['toolRegistry'].getToolDefinitions(tool => {
      if (allowedTools && allowedTools.length > 0 && !allowedTools.includes(tool.metadata.name))
        return false;
      if (disallowedTools && disallowedTools.includes(tool.metadata.name)) return false;
      return true;
    }) as LlmToolDefinition[] | undefined;

    // 5. Run streaming loop with persistence callback
    let finalContent = '';
    const stream = this.executorService.runLoopStream(
      systemPrompt,
      history,
      toolDefinitions,
      agent.definition.maxIterations,
      context,
      async (event) => {
        await this.conversationStore.addMessage(
          context.conversationId,
          'tool',
          event.result,
          { toolName: event.toolName },
        );
      },
    );

    for await (const event of stream) {
      // Capture final content for persistence
      if (event.type === 'token') {
        finalContent = event.content;
      }

      yield event;

      // Persist assistant response on done
      if (event.type === 'done') {
        const safeResult = filterContent(finalContent);
        await this.conversationStore.addMessage(
          context.conversationId,
          'assistant',
          safeResult.content,
        );
      }
    }
  }

  /**
   * Inject skill content into the system prompt for agents with allowedSkills.
   */
  private injectSkills(systemPrompt: string, allowedSkills?: string[]): string {
    if (!allowedSkills || allowedSkills.length === 0) return systemPrompt;

    const skills = this.skillRegistry.getSkillsForAgent(allowedSkills);
    if (skills.length === 0) return systemPrompt;

    const skillParts = skills.map(skill =>
      this.skillExecutor.renderSkillForPrompt(skill.definition),
    );

    this.logger.debug(`Injecting ${skills.length} skills: ${skills.map(s => s.definition.id).join(', ')}`);
    return `${systemPrompt}\n\n---\n\n# Active Skills\n\n${skillParts.join('\n\n')}`;
  }
}
