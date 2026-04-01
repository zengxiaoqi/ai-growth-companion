import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai/index';
import { LlmConfig } from './llm.config';

type ChatMessageParam = OpenAI.ChatCompletionMessageParam;
type ChatTool = OpenAI.ChatCompletionTool;
type ChatCompletion = OpenAI.ChatCompletion;

@Injectable()
export class LlmClient {
  private readonly client: OpenAI;
  private readonly logger = new Logger(LlmClient.name);

  constructor(private readonly config: LlmConfig) {
    // Skip TLS revocation check on Windows (schannel CRYPT_E_REVOCATION_OFFLINE)
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey || 'unused',
    });
  }

  /** Non-streaming chat completion — used for tool-call rounds */
  async chatCompletion(
    messages: ChatMessageParam[],
    tools?: ChatTool[],
  ): Promise<ChatCompletion> {
    try {
      return await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
    } catch (error) {
      this.logger.error(`LLM call failed: ${error.message}`);
      throw error;
    }
  }

  /** Streaming chat completion — used for final text response */
  async *chatCompletionStream(
    messages: ChatMessageParam[],
    tools?: ChatTool[],
  ): AsyncGenerator<string> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools,
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
    } catch (error) {
      this.logger.error(`LLM stream failed: ${error.message}`);
      throw error;
    }
  }

  /** Strip <think...</think-> blocks from LLM output (reasoning tokens) */
  private stripThinking(text: string): string {
    if (!text.startsWith('<think')) return text.trim();
    const tagEnd = text.indexOf('</think' + '>');
    if (tagEnd !== -1) return text.slice(tagEnd + 8).trim();
    return text.trim();
  }

  /** Secondary LLM call for structured content generation (e.g., quizzes) */
  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.chatCompletion(messages);
    const raw = response.choices[0]?.message?.content ?? '';
    return this.stripThinking(raw);
  }

  /** Rough token estimate for Chinese text */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 2);
  }
}
