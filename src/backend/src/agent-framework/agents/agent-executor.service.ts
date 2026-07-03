/**
 * AgentExecutorService — the core agent execution loop.
 *
 * Extracted from modules/ai/agent/agent-executor.ts, but made fully generic:
 * - No dependency on ConversationManager (caller handles persistence)
 * - No dependency on ContentSafetyService (caller handles safety filtering)
 * - Works with any IAgent definition, ILlmClient, and IToolRegistry
 * - Accepts a plain messages array and returns ExecutionResult / yields StreamEvents
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  IToolRegistry,
  ILlmClient,
  LlmMessage,
  LlmToolDefinition,
  AgentContext,
  ExecutionResult,
  StreamEvent,
  ToolCallInfo,
} from '../core';
import { stripThinking, extractThinking, filterContent } from '../core';
import { isActivityType, type ActivityType } from '../core';
import { extractJsonObject } from '../core';

/** Fallback reply when max iterations are reached */
const MAX_ITERATIONS_FALLBACK = '我思考了很久，暂时想不出好的回答。换个问题试试吧~ 🌟';

@Injectable()
export class AgentExecutorService {
  private readonly logger = new Logger(AgentExecutorService.name);

  constructor(
    protected readonly toolRegistry: IToolRegistry,
    protected readonly llmClient: ILlmClient,
  ) {}

  /**
   * Run the agent tool-calling loop (non-streaming).
   *
   * @param systemPrompt - The system prompt for this agent
   * @param messages - Existing conversation messages (will be mutated in place)
   * @param toolDefinitions - Filtered tool definitions for this agent
   * @param maxIterations - Maximum tool-call rounds
   * @param context - Agent execution context for tool arg normalization
   * @param onToolCall - Optional callback invoked after each tool call (for persistence)
   * @returns ExecutionResult with final response and tool call log
   */
  async runLoop(
    systemPrompt: string,
    messages: LlmMessage[],
    toolDefinitions: LlmToolDefinition[] | undefined,
    maxIterations: number,
    context: AgentContext,
    onToolCall?: (event: {
      toolName: string;
      args: Record<string, any>;
      result: string;
    }) => Promise<void> | void,
    maxTokensOverride?: number,
  ): Promise<ExecutionResult> {
    const fullMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

    const toolCallLog: ToolCallInfo[] = [];
    let gameData: unknown = undefined;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.logger.log(`Agent iteration ${iteration + 1}/${maxIterations}`);

      // Check for cancellation
      if (context.abortSignal?.aborted) {
        this.logger.warn('Agent execution aborted');
        break;
      }

      const response = await this.llmClient.chatCompletion(
        fullMessages,
        toolDefinitions,
        maxTokensOverride,
      );

      // Check for tool calls from LlmResponse
      if (response.toolCalls && response.toolCalls.length > 0) {
        fullMessages.push({
          role: 'assistant',
          content: response.content || null,
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            // LLM returned malformed/truncated function arguments.
            // Try to salvage partial JSON before falling back to empty.
            const rawArgs = toolCall.function.arguments;
            const salvaged = this.trySalvageToolArgs(rawArgs);
            if (salvaged) {
              this.logger.warn(
                `Tool "${toolName}" had malformed JSON arguments (${rawArgs?.length || 0} chars), salvaged partial: ${Object.keys(salvaged).join(',')}`,
              );
              toolArgs = salvaged;
            } else {
              this.logger.warn(
                `Tool "${toolName}" JSON.parse failed (${rawArgs?.length || 0} chars), raw: ${(rawArgs || '').slice(0, 200)}`,
              );
              toolArgs = {};
            }
          }

          // Execute tool
          const toolExecContext = {
            childId: context.childId,
            parentId: context.parentId,
            ageGroup: context.ageGroup,
            conversationId: context.conversationId,
            extra: context.metadata,
          };
          const normalizedToolArgs = this.normalizeToolArgs(toolName, toolArgs, context);
          const result = await this.toolRegistry.execute(
            toolName,
            normalizedToolArgs,
            toolExecContext,
          );
          const resultString = JSON.stringify(result.data ?? { error: result.error });

          // Add tool result to messages
          fullMessages.push({
            role: 'tool',
            content: resultString,
            toolCallId: toolCall.id,
          });

          toolCallLog.push({
            tool: toolName,
            args: normalizedToolArgs,
            resultSummary: resultString.slice(0, 100),
          });

          // Extract game data from generateActivity tool calls
          if (toolName === 'generateActivity') {
            const resultPayload = extractJsonObject(resultString);
            const activityType = this.resolveGenerateActivityType(
              normalizedToolArgs,
              resultPayload,
            );
            if (activityType && !this.isToolErrorPayload(resultPayload)) {
              gameData = {
                activityType,
                gameData: resultString,
                domain: normalizedToolArgs.domain || 'language',
              };
            }
          }

          // Notify caller (for conversation persistence, etc.)
          if (onToolCall) {
            await onToolCall({
              toolName,
              args: normalizedToolArgs,
              result: resultString,
            });
          }
        }

        continue; // next iteration
      }

      // --- Final answer (no tool calls) ---
      if (!response.content) break;
      let finalReply = stripThinking(response.content);

      // Safety filter
      const safeResult = filterContent(finalReply);
      finalReply = safeResult.content;

      return {
        response: finalReply,
        toolCalls: toolCallLog,
        wasFiltered: safeResult.wasFiltered,
        gameData,
        tokenUsage: response.usage
          ? {
              prompt: response.usage.promptTokens,
              completion: response.usage.completionTokens,
            }
          : undefined,
      };
    }

    // Max iterations reached
    return {
      response: MAX_ITERATIONS_FALLBACK,
      toolCalls: toolCallLog,
    };
  }

  /**
   * Run the agent tool-calling loop with streaming.
   *
   * Tool-call rounds use non-streaming calls; the final text response is emitted
   * as a single token event (the LLM returns the full text in the non-streaming call).
   *
   * @param systemPrompt - The system prompt for this agent
   * @param messages - Existing conversation messages (will be mutated in place)
   * @param toolDefinitions - Filtered tool definitions for this agent
   * @param maxIterations - Maximum tool-call rounds
   * @param context - Agent execution context
   * @param onToolCall - Optional callback for persistence
   * @yields StreamEvent
   */
  async *runLoopStream(
    systemPrompt: string,
    messages: LlmMessage[],
    toolDefinitions: LlmToolDefinition[] | undefined,
    maxIterations: number,
    context: AgentContext,
    onToolCall?: (event: {
      toolName: string;
      args: Record<string, any>;
      result: string;
    }) => Promise<void> | void,
  ): AsyncGenerator<StreamEvent> {
    const fullMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

    const toolCallLog: ToolCallInfo[] = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.logger.log(`[STREAM] Agent iteration ${iteration + 1}/${maxIterations}`);

      if (context.abortSignal?.aborted) {
        yield { type: 'error', message: 'Agent execution aborted' };
        return;
      }

      const response = await this.llmClient.chatCompletion(fullMessages, toolDefinitions);
      const assistantContent = response.content;
      const assistantToolCalls = response.toolCalls;
      if (!assistantContent && (!assistantToolCalls || assistantToolCalls.length === 0)) break;

      // --- Tool calls ---
      if (assistantToolCalls && assistantToolCalls.length > 0) {
        // Emit thinking content if present (before tool calls)
        const thinkingContent = extractThinking(assistantContent || '');
        if (thinkingContent) {
          yield { type: 'thinking', thinkingContent };
        }

        fullMessages.push({
          role: 'assistant',
          content: assistantContent || null,
          toolCalls: assistantToolCalls,
        });

        for (const toolCall of assistantToolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            const rawArgs = toolCall.function.arguments;
            const salvaged = this.trySalvageToolArgs(rawArgs);
            if (salvaged) {
              this.logger.warn(
                `Tool "${toolName}" had malformed JSON arguments (${rawArgs?.length || 0} chars), salvaged partial: ${Object.keys(salvaged).join(',')}`,
              );
              toolArgs = salvaged;
            } else {
              this.logger.warn(
                `Tool "${toolName}" JSON.parse failed (${rawArgs?.length || 0} chars), raw: ${(rawArgs || '').slice(0, 200)}`,
              );
              toolArgs = {};
            }
          }

          // Execute tool
          const toolExecContext = {
            childId: context.childId,
            parentId: context.parentId,
            ageGroup: context.ageGroup,
            conversationId: context.conversationId,
            extra: context.metadata,
          };

          const normalizedToolArgs = this.normalizeToolArgs(toolName, toolArgs, context);
          yield { type: 'tool_start', toolName, toolArgs: normalizedToolArgs };
          const result = await this.toolRegistry.execute(
            toolName,
            normalizedToolArgs,
            toolExecContext,
          );
          const resultString = JSON.stringify(result.data ?? { error: result.error });
          yield {
            type: 'tool_result',
            toolName,
            toolArgs: normalizedToolArgs,
            toolResult: resultString,
          };

          // Emit game_data for generateActivity tool
          if (toolName === 'generateActivity') {
            const resultPayload = extractJsonObject(resultString);
            const activityType = this.resolveGenerateActivityType(
              normalizedToolArgs,
              resultPayload,
            );
            if (activityType && !this.isToolErrorPayload(resultPayload)) {
              yield {
                type: 'game_data',
                activityType,
                gameData: resultString,
                domain: normalizedToolArgs.domain || 'language',
              };
            } else {
              this.logger.warn('[STREAM] Skip invalid game_data payload for generateActivity');
            }
          }

          fullMessages.push({
            role: 'tool',
            content: resultString,
            toolCallId: toolCall.id,
          });

          toolCallLog.push({
            tool: toolName,
            args: normalizedToolArgs,
            resultSummary: resultString.slice(0, 100),
          });

          if (onToolCall) {
            await onToolCall({
              toolName,
              args: normalizedToolArgs,
              result: resultString,
            });
          }
        }

        continue; // next iteration
      }

      // --- Final response (streaming with thinking-block-aware state machine) ---
      this.logger.log('[STREAM] Starting streaming final response');

      // Accumulate streamed text so we can detect <think> boundaries across chunks.
      // Buffer tracks the portion of the stream not yet classified into events.
      // inThinkBlock: true means the buffer holds content between <think...> and </think>.
      let streamedText = '';
      let buffer = '';
      let inThinkBlock = false;

      for await (const chunk of this.llmClient.chatCompletionStream(fullMessages, undefined)) {
        if (!chunk) continue;
        streamedText += chunk;
        buffer += chunk;

        if (!inThinkBlock) {
          // Not in a thinking block — look for <think... opening tag
          if (/<think\b/.test(buffer)) {
            // Emit any preceding text as a token event
            const splitIdx = buffer.indexOf('<think');
            if (splitIdx > 0) {
              yield { type: 'token', content: buffer.slice(0, splitIdx) };
            }
            // Everything from '<think' onward is thinking content
            inThinkBlock = true;
            // Do NOT clear buffer — extractThinking below will grab it
          } else if (this.hasPartialThinkPrefix(buffer)) {
            // Buffer might end with a partial '<think' prefix — hold it back
            const safeEnd = buffer.length - this.partialThinkPrefixLength(buffer);
            if (safeEnd > 0) {
              yield { type: 'token', content: buffer.slice(0, safeEnd) };
              buffer = buffer.slice(safeEnd);
            }
          } else {
            // No thinking tag detected — emit buffer as token and clear
            yield { type: 'token', content: buffer };
            buffer = '';
          }
        } else {
          // Inside a thinking block — look for </think... closing tag
          if (/<\/think/i.test(buffer)) {
            // Flush thinking content as a thinking event
            const thinkingContent = extractThinking(buffer);
            if (thinkingContent) {
              yield { type: 'thinking', thinkingContent };
            }
            // Exit thinking mode; remaining text after closing tag becomes new token
            const closeMatch = buffer.match(/<\/think[^>]*>/i);
            if (closeMatch) {
              const closeEnd = buffer.indexOf(closeMatch[0]) + closeMatch[0].length;
              buffer = buffer.slice(closeEnd);
            } else {
              buffer = '';
            }
            inThinkBlock = false;
            // Emit any text that came after the closing tag
            if (buffer) {
              // Check if buffer starts a new think block
              if (/<think\b/.test(buffer)) {
                // leave inThinkBlock = false, let next iteration handle it
              } else {
                yield { type: 'token', content: buffer };
                buffer = '';
              }
            }
          }
          // else: no closing tag yet — continue accumulating
        }
      }

      // Flush any remaining buffered content after stream ends
      if (buffer) {
        if (inThinkBlock) {
          // Unclosed think block — treat remaining buffer as regular text
          const residual = stripThinking(buffer);
          if (residual) {
            yield { type: 'token', content: residual };
          }
        } else {
          yield { type: 'token', content: buffer };
        }
      }

      // Safety filter
      this.logger.log(`[STREAM] Streaming complete, streamedText length=${streamedText.length}`);
      const safeResult = filterContent(streamedText);

      yield {
        type: 'done',
        sessionId: context.conversationId,
        wasFiltered: safeResult.wasFiltered,
        toolCalls: toolCallLog,
      };
      return;
    }

    // Max iterations reached — fallback
    yield { type: 'token', content: MAX_ITERATIONS_FALLBACK };
    yield {
      type: 'done',
      sessionId: context.conversationId,
      wasFiltered: false,
      toolCalls: toolCallLog,
    };
  }

  // --- Private helpers ---

  /** Check if buffer ends with a partial `<think` prefix (e.g. `<`, `<t`, `<thi`) */
  private hasPartialThinkPrefix(buffer: string): boolean {
    return this.partialThinkPrefixLength(buffer) > 0;
  }

  /** Returns the length of a partial `<think` prefix at the end of buffer, or 0 */
  private partialThinkPrefixLength(buffer: string): number {
    const tag = '<think';
    for (let i = Math.min(buffer.length, tag.length); i >= 1; i--) {
      if (buffer.endsWith(tag.slice(0, i))) {
        return i;
      }
    }
    return 0;
  }

  private resolveGenerateActivityType(
    toolArgs: Record<string, any>,
    resultPayload: Record<string, any> | null,
  ): ActivityType | undefined {
    if (this.isToolErrorPayload(resultPayload)) return undefined;

    const fromResult = this.inferActivityType(resultPayload);
    if (fromResult) return fromResult;

    const fromArgs = this.inferActivityType(toolArgs);
    if (fromArgs) return fromArgs;

    return undefined;
  }

  private isToolErrorPayload(payload: Record<string, any> | null): boolean {
    return Boolean(payload && typeof payload.error === 'string' && payload.error.trim());
  }

  private inferActivityType(payload: unknown): ActivityType | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const value = payload as Record<string, any>;

    if (isActivityType(value.type)) return value.type;
    if (isActivityType(value.activityType)) return value.activityType;

    // Infer from known structural keys
    const ACTIVITY_STRUCTURAL_KEYS: Record<string, string[]> = {
      quiz: ['questions'],
      true_false: ['statements'],
      fill_blank: ['sentences'],
      matching: ['pairs'],
      connection: ['connections', 'leftItems'],
      sequencing: ['items'],
      puzzle: ['pieces'],
    };

    for (const [type, keys] of Object.entries(ACTIVITY_STRUCTURAL_KEYS)) {
      if (keys.some((key) => Array.isArray(value[key]))) {
        if (isActivityType(type)) return type;
      }
    }

    return undefined;
  }

  private normalizeToolArgs(
    toolName: string,
    args: Record<string, any>,
    context: AgentContext,
  ): Record<string, any> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) return { ...args };

    const normalized = { ...args };
    const meta = tool.metadata;

    // Enforce runtime identity context to reduce wrong-id tool calls from model output.
    if (meta.requiresChildId && context.childId != null) {
      normalized.childId = context.childId;
    }
    if (meta.requiresParentId && context.parentId != null) {
      normalized.parentId = context.parentId;
    }
    if (meta.requiresAgeGroup && context.ageGroup !== 'parent') {
      normalized.ageGroup = context.ageGroup;
    }

    return normalized;
  }

  /**
   * Attempt to salvage a partial JSON object from truncated/malformed LLM
   * function-call arguments. DeepSeek and similar models sometimes truncate
   * large arguments (e.g. writeFile with a full TSX component) at max_tokens,
   * producing invalid JSON like {"path":"GeneratedLesson.tsx","content":"import R
   *
   * Strategy: find the first '{', then try progressive brace-matching to
   * recover whatever key-value pairs are complete.
   */
  private trySalvageToolArgs(raw: unknown): Record<string, any> | null {
    if (!raw || typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;

    // Try parsing as-is first (maybe just had whitespace issues)
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* continue */
    }

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    const sliced = text.slice(firstBrace);

    // Progressive salvage attempts — close open structures and try parsing
    const attempts = [
      () => sliced + '}',
      () => sliced.replace(/,\s*$/, '') + '}',
      () => sliced.replace(/"[^"]*$/, '"') + '}',
      () => sliced.replace(/,\s*"[^"]*$/, '') + '}',
      () => sliced.replace(/,\s*"[^"]*":\s*"[^"]*$/, '') + '}',
      () => sliced.replace(/,\s*\{[^}]*$/, '') + '}',
      () => sliced.replace(/,\s*\[[^\]]*$/, '') + '}',
    ];

    for (const attempt of attempts) {
      try {
        const candidate = attempt();
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch {
        /* continue */
      }
    }

    return null;
  }
}
