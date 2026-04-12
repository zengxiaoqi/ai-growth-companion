/**
 * LLM client service — implements ILlmClient wrapping the OpenAI SDK.
 * Refactored from the original LlmClient with:
 * - Proper ILlmClient interface
 * - Retry strategy with exponential backoff
 * - Unified thinking-block stripping
 * - No TLS rejection hack
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai/index';
import type { ILlmClient, LlmMessage, LlmResponse, LlmToolDefinition, LlmConfig } from '../core';
import { stripThinking } from '../core';
import { RetryStrategy } from './retry.strategy';

@Injectable()
export class LlmClientService implements ILlmClient, OnModuleInit {
  private readonly logger = new Logger(LlmClientService.name);
  private client: OpenAI;
  private config: LlmConfig;
  private retryStrategy: RetryStrategy;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      baseUrl: this.configService.get<string>('LLM_BASE_URL', 'http://localhost:11434/v1'),
      apiKey: this.configService.get<string>('LLM_API_KEY', 'unused'),
      model: this.configService.get<string>('LLM_MODEL', 'qwen2.5:7b'),
      maxTokens: this.configService.get<number>('LLM_MAX_TOKENS', 4096),
      temperature: this.configService.get<number>('LLM_TEMPERATURE', 0.7),
    };

    this.retryStrategy = new RetryStrategy({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    });
  }

  onModuleInit() {
    this.client = new OpenAI({
      baseURL: this.config.baseUrl,
      apiKey: this.config.apiKey || 'unused',
    });
    this.logger.log(`LLM client initialized: model=${this.config.model}, baseUrl=${this.config.baseUrl}`);
  }

  get isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.model);
  }

  /** Convert framework messages to OpenAI format */
  private toOpenAIMessages(messages: LlmMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.toolCallId,
        } as any;
      }
      if (msg.role === 'assistant' && msg.toolCalls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.toolCalls,
        } as any;
      }
      return {
        role: msg.role as any,
        content: msg.content,
      } as any;
    });
  }

  /** Convert framework tool definitions to OpenAI format */
  private toOpenAITools(tools?: LlmToolDefinition[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools as any;
  }

  async chatCompletion(messages: LlmMessage[], tools?: LlmToolDefinition[]): Promise<LlmResponse> {
    return this.retryStrategy.execute(async () => {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.toOpenAIMessages(messages),
        tools: this.toOpenAITools(tools),
        tool_choice: tools ? 'auto' : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? null,
        toolCalls: choice?.message?.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: (tc as any).function?.name,
            arguments: (tc as any).function?.arguments,
          },
        })),
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
        } : undefined,
        finishReason: choice?.finish_reason ?? undefined,
      };
    }, 'chatCompletion');
  }

  async *chatCompletionStream(messages: LlmMessage[], tools?: LlmToolDefinition[]): AsyncGenerator<string> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.toOpenAIMessages(messages),
        tools: this.toOpenAITools(tools),
        tool_choice: tools ? 'auto' : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      this.logger.error(`LLM stream failed: ${error.message}`);
      throw error;
    }
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LlmMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.chatCompletion(messages);
    const raw = response.content ?? '';
    const result = stripThinking(raw);

    // If the response was only thinking (no visible content), retry with explicit anti-thinking instruction
    if (!result && raw) {
      this.logger.debug('generate() produced empty content after stripThinking, retrying with anti-thinking prompt...');
      try {
        const retryMessages: LlmMessage[] = [
          ...messages,
          { role: 'assistant', content: raw.slice(0, 200) },
          { role: 'user', content: 'Your previous response contained only internal reasoning with no visible output. Please respond again with the JSON output directly. Do NOT use <think</think*> blocks. Output ONLY the raw JSON object, nothing else.' },
        ];
        const retry = await this.chatCompletion(retryMessages);
        const retryResult = stripThinking(retry.content ?? '');
        return retryResult;
      } catch (err: any) {
        this.logger.debug(`generate() retry failed: ${err.message}`);
      }
    }

    return result;
  }

  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 2);
  }
}
