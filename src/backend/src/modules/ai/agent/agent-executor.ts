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

const MAX_TOOL_ITERATIONS = 5;

const THINK_CLOSE_TAG = '</think' + '>';

/** Strip <think...</think-> reasoning blocks from model output.
 *  MiniMax-M2.5 format: <think...content...</think->\n\nanswer
 */
function stripThinking(text: string): string {
  if (!text.startsWith('<think')) return text.trim();
  const tagEnd = text.indexOf(THINK_CLOSE_TAG);
  if (tagEnd !== -1) {
    return text.slice(tagEnd + THINK_CLOSE_TAG.length).trim();
  }
  return text.trim();
}

/** Extract the content inside <think...</think-> blocks */
function extractThinking(text: string): string {
  if (!text.startsWith('<think')) return '';
  const start = text.indexOf('>') + 1;
  const tagEnd = text.indexOf(THINK_CLOSE_TAG);
  if (tagEnd !== -1 && tagEnd > start) {
    return text.slice(start, tagEnd).trim();
  }
  return '';
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
  buildSystemPrompt(ageGroup: AgeGroup | 'parent', childName: string): string {
    if (ageGroup === 'parent') return systemPromptParent(childName);
    if (ageGroup === '3-4') return systemPrompt34(childName);
    if (ageGroup === '5-6') return systemPrompt56(childName);
    return systemPrompt56(childName); // default to 5-6 style
  }

  /**
   * Execute the agent loop: send message to LLM, handle tool calls, return final answer.
   */
  async execute(
    sessionId: string,
    userMessage: string,
    ageGroup: AgeGroup | 'parent',
    childName: string,
  ): Promise<{ reply: string; toolCalls: ToolCallInfo[] }> {
    // Save user message
    await this.conversationManager.addMessage(sessionId, 'user', userMessage);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(ageGroup, childName);

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

          const result = await this.toolRegistry.execute(toolName, toolArgs);

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
            args: toolArgs,
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

    const systemPrompt = this.buildSystemPrompt(ageGroup, childName);
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

          yield { type: 'tool_start', content: toolName, toolName, toolArgs };
          const result = await this.toolRegistry.execute(toolName, toolArgs);
          yield { type: 'tool_result', content: toolName, toolName, toolArgs, toolResult: result };

          // If this was generateActivity, emit game_data for frontend rendering
          if (toolName === 'generateActivity') {
            yield {
              type: 'game_data',
              activityType: toolArgs.type,
              gameData: result,
              domain: toolArgs.domain || 'language',
            } as any;
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

          toolCallLog.push({ tool: toolName, args: toolArgs, resultSummary: result.slice(0, 100) });
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
}
