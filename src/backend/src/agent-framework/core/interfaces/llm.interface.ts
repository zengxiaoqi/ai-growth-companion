/**
 * LLM client interface — abstracts LLM communication.
 *
 * Implementations can wrap any OpenAI-compatible API
 * (Ollama, OpenAI, Azure, etc.)
 */

/** Base64-encoded image attached to a message (vision calls). */
export interface LlmImage {
  data: string;
  mimeType: string;
}

/** A single message in the LLM conversation */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Images ride alongside content; channels convert them to their own part format. */
  images?: LlmImage[];
  toolCalls?: any[];
  toolCallId?: string;
}

/** A single tool definition in OpenAI function-calling format */
export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/** Non-streaming LLM response */
export interface LlmResponse {
  content: string | null;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason?: string;
}

/** Per-call overrides; undefined fields fall back to provider config */
export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  /** Scoped model override (e.g. LLM_AUTHOR_MODEL); undefined = provider default */
  model?: string;
  /**
   * 单次调用硬超时（毫秒）。undefined 时取 LLM_TIMEOUT_MS，默认 300000。
   *
   * 为什么可配：非流式调用把"生成完"和"超时"混在一个计时器里，而思考型
   * 模型吐 2 万 token 就要 5 分钟以上（实测 qwen3.8-max ≈ 65 tok/s）。
   * 需要长输出的调用方要么显式放宽这里，要么改用 generateStreaming ——
   * 后者的超时按"两次增量之间的静默"计，只要还在吐就不算超时。
   */
  timeoutMs?: number;
  /**
   * 流式调用时两次增量之间允许的最大静默（毫秒）。
   * undefined 时取 timeoutMs。用于区分"慢但活着"和"彻底卡住"。
   */
  idleTimeoutMs?: number;
}

/** Configuration for the LLM client */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

/** The LLM client interface */
export interface ILlmClient {
  /** Non-streaming chat completion */
  chatCompletion(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    maxTokensOverride?: number,
    forceToolChoice?: boolean,
    modelOverride?: string,
    options?: LlmCallOptions,
  ): Promise<LlmResponse>;

  /** Streaming chat completion — yields content chunks */
  chatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
    modelOverride?: string,
    /** 两次增量之间允许的最大静默；默认 300000 */
    idleTimeoutMs?: number,
    /** 输出预算覆盖；undefined 时用该 provider 的配置值 */
    maxTokensOverride?: number,
  ): AsyncGenerator<string>;

  /** Model for the casual (碎碎念) chat mode, when configured via LLM_MODEL_CASUAL */
  readonly casualModel?: string;

  /** Model for the english-practice mode, when configured via LLM_MODEL_ENGLISH */
  readonly englishModel?: string;

  /** Model for vision calls (visual QA / asset admission), when configured via LLM_VISION_MODEL */
  readonly visionModel?: string;

  /** Model for video authoring (storyboard / TSX creation), when configured via LLM_AUTHOR_MODEL */
  readonly authorModel?: string;

  /**
   * Secondary call for structured content generation (quizzes, activities, etc.)
   *
   * `options.maxTokens` 是给思考型模型用的逃生口：MiniMax-M3 这类模型会把
   * 一两万 token 花在 <think> 上，默认 16384 的升级上限根本到不了正文，
   * generate() 于是返回空串，调用方只能走兜底。需要长输出的调用方自己指定预算。
   */
  generate(prompt: string, systemPrompt?: string, options?: LlmCallOptions): Promise<string>;

  /** Structured JSON generation: low temperature + large token budget by default */
  generateJson(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCallOptions,
  ): Promise<string>;

  /**
   * 流式生成并累积成完整文本。
   *
   * 与 `generate()` 的区别只在超时语义：`generate()` 是"整次调用必须在 timeoutMs
   * 内完成"，这里是"两次增量之间不得静默超过 idleTimeoutMs"。思考型模型吐一份
   * 带 figure/sceneGraph/beats 的六幕分镜要 5 分钟以上，非流式只能靠无限放宽超时
   * 才能成功；流式则在"慢但活着"和"彻底卡住"之间分得清，卡住照样 90 秒失败。
   *
   * 返回的是已经 stripThinking 的正文；流式拿不到 finishReason，所以调用方仍需
   * 自己对结果做 JSON 解析与校验。
   */
  generateStreaming(
    prompt: string,
    systemPrompt?: string,
    options?: LlmCallOptions,
  ): Promise<string>;

  /** Estimate token count for a text string */
  estimateTokenCount(text: string): number;

  /** Check if the LLM client is properly configured */
  readonly isConfigured: boolean;
}
