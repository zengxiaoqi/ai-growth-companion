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
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { ILlmClient, LlmMessage, LlmResponse, LlmToolDefinition, LlmConfig, LlmCallOptions } from '../core';
import { stripThinking } from '../core';
import { RetryStrategy } from './retry.strategy';

interface ProviderEntry {
  config: ProviderConfig;
  model: any; // pi-ai Model<Api>
}

interface ProviderConfig {
  id: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  input?: ('text' | 'image')[];
}

@Injectable()
export class LlmClientService implements ILlmClient, OnModuleInit {
  private readonly logger = new Logger(LlmClientService.name);
  private config: LlmConfig;
  private retryStrategy: RetryStrategy;

  // Fallback: plain OpenAI SDK (used when pi-ai fails to load)
  private client: OpenAI;

  // pi-ai state
  private models: any = null; // PiAiModels
  private entries: ProviderEntry[] = [];
  private piAiEnabled = false;

  // 队列可能在 onModuleInit 完成前认领任务（pi-ai 动态 import 耗时数秒），
  // 此时 client/piAi 均未就绪；所有 LLM 入口必须等初始化落定。
  private readonly ready: Promise<void>;
  private resolveReady!: () => void;

  /** Casual-mode model override (LLM_MODEL_CASUAL); undefined when unset */
  readonly casualModel?: string;

  /** English-practice model override (LLM_MODEL_ENGLISH); undefined when unset */
  readonly englishModel?: string;

  /** Intent-classifier model override (LLM_MODEL_INTENT); falls back to casual */
  readonly intentModel?: string;

  /** Vision model override (LLM_VISION_MODEL); undefined when unset */
  readonly visionModel?: string;

  /** Storyboard/figure authoring override (LLM_AUTHOR_MODEL); undefined when unset */
  readonly authorModel?: string;

  constructor(private readonly configService: ConfigService) {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    this.config = {
      baseUrl: this.configService.get<string>('LLM_BASE_URL', 'http://localhost:11434/v1'),
      apiKey: this.configService.get<string>('LLM_API_KEY', 'unused'),
      model: this.configService.get<string>('LLM_MODEL', 'qwen2.5:7b'),
      maxTokens: Number(this.configService.get<string>('LLM_MAX_TOKENS', '4096')),
      temperature: Number(this.configService.get<string>('LLM_TEMPERATURE', '0.7')),
    };

    // Casual (碎碎念) chat mode can use a lighter/faster model: the default
    // model may be a reasoning model whose thinking chain makes a 40-char
    // murmur reply take 10-20s. Configured via LLM_MODEL_CASUAL.
    const casual = this.configService.get<string>('LLM_MODEL_CASUAL', '').trim();
    this.casualModel = casual && casual !== this.config.model ? casual : undefined;

    // English practice can use a dedicated fast model for low-latency voice
    // turns. Falls back to the casual model when LLM_MODEL_ENGLISH is unset.
    const english = this.configService.get<string>('LLM_MODEL_ENGLISH', '').trim();
    this.englishModel = english && english !== this.config.model ? english : this.casualModel;

    // Intent classification wants a fast, cheap model. Defaults to the casual
    // model so it stays low-latency; LLM_MODEL_INTENT can pin a dedicated one.
    const intent = this.configService.get<string>('LLM_MODEL_INTENT', '').trim();
    this.intentModel = intent && intent !== this.config.model ? intent : this.casualModel;

    // Visual QA / asset admission need a vision-capable model. It can live on a
    // different gateway than the text models, hence its own base url / key.
    const vision = this.configService.get<string>('LLM_VISION_MODEL', '').trim();
    this.visionModel = vision || undefined;

    // Authoring (storyboard + figure) can pin a model without touching the
    // global chat model: the QA bench and the figure channel disagree on which
    // model is best, and chat must not follow that decision.
    const author = this.configService.get<string>('LLM_AUTHOR_MODEL', '').trim();
    this.authorModel = author && author !== this.config.model ? author : undefined;

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
    } finally {
      this.resolveReady();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // pi-ai initialization
  // ─────────────────────────────────────────────────────────────────

  private async initializePiAi() {
    const piAi = await import('@earendil-works/pi-ai');

    const configs = this.buildProviderConfigs();
    const models = piAi.createModels();

    // Use lazyApi to wrap the dynamic API module import
    const apiStreams = piAi.lazyApi(
      // @ts-expect-error — ESM subpath export, works at runtime via dynamic import
      () => import('@earendil-works/pi-ai/api/openai-completions') as Promise<any>,
    );

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
            input: pc.input ?? ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: pc.maxTokens,
          },
        ],
        // Use lazyApi to wrap the dynamic API module import
        api: apiStreams,
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

    // Casual-mode provider entry (same gateway, lighter model)
    if (this.casualModel) {
      configs.push({
        id: `${primaryId}-casual`,
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        model: this.casualModel,
        maxTokens: Number(this.configService.get<string>('LLM_CASUAL_MAX_TOKENS', '1024')),
        temperature: Number(this.configService.get<string>('LLM_CASUAL_TEMPERATURE', '0.9')),
      });
    }

    // English-practice provider entry. Skip when it reuses the casual model —
    // selectEntries matches by model id, so the casual entry already covers it.
    if (this.englishModel && this.englishModel !== this.casualModel) {
      configs.push({
        id: `${primaryId}-english`,
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        model: this.englishModel,
        maxTokens: Number(this.configService.get<string>('LLM_ENGLISH_MAX_TOKENS', '1024')),
        temperature: Number(this.configService.get<string>('LLM_ENGLISH_TEMPERATURE', '0.7')),
      });
    }

    // Intent-classifier provider entry. Skip when it reuses an already-registered
    // model id (casual/english) — selectEntries matches by model id.
    if (
      this.intentModel &&
      this.intentModel !== this.casualModel &&
      this.intentModel !== this.englishModel
    ) {
      configs.push({
        id: `${primaryId}-intent`,
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        model: this.intentModel,
        maxTokens: Number(this.configService.get<string>('INTENT_LLM_MAX_TOKENS', '256')),
        temperature: 0,
      });
    }

    // Authoring provider entry. Skip when it reuses an already-registered model
    // id (selectEntries matches by model id).
    if (
      this.authorModel &&
      this.authorModel !== this.config.model &&
      this.authorModel !== this.casualModel &&
      this.authorModel !== this.englishModel &&
      this.authorModel !== this.intentModel
    ) {
      configs.push({
        id: `${primaryId}-author`,
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        model: this.authorModel,
        maxTokens: Number(this.configService.get<string>('LLM_AUTHOR_MAX_TOKENS', '32000')),
        temperature: 0.7,
      });
    }

    // Vision provider entry. Skip when it reuses an already-registered model id
    // (selectEntries matches by model id); that entry gets image input below.
    if (
      this.visionModel &&
      this.visionModel !== this.config.model &&
      this.visionModel !== this.casualModel &&
      this.visionModel !== this.englishModel &&
      this.visionModel !== this.intentModel
    ) {
      configs.push({
        id: this.configService.get<string>('LLM_VISION_PROVIDER', `${primaryId}-vision`),
        apiKey: this.configService.get<string>('LLM_VISION_API_KEY', this.config.apiKey),
        baseUrl: this.configService.get<string>('LLM_VISION_BASE_URL', this.config.baseUrl),
        model: this.visionModel,
        maxTokens: Number(this.configService.get<string>('LLM_VISION_MAX_TOKENS', '4096')),
        temperature: Number(this.configService.get<string>('LLM_VISION_TEMPERATURE', '0.2')),
        input: ['text', 'image'],
      });
    }

    // Any entry serving the vision model must accept image input.
    for (const c of configs) {
      if (c.model === this.visionModel) c.input = ['text', 'image'];
    }

    return configs;
  }

  // ─────────────────────────────────────────────────────────────────
  // ILlmClient implementation
  // ─────────────────────────────────────────────────────────────────

  get isConfigured(): boolean {
    return this.piAiEnabled || Boolean(this.config.baseUrl && this.config.model);
  }

  /**
   * 单次调用默认硬超时。
   *
   * 300s 是给"正常快"的调用留的余量；慢到需要更久的长输出应当走 generateStreaming
   * （超时按增量静默计），而不是把这里调成 10 分钟——那会让一次真正卡住的请求
   * 白白占住队列 worker 十分钟以上，后面排队的课全部干等。
   */
  private get callTimeoutMs(): number {
    const raw = Number(this.configService.get<string>('LLM_TIMEOUT_MS', ''));
    if (Number.isFinite(raw) && raw >= 10_000) return raw;
    return 300_000;
  }

  async chatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    _forceToolChoice?: boolean,
    modelOverride?: string,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    await this.ready;
    this.logger.debug(`chatCompletion model=${modelOverride ?? this.config.model}`);
    const safeMessages = this.sanitizeToolMessageSequence(messages);
    if (this.piAiEnabled) {
      return this.piAiChatCompletion(safeMessages, tools, maxTokensOverride, modelOverride, options);
    }
    return this.legacyChatCompletion(
      safeMessages,
      tools,
      maxTokensOverride,
      _forceToolChoice,
      modelOverride,
      options,
    );
  }

  async *chatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    modelOverride?: string,
    idleTimeoutMs?: number,
    maxTokensOverride?: number,
  ): AsyncGenerator<string> {
    await this.ready;
    const idle = idleTimeoutMs ?? this.callTimeoutMs;
    this.logger.debug(`chatCompletionStream model=${modelOverride ?? this.config.model} idle=${idle}ms`);
    const safeMessages = this.sanitizeToolMessageSequence(messages);
    if (this.piAiEnabled) {
      yield* this.piAiChatCompletionStream(
        safeMessages,
        tools,
        modelOverride,
        idle,
        maxTokensOverride,
      );
      return;
    }
    yield* this.legacyChatCompletionStream(
      safeMessages,
      tools,
      modelOverride,
      idle,
      maxTokensOverride,
    );
  }

  /**
   * 流式生成并累积成交付给调用方的完整文本。
   *
   * 只保留正文：思考型模型的 reasoning 走的是另一个增量通道，`chatCompletionStream`
   * 本来就不 yield 它，所以累积出来的就是可解析的 JSON（仍需 stripThinking 兜底，
   * 有些网关会把 <thinking> 混在 text_delta 里）。
   */
  async generateStreaming(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCallOptions,
  ): Promise<string> {
    const messages: LlmMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const idle = options?.idleTimeoutMs ?? options?.timeoutMs ?? this.callTimeoutMs;
    const chunks: string[] = [];
    for await (const delta of this.chatCompletionStream(
      messages,
      undefined,
      options?.model,
      idle,
      options?.maxTokens,
    )) {
      chunks.push(delta);
    }
    return stripThinking(chunks.join(''));
  }

  /**
   * Enforce a provider-valid tool-call sequence before sending to an LLM.
   *
   * Strict providers (MiniMax error 2013, OpenAI strict validation) reject:
   *  - a `tool` result with no preceding assistant `tool_calls` (orphan);
   *  - a `tool` result that does not IMMEDIATELY follow its assistant call
   *    (a user/system message wedged between them, e.g. from history
   *    compaction or prefix re-injection);
   *  - an assistant `tool_calls` whose results were truncated away.
   *
   * Strategy: linear rebuild. For each assistant message carrying tool_calls,
   * look at the consecutive run of `tool` messages after it; keep the call +
   * its results only if that run covers every tool_call id (first occurrence
   * wins for duplicates); otherwise strip the tool_calls and drop the run.
   * Orphan tool results anywhere else are dropped.
   */
  private sanitizeToolMessageSequence(messages: LlmMessage[]): LlmMessage[] {
    const hasToolTraffic = messages.some(
      (m) => m.role === 'tool' || (m.role === 'assistant' && m.toolCalls),
    );
    if (!hasToolTraffic) return messages;

    const out: LlmMessage[] = [];
    let dropped = 0;
    let seq = 0;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];

      if (m.role === 'tool') {
        dropped++; // orphan here: not preceded by an assistant(tool_calls) we handled
        continue;
      }

      const calls =
        m.role === 'assistant' && m.toolCalls ? (m.toolCalls as Array<{ id?: string }>) : null;
      if (!calls || calls.length === 0) {
        out.push(m);
        continue;
      }

      const callIds = calls.map((tc) => tc?.id).filter((id): id is string => Boolean(id));
      const wantIds = new Set(callIds);

      // Find the consecutive run of tool results right after this assistant.
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') j++;
      const runStart = i + 1;
      const runEnd = j; // exclusive

      // Keep only results that reference one of this assistant's calls
      // (first occurrence wins for duplicates).
      const validResults: LlmMessage[] = [];
      const seenOrig = new Set<string>();
      for (let k = runStart; k < runEnd; k++) {
        const t = messages[k];
        const tid = t.toolCallId as string;
        if (!tid || !wantIds.has(tid) || seenOrig.has(tid)) {
          dropped++;
          continue;
        }
        seenOrig.add(tid);
        validResults.push(t);
      }

      if (callIds.length > 0 && validResults.length === callIds.length) {
        // Rewrite ids to globally-unique values: strict providers (MiniMax
        // 2013) match results to calls by id across the WHOLE conversation,
        // so repeated ids from a tool-loop (e.g. "call_0_..." every round)
        // collide and get rejected.
        const newIds = calls.map(() => `tcall_${seq++}`);

        // Split parallel tool calls into sequential single-call rounds:
        // the MiniMax gateway rejects any assistant message carrying more
        // than one tool_calls entry ("tool call result does not follow tool
        // call", 2013) even when ids are unique and results are adjacent.
        // A(call)+result+A(call)+result is protocol-valid and semantically
        // equivalent for every provider.
        for (let idx = 0; idx < calls.length; idx++) {
          out.push({ ...m, toolCalls: [{ ...calls[idx], id: newIds[idx] }] });
          out.push({ ...validResults[idx], toolCallId: newIds[idx] });
        }
        i = runEnd - 1;
      } else {
        // Results incomplete (truncated) or not adjacent: strip the calls,
        // keep the assistant text, and drop the whole result run.
        dropped += runEnd - runStart;
        out.push({ ...m, toolCalls: undefined });
        i = runEnd - 1;
      }
    }

    if (dropped > 0) {
      this.logger.warn(
        `sanitizeToolMessageSequence: repaired/dropped ${dropped} tool message(s) to satisfy strict provider validation`,
      );
    }
    return out;
  }

  async generate(prompt: string, systemPrompt?: string, options?: LlmCallOptions): Promise<string> {
    return this.generateWithOptions(prompt, systemPrompt, options);
  }

  async generateJson(
    prompt: string,
    systemPrompt = 'You output strict JSON only. No markdown, no explanations.',
    options: LlmCallOptions = {},
  ): Promise<string> {
    return this.generateWithOptions(prompt, systemPrompt, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 12000,
      model: options.model,
    });
  }

  private async generateWithOptions(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCallOptions,
  ): Promise<string> {
    const messages: LlmMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    // Start at the requested budget (if any), then escalate on truncation
    const tokenLimits = options?.maxTokens
      ? [options.maxTokens, ...this.ESCALATING_TOKEN_LIMITS.filter((l) => l > options.maxTokens!)]
      : this.ESCALATING_TOKEN_LIMITS;

    // Try with escalating max_tokens when finish_reason === 'length' (Claude Code pattern)
    for (const tokenLimit of tokenLimits) {
      const response = await this.chatCompletionWithTokenLimit(messages, tokenLimit, options);
      const raw = response.content ?? '';
      const result = stripThinking(raw);

      if (
        response.finishReason === 'length' &&
        tokenLimit < tokenLimits[tokenLimits.length - 1]
      ) {
        this.logger.debug(`generate() hit token limit (${tokenLimit}), escalating to next tier...`);
        continue;
      }

      if (response.finishReason === 'length' && result) {
        const salvaged = this.tryPartialJsonSalvage(result);
        if (salvaged) {
          this.logger.debug('generate() salvaged partial JSON from truncated response');
          return salvaged;
        }
      }

      if (result) return result;

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
          const retry = await this.chatCompletion(
            retryMessages,
            undefined,
            undefined,
            undefined,
            undefined,
            options,
          );
          const retryResult = stripThinking(retry.content ?? '');
          return retryResult;
        } catch (err: any) {
          this.logger.debug(`generate() retry failed: ${err.message}`);
        }
      }

      return result;
    }

    const finalResponse = await this.chatCompletion(
      messages,
      undefined,
      undefined,
      undefined,
      undefined,
      options,
    );
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
    modelOverride?: string,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    let lastError: Error | null = null;

    const candidates = this.selectEntries(modelOverride);
    for (const entry of candidates) {
      try {
        const result = await this.callProvider(entry, messages, tools, maxTokensOverride, options);
        return result;
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `Provider ${entry.config.id} failed: ${err.message}${candidates.length > 1 ? ', trying next...' : ''}`,
        );
      }
    }

    throw lastError ?? new Error('All providers failed');
  }

  /**
   * Choose provider entries for a call: when modelOverride matches a
   * registered entry, that entry goes first; otherwise all entries in
   * registration order (primary → fallback → casual).
   */
  private selectEntries(modelOverride?: string): ProviderEntry[] {
    if (!modelOverride) return this.entries;
    const matched = this.entries.filter((e) => e.config.model === modelOverride);
    if (matched.length === 0) {
      this.logger.warn(`modelOverride "${modelOverride}" has no registered entry, using default`);
      return this.entries;
    }
    return [...matched, ...this.entries.filter((e) => e.config.model !== modelOverride)];
  }

  /**
   * Fold system messages into the one `systemPrompt` pi-ai accepts.
   *
   * The previous code took `find(role === 'system')` and dropped every
   * other system message with `filter`. That silently discarded any
   * additional one — notably the rolling-summary note
   * `ConversationService` prefixes onto a truncated history, which made
   * summaries invisible on pi-ai providers while working on the legacy
   * OpenAI path. Joining keeps all of them, in order.
   */
  private splitSystemMessages(messages: LlmMessage[]): {
    systemPrompt: string | undefined;
    nonSystemMessages: LlmMessage[];
  } {
    const parts = messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .filter(Boolean);
    return {
      systemPrompt: parts.length > 0 ? parts.join('\n\n') : undefined,
      nonSystemMessages: messages.filter((m) => m.role !== 'system'),
    };
  }

  /**
   * Call a single provider via pi-ai's Models.complete().
   */
  private async callProvider(
    entry: ProviderEntry,
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    if (!this.models) throw new Error('pi-ai not initialized');

    const { systemPrompt, nonSystemMessages } = this.splitSystemMessages(messages);

    const context: any = {
      systemPrompt,
      messages: nonSystemMessages.map((m) => this.toPiAiMessage(m, messages)),
      tools: tools?.map((t) => this.toPiAiTool(t)),
    };

    const TIMEOUT_MS = options?.timeoutMs ?? this.callTimeoutMs;
    const result = await Promise.race([
      this.models.complete(entry.model, context, {
        maxTokens: maxTokensOverride ?? entry.config.maxTokens,
        temperature: options?.temperature ?? entry.config.temperature,
        timeoutMs: TIMEOUT_MS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`LLM call timed out (${TIMEOUT_MS}ms) for provider ${entry.config.id}`),
            ),
          TIMEOUT_MS,
        ),
      ),
    ]);

    return this.fromPiAiResponse(result);
  }

  /**
   * Streaming chat completion via pi-ai.
   * Yields text delta tokens from the pi-ai event stream.
   */
  private async *piAiChatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    modelOverride?: string,
    idleTimeoutMs?: number,
    maxTokensOverride?: number,
  ): AsyncGenerator<string> {
    if (!this.models || this.entries.length === 0) {
      throw new Error('pi-ai not initialized');
    }

    const entry = this.selectEntries(modelOverride)[0];

    const { systemPrompt, nonSystemMessages } = this.splitSystemMessages(messages);

    const context: any = {
      systemPrompt,
      messages: nonSystemMessages.map((m) => this.toPiAiMessage(m, messages)),
      tools: tools?.map((t) => this.toPiAiTool(t)),
    };

    // 这里的超时是"两次增量之间"的静默上限，不是整条流的总时长。
    // 慢模型吐 2 万 token 要十几分钟，只要还在吐就不该判死。
    const TIMEOUT_MS = idleTimeoutMs ?? this.callTimeoutMs;
    const stream = this.models.stream(entry.model, context, {
      maxTokens: maxTokensOverride ?? entry.config.maxTokens,
      temperature: entry.config.temperature,
      timeoutMs: TIMEOUT_MS,
    });

    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (true) {
        const { value, done } = await this.nextWithIdleTimeout(
          iterator,
          TIMEOUT_MS,
          `LLM stream stalled for ${TIMEOUT_MS}ms (provider ${entry.config.id})`,
        );
        if (done) break;
        if (value.type === 'text_delta') {
          yield value.delta;
        }
      }
    } finally {
      // 超时/调用方提前 return 时把上游流关掉，别让连接挂在服务端。
      // 注意不能 await：流卡死时上游 generator 自己也卡在 await 上，
      // 它的 return() 一样不会 settle，await 就把清理变成了新的挂死点
      // （单测里复现过：idle 超时抛出后进程再也回不来）。
      this.closeQuietly(iterator);
    }
  }

  /** 尽力关闭上游流：不等待、不抛错，只为释放连接。 */
  private closeQuietly(iterator: AsyncIterator<any>): void {
    try {
      void Promise.resolve(iterator.return?.(undefined as any)).catch(() => {});
    } catch {
      /* 上游不支持 return —— 忽略 */
    }
  }

  /**
   * 取下一个增量，并在"静默过久"时失败。
   *
   * 三个细节都不能省：
   * - clearTimeout：每个 chunk 一个 timer 且不清理，长流会攒出几百个 pending
   *   timer（实测 20k token ≈ 3000 chunks），进程退出被拖住、句柄也一直涨。
   * - 超时后由调用方 iterator.return() 收尾，否则挂着的 next() 永远不 settle。
   * - 报错文案带 "stalled"，与"整次调用超时"区分开：前者是流断了，后者是
   *   请求根本没在被处理，排查方向完全不同。
   */
  private nextWithIdleTimeout<T>(
    iterator: AsyncIterator<T>,
    idleTimeoutMs: number,
    message: string,
  ): Promise<IteratorResult<T>> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), idleTimeoutMs);
    });
    return Promise.race([iterator.next(), timeout]).finally(() => clearTimeout(timer));
  }

  // ─── Type conversion: LlmMessage ↔ pi-ai Message ─────────────────

  private toPiAiMessage(msg: LlmMessage, allMessages: LlmMessage[]): any {
    if (msg.role === 'user') {
      const content = msg.images?.length
        ? [
            ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
            ...msg.images.map((img) => ({
              type: 'image',
              data: img.data,
              mimeType: img.mimeType,
            })),
          ]
        : msg.content;
      return {
        role: 'user',
        content,
        timestamp: Date.now(),
      };
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
      };
    }

    if (msg.role === 'tool') {
      // Look up the tool name from the corresponding assistant message
      let toolName = '';
      if (msg.toolCallId) {
        for (const m of allMessages) {
          if (m.role === 'assistant' && m.toolCalls) {
            const tc = m.toolCalls.find((t: any) => t.id === msg.toolCallId);
            if (tc) {
              toolName = tc.function?.name || '';
              break;
            }
          }
        }
      }
      return {
        role: 'toolResult',
        toolCallId: msg.toolCallId || '',
        toolName,
        content: [{ type: 'text', text: msg.content || '' }],
        timestamp: Date.now(),
      };
    }

    return {
      role: 'user',
      content: msg.content,
      timestamp: Date.now(),
    };
  }

  private toPiAiTool(tool: LlmToolDefinition): any {
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    };
  }

  /**
   * Recover tool calls that a model/gateway emitted as XML text in `content`
   * rather than the OpenAI `tool_calls` field. Recognized shape:
   *   <tool_call>
   *     <function=name>
   *       <parameter=key>value</parameter>
   *     </function>
   *   </tool_call>
   * Multiple <tool_call> blocks and repeated <parameter> tags are supported.
   * If no XML tool call is found the original response is returned untouched.
   */
  private recoverXmlToolCalls(
    content: string | null,
    existing?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>,
  ): {
    content: string | null;
    toolCalls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  } {
    if (existing?.length || !content || !content.includes('<tool_call>')) {
      return { content, toolCalls: existing };
    }
    const blockRe = /<tool_call>\s*<function=([^>\s]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/g;
    const paramRe = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];
    let block: RegExpExecArray | null;
    while ((block = blockRe.exec(content)) !== null) {
      const name = block[1]?.trim();
      if (!name) continue;
      const args: Record<string, string> = {};
      let param: RegExpExecArray | null;
      paramRe.lastIndex = 0;
      while ((param = paramRe.exec(block[2])) !== null) {
        const key = param[1]?.trim();
        if (key) args[key] = param[2]?.trim() ?? '';
      }
      toolCalls.push({
        id: `xml_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      });
    }
    if (!toolCalls.length) return { content, toolCalls: existing };
    this.logger.warn(
      `Recovered ${toolCalls.length} XML tool call(s) from model content: ${toolCalls.map((t) => t.function.name).join(', ')}`,
    );
    // Strip only the XML blocks; keep any other natural-language text.
    const remaining = content.replace(blockRe, '').trim();
    return { content: remaining || null, toolCalls };
  }

  private fromPiAiResponse(result: any): LlmResponse {
    const textContent = result.content?.find((c: any) => c.type === 'text');
    const content = textContent?.text ?? null;

    const toolCalls = result.content
      ?.filter((c: any) => c.type === 'toolCall')
      ?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

    const usage = result.usage
      ? {
          promptTokens: result.usage.input,
          completionTokens: result.usage.output,
        }
      : undefined;

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

    const recovered = this.recoverXmlToolCalls(content, toolCalls);
    return {
      content: recovered.content,
      toolCalls: recovered.toolCalls,
      usage,
      finishReason: recovered.toolCalls?.length ? 'tool_calls' : finishReason,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Legacy OpenAI SDK implementation (fallback when pi-ai unavailable)
  // ─────────────────────────────────────────────────────────────────

  private readonly ESCALATING_TOKEN_LIMITS = [4096, 8192, 16384];

  private toOpenAIMessages(messages: LlmMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        // Strict providers require a string content on tool results.
        const content =
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
        return {
          role: 'tool' as const,
          content,
          tool_call_id: msg.toolCallId,
        } as any;
      }
      if (msg.role === 'assistant' && msg.toolCalls) {
        // Assistant messages carrying tool_calls must have null (not '') content.
        const content =
          msg.content === undefined || msg.content === null || msg.content === ''
            ? null
            : msg.content;
        return {
          role: 'assistant' as const,
          content,
          tool_calls: msg.toolCalls,
        } as any;
      }
      if (msg.images?.length && (msg.role === 'user' || msg.role === 'system')) {
        return {
          role: msg.role as any,
          content: [
            ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
            ...msg.images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ],
        } as any;
      }
      return {
        role: msg.role as any,
        content: msg.content,
      } as any;
    });
  }

  private toOpenAITools(tools?: LlmToolDefinition[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools as any;
  }

  private async legacyChatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    _forceToolChoice?: boolean,
    modelOverride?: string,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    // Debug aid: dump the message shape actually being sent, one line per
    // message, to diagnose strict-provider validation errors (MiniMax 2013).
    this.logger.debug(
      `LLM request dump (${messages.length} msgs): ${messages
        .map((m) => {
          const ct =
            typeof m.content === 'string'
              ? `str(${(m.content || '').length})`
              : Array.isArray(m.content as any)
                ? `parts(${(m.content as any).length})`
                : m.content === null
                  ? 'null'
                  : typeof m.content;
          const tcs = (m as any).toolCalls?.map?.((t: any) => t.id).join(',') || '';
          return `${m.role}${tcs ? `[calls:${tcs}]` : ''}[${m.toolCallId ? `res:${m.toolCallId}` : ''}](${ct})`;
        })
        .join(' -> ')}`,
    );
    return this.retryStrategy.execute(async () => {
      const TIMEOUT_MS = options?.timeoutMs ?? this.callTimeoutMs;
      const effectiveMaxTokens = maxTokensOverride ?? this.config.maxTokens;
      const response = (await Promise.race([
        this.client.chat.completions.create(
          {
            model: modelOverride ?? this.config.model,
            messages: this.toOpenAIMessages(messages),
            tools: this.toOpenAITools(tools),
            tool_choice: tools ? 'auto' : undefined,
            parallel_tool_calls: false,
            max_tokens: effectiveMaxTokens,
            temperature: options?.temperature ?? this.config.temperature,
          },
          { timeout: TIMEOUT_MS },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`LLM call timed out (${TIMEOUT_MS}ms) for ${this.config.model}`)),
            TIMEOUT_MS,
          ),
        ),
      ])) as ChatCompletion;

      const choice = response.choices[0];
      const rawContent = choice?.message?.content ?? null;
      const standardToolCalls = choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: (tc as any).function?.name,
          arguments: (tc as any).function?.arguments,
        },
      }));
      // Some gateways/models occasionally serialize tool calls as XML text in
      // `content` instead of the standard `tool_calls` field. Normalize those
      // so downstream agents can execute them instead of echoing raw markup.
      const recovered = this.recoverXmlToolCalls(rawContent, standardToolCalls);
      return {
        content: recovered.content,
        toolCalls: recovered.toolCalls,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
            }
          : undefined,
        finishReason: recovered.toolCalls?.length
          ? 'tool_calls'
          : choice?.finish_reason ?? undefined,
      };
    }, 'chatCompletion');
  }

  private async *legacyChatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    modelOverride?: string,
    idleTimeoutMs?: number,
    maxTokensOverride?: number,
  ): AsyncGenerator<string> {
    // 与 pi-ai 分支同语义：这是"两次增量之间的静默上限"，不是整条流的总时长。
    const TIMEOUT_MS = idleTimeoutMs ?? this.callTimeoutMs;
    const stream = await this.client.chat.completions.create(
      {
        model: modelOverride ?? this.config.model,
        messages: this.toOpenAIMessages(messages),
        tools: this.toOpenAITools(tools),
        tool_choice: tools ? 'auto' : undefined,
        max_tokens: maxTokensOverride ?? this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      },
      { timeout: TIMEOUT_MS },
    );

    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (true) {
        const { value, done } = await this.nextWithIdleTimeout(
          iterator,
          TIMEOUT_MS,
          `LLM stream stalled for ${TIMEOUT_MS}ms (model ${modelOverride ?? this.config.model})`,
        );
        if (done) break;
        const content = value.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      this.logger.error(`LLM stream failed: ${error.message}`);
      throw error;
    } finally {
      this.closeQuietly(iterator);
    }
  }

  private async chatCompletionWithTokenLimit(
    messages: LlmMessage[],
    maxTokens: number,
    options?: LlmCallOptions,
  ): Promise<LlmResponse> {
    await this.ready;
    return this.retryStrategy.execute(async () => {
      if (this.piAiEnabled) {
        return this.piAiChatCompletion(messages, undefined, maxTokens, options?.model, options);
      }
      const TIMEOUT_MS = options?.timeoutMs ?? this.callTimeoutMs;
      const response = (await Promise.race([
        this.client.chat.completions.create(
          {
            model: options?.model ?? this.config.model,
            messages: this.toOpenAIMessages(messages),
            max_tokens: maxTokens,
            temperature: options?.temperature ?? this.config.temperature,
          },
          { timeout: TIMEOUT_MS },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`LLM call timed out (${TIMEOUT_MS}ms) for ${this.config.model}`)),
            TIMEOUT_MS,
          ),
        ),
      ])) as ChatCompletion;

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

  private tryPartialJsonSalvage(text: string): string | null {
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;

    try {
      JSON.parse(text.slice(firstBrace));
      return text;
    } catch {
      /* continue */
    }

    const sliced = text.slice(firstBrace);
    const attempts = [
      () => sliced + '}',
      () => sliced.replace(/,\s*$/, '') + '}',
      () => sliced.replace(/"[^"]*$/, '"') + '}',
      () => sliced.replace(/,\s*"[^"]*$/, '') + '}',
      () => sliced.replace(/,\s*\{[^}]*$/, '') + '}',
      () => sliced.replace(/,\s*\[[^\]]*$/, '') + '}',
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
