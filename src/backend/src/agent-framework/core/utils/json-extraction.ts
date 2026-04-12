/**
 * Unified JSON extraction from LLM outputs.
 *
 * Eliminates duplication across generate-activity.ts, generate-video-data.ts,
 * generate-quiz.ts, and agent-executor.ts — all of which had their own
 * JSON extraction logic.
 *
 * Tries in order:
 * 1. Direct JSON.parse of the trimmed text
 * 2. Extract from ```json ... ``` code block
 * 3. Extract from ``` ... ``` code block
 * 4. Slice between first { and last } (or [ and ])
 */

/** Attempt to extract and parse a JSON object from raw LLM text */
export function extractJsonObject<T extends Record<string, any> = Record<string, any>>(
  text: string,
): T | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // 1. Direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  // 2. ```json code block
  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  // 3. Generic code block
  const codeBlockMatch = trimmed.match(/```\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* continue */ }
  }

  // 4. Brace slice — find outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace !== -1) {
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      try {
        const sliced = trimmed.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(sliced);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* continue */ }
    }
  }

  return null;
}

/** Attempt to extract and parse a JSON array from raw LLM text */
export function extractJsonArray<T = any>(text: string): T[] | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  // 1. Direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  // 2. Code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  // 3. Bracket slice
  const firstBracket = trimmed.indexOf('[');
  if (firstBracket !== -1) {
    const lastBracket = trimmed.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      try {
        const sliced = trimmed.slice(firstBracket, lastBracket + 1);
        const parsed = JSON.parse(sliced);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  return null;
}

/** Quick check: does the text look like it contains JSON? */
export function containsJson(text: string): boolean {
  return /[{[]/.test(text);
}
