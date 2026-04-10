import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../llm/llm-client';
import { ToolRegistry } from './tool-registry';
import { ConversationManager } from '../conversation/conversation-manager';
import { ContentSafetyService } from '../../../common/services/content-safety.service';
import { systemPrompt34, systemPrompt56, systemPromptParent } from './prompts/system-prompts';
import type { ChatCompletionMessageParam, ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions';
import type { ToolCallInfo, AgeGroup } from '../ai.types';

function isFunctionToolCall(tc: any): tc is ChatCompletionMessageFunctionToolCall {
  return tc && tc.type === 'function' && tc.function;
}

const MAX_TOOL_ITERATIONS = 8;
const CHILD_ID_TOOLS = new Set([
  'getUserProfile',
  'getAbilities',
  'getLearningHistory',
  'getRecommendations',
  'recordLearning',
  'getParentControl',
  'viewReport',
  'viewAbilities',
  'listAssignments',
]);
const PARENT_ID_TOOLS = new Set([
  'listChildren',
  'assignActivity',
  'updateParentControl',
]);
const NEEDS_AGE_GROUP_TOOLS = new Set([
  'generateQuiz',
  'generateActivity',
  'assignActivity',
  'generateCoursePack',
]);
const SUPPORTED_ACTIVITY_TYPES = ['quiz', 'true_false', 'fill_blank', 'matching', 'connection', 'sequencing', 'puzzle'] as const;
type SupportedActivityType = (typeof SUPPORTED_ACTIVITY_TYPES)[number];
const SUPPORTED_ACTIVITY_TYPE_SET = new Set<string>(SUPPORTED_ACTIVITY_TYPES);

const THINK_CLOSE_TAG = '</think' + '>';

/** Strip <think...</think-> reasoning blocks from model output.
 *  Handles thinking blocks anywhere in the string, not just at the start.
 */
function stripThinking(text: string): string {
  if (!text) return '';
  // Remove all <think...>...</think-> blocks (with or without attributes)
  let result = text.replace(/<think[^>]*>[\s\S]*?<\/think\s*>/g, '').trim();
  // Also handle unclosed <think at end of string
  result = result.replace(/<think[^>]*>[\s\S]*$/g, '').trim();
  return result;
}

/** Extract the content inside <think...</think-> blocks */
function extractThinking(text: string): string {
  if (!text) return '';
  const match = text.match(/<think[^>]*>([\s\S]*?)<\/think\s*>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  // Handle unclosed <think
  const unclosed = text.match(/<think[^>]*>([\s\S]*)$/);
  if (unclosed && unclosed[1]) {
    return unclosed[1].trim();
  }
  return '';
}

function isSupportedActivityType(value: unknown): value is SupportedActivityType {
  return typeof value === 'string' && SUPPORTED_ACTIVITY_TYPE_SET.has(value);
}

function safeParseJsonObject(text: string): Record<string, any> | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {}

  const codeBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {}
  }

  return null;
}

@Injectable()
export class AgentExecutor {
  private readonly logger = new Logger(AgentExecutor.name);

  constructor(
    private readonly llmClient: LlmClient,
    private readonly toolRegistry: ToolRegistry,
    private readonly conversationManager: ConversationManager,
    private readonly contentSafetyService: ContentSafetyService,
  ) {}

  /** Classify a numeric age into an age group */
  classifyAge(age: number | undefined | null): AgeGroup {
    if (age == null) return 'unknown';
    if (age >= 3 && age <= 4) return '3-4';
    if (age >= 5 && age <= 6) return '5-6';
    return 'unknown';
  }

  /** Build system prompt based on age group */
  buildSystemPrompt(
    ageGroup: AgeGroup | 'parent',
    childName: string,
    executionContext?: { childId?: number; parentId?: number },
  ): string {
    const contextHints = [
      '## Runtime Context',
      executionContext?.childId != null ? `- Current childId: ${executionContext.childId}` : '',
      executionContext?.parentId != null ? `- Current parentId: ${executionContext.parentId}` : '',
      '- IMPORTANT: Use these IDs directly when calling tools. Never guess IDs.',
      '- If childId is already known, do not call listChildren only to discover childId.',
      '- If parent asks for one-shot complete lesson generation (listen/speak/read/write + game + video), call generateCoursePack.',
    ].filter(Boolean).join('\n');

    if (ageGroup === 'parent') return `${systemPromptParent(childName)}\n\n${contextHints}`;
    if (ageGroup === '3-4') return `${systemPrompt34(childName)}\n\n${contextHints}`;
    if (ageGroup === '5-6') return `${systemPrompt56(childName)}\n\n${contextHints}`;
    return `${systemPrompt56(childName)}\n\n${contextHints}`; // default to 5-6 style
  }

  /**
   * Execute the agent loop: send message to LLM, handle tool calls, return final answer.
   */
  async execute(
    sessionId: string,
    userMessage: string,
    ageGroup: AgeGroup | 'parent',
    childName: string,
    executionContext?: { childId?: number; parentId?: number },
  ): Promise<{ reply: string; toolCalls: ToolCallInfo[] }> {
    // Save user message
    await this.conversationManager.addMessage(sessionId, 'user', userMessage);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(ageGroup, childName, executionContext);

    // Load conversation history
    const history = await this.conversationManager.buildMessageArray(sessionId);

    // Build full message array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    const tools = this.toolRegistry.getToolDefinitions();
    const toolCallLog: ToolCallInfo[] = [];

    // Agent loop
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      this.logger.log(`Agent iteration ${iteration + 1}`);

      const response = await this.llmClient.chatCompletion(messages, tools);
      const choice = response.choices[0];
      if (!choice?.message) {
        break;
      }

      const assistantMessage = choice.message;

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push({
          role: 'assistant',
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls,
        } as ChatCompletionMessageParam);

        // Save to DB
        await this.conversationManager.addMessage(sessionId, 'assistant', stripThinking(assistantMessage.content || ''), {
          toolCalls: assistantMessage.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          if (!isFunctionToolCall(toolCall)) continue;
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          const normalizedToolArgs = this.normalizeToolArgs(toolName, toolArgs, ageGroup, executionContext);
          const result = await this.toolRegistry.execute(toolName, normalizedToolArgs);

          // Add tool result to messages
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          } as ChatCompletionMessageParam);

          // Save to DB
          await this.conversationManager.addMessage(sessionId, 'tool', result, {
            toolCallId: toolCall.id,
            toolName,
          });

          toolCallLog.push({
            tool: toolName,
            args: normalizedToolArgs,
            resultSummary: result.slice(0, 100),
          });
        }

        // Continue loop for next iteration
        continue;
      }

      // No tool calls — this is the final answer
      let finalReply = stripThinking(assistantMessage.content || '');

      // Safety filter
      const safeResult = this.contentSafetyService.filterContent(finalReply);
      finalReply = safeResult.content;

      // Save assistant response
      await this.conversationManager.addMessage(sessionId, 'assistant', finalReply);

      return { reply: finalReply, toolCalls: toolCallLog };
    }

    // Max iterations reached — return what we have
    const fallback = '我思考了很久，暂时想不出好的回答。换个问题试试吧~ 🌟';
    await this.conversationManager.addMessage(sessionId, 'assistant', fallback);
    return { reply: fallback, toolCalls: toolCallLog };
  }

  /**
   * Streaming version of execute.
   * Tool-call rounds use non-streaming; only the final text response streams.
   */
  async *executeStream(
    sessionId: string,
    userMessage: string,
    ageGroup: AgeGroup | 'parent',
    childName: string,
    executionContext?: { childId?: number; parentId?: number },
  ): AsyncGenerator<{
    type: 'thinking' | 'token' | 'done' | 'tool_start' | 'tool_result' | 'error' | 'game_data';
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    toolResult?: string;
    thinkingContent?: string;
    toolCalls?: ToolCallInfo[];
    sessionId?: string;
    wasFiltered?: boolean;
  }> {
    // Save user message
    await this.conversationManager.addMessage(sessionId, 'user', userMessage);

    const systemPrompt = this.buildSystemPrompt(ageGroup, childName, executionContext);
    const history = await this.conversationManager.buildMessageArray(sessionId);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];
    const tools = this.toolRegistry.getToolDefinitions();
    const toolCallLog: ToolCallInfo[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.llmClient.chatCompletion(messages, tools);
      const choice = response.choices[0];
      if (!choice?.message) break;

      const assistantMessage = choice.message;

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Emit thinking content if present (before tool calls)
        const thinkingContent = extractThinking(assistantMessage.content || '');
        if (thinkingContent) {
          yield { type: 'thinking', thinkingContent };
        }

        // Handle tool calls (non-streaming)
        messages.push({
          role: 'assistant',
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls,
        } as ChatCompletionMessageParam);

        await this.conversationManager.addMessage(sessionId, 'assistant', stripThinking(assistantMessage.content || ''), {
          toolCalls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
          if (!isFunctionToolCall(toolCall)) continue;
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          const normalizedToolArgs = this.normalizeToolArgs(toolName, toolArgs, ageGroup, executionContext);
          yield { type: 'tool_start', content: toolName, toolName, toolArgs: normalizedToolArgs };
          const result = await this.toolRegistry.execute(toolName, normalizedToolArgs);
          yield { type: 'tool_result', content: toolName, toolName, toolArgs: normalizedToolArgs, toolResult: result };

          // If this was generateActivity, emit game_data for frontend rendering
          if (toolName === 'generateActivity') {
            const resultPayload = safeParseJsonObject(result);
            const activityType = this.resolveGenerateActivityType(normalizedToolArgs, resultPayload);
            if (activityType && !this.isToolErrorPayload(resultPayload)) {
              yield {
                type: 'game_data',
                activityType,
                gameData: result,
                domain: normalizedToolArgs.domain || 'language',
              } as any;
            } else {
              this.logger.warn(`[STREAM] Skip invalid game_data payload for generateActivity`);
            }
          }

          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          } as ChatCompletionMessageParam);

          await this.conversationManager.addMessage(sessionId, 'tool', result, {
            toolCallId: toolCall.id,
            toolName,
          });

          toolCallLog.push({ tool: toolName, args: normalizedToolArgs, resultSummary: result.slice(0, 100) });
        }
        continue;
      }

      // Final response — the LLM already gave us the text in the non-streaming call
      // (tool-call rounds use non-streaming chatCompletion, so the final answer is in assistantMessage)
      // Emit thinking content if present
      const finalThinking = extractThinking(assistantMessage.content || '');
      if (finalThinking) {
        yield { type: 'thinking', thinkingContent: finalThinking };
      }

      let cleanContent = stripThinking(assistantMessage.content || '');

      // If the non-streaming response was only thinking (no visible content), make one more call without tools
      if (!cleanContent) {
        this.logger.log(`[STREAM] Non-streaming response was empty, making follow-up call without tools`);
        try {
          const followUp = await this.llmClient.chatCompletion(messages, undefined);
          cleanContent = stripThinking(followUp.choices[0]?.message?.content || '');
        } catch (err: any) {
          this.logger.warn(`[STREAM] Follow-up call failed: ${err.message}`);
        }
      }

      this.logger.log(`[STREAM] cleanContent length=${cleanContent.length}`);

      // Emit the cleaned content
      if (cleanContent) {
        yield { type: 'token', content: cleanContent };
      }

      // Safety filter
      const safeResult = this.contentSafetyService.filterContent(cleanContent);

      await this.conversationManager.addMessage(sessionId, 'assistant', safeResult.content);

      yield {
        type: 'done',
        sessionId,
        wasFiltered: safeResult.wasFiltered,
        toolCalls: toolCallLog,
      };
      return;
    }

    // Fallback
    yield { type: 'token', content: '我思考了很久，暂时想不出好的回答。换个问题试试吧~ 🌟' };
    yield { type: 'done', sessionId, toolCalls: toolCallLog };
  }

  private resolveGenerateActivityType(
    toolArgs: Record<string, any>,
    resultPayload: Record<string, any> | null,
  ): SupportedActivityType | undefined {
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

  private inferActivityType(payload: unknown): SupportedActivityType | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const value = payload as Record<string, any>;

    if (isSupportedActivityType(value.type)) return value.type;
    if (isSupportedActivityType(value.activityType)) return value.activityType;

    for (const key of SUPPORTED_ACTIVITY_TYPES) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return key;
    }

    if (Array.isArray(value.questions)) return 'quiz';
    if (Array.isArray(value.statements)) return 'true_false';
    if (Array.isArray(value.sentences)) return 'fill_blank';
    if (Array.isArray(value.pairs)) return 'matching';
    if (Array.isArray(value.connections) || (Array.isArray(value.leftItems) && Array.isArray(value.rightItems))) return 'connection';
    if (Array.isArray(value.items)) return 'sequencing';
    if (Array.isArray(value.pieces)) return 'puzzle';

    return undefined;
  }

  private normalizeToolArgs(
    toolName: string,
    toolArgs: Record<string, any>,
    ageGroup: AgeGroup | 'parent',
    executionContext?: { childId?: number; parentId?: number },
  ): Record<string, any> {
    const normalized = { ...toolArgs };

    if (toolName === 'generateActivity') {
      const inferredType = this.inferActivityType(normalized);
      if (inferredType) {
        normalized.type = inferredType;
      }
    }

    if (executionContext?.childId != null && CHILD_ID_TOOLS.has(toolName) && normalized.childId == null) {
      normalized.childId = executionContext.childId;
    }

    if (executionContext?.parentId != null && PARENT_ID_TOOLS.has(toolName) && normalized.parentId == null) {
      normalized.parentId = executionContext.parentId;
    }

    if (NEEDS_AGE_GROUP_TOOLS.has(toolName) && normalized.ageGroup == null) {
      if (ageGroup === '3-4' || ageGroup === '5-6') {
        normalized.ageGroup = ageGroup;
      }
    }

    return normalized;
  }
}
