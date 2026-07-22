/**
 * LLM client service — implements ILlmClient wrapping pi-ai for multi-provider support.
 *
 * Features:
 * - Multi-provider switching via pi-ai (OpenAI, DeepSeek, Ollama, etc.)
 * - Automatic fallback to next provider on failure
 * - Token usage and cost tracking via pi-ai's Usage
 * - Falls back to plain OpenAI SDK if pi-ai fails to load
 * - Identical ILlmClient interface — all consumers unchanged
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai/index';
import type { ILlmClient, LlmMessage, LlmResponse, LlmToolDefinition, LlmConfig } from '../core';
import { stripThinking } from '../core';
import { RetryStrategy } from './retry.strategy';

// ─────────────────────────────────────────────────────────────────────
// pi-ai type shims (dynamic import since pi-ai is ESM-only)
// TypeScript resolves `import()` type expressions at compile time, so
// these work even though the actual import is dynamic at runtime.
// ─────────────────────────────────────────────────────────────────────
type PiAiModels = import('@earendil-works/pi-ai').Models;
type PiAiModel = import('@earendil-works/pi-ai').Model<import('@earendil-works/pi-ai').Api>;
type PiAiContext = import('@earendil-works/pi-ai').Context;
type PiAiMessage = import('@earendil-works/pi-ai').Message;
type PiAiAssistantMessage = import('@earendil-works/pi-ai').AssistantMessage;

interface ProviderEntry {
  config: ProviderConfig;
  model: PiAiModel;
}

interface ProviderConfig {
  id: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

@Injectable()
export class LlmClientService implements ILlmClient, OnModuleInit {
  private readonly logger = new Logger(LlmClientService.name);
  private config: LlmConfig;
  private retryStrategy: RetryStrategy;

  // Fallback: plain OpenAI SDK (used when pi-ai fails to load)
  private client: OpenAI;

  // pi-ai state
  private models: PiAiModels | null = null;
  private entries: ProviderEntry[] = [];
  private piAiEnabled = false;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      baseUrl: this.configService.get<string>('LLM_BASE_URL', 'http://localhost:11434/v1'),
      apiKey: this.configService.get<string>('LLM_API_KEY', 'unused'),
      model: this.configService.get<string>('LLM_MODEL', 'qwen2.5:7b'),
      maxTokens: Number(this.configService.get<string>('LLM_MAX_TOKENS', '4096')),
      temperature: Number(this.configService.get<string>('LLM_TEMPERATURE', '0.7')),
    };

    this.retryStrategy = new RetryStrategy({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    });
  }

  async onModuleInit() {
    // Try pi-ai first; fall back to OpenAI SDK on failure
    try {
      await this.initializePiAi();
    } catch (err: any) {
      this.logger.warn(`pi-ai init failed: ${err.message}`);
      this.logger.log('Falling back to plain OpenAI SDK');
      this.client = new OpenAI({
        baseURL: this.config.baseUrl,
        apiKey: this.config.apiKey || 'unused',
      });
      this.logger.log(
        `LLM client initialized: model=${this.config.model}, baseUrl=${this.config.baseUrl}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // pi-ai initialization
  // ─────────────────────────────────────────────────────────────────

  private async initializePiAi() {
    const piAi = await import('@earendil-works/pi-ai');
    const apiModule = await import('@earendil-works/pi-ai/api/openai-completions');

    const configs = this.buildProviderConfigs();
    const models = piAi.createModels();

    for (const pc of configs) {
      const provider = piAi.createProvider({
        id: pc.id,
        name: pc.id,
        baseUrl: pc.baseUrl,
        auth: {
          apiKey: {
            name: 'API Key',
            resolve: async () => ({
              auth: { apiKey: pc.apiKey, baseUrl: pc.baseUrl },
            }),
          },
        },
        models: [
          {
            id: pc.model,
            name: pc.model,
            api: 'openai-completions',
            provider: pc.id,
            baseUrl: pc.baseUrl,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            contextWindow: 128000,
            maxTokens: pc.maxTokens,
          },
        ],
        api: apiModule,
      });

      models.setProvider(provider);
      const model = models.getModel(pc.id, pc.model);
      if (model) {
        this.entries.push({ config: pc, model });
      }
    }

    this.models = models;
    this.piAiEnabled = true;
    this.logger.log(
      `pi-ai initialized: ${this.entries.length} provider(s) — ${this.entries.map((e) => e.config.id).join(', ')}`,
    );
  }

  private buildProviderConfigs(): ProviderConfig[] {
    const configs: ProviderConfig[] = [];

    // Primary provider
    const primaryId = this.configService.get<string>('LLM_PROVIDER', 'openai');
    configs.push({
      id: primaryId,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    // Optional fallback provider
    const fallbackId = this.configService.get<string>('LLM_FALLBACK_PROVIDER');
    if (fallbackId) {
      configs.push({
        id: fallbackId,
        apiKey: this.configService.get<string>('LLM_FALLBACK_API_KEY', this.config.apiKey),
        baseUrl: this.configService.get<string>('LLM_FALLBACK_BASE_URL', this.config.baseUrl),
        model: this.configService.get<string>('LLM_FALLBACK_MODEL', this.config.model),
        maxTokens: Number(
          this.configService.get<string>('LLM_FALLBACK_MAX_TOKENS', String(this.config.maxTokens)),
        ),
        temperature: Number(
          this.configService.get<string>(
            'LLM_FALLBACK_TEMPERATURE',
            String(this.config.temperature),
          ),
        ),
      });
    }

    return configs;
  }

  // ─────────────────────────────────────────────────────────────────
  // ILlmClient implementation
  // ─────────────────────────────────────────────────────────────────

  get isConfigured(): boolean {
    return this.piAiEnabled || Boolean(this.config.baseUrl && this.config.model);
  }

  async chatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    _forceToolChoice?: boolean,
  ): Promise<LlmResponse> {
    if (this.piAiEnabled) {
      return this.piAiChatCompletion(messages, tools, maxTokensOverride);
    }
    return this.legacyChatCompletion(messages, tools, maxTokensOverride, _forceToolChoice);
  }

  async *chatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
  ): AsyncGenerator<string> {
    if (this.piAiEnabled) {
      yield* this.piAiChatCompletionStream(messages, tools);
      return;
    }
    yield* this.legacyChatCompletionStream(messages, tools);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LlmMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Try with escalating max_tokens when finish_reason === 'length' (Claude Code pattern)
    for (const tokenLimit of this.ESCALATING_TOKEN_LIMITS) {
      const response = await this.chatCompletionWithTokenLimit(messages, tokenLimit);
      const raw = response.content ?? '';
      const result = stripThinking(raw);

      // finish_reason === 'length' means output was truncated — retry with higher limit
      if (
        response.finishReason === 'length' &&
        tokenLimit < this.ESCALATING_TOKEN_LIMITS[this.ESCALATING_TOKEN_LIMITS.length - 1]
      ) {
        this.logger.debug(`generate() hit token limit (${tokenLimit}), escalating to next tier...`);
        continue;
      }

      // Attempt partial JSON salvage for truncated responses
      if (response.finishReason === 'length' && result) {
        const salvaged = this.tryPartialJsonSalvage(result);
        if (salvaged) {
          this.logger.debug('generate() salvaged partial JSON from truncated response');
          return salvaged;
        }
      }

      // Normal success path
      if (result) return result;

      // Empty after stripThinking — model produced only thinking blocks
      if (raw) {
        this.logger.debug(
          'generate() produced empty content after stripThinking, retrying with anti-thinking prompt...',
        );
        try {
          const retryMessages: LlmMessage[] = [
            ...messages,
            { role: 'assistant', content: raw.slice(0, 200) },
            {
              role: 'user',
              content:
                'Your previous response contained only internal reasoning with no visible output. Please respond again with the JSON output directly. Do NOT use <think</think*> blocks. Output ONLY the raw JSON object, nothing else.',
            },
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

    // Fallback: return whatever we got at the highest token limit
    const finalResponse = await this.chatCompletion(messages);
    return stripThinking(finalResponse.content ?? '');
  }

  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 2);
  }

  // ─────────────────────────────────────────────────────────────────
  // pi-ai implementation
  // ─────────────────────────────────────────────────────────────────

  /**
   * Non-streaming chat completion via pi-ai.
   * Tries each provider in order, falling back to the next on failure.
   */
  private async piAiChatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
  ): Promise<LlmResponse> {
    // Try each provider in sequence, falling back on failure
    let lastError: Error | null = null;

    for (const entry of this.entries) {
      try {
        const result = await this.callProvider(entry, messages, tools, maxTokensOverride);
        return result;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `Provider ${entry.config.id} failed: ${err.message}${this.entries.length > 1 ? ', trying next...' : ''}`,
        );
      }
    }

    throw lastError ?? new Error('All providers failed');
  }

  /**
   * Call a single provider via pi-ai's Models.complete().
   */
  private async callProvider(
    entry: ProviderEntry,
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
  ): Promise<LlmResponse> {
    if (!this.models) throw new Error('pi-ai not initialized');

    // Extract system prompt from messages
    const systemPrompt = messages.find((m) => m.role === 'system')?.content;
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // Build pi-ai Context
    const context: PiAiContext = {
      systemPrompt,
      messages: nonSystemMessages.map((m) => this.toPiAiMessage(m)),
      tools: tools?.map((t) => this.toPiAiTool(t)),
    };

    const piAi = await import('@earendil-works/pi-ai');

    // Use Models.complete() which handles auth resolution + provider dispatch
    const result = await piAi.complete(entry.model, context, {
      maxTokens: maxTokensOverride ?? entry.config.maxTokens,
      temperature: entry.config.temperature,
    });

    return this.fromPiAiResponse(result);
  }

  /**
   * Streaming chat completion via pi-ai.
   * Yields text delta tokens from the pi-ai event stream.
   */
  private async *piAiChatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
  ): AsyncGenerator<string> {
    if (!this.models || this.entries.length === 0) {
      throw new Error('pi-ai not initialized');
    }

    // Use the first (primary) provider for streaming
    const entry = this.entries[0];

    const systemPrompt = messages.find((m) => m.role === 'system')?.content;
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const context: PiAiContext = {
      systemPrompt,
      messages: nonSystemMessages.map((m) => this.toPiAiMessage(m)),
      tools: tools?.map((t) => this.toPiAiTool(t)),
    };

    const piAi = await import('@earendil-works/pi-ai');

    const stream = piAi.stream(entry.model, context, {
      maxTokens: entry.config.maxTokens,
      temperature: entry.config.temperature,
    });

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        yield event.delta;
      }
    }
  }

  // ─── Type conversion: LlmMessage ↔ pi-ai Message ─────────────────

  private toPiAiMessage(msg: LlmMessage): PiAiMessage {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.content,
        timestamp: Date.now(),
      } as unknown as PiAiMessage;
    }

    if (msg.role === 'assistant') {
      const content: any[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            parsedArgs = {};
          }
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.function?.name,
            arguments: parsedArgs,
          });
        }
      }
      return {
        role: 'assistant',
        content,
        timestamp: Date.now(),
      } as unknown as PiAiMessage;
    }

    if (msg.role === 'tool') {
      return {
        role: 'toolResult',
        toolCallId: msg.toolCallId!,
        toolName: msg.toolName!,
        content: [{ type: 'text', text: msg.content }],
        timestamp: Date.now(),
      } as unknown as PiAiMessage;
    }

    // Fallback: treat unknown roles as user
    return {
      role: 'user',
      content: msg.content,
      timestamp: Date.now(),
    } as unknown as PiAiMessage;
  }

  private toPiAiTool(tool: LlmToolDefinition): any {
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    };
  }

  private fromPiAiResponse(result: PiAiAssistantMessage): LlmResponse {
    // Extract text content
    const textContent = (result.content as any[])?.find((c: any) => c.type === 'text');
    const content = textContent?.text ?? null;

    // Extract tool calls
    const toolCalls = (result.content as any[])
      ?.filter((c: any) => c.type === 'toolCall')
      ?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

    // Map usage
    const usage = result.usage
      ? {
          promptTokens: result.usage.input,
          completionTokens: result.usage.output,
        }
      : undefined;

    // Map finish reason
    const finishReason =
      result.stopReason === 'stop'
        ? 'stop'
        : result.stopReason === 'toolUse'
          ? 'tool_calls'
          : result.stopReason === 'length'
            ? 'length'
            : result.stopReason === 'error'
              ? 'error'
              : undefined;

    return { content, toolCalls, usage, finishReason };
  }

  // ─────────────────────────────────────────────────────────────────
  // Legacy OpenAI SDK implementation (fallback when pi-ai unavailable)
  // ─────────────────────────────────────────────────────────────────

  private readonly ESCALATING_TOKEN_LIMITS = [4096, 8192, 16384];

  /** Convert framework messages to OpenAI format */
  private toOpenAIMessages(messages: LlmMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
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

  private async legacyChatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    _forceToolChoice?: boolean,
  ): Promise<LlmResponse> {
    return this.retryStrategy.execute(async () => {
      const effectiveMaxTokens = maxTokensOverride ?? this.config.maxTokens;
      // NOTE: tool_choice='required' is unsupported by many thinking-mode LLMs
      // (e.g. deepseek-v4-pro). We always use 'auto' and rely on prompt
      // engineering to steer the LLM toward tool usage.
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.toOpenAIMessages(messages),
        tools: this.toOpenAITools(tools),
        tool_choice: tools ? 'auto' : undefined,
        max_tokens: effectiveMaxTokens,
        temperature: this.config.temperature,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? null,
        toolCalls: choice?.message?.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: (tc as any).function?.name,
            arguments: (tc as any).function?.arguments,
          },
        })),
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
        finishReason: choice?.finish_reason ?? undefined,
      };
    }, 'chatCompletion');
  }

  private async *legacyChatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
  ): AsyncGenerator<string> {
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

  /** chatCompletion with a specific max_tokens override */
  private async chatCompletionWithTokenLimit(
    messages: LlmMessage[],
    maxTokens: number,
  ): Promise<LlmResponse> {
    return this.retryStrategy.execute(async () => {
      if (this.piAiEnabled) {
        return this.piAiChatCompletion(messages, undefined, maxTokens);
      }
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.toOpenAIMessages(messages),
        max_tokens: maxTokens,
        temperature: this.config.temperature,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? undefined,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    }, 'chatCompletion');
  }

  /**
   * Attempt to salvage a valid JSON object from a truncated response.
   * Tries progressive brace-matching from the end of the string.
   */
  private tryPartialJsonSalvage(text: string): string | null {
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;

    // Try parsing the full text first
    try {
      JSON.parse(text.slice(firstBrace));
      return text; // wasn't actually broken
    } catch {
      /* continue */
    }

    // Progressive salvage: close open structures and try parsing
    const sliced = text.slice(firstBrace);
    const attempts = [
      () => sliced + '}', // close outermost object
      () => sliced.replace(/,\s*$/, '') + '}', // remove trailing comma + close
      () => sliced.replace(/"[^"]*$/, '"') + '}', // close truncated string value
      () => sliced.replace(/,\s*"[^"]*$/, '') + '}', // remove truncated key-value pair
      () => sliced.replace(/,\s*\{[^}]*$/, '') + '}', // remove truncated inner object
      () => sliced.replace(/,\s*\[[^\]]*$/, '') + '}', // remove truncated inner array
    ];

    for (const attempt of attempts) {
      try {
        const candidate = attempt();
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') {
          return candidate;
        }
      } catch {
        /* continue */
      }
    }

    return null;
  }
}
