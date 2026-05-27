import { getCoursePackCurriculumSeed } from '../../src/modules/learning/course-curriculum-fallback';

describe('course curriculum fallback', () => {
  it('matches animal tiger topics to animal curriculum instead of seasons', () => {
    const seed = getCoursePackCurriculumSeed({
      topic: '认识动物老虎',
      ageGroup: '5-6',
      domain: 'science',
    });

    expect(seed).toBeTruthy();
    expect(
      [
        seed?.summary,
        seed?.readingText,
        ...(seed?.teachingUnits || []),
        ...(seed?.readingKeywords || []),
      ].join(' '),
    ).toMatch(/动物|猫|狗|兔|鸟|鱼|老虎/);
    expect(seed?.teachingUnits).not.toEqual(
      expect.arrayContaining(['春天', '夏天', '秋天', '冬天']),
    );
  });
});
