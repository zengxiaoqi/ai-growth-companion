import { describe, expect, it } from 'vitest';
import { safeGlyph, visualFor } from '../components/games/ChildGameUI';

/**
 * Regression guard: the emoji compatibility layer must never swap a picture
 * for a semantically unrelated one. For 3-6 year olds learning by matching
 * pictures to words, teaching the wrong association is worse than a tofu box.
 * Keep this file in sync with Flutter `child_game_ui_test.dart`.
 */
describe('safeGlyph — semantic fidelity', () => {
  it('substitutes only semantic equivalents', () => {
    expect(safeGlyph('🪷')).toBe('🌸');
    expect(safeGlyph('☃️')).toBe('⛄');
    expect(safeGlyph('🃏')).toBe('🎲');
    expect(safeGlyph('🦉')).toBe('🐦');
  });

  it('never replaces a glyph with an unrelated picture', () => {
    expect(safeGlyph('🧸')).toBe('🧸');
    expect(safeGlyph('🧺')).toBe('🧺');
    expect(safeGlyph('🧱')).toBe('🧱');
    expect(safeGlyph('🦊')).toBe('🦊');
    expect(safeGlyph('🦋')).toBe('🦋');
    expect(safeGlyph('🦆')).toBe('🦆');
    expect(safeGlyph('🧩')).toBe('🧩');
  });

  it('keeps valid glyphs and unknown new emoji untouched', () => {
    expect(safeGlyph('🐱')).toBe('🐱');
    expect(safeGlyph('❄️')).toBe('❄️');
    expect(safeGlyph('1️⃣')).toBe('1️⃣');
    expect(safeGlyph('🫧')).toBe('🫧');
    expect(safeGlyph('')).toBe('');
  });

  it('visualFor keeps the explicit icon even for new emoji', () => {
    expect(visualFor({ icon: '🧸', label: '一个人玩' })).toBe('🧸');
    expect(visualFor({ icon: '🧺', label: '一起收拾' })).toBe('🧺');
  });
});
