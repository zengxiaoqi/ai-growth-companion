import { bestWindow, normalize, resolveQuote, similarity } from '../../src/modules/memory/verbatim';

/**
 * The verbatim gate is the reason the product may claim "every quote is
 * real". These assertions are ported from 碎碎念's
 * `tests/memory/test_extract.py` and keep the same intent: a paraphrase
 * must be refused, and whatever *is* accepted must be the transcript's
 * own text — never the model's tidied version.
 */
describe('verbatim gate', () => {
  describe('normalize', () => {
    it('drops punctuation and spaces but keeps an index map back to the source', () => {
      const { text, index } = normalize('我，喜欢 霸王龙！');
      expect(text).toBe('我喜欢霸王龙');
      // Every normalized char must point at the same char in the source.
      for (let i = 0; i < text.length; i++) {
        expect('我，喜欢 霸王龙！'[index[i]]).toBe(text[i]);
      }
    });

    it('unifies full-width ASCII and digits', () => {
      expect(normalize('ＡＢＣ１２３').text).toBe('ABC一二三');
    });
  });

  describe('resolveQuote', () => {
    const turns = ['我今天在幼儿园看到一只霸王龙', '它最爱咬我的鞋带'];

    it('matches exactly and reports every turn it appears in', () => {
      const match = resolveQuote('霸王龙', ['霸王龙', '霸王龙好酷']);
      expect(match).not.toBeNull();
      expect(match!.tier).toBe('exact');
      expect(match!.turnIndices).toEqual([0, 1]);
    });

    it('matches across punctuation via the normalized tier, returning the ORIGINAL slice', () => {
      const match = resolveQuote('我今天在幼儿园看到一只霸王龙', turns);
      expect(match).not.toBeNull();
      expect(match!.tier).toBe('exact');

      // Same words, different punctuation: the stored quote must keep the
      // transcript's punctuation, not the model's.
      const punctuated = resolveQuote('它最爱咬我的鞋带，', turns);
      expect(punctuated).not.toBeNull();
      expect(punctuated!.quote).toBe('它最爱咬我的鞋带');
    });

    it('falls back to the fuzzy tier only at high similarity, and still returns a transcript window', () => {
      // The model dropped one character (看到一只 → 看到只). Exact fails,
      // normalized fails, and 24/25 = 0.96 clears the 0.95 floor.
      const match = resolveQuote('我今天在幼儿园看到只霸王龙', turns, 0.95);
      expect(match).not.toBeNull();
      expect(match!.tier).toBe('fuzzy');
      // Whatever tier matched, the result must be a substring of a turn.
      expect(turns.some((turn) => turn.includes(match!.quote))).toBe(true);
    });

    it('refuses a fabricated quote', () => {
      expect(resolveQuote('我养了一只喷火龙', turns)).toBeNull();
      expect(resolveQuote('', turns)).toBeNull();
      // A single character is below the two-char floor.
      expect(resolveQuote('龙', ['今天天气不错'])).toBeNull();
    });

    it('refuses a one-character paraphrase rather than inventing one', () => {
      expect(resolveQuote('它最爱吃我的鞋带', turns, 0.95)).toBeNull();
    });
  });

  describe('similarity', () => {
    it('is 1 for identical strings and 0 for disjoint ones', () => {
      expect(similarity('霸王龙', '霸王龙')).toBe(1);
      expect(similarity('霸王龙', '西红柿')).toBe(0);
    });

    it('reports 2·LCS/(|a|+|b|)', () => {
      // LCS("abc","abd") = 2 → 4/6
      expect(similarity('abc', 'abd')).toBeCloseTo(4 / 6, 6);
    });
  });

  describe('bestWindow', () => {
    it('returns null below the ratio and a real window above it', () => {
      expect(bestWindow('霸王龙', '完全无关的一句话', 0.95)).toBeNull();
      const window = bestWindow('霸王龙', '我看到霸王龙了', 0.9);
      expect(window).toBe('霸王龙');
    });
  });
});
