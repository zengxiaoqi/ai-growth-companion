/**
 * Intent layer types — single source of truth for the per-turn intent taxonomy.
 *
 * Mirrors the CHAT_MODES / ACTIVITY_TYPES pattern: const tuple → union → Set →
 * guard. The classifier produces an IntentDecision; the orchestrator uses
 * `tools` to gate what the model may call this turn, and the executor uses
 * `slots` to bind verbatim user text into tool arguments.
 */

export const INTENT_KINDS = [
  'play_music',
  'play_story',
  'translate',
  'do_activity',
  'learn_explore',
  'plain_chat',
  'parent_report',
  'parent_control',
  'open',
] as const;

export type IntentKind = (typeof INTENT_KINDS)[number];

export const INTENT_KIND_SET: ReadonlySet<string> = new Set<string>(INTENT_KINDS);

export function isIntentKind(value: unknown): value is IntentKind {
  return typeof value === 'string' && INTENT_KIND_SET.has(value);
}

/** How the decision was reached — rule hit, LLM fallback, or safe default. */
export type IntentSource = 'rule' | 'llm' | 'fallback';

/** Static description of one intent in the catalog. */
export interface IntentDescriptor {
  /** Human-readable label (used in the classifier prompt). */
  label: string;
  /**
   * Tools this intent may call. `null` means "do not gate" (composite / course /
   * video / fallback): the agent's full filtered list is offered as before.
   * `[]` means "no tools at all" (plain chat).
   */
  tools: string[] | null;
  /** Skills relevant to this intent (declarative; loadSkill stays in tools). */
  skills?: string[];
  /** Slot key captured verbatim from the user turn, when this intent has one. */
  slot?: string;
}

/** The classifier's verdict for one user turn. */
export interface IntentDecision {
  intent: IntentKind;
  /** Mirrors INTENT_CATALOG[intent].tools — null = ungated, [] = no tools. */
  tools: string[] | null;
  /** Verbatim user substrings keyed by slot name (e.g. { song_title: '<用户说的歌名>' }). */
  slots?: Record<string, string>;
  source: IntentSource;
}