/**
 * Unified thinking-block parser for LLM outputs.
 *
 * Handles the MiniMax reasoning format: <think\n...reasoning...\n</think->\n\nanswer
 * Also handles standard <think...</think-> blocks from other models.
 *
 * Eliminates duplication across agent-executor.ts and llm-client.ts.
 */

/** Strip all <think...</think*> blocks from model output, returning visible content only */
export function stripThinking(text: string): string {
  if (!text) return "";
  // Remove all closed <think...>...</think*> blocks
  let result = text.replace(/<think\b[\s\S]*?<\/think.*?>/g, "").trim();
  // Handle unclosed <think at end of string
  result = result.replace(/<think\b[\s\S]*$/g, "").trim();
  return result;
}

/** Extract the reasoning content inside <think...</think*> blocks */
export function extractThinking(text: string): string {
  if (!text) return "";

  // Standard: <think ...>content</think...>
  const standardMatch = text.match(/<think\b[^>]*>([\s\S]*?)<\/think.*?>/);
  if (standardMatch?.[1]) return standardMatch[1].trim();

  // MiniMax: <think\ncontent\n</think-> (no closing > on opening tag)
  const minimaxMatch = text.match(/<think\b([\s\S]*?)<\/think.*?>/);
  if (minimaxMatch?.[1]) return minimaxMatch[1].trim();

  // Unclosed <think at end of string
  const unclosedMatch = text.match(/<think\b([\s\S]*)$/);
  if (unclosedMatch?.[1]) return unclosedMatch[1].trim();

  return "";
}

/** Check if text contains thinking blocks */
export function hasThinkingBlock(text: string): boolean {
  return /<think\b/.test(text);
}
