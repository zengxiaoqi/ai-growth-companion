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

  /** Strip <think...</think-> blocks from LLM output (reasoning tokens).
   *  MiniMax format: <think\n...reasoning...\n</think->\n\nanswer
   *  Handles thinking blocks anywhere in the string.
   */
  private stripThinking(text: string): string {
    if (!text) return '';
    // Remove all <think...>...</think*> blocks (closed tags, with or without attributes)
    let result = text.replace(/<think\b[\s\S]*?<\/think.*?>/g, '').trim();
    // Also handle unclosed <think at end of string
    result = result.replace(/<think\b[\s\S]*$/g, '').trim();
    return result;
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

    // Debug: log raw response length and first 200 chars when it looks like thinking-only
    if (raw && raw.startsWith('<think')) {
      this.logger.debug(`generate() raw response starts with <think, length=${raw.length}, preview=${raw.slice(0, 200)}`);
    } else if (!raw) {
      this.logger.debug(`generate() raw response is empty, finish_reason=${response.choices[0]?.finish_reason}`);
    }

    let result = this.stripThinking(raw);

    // If the response was only thinking (no visible content), retry with anti-thinking prompt
    if (!result) {
      this.logger.debug(`generate() produced empty content after stripThinking (raw length=${raw.length}), retrying with anti-thinking prompt...`);
      try {
        const retryMessages: ChatMessageParam[] = [
          ...messages,
          { role: 'assistant', content: raw.slice(0, 200) } as ChatMessageParam,
          { role: 'user', content: 'Your previous response contained only internal reasoning with no visible output. Please respond again with the JSON output directly. Do NOT use <think</think*> blocks. Output ONLY the raw JSON object, nothing else.' } as ChatMessageParam,
        ];
        const retry = await this.chatCompletion(retryMessages);
        const retryRaw = retry.choices[0]?.message?.content ?? '';
        result = this.stripThinking(retryRaw);
        if (!result && retryRaw) {
          this.logger.debug(`generate() retry still empty after strip (retryRaw length=${retryRaw.length}, starts=${retryRaw.slice(0, 100)})`);
        }
      } catch (err: any) {
        this.logger.debug(`generate() retry failed: ${err.message}`);
      }
    }

    return result;
  }

  /** Rough token estimate for Chinese text */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 2);
  }
}
