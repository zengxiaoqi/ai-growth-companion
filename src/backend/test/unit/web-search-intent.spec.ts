import {
  buildCourseSearchQuery,
  normalizeWebSearchMode,
  shouldSearchForCourse,
} from '../../src/modules/web-search/web-search-intent';

describe('web search intent', () => {
  it('normalizes explicit overrides', () => {
    expect(normalizeWebSearchMode(true)).toBe('on');
    expect(normalizeWebSearchMode(false)).toBe('off');
    expect(normalizeWebSearchMode('always')).toBe('on');
    expect(normalizeWebSearchMode('never')).toBe('off');
    expect(normalizeWebSearchMode(undefined)).toBe('auto');
    expect(normalizeWebSearchMode('garbage')).toBe('auto');
  });

  it('keeps pure skill drills offline', () => {
    expect(shouldSearchForCourse({ topic: '认识数字3', domain: 'math' })).toBe(false);
    expect(shouldSearchForCourse({ topic: '汉字：天', domain: 'language' })).toBe(false);
    expect(shouldSearchForCourse({ topic: '5以内加法', domain: 'math' })).toBe(false);
  });

  it('searches knowledge-heavy topics', () => {
    expect(shouldSearchForCourse({ topic: '恐龙', domain: 'science' })).toBe(true);
    expect(shouldSearchForCourse({ topic: '彩虹', domain: 'science' })).toBe(true);
    expect(shouldSearchForCourse({ topic: '中秋节', domain: 'social' })).toBe(true);
  });

  it('searches when the parent wrote a real request', () => {
    expect(
      shouldSearchForCourse({
        topic: '故宫',
        parentPrompt: '给五岁的孩子讲讲故宫的建筑特点和小故事',
        domain: 'social',
      }),
    ).toBe(true);
  });

  it('lets a knowledge question override a skill-only topic', () => {
    expect(
      shouldSearchForCourse({
        topic: '颜色',
        parentPrompt: '为什么天空是蓝色的？',
        domain: 'science',
      }),
    ).toBe(true);
  });

  it('searches freshness requests even for skill topics', () => {
    expect(
      shouldSearchForCourse({
        topic: '数学绘本',
        parentPrompt: '推荐最近出版的数学启蒙绘本',
        domain: 'math',
      }),
    ).toBe(true);
  });

  it('respects explicit on/off overrides', () => {
    expect(shouldSearchForCourse({ topic: '认识数字3', mode: 'on' })).toBe(true);
    expect(shouldSearchForCourse({ topic: '恐龙', mode: 'off' })).toBe(false);
  });

  it('builds a domain-aware query', () => {
    expect(buildCourseSearchQuery({ topic: '恐龙', domain: 'science' })).toBe('恐龙 儿童科普');
    expect(buildCourseSearchQuery({ topic: '彩虹', domain: 'unknown' })).toBe('彩虹 儿童启蒙');
  });
});
