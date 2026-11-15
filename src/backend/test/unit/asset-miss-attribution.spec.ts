import {
  classifyAssetMiss,
  longestCommonRun,
} from '../../src/modules/learning/visual-asset.service';

/**
 * 归因只回答"这次 miss 该记到哪一栏"，不参与匹配。
 * 但判据必须够紧：中文单字会把所有东西串成一团，
 * 第一版只看"有没有公共字"，于是荷花撞梅花鹿、稻草人撞草莓、水蒸气撞水稻。
 */
const LIB = [
  { role: 'flower', alias: '花' },
  { role: 'flower', alias: '花朵' },
  { role: 'tree', alias: '树' },
  { role: 'tree', alias: '大树' },
  { role: 'bird', alias: '鸟' },
  { role: 'bird', alias: '小鸟' },
  { role: 'snow', alias: '雪' },
  { role: 'snow', alias: '雪花' },
  { role: 'squirrel', alias: '松鼠' },
  { role: 'rain', alias: '雨' },
  { role: 'drop', alias: '水滴' },
  { role: 'rice', alias: '水稻' },
  { role: 'strawberry', alias: '草莓' },
  { role: 'leaf', alias: '树叶' },
  { role: 'deer', alias: '梅花鹿' },
  { role: 'broccoli', alias: '西兰花' },
];

describe('素材缺失归因', () => {
  it('库里确实没有的概念判 not-in-library', () => {
    for (const subject of ['石头', '知了', '柳条']) {
      expect(classifyAssetMiss(subject, LIB).reason).toBe('not-in-library');
    }
  });

  it('「树根」能挂到单字别名「树」上，但那是降级不是命中', () => {
    const verdict = classifyAssetMiss('树根', LIB);
    expect(verdict.reason).toBe('degraded-candidate');
    expect(verdict.nearestAlias).toBe('树');
  });

  it('已知局限：同字不同物分不开，只能归进"需要人看"那一栏', () => {
    // 青草撞草莓、松树撞松鼠，字面规则无法区分"同一类东西"和"恰好共用一个字"。
    // 这两条判成 degraded-candidate 是对的——它的含义就是"人工定夺"，
    // 不是自动降级。报告里会连着最近的别名一起打出来，让人一眼看出不对。
    expect(classifyAssetMiss('青草', LIB).reason).toBe('degraded-candidate');
    expect(classifyAssetMiss('松树', LIB).reason).toBe('degraded-candidate');
  });

  it('单字重叠不足以判定"库里有"：稻草人不能被草莓带偏', () => {
    expect(classifyAssetMiss('稻草人', LIB).reason).toBe('not-in-library');
  });

  it('水蒸气不能被"水滴"带偏', () => {
    expect(classifyAssetMiss('水蒸气', LIB).reason).toBe('not-in-library');
  });

  it('「小燕子」剥掉虚词「小」之后不该撞上「小鸟」', () => {
    expect(classifyAssetMiss('小燕子', LIB).reason).toBe('not-in-library');
  });

  it('荷花可以降级到 flower，但必须标成失真候选而不是"库里有"', () => {
    const verdict = classifyAssetMiss('荷花', LIB);
    expect(verdict.reason).toBe('degraded-candidate');
    expect(verdict.nearestRole).toBe('flower');
  });

  it('雪人不能被判成 no-match：「人」是实词，剥掉就只剩「雪」了', () => {
    const verdict = classifyAssetMiss('雪人', LIB);
    expect(verdict.reason).toBe('degraded-candidate');
    expect(verdict.nearestAlias).toBe('雪');
  });

  it('完全同名却仍然 miss 的，是匹配器的问题', () => {
    expect(classifyAssetMiss('雨', LIB).reason).toBe('no-match');
  });

  it('同字不同物会被归进降级候选：nearest 可能是上位词，也可能是同字异类', () => {
    const verdict = classifyAssetMiss('松树', LIB);
    expect(verdict.reason).toBe('degraded-candidate');
    // 「树」和「松鼠」得分相同，谁先被遍历到就是谁——这条断言只保证"有候选"，不锁顺序
    expect(['树', '松鼠']).toContain(verdict.nearestAlias);
  });
});

describe('longestCommonRun', () => {
  it('按连续字计算，不按共有字', () => {
    expect(longestCommonRun('青草', '树叶')).toBe(0);
    expect(longestCommonRun('桃花', '花朵')).toBe(1);
    expect(longestCommonRun('彩虹', '彩虹')).toBe(2);
  });

  it('虚词不参与相似度', () => {
    expect(longestCommonRun('小燕子', '小鸟')).toBe(0);
    expect(longestCommonRun('松树', '大树')).toBe(1);
  });
});
