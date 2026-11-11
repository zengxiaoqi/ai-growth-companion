/**
 * Single source of truth for 碎碎念 casual-mode capabilities.
 *
 * - DEFAULT_CASUAL_TOOLS: enabled when neither the env var nor a per-child
 *   parent override specifies a set.
 * - CASUAL_TOOL_CATALOG: the curated, parent-toggleable tools shown in the
 *   parent-control UI. Per-child overrides are validated against this set,
 *   so a parent can only enable casual-appropriate tools (never course or
 *   video generation).
 *
 * The env var CASUAL_ALLOWED_TOOLS may name any registered tool; names the
 * registry does not know are simply ignored when the allowlist is filtered.
 */

export interface CasualToolDescriptor {
  name: string;
  label: string;
  description: string;
}

export const CASUAL_TOOL_CATALOG: CasualToolDescriptor[] = [
  { name: 'translate', label: '翻译', description: '中英互译，比如问"苹果用英语怎么说"' },
  { name: 'playStory', label: '讲故事', description: '讲一个适合孩子年龄的小故事' },
  { name: 'playMusic', label: '点歌', description: '孩子说想听歌时搜索并播放，比如"我想听小星星"' },
];

export const DEFAULT_CASUAL_TOOLS: string[] = ['translate', 'playStory', 'playMusic'];

export const CASUAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  CASUAL_TOOL_CATALOG.map((t) => t.name),
);

export function isCasualToolName(name: unknown): name is string {
  return typeof name === 'string' && CASUAL_TOOL_NAMES.has(name);
}

/**
 * Parse the CASUAL_ALLOWED_TOOLS env value into an allowlist. Unset/empty
 * falls back to the catalog default. Shared by the chat resolver and the
 * parent-control API so "inherit default" means the same thing everywhere.
 */
export function parseCasualToolsEnv(raw: string | undefined | null): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [...DEFAULT_CASUAL_TOOLS];
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}