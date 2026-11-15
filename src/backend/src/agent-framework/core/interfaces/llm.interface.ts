/**
 * LLM client interface — abstracts LLM communication.
 *
 * Implementations can wrap any OpenAI-compatible API
 * (Ollama, OpenAI, Azure, etc.)
 */

/** A single message in the LLM conversation */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
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
  ): AsyncGenerator<string>;

  /** Model for the casual (碎碎念) chat mode, when configured via LLM_MODEL_CASUAL */
  readonly casualModel?: string;

  /** Model for the english-practice mode, when configured via LLM_MODEL_ENGLISH */
  readonly englishModel?: string;

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

  /** Estimate token count for a text string */
  estimateTokenCount(text: string): number;

  /** Check if the LLM client is properly configured */
  readonly isConfigured: boolean;
}
