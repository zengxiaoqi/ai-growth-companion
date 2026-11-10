import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from '../../../agent-framework/llm/llm-client.service';
import { ToolRegistry } from './tool-registry';
import { ConversationService } from '../../../agent-framework/conversation/conversation.service';
import { ContentSafetyService } from '../../../common/services/content-safety.service';
import { careCuePrompt } from '../../care/care-prompt';
import {
  systemPrompt34,
  systemPrompt56,
  systemPrompt79,
  systemPrompt1012,
  systemPromptParent,
} from './prompts/system-prompts';
import {
  classifyAge as classifyAgeGroup,
  contentAgeGroup,
} from '../../../agent-framework/core/types/age-group';
import { stripThinking, extractThinking } from '../../../agent-framework/core';
import { ACTIVITY_TYPES } from '../../../agent-framework/core/types/tool-metadata';
import type { LlmMessage } from '../../../agent-framework/core';
import type { ToolCallInfo, AgeGroup } from '../ai.types';

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
  'enqueueTeachingVideo',
  'recallMemory',
  'saveMemory',
]);
const PARENT_ID_TOOLS = new Set(['listChildren', 'assignActivity', 'updateParentControl']);
/**
 * Tools that need the current session id: `saveMemory` verifies the quote
 * against the child's messages *in this conversation*, so it has to know
 * which conversation that is.
 */
const SESSION_ID_TOOLS = new Set(['recallMemory', 'saveMemory']);

/**
 * Words that *may* point at the past. Used only to add one line to the
 * system prompt — never to decide anything. Narrow on purpose: 「又」 and
 * 「还是」 are far too common to be useful as triggers.
 */
const MEMORY_TRIGGER =
  /(上次|上回|以前|之前|还记得|记不记得|我说过|答应过|约好|那天|昨天|前天|上周|上个月|生日|最喜欢|最讨厌|害怕|记住|别忘了)/;
const NEEDS_AGE_GROUP_TOOLS = new Set([
  'generateQuiz',
  'generateActivity',
  'assignActivity',
  'generateCoursePack',
]);
const SUPPORTED_ACTIVITY_TYPES = ACTIVITY_TYPES;
type SupportedActivityType = (typeof ACTIVITY_TYPES)[number];
const SUPPORTED_ACTIVITY_TYPE_SET = new Set<string>(SUPPORTED_ACTIVITY_TYPES);

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

  const codeBlockMatch =
    trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {}
  }

  return null;
}

/** Convert ChatCompletionMessageParam[] from ConversationService to LlmMessage[] */
function toLlmMessages(raw: any[]): LlmMessage[] {
  return raw.map((msg: any) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: typeof msg.content === 'string' ? msg.content : '',
        toolCallId: msg.tool_call_id,
      };
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      return {
        role: 'assistant' as const,
        content: msg.content ?? null,
        toolCalls: msg.tool_calls,
      };
    }
    return {
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : (msg.content ?? ''),
    };
  });
}

@Injectable()
export class AgentExecutor {
  private readonly logger = new Logger(AgentExecutor.name);

  constructor(
    private readonly llmClient: LlmClientService,
    private readonly toolRegistry: ToolRegistry,
    private readonly conversationService: ConversationService,
    private readonly contentSafetyService: ContentSafetyService,
  ) {}

  /**
   * Classify a numeric age into an age group.
   *
   * Delegates to the framework's single source of truth so the two
   * executors cannot disagree about what a 9-year-old is. 'unknown' is
   * kept only as this executor's "age not supplied" sentinel.
   */
  classifyAge(age: number | undefined | null): AgeGroup {
    if (age == null) return 'unknown';
    return classifyAgeGroup(age);
  }

  /** Build system prompt based on age group */
  buildSystemPrompt(
    ageGroup: AgeGroup | 'parent',
    childName: string,
    executionContext?: { childId?: number; parentId?: number },
    bookId?: number,
    bookTitle?: string,
    userMessage?: string,
    careTopic?: string,
  ): string {
    const contextHints = [
      '## Runtime Context',
      executionContext?.childId != null ? `- Current childId: ${executionContext.childId}` : '',
      executionContext?.parentId != null ? `- Current parentId: ${executionContext.parentId}` : '',
      '- IMPORTANT: Use these IDs directly when calling tools. Never guess IDs.',
      '- If childId is already known, do not call listChildren only to discover childId.',
      '- If parent asks for one-shot complete lesson generation (listen/speak/read/write + game + video), call generateCoursePack.',
      this.memoryTriggerHint(userMessage),
      careCuePrompt(careTopic),
      bookId != null && bookTitle != null
        ? `\n## 当前知识书上下文\n用户正在查看"${bookTitle}"这本书，请优先回答与这本书内容相关的问题。\n你可以使用 queryBookSkill 工具搜索这本书中的章节、术语和模式。\n当用户问到书中角色、情节、知识点时，请用 queryBookSkill 搜索相关章节来回答。\n如果用户没有明确指定书本，但问题与当前上下文相关，也请优先搜索这本书。\n- bookId: ${bookId}`
        : '',
      bookId != null && bookTitle == null
        ? `\n## 当前知识书上下文\n用户正在查看一本书（ID: ${bookId}），请优先回答与这本书内容相关的问题。\n你可以使用 queryBookSkill 工具搜索这本书中的内容。\n- bookId: ${bookId}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (ageGroup === 'parent') return `${systemPromptParent(childName)}\n\n${contextHints}`;
    if (ageGroup === '3-4') return `${systemPrompt34(childName)}\n\n${contextHints}`;
    if (ageGroup === '5-6') return `${systemPrompt56(childName)}\n\n${contextHints}`;
    if (ageGroup === '7-9') return `${systemPrompt79(childName)}\n\n${contextHints}`;
    if (ageGroup === '10-12') return `${systemPrompt1012(childName)}\n\n${contextHints}`;
    return `${systemPrompt56(childName)}\n\n${contextHints}`; // 'unknown' and anything else
  }

  /**
   * A local nudge, computed without any model call.
   *
   * The model decides whether to use the memory tools; this line only
   * lowers the chance that it forgets they exist. It is a hint, not a
   * switch: a false positive costs one sentence of prompt, and a false
   * negative is covered by the tools' own descriptions.
   *
   * Deliberately age-agnostic — the wording of whatever the model then
   * says comes from the active age-group prompt, which is what keeps the
   * memory capability independent of age.
   */
  private memoryTriggerHint(userMessage?: string): string {
    if (!userMessage || !MEMORY_TRIGGER.test(userMessage)) return '';
    return (
      '- 这句话里出现了可能指向过去的说法（记忆触发词）。' +
      '如果确实在问以前的事，可以调用 recallMemory；' +
      '如果孩子说出了值得长期记住的偏好或事件，可以调用 saveMemory。' +
      '不确定时宁可不调用，普通闲聊不要调用。'
    );
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
    bookId?: number,
    bookTitle?: string,
    careTopic?: string,
  ): Promise<{ reply: string; toolCalls: ToolCallInfo[] }> {
    // Save user message
    await this.conversationService.addMessage(sessionId, 'user', userMessage);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      ageGroup,
      childName,
      executionContext,
      bookId,
      bookTitle,
      userMessage,
      careTopic,
    );

    // Load conversation history
    const rawHistory = await this.conversationService.buildMessageArray(sessionId);

    // Build full message array
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...toLlmMessages(rawHistory),
    ];

    const tools = this.toolRegistry.getToolDefinitions() as any;
    const toolCallLog: ToolCallInfo[] = [];

    // Agent loop
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      this.logger.log(`Agent iteration ${iteration + 1}`);

      const response = await this.llmClient.chatCompletion(messages, tools);

      // Check for tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Save to DB
        await this.conversationService.addMessage(
          sessionId,
          'assistant',
          stripThinking(response.content || ''),
          {
            toolCalls: response.toolCalls,
          },
        );

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          if (!toolCall.function?.name) continue;
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          const normalizedToolArgs = this.normalizeToolArgs(
            toolName,
            toolArgs,
            ageGroup,
            executionContext,
            sessionId,
          );
          this.logger.debug(
            `[TOOL CALL] ${toolName} args=${JSON.stringify(normalizedToolArgs).slice(0, 500)}`,
          );
          const result = await this.toolRegistry.execute(toolName, normalizedToolArgs, {
            // Same convention as AiService.buildAgentContext: a parent
            // conversation is the only one routed with ageGroup='parent'.
            actorType: ageGroup === 'parent' ? 'parent' : 'child',
          });
          this.logger.debug(
            `[TOOL RESULT] ${toolName} resultLen=${result.length} preview=${result.slice(0, 300)}`,
          );

          // Add tool result to messages
          messages.push({
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
          });

          // Save to DB
          await this.conversationService.addMessage(sessionId, 'tool', result, {
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
      let finalReply = stripThinking(response.content || '');
      this.logger.debug(
        `[FINAL REPLY] contentLen=${finalReply.length} preview=${finalReply.slice(0, 300)}`,
      );

      // Safety filter
      const safeResult = this.contentSafetyService.filterContent(finalReply);
      finalReply = safeResult.content;

      // Save assistant response
      await this.conversationService.addMessage(sessionId, 'assistant', finalReply);

      // The turn is over: hand the rolling summary to the background so the
      // reply is not delayed by a model call nobody is waiting for.
      this.conversationService.scheduleSummary(sessionId);

      return { reply: finalReply, toolCalls: toolCallLog };
    }

    // Max iterations reached — return what we have
    const fallback = '我思考了很久，暂时想不出好的回答。换个问题试试吧~ 🌟';
    await this.conversationService.addMessage(sessionId, 'assistant', fallback);
    this.conversationService.scheduleSummary(sessionId);
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
    bookId?: number,
    bookTitle?: string,
    careTopic?: string,
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
    await this.conversationService.addMessage(sessionId, 'user', userMessage);

    const systemPrompt = this.buildSystemPrompt(
      ageGroup,
      childName,
      executionContext,
      bookId,
      bookTitle,
      userMessage,
      careTopic,
    );
    const rawHistory = await this.conversationService.buildMessageArray(sessionId);
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...toLlmMessages(rawHistory),
    ];
    const tools = this.toolRegistry.getToolDefinitions() as any;
    const toolCallLog: ToolCallInfo[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.llmClient.chatCompletion(messages, tools);

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Emit thinking content if present (before tool calls)
        const thinkingContent = extractThinking(response.content || '');
        if (thinkingContent) {
          yield { type: 'thinking', thinkingContent };
        }

        // Handle tool calls (non-streaming)
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        await this.conversationService.addMessage(
          sessionId,
          'assistant',
          stripThinking(response.content || ''),
          {
            toolCalls: response.toolCalls,
          },
        );

        for (const toolCall of response.toolCalls) {
          if (!toolCall.function?.name) continue;
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          const normalizedToolArgs = this.normalizeToolArgs(
            toolName,
            toolArgs,
            ageGroup,
            executionContext,
            sessionId,
          );
          yield {
            type: 'tool_start',
            content: toolName,
            toolName,
            toolArgs: normalizedToolArgs,
          };
          this.logger.debug(
            `[STREAM TOOL CALL] ${toolName} args=${JSON.stringify(normalizedToolArgs).slice(0, 500)}`,
          );
          const result = await this.toolRegistry.execute(toolName, normalizedToolArgs, {
            // Same convention as AiService.buildAgentContext: a parent
            // conversation is the only one routed with ageGroup='parent'.
            actorType: ageGroup === 'parent' ? 'parent' : 'child',
          });
          this.logger.debug(
            `[STREAM TOOL RESULT] ${toolName} resultLen=${result.length} preview=${result.slice(0, 300)}`,
          );
          yield {
            type: 'tool_result',
            content: toolName,
            toolName,
            toolArgs: normalizedToolArgs,
            toolResult: result,
          };

          // If this was generateActivity or generateQuiz, emit game_data for frontend rendering
          if (toolName === 'generateActivity' || toolName === 'generateQuiz') {
            const resultPayload = safeParseJsonObject(result);
            const activityType = this.resolveGenerateActivityType(
              normalizedToolArgs,
              resultPayload,
            );
            if (activityType && !this.isToolErrorPayload(resultPayload)) {
              yield {
                type: 'game_data',
                activityType,
                gameData: result,
                domain: normalizedToolArgs.domain || 'language',
              } as any;
            } else {
              this.logger.warn(`[STREAM] Skip invalid game_data payload for ${toolName}`);
            }
          }

          messages.push({
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
          });

          await this.conversationService.addMessage(sessionId, 'tool', result, {
            toolCallId: toolCall.id,
            toolName,
          });

          toolCallLog.push({
            tool: toolName,
            args: normalizedToolArgs,
            resultSummary: result.slice(0, 100),
          });
        }
        continue;
      }

      // Final response — the LLM already gave us the text in the non-streaming call
      // Emit thinking content if present
      const finalThinking = extractThinking(response.content || '');
      if (finalThinking) {
        yield { type: 'thinking', thinkingContent: finalThinking };
      }

      let cleanContent = stripThinking(response.content || '');

      // If the non-streaming response was only thinking (no visible content), make one more call without tools
      if (!cleanContent) {
        this.logger.log(
          `[STREAM] Non-streaming response was empty, making follow-up call without tools`,
        );
        try {
          const followUp = await this.llmClient.chatCompletion(messages, undefined);
          cleanContent = stripThinking(followUp.content || '');
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

      await this.conversationService.addMessage(sessionId, 'assistant', safeResult.content);

      // Fire-and-forget: the stream must close on the reply, not on a
      // summary the client is not waiting for.
      this.conversationService.scheduleSummary(sessionId);

      yield {
        type: 'done',
        sessionId,
        wasFiltered: safeResult.wasFiltered,
        toolCalls: toolCallLog,
      };
      return;
    }

    // Fallback
    this.conversationService.scheduleSummary(sessionId);
    yield {
      type: 'token',
      content: '我思考了很久，暂时想不出好的回答。换个问题试试吧~ 🌟',
    };
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

    // drag_sort carries `items` too; check it before the generic
    // items -> sequencing fallback or the payload is silently mis-typed.
    if (Array.isArray(value.buckets) && Array.isArray(value.items)) return 'drag_sort';
    if (Array.isArray(value.questions)) return 'quiz';
    if (Array.isArray(value.statements)) return 'true_false';
    if (Array.isArray(value.sentences)) return 'fill_blank';
    if (Array.isArray(value.pairs)) return 'matching';
    if (
      Array.isArray(value.connections) ||
      (Array.isArray(value.leftItems) && Array.isArray(value.rightItems))
    )
      return 'connection';
    if (Array.isArray(value.items)) return 'sequencing';
    if (Array.isArray(value.pieces)) return 'puzzle';

    return undefined;
  }

  private normalizeToolArgs(
    toolName: string,
    toolArgs: Record<string, any>,
    ageGroup: AgeGroup | 'parent',
    executionContext?: { childId?: number; parentId?: number },
    conversationId?: string,
  ): Record<string, any> {
    const normalized = { ...toolArgs };

    if (toolName === 'generateActivity') {
      const inferredType = this.inferActivityType(normalized);
      if (inferredType) {
        normalized.type = inferredType;
      }
    }

    if (executionContext?.childId != null && CHILD_ID_TOOLS.has(toolName)) {
      normalized.childId = executionContext.childId;
    }

    if (executionContext?.parentId != null && PARENT_ID_TOOLS.has(toolName)) {
      normalized.parentId = executionContext.parentId;
    }

    if (NEEDS_AGE_GROUP_TOOLS.has(toolName) && ageGroup !== 'parent' && ageGroup !== 'unknown') {
      // The conversation may be in a school-age style, but the content
      // layer still only has two buckets. Inject the bucket here rather
      // than letting a '7-9' string reach a tool that would reject it.
      normalized.ageGroup = contentAgeGroup(ageGroup);
    }

    if (toolName === 'assignActivity' && conversationId && normalized.conversationId == null) {
      normalized.conversationId = conversationId;
    }

    if (SESSION_ID_TOOLS.has(toolName) && conversationId && normalized.sessionId == null) {
      // `saveMemory` proves the quote against this conversation's messages,
      // so the id is supplied here rather than trusted from the model.
      normalized.sessionId = conversationId;
    }

    return normalized;
  }
}
