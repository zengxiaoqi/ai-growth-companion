/**
 * Safety vocabulary shared by the rule detector, the async classifier and
 * the chat entry point.
 *
 * Ported from 碎碎念 `agent/safety/base.py`. The names are kept identical
 * on purpose: the two projects write these rows into their own databases,
 * and a shared vocabulary is what makes the audit trails comparable.
 */

/** What kind of danger was signalled. */
export type SafetyCategory = 'self_harm' | 'violence' | 'danger';

/**
 * Severity carried by a flag.
 *
 * `watch` exists because the classifier deliberately runs at recall over
 * precision: a watch signal must not interrupt the child, only queue for
 * the parent.
 */
export type SafetyLevel = 'critical' | 'watch';

/** Which layer produced the flag. */
export type SafetySource = 'rules' | 'classifier';

export interface SafetyFlag {
  category: SafetyCategory;
  level: SafetyLevel;
  source: SafetySource;
  /**
   * Matched text, kept for the audit trail only.
   * Never read back to the child, never put in a notification body.
   */
  snippet: string;
}

/** The synchronous verdict for one incoming message. */
export interface SafetyVerdict {
  /** True when the rule layer hit and the LLM must not be called. */
  intercepted: boolean;
  /** Age-appropriate line to speak instead of a model answer. */
  reply?: string;
  flags: SafetyFlag[];
  /** Wall-clock cost of the local match, for the "&lt;10ms" promise. */
  latencyMs: number;
}

export const SAFETY_CATEGORIES: readonly SafetyCategory[] = [
  'self_harm',
  'violence',
  'danger',
];
