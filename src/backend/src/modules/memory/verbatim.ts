/**
 * The verbatim gate: proving a quote really is what the child said.
 *
 * Three tiers, in order — exact, normalized, fuzzy. This is what makes
 * "every quote is real" a code fact instead of a prompt instruction:
 *
 *  - A normalized match still returns the **original** slice of the
 *    transcript, so punctuation and full-width digits do not have to
 *    match, but the words do.
 *  - A fuzzy match only fires at 0.95 similarity and, even then, returns
 *    the transcript's own window — never the model's tidied version.
 *
 * Ported from 碎碎念 `memory/extract.py` (`normalize`, `resolve_quote`,
 * `_best_window`).
 */

const CHINESE_DIGITS = '〇一二三四五六七八九';

export interface Normalized {
  text: string;
  /** `index[i]` is the position in the source of normalized char `i`. */
  index: number[];
}

/**
 * Strip punctuation and spaces, unify width and digits for matching.
 *
 * The index map is what lets the gate hand back the original substring:
 * what gets stored is the transcript's text, never the model's tidying.
 */
export function normalize(source: string): Normalized {
  const out: string[] = [];
  const index: number[] = [];
  for (let position = 0; position < source.length; position++) {
    const char = source[position];
    let mapped = char;
    const code = char.charCodeAt(0);
    if (char >= '0' && char <= '9') {
      mapped = CHINESE_DIGITS[Number(char)];
    } else if (code >= 0xff10 && code <= 0xff19) {
      mapped = CHINESE_DIGITS[code - 0xff10];
    } else if (code >= 0xff21 && code <= 0xff5a) {
      // Full-width ASCII → ASCII.
      mapped = String.fromCharCode(code - 0xfee0);
    }
    if (!isAlnum(mapped)) continue;
    out.push(mapped);
    index.push(position);
  }
  return { text: out.join(''), index };
}

export interface QuoteMatch {
  /** The substring actually present in the transcript. */
  quote: string;
  tier: 'exact' | 'normalized' | 'fuzzy';
  /** Positions, in the caller's turn list, of every turn it was found in. */
  turnIndices: number[];
}

/**
 * Find `quote` in the transcript, returning the real substring.
 *
 * Returns null when the quote is not there and must be discarded.
 */
export function resolveQuote(quote: string, texts: string[], fuzzyRatio = 0.95): QuoteMatch | null {
  const trimmed = (quote ?? '').trim();
  if (!trimmed) return null;

  const exact: number[] = [];
  texts.forEach((text, i) => {
    if (text.includes(trimmed)) exact.push(i);
  });
  if (exact.length > 0) {
    return { quote: trimmed, tier: 'exact', turnIndices: exact };
  }

  const normalizedQuote = normalize(trimmed).text;
  if (normalizedQuote.length < 2) return null;

  const normalizedHit = normalizedMatches(normalizedQuote, texts);
  if (normalizedHit) {
    return {
      quote: normalizedHit.slices[0],
      tier: 'normalized',
      turnIndices: normalizedHit.indices,
    };
  }

  for (let i = 0; i < texts.length; i++) {
    const window = bestWindow(normalizedQuote, texts[i], fuzzyRatio);
    if (window != null) {
      return { quote: window, tier: 'fuzzy', turnIndices: [i] };
    }
  }
  return null;
}

/**
 * Every turn matching without punctuation/spacing, original slices.
 *
 * The slices may differ between turns (each keeps its own punctuation);
 * the first one is what gets stored, and the audit trail points at all
 * of them.
 */
export function normalizedMatches(
  normalizedQuote: string,
  texts: string[],
): { slices: string[]; indices: number[] } | null {
  const slices: string[] = [];
  const indices: number[] = [];
  texts.forEach((text, i) => {
    const normalizedText = normalize(text);
    const position = normalizedText.text.indexOf(normalizedQuote);
    if (position < 0) return;
    const start = normalizedText.index[position];
    const end = normalizedText.index[position + normalizedQuote.length - 1] + 1;
    slices.push(text.slice(start, end));
    indices.push(i);
  });
  return slices.length > 0 ? { slices, indices } : null;
}

/**
 * Closest substring of `text` at or above `ratio`, else null.
 *
 * Similarity is `2·LCS / (|a| + |b|)`, the same quantity Python's
 * `difflib.SequenceMatcher.ratio()` reports, computed directly.
 *
 * **Deviation from the source, and why:** 碎碎念 slides a window whose
 * width is *exactly* the quote's length. For two strings of equal length
 * that ratio is `matches / length`, so it reaches 0.95 only when the
 * strings are identical — which the exact and normalized tiers have
 * already claimed. In other words the fuzzy tier could never fire at its
 * own threshold. Searching `w-1` and `w+1` as well makes the tier do what
 * it is documented to do: accept "the model dropped one character"
 * (13 vs 14 characters scores 26/27 ≈ 0.963) while still refusing a
 * rewrite.
 */
export function bestWindow(normalizedQuote: string, text: string, ratio: number): string | null {
  const normalizedText = normalize(text);
  const baseWidth = normalizedQuote.length;
  if (normalizedText.text.length < baseWidth) return null;

  let best = 0;
  let bestStart = -1;
  let bestWidth = baseWidth;
  for (const width of [baseWidth, baseWidth - 1, baseWidth + 1]) {
    if (width < 1 || width > normalizedText.text.length) continue;
    for (let start = 0; start + width <= normalizedText.text.length; start++) {
      const window = normalizedText.text.slice(start, start + width);
      const score = similarity(normalizedQuote, window);
      if (score > best) {
        best = score;
        bestStart = start;
        bestWidth = width;
      }
    }
  }
  if (best < ratio || bestStart < 0) return null;
  const from = normalizedText.index[bestStart];
  const to = normalizedText.index[bestStart + bestWidth - 1] + 1;
  return text.slice(from, to);
}

/** `2·LCS(a,b) / (|a|+|b|)`, in [0,1]. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const lcs = longestCommonSubsequence(a, b);
  return (2 * lcs) / (a.length + b.length);
}

function longestCommonSubsequence(a: string, b: string): number {
  // Rolling row: O(|a|·|b|) time, O(min) space. Strings here are one
  // spoken sentence, so the simple table is the right trade.
  const width = b.length + 1;
  let previous = new Uint16Array(width);
  let current = new Uint16Array(width);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[b.length];
}

function isAlnum(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}
