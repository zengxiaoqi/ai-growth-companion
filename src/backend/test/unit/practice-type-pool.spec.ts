import {
  pickPracticeActivityType,
  practiceTypePool,
} from '../../src/common/learning/practice-type-pool';
import { isActivityType } from '../../src/agent-framework/core/types/tool-metadata';

describe('practice-type-pool', () => {
  it('3-4 pool is icon-based: no reading-heavy types, no trace_path', () => {
    const pool = practiceTypePool({ ageGroup: '3-4', domain: 'science' });
    expect(pool.length).toBeGreaterThanOrEqual(4);
    for (const type of pool) {
      expect(isActivityType(type)).toBe(true);
      expect(['quiz', 'true_false', 'fill_blank', 'sequencing', 'matching', 'connection', 'trace_path']).not.toContain(type);
    }
  });

  it('5-6 pool offers diverse types including text-based ones', () => {
    const pool = practiceTypePool({ ageGroup: '5-6', domain: 'science' });
    expect(pool.length).toBeGreaterThanOrEqual(8);
    expect(pool).toEqual(expect.arrayContaining(['quiz', 'connection', 'matching', 'tap_target']));
    expect(pool).not.toContain('trace_path');
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('fill_blank only for 5-6 language', () => {
    expect(practiceTypePool({ ageGroup: '5-6', domain: 'language' })).toContain('fill_blank');
    expect(practiceTypePool({ ageGroup: '3-4', domain: 'language' })).not.toContain('fill_blank');
    expect(practiceTypePool({ ageGroup: '5-6', domain: 'science' })).not.toContain('fill_blank');
  });

  it('color_fill only for art domain', () => {
    expect(practiceTypePool({ ageGroup: '3-4', domain: 'art' })).toContain('color_fill');
    expect(practiceTypePool({ ageGroup: '5-6', domain: 'art' })).toContain('color_fill');
    expect(practiceTypePool({ ageGroup: '5-6', domain: 'science' })).not.toContain('color_fill');
  });

  it('picks valid pool members and produces variety across lessons', () => {
    const ctx = { ageGroup: '5-6', domain: 'science' };
    const pool = practiceTypePool(ctx);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const type = pickPracticeActivityType(ctx);
      expect(pool).toContain(type);
      seen.add(type);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});