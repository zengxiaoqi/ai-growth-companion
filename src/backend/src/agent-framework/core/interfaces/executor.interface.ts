/**
 * Executor interface — the core agent execution loop.
 */

import type { AgentContext, ExecutionResult } from "./agent.interface";
import type { StreamEvent } from "../types";

/** The agent executor interface */
export interface IAgentExecutor {
  /**
   * Run the agent loop synchronously.
   * Sends the user message to the LLM, handles tool calls in a loop,
   * and returns the final response.
   */
  execute(
    agentType: string,
    input: string,
    context: AgentContext,
  ): Promise<ExecutionResult>;

  /**
   * Run the agent loop with streaming.
   * Tool-call rounds are non-streaming; the final text response streams.
   * Yields StreamEvent objects for progress updates.
   */
  executeStream(
    agentType: string,
    input: string,
    context: AgentContext,
  ): AsyncGenerator<StreamEvent>;
}
