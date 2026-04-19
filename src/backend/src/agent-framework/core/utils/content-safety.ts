/**
 * Content safety utilities for filtering AI responses.
 *
 * Extracted from ContentSafetyService to be usable without NestJS DI.
 * Handles:
 * - Prohibited word filtering
 * - PII redaction (phone numbers, ID numbers)
 * - Encouragement text injection
 */

/** Prohibited words covering violence, fear, horror, and inappropriate content */
const PROHIBITED_WORDS: readonly string[] = [
  "杀",
  "打",
  "砍",
  "刺",
  "血",
  "死",
  "暴",
  "枪",
  "刀",
  "毒",
  "伤害",
  "攻击",
  "战斗",
  "武器",
  "炸弹",
  "谋杀",
  "复仇",
  "鬼",
  "魔",
  "噩梦",
  "恐怖",
  "惊悚",
  "幽灵",
  "诅咒",
  "赌博",
  "酗酒",
  "吸毒",
  "偷窃",
  "犯罪",
  "监狱",
];

/** PII patterns to redact */
const PII_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /1[3-9]\d{9}/g, replacement: "[已隐藏]" }, // Phone numbers
  { pattern: /\d{17}[\dXx]/g, replacement: "[已隐藏]" }, // ID numbers
  { pattern: /密码\s*[:：]\s*\S+/g, replacement: "密码: [已隐藏]" }, // Password patterns
];

/** Encouragement text appended when content is filtered */
const ENCOURAGEMENT_TEXT = "🌈 让我们一起学习美好的事物吧！";

export interface SafetyFilterResult {
  content: string;
  wasFiltered: boolean;
}

/** Filter prohibited words from content, replacing with *** */
export function filterProhibitedWords(text: string): string {
  let result = text;
  for (const word of PROHIBITED_WORDS) {
    result = result.split(word).join("***");
  }
  return result;
}

/** Redact PII patterns from content */
export function redactPii(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Check if content contains any prohibited words */
export function isContentSafe(text: string): boolean {
  return PROHIBITED_WORDS.every((word) => !text.includes(word));
}

/** Full safety filter: prohibited words + PII redaction + encouragement */
export function filterContent(text: string): SafetyFilterResult {
  const wordFiltered = filterProhibitedWords(text);
  const piiFiltered = redactPii(wordFiltered);
  const wasFiltered = wordFiltered !== text || piiFiltered !== wordFiltered;

  return {
    content: wasFiltered
      ? `${piiFiltered}\n\n${ENCOURAGEMENT_TEXT}`
      : piiFiltered,
    wasFiltered,
  };
}
