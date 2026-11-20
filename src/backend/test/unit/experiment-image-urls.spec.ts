import {
  sanitizeExperimentModule,
  toActivityImageUrl,
} from '../../src/modules/learning/lesson-scene';

/**
 * Experiment targets are rendered as picture cards. The picture endpoint
 * draws the SUBJECT, so "棕熊卡片" must be normalized to "棕熊" before an
 * /api/learning/activity-image/... URL is embedded in the lesson JSON.
 */
describe('experiment picture card URLs', () => {
  it('strips the 卡片 suffix so the endpoint draws the animal, not a card', () => {
    expect(toActivityImageUrl('棕熊卡片')).toBe(
      `/api/learning/activity-image/${encodeURIComponent('棕熊')}`,
    );
    expect(toActivityImageUrl('青蛙卡片')).toBe(
      `/api/learning/activity-image/${encodeURIComponent('青蛙')}`,
    );
    expect(toActivityImageUrl('麻雀卡片')).toBe(
      `/api/learning/activity-image/${encodeURIComponent('麻雀')}`,
    );
  });

  it('keeps a bare concrete noun unchanged', () => {
    expect(toActivityImageUrl('小猫')).toBe(
      `/api/learning/activity-image/${encodeURIComponent('小猫')}`,
    );
  });

  it('rejects empty, overly long and path-like subjects', () => {
    expect(toActivityImageUrl('卡片')).toBeNull();
    expect(toActivityImageUrl('')).toBeNull();
    expect(toActivityImageUrl(null)).toBeNull();
    expect(toActivityImageUrl('一二三四五六七八九十十一十二十三')).toBeNull();
    expect(toActivityImageUrl('../../etc/passwd')).toBeNull();
    expect(toActivityImageUrl('<script>x</script>')).toBeNull();
  });

  it('embeds index-aligned picture URLs in sanitized experiment modules', () => {
    const module = sanitizeExperimentModule(
      {
        title: '模拟小实验',
        question: '哪些动物冬天要冬眠？',
        materials: ['棕熊卡片', '青蛙卡片', '麻雀卡片'],
        steps: [
          {
            instruction: '点一点棕熊卡片，看看它做什么。',
            action: 'tap_target',
            targets: ['棕熊卡片', '青蛙卡片', '麻雀卡片'],
            reveal: '棕熊在冬眠',
          },
        ],
      },
      '四季变化',
    );

    expect(module.materials).toEqual(['棕熊卡片', '青蛙卡片', '麻雀卡片']);
    expect(module.materialImageUrls).toEqual([
      `/api/learning/activity-image/${encodeURIComponent('棕熊')}`,
      `/api/learning/activity-image/${encodeURIComponent('青蛙')}`,
      `/api/learning/activity-image/${encodeURIComponent('麻雀')}`,
    ]);
    expect(module.steps[0].targetImageUrls).toEqual(module.materialImageUrls);
  });

  it('keeps the old lessons renderable: no targets means no picture URLs', () => {
    const module = sanitizeExperimentModule({ materials: [] }, '四季变化');
    expect(module.steps[0].targets).toEqual(['四季变化']);
    expect(module.steps[0].targetImageUrls?.[0]).toBe(
      `/api/learning/activity-image/${encodeURIComponent('四季变化')}`,
    );
    expect(module.materialImageUrls).toEqual([]);
  });
});
