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
  ): Promise<LlmResponse>;

  /** Streaming chat completion — yields content chunks */
  chatCompletionStream(
    messages: LlmMessage[],
    tools?: LlmToolDefinition[],
  ): AsyncGenerator<string>;

  /** Secondary call for structured content generation (quizzes, activities, etc.) */
  generate(prompt: string, systemPrompt?: string): Promise<string>;

  /** Estimate token count for a text string */
  estimateTokenCount(text: string): number;

  /** Check if the LLM client is properly configured */
  readonly isConfigured: boolean;
}
