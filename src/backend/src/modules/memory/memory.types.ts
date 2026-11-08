/**
 * Memory vocabulary shared by the write gates, the recall pipeline and the
 * two agent tools.
 *
 * Ported from 碎碎念 `memory/base.py` and `memory/extract.py`. The four
 * exits are the important part: `miss` and `degraded` are *not* failures
 * and must never be answered with a failure line.
 */

/** What kind of thing was remembered. */
export type MemoryKind = 'event' | 'topic' | 'detail' | 'preference';

/**
 * How private a memory is.
 *
 * `L2` is withheld from recall in the SQL query itself — not filtered out
 * after the rows are loaded — so no code path can accidentally surface a
 * secret by forgetting a check.
 */
export type Sensitivity = 'L0' | 'L1' | 'L2';

/** Which of the four exits the recall pipeline took. */
export type RecallOutcome = 'hit' | 'miss' | 'degraded' | 'first_day';

export interface MemoryHit {
  memoryId: number;
  verbatimQuote: string;
  content: string;
  occurredAt: string | null;
  score: number;
  kind: string;
  sensitivity: string;
}

export interface RecallResult {
  outcome: RecallOutcome;
  hits: MemoryHit[];
}

export function hit(hits: MemoryHit[]): RecallResult {
  return { outcome: 'hit', hits };
}

/** Nothing passed the gate: speak the honest-forgetting line. */
export function miss(): RecallResult {
  return { outcome: 'miss', hits: [] };
}

/** Retrieval timed out or the database failed. */
export function degraded(): RecallResult {
  return { outcome: 'degraded', hits: [] };
}

/** This child has no memories yet. */
export function firstDay(): RecallResult {
  return { outcome: 'first_day', hits: [] };
}

/** Why a candidate was refused, per gate. */
export type SaveRejection =
  | 'low_confidence'
  | 'quote_mismatch'
  | 'duplicate'
  | 'empty_content'
  | 'no_session';

export interface SaveResult {
  stored: boolean;
  reason?: SaveRejection;
  memoryId?: number;
  /** The substring that was actually found in the child's own words. */
  resolvedQuote?: string;
  /** Which tier the verbatim gate matched on. */
  tier?: 'exact' | 'normalized' | 'fuzzy';
  sensitivity?: Sensitivity;
}
