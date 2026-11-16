import { auditFlowOrder, buildActionAnchors, summarizeActionAnchors } from '../../src/modules/learning/action-anchors';

/** 造字幕页：按"每个字 N 帧"排发音帧，够用且好读 */
function pages(texts: Array<{ text: string; from: number; step?: number }>) {
  return texts.map(({ text, from, step = 5 }) => {
    const tokens = Array.from(text);
    return { tokens, starts: tokens.map((_, i) => from + i * step) };
  });
}

describe('buildActionAnchors', () => {
  it('词在本句中间时，窗口从发音帧开始、到本句收尾', () => {
    const cue = pages([
      { text: '太阳把水晒热', from: 0 },
      { text: '水变成水汽飞上天', from: 60 },
    ]);
    const table = buildActionAnchors([{ id: 'a', label: '水汽', subject: '水蒸气' }], cue, {
      durationFrames: 240,
    });

    // 第二页文字是"水变成水汽飞上天"，"水汽"从第 3 个字起（下标 3），起帧 60+3*5=75
    expect(table.a).toBeDefined();
    expect(table.a.matched).toBe('水汽');
    expect(table.a.start).toBe(75);
    // 收尾 = 下一屏的第一帧；这是最后一屏，收到场景结束
    expect(table.a.end).toBe(240);
    expect(table.a.page).toBe(1);
  });

  it('label 不在旁白里时用 subject 兜底', () => {
    const cue = pages([{ text: '水蒸气飞上天', from: 30 }]);
    const table = buildActionAnchors([{ id: 'a', label: '白云', subject: '水蒸气' }], cue, {
      durationFrames: 200,
    });
    expect(table.a?.matched).toBe('水蒸气');
    expect(table.a.start).toBe(30);
  });

  it('旁白没念到就不给锚点，交给调用方回退', () => {
    const cue = pages([{ text: '太阳把水晒热', from: 0 }]);
    const table = buildActionAnchors([{ id: 'a', label: '白云', subject: '云朵' }], cue, {
      durationFrames: 200,
    });
    expect(table.a).toBeUndefined();
  });

  it('单字节点不锚定——单字重合并不会报错，是静默错配', () => {
    const cue = pages([{ text: '一棵大树', from: 0 }]);
    const table = buildActionAnchors([{ id: 'root', label: '树根', subject: '根' }], cue, {
      durationFrames: 200,
    });
    expect(table.root).toBeUndefined();
  });

  it('词在句尾时前移起点，保证动作有可看时长', () => {
    // "水果"在这句第 2 个字，起帧 180，但本句 200 就收尾——窗口只有 20 帧，
    // 比 minWindow(24) 短，所以起点前移到 200-24=176
    const cue = pages([
      { text: '这是水果', from: 170 },
      { text: '下一句', from: 200 },
    ]);
    const table = buildActionAnchors([{ id: 'n', label: '水果', subject: '水果' }], cue, {
      durationFrames: 240,
      minWindow: 24,
    });
    expect(table.n?.start).toBe(176);
    expect(table.n?.end).toBe(200);
  });

  it('前移也凑不出可看时长时不给锚点', () => {
    // 本句只剩 10 帧就收尾，前移也只能到开头，窗口还是太短 → 宁可回退
    const cue = pages([
      { text: '这是水果', from: 190 },
      { text: '下一句', from: 200 },
    ]);
    const table = buildActionAnchors([{ id: 'n', label: '水果', subject: '水果' }], cue, {
      durationFrames: 300,
      minWindow: 24,
    });
    expect(table.n).toBeUndefined();
  });

  it('标点不参与匹配', () => {
    const cue = pages([{ text: '遇冷，变回小水珠', from: 0 }]);
    const table = buildActionAnchors([{ id: 'r', label: '水珠', subject: '水珠' }], cue, {
      durationFrames: 200,
    });
    // "水珠"在"小水珠"里，应命中；帧数按字符下标算（遇冷，变回小水珠 → 下标 6）
    expect(table.r?.matched).toBe('水珠');
    expect(table.r?.start).toBe(30);
  });

  it('没有字幕页时返回空表', () => {
    expect(buildActionAnchors([{ id: 'a', label: '水汽' }], undefined, { durationFrames: 200 })).toEqual({});
    expect(buildActionAnchors([{ id: 'a', label: '水汽' }], [], { durationFrames: 200 })).toEqual({});
  });

  it('结构不合法（starts 与 tokens 长度不符）的页被跳过，不影响其他页', () => {
    const bad = [{ tokens: ['水', '汽'], starts: [10] }];
    const good = pages([{ text: '水汽', from: 40 }]);
    const table = buildActionAnchors([{ id: 'a', label: '水汽' }], [...bad, ...good], {
      durationFrames: 200,
    });
    expect(table.a?.start).toBe(40);
  });
});

describe('summarizeActionAnchors', () => {
  it('统计覆盖率并列出没锚上的节点', () => {
    const nodes = [
      { id: 'a', label: '水汽' },
      { id: 'b', label: '白云' },
    ];
    const stats = summarizeActionAnchors(nodes, { a: { start: 10, end: 60, matched: '水汽', page: 0 } });
    expect(stats).toEqual({ total: 2, anchored: 1, ratio: 0.5, missed: ['白云'] });
  });
});

describe('单字标签', () => {
  it('单字标签且全篇只出现一次 → 锚定', () => {
    const cue = pages([{ text: '小水珠聚在一起就成了云', from: 0 }]);
    const table = buildActionAnchors([{ id: 'c', label: '云', subject: '云朵' }], cue, {
      durationFrames: 200,
    });
    expect(table.c?.matched).toBe('云');
    expect(table.c?.start).toBe(50);
  });

  it('单字出现多次 → 取第一次（重复指的多半是同一个概念）', () => {
    // 早先这里直接不锚，理由是"第一次未必指它"。实测生成端压不住单字
    // （提示词写"不要用单字"反而让模型更常写），于是这些节点永远不亮。
    const cue = pages([
      { text: '天上的云很大', from: 0 },
      { text: '云里有很多水', from: 80 },
    ]);
    const table = buildActionAnchors([{ id: 'c', label: '云', subject: '云朵' }], cue, {
      durationFrames: 200,
    });
    expect(table.c?.start).toBe(15);
    expect(table.c?.page).toBe(0);
  });

  it('单字被更长的词包住时不算命中——「水」不能靠「水果」锚上', () => {
    // 有词边界时只认独立成词。字幕 token 是逐字的，靠 indexOf 会静默错配，
    // 把「水」的动效演在"水果"那一刻。
    const cue = pages([{ text: '它们都是水果', from: 0 }]);
    const table = buildActionAnchors([{ id: 'w', label: '水', subject: '水' }], cue, {
      durationFrames: 200,
      boundaries: [
        { text: '它们', offset: 0, duration: 5e6 },
        { text: '都是', offset: 5e6, duration: 5e6 },
        { text: '水果', offset: 1e7, duration: 1e7 },
      ],
    });
    expect(table.w).toBeUndefined();
  });

  it('单字独立成词时锚定，哪怕旁白里还有别的含这个字的词', () => {
    const cue = pages([{ text: '水变成水汽', from: 0 }]);
    const table = buildActionAnchors([{ id: 'w', label: '水', subject: '水' }], cue, {
      durationFrames: 200,
      boundaries: [
        { text: '水', offset: 0, duration: 4e6 },
        { text: '变成', offset: 4e6, duration: 6e6 },
        { text: '水汽', offset: 1e7, duration: 6e6 },
      ],
    });
    expect(table.w?.matched).toBe('水');
    expect(table.w?.start).toBe(0);
  });

  it('双字标签不会退化成单字匹配', () => {
    const cue = pages([{ text: '一棵大树', from: 0 }]);
    const table = buildActionAnchors([{ id: 'r', label: '树根', subject: '根部' }], cue, {
      durationFrames: 200,
    });
    expect(table.r).toBeUndefined();
  });
});

describe('auditFlowOrder', () => {
  const nodes = [
    { id: 'n1', label: '小水滴' },
    { id: 'n2', label: '水蒸气' },
    { id: 'n3', label: '小水珠' },
  ];

  it('图上顺序与旁白顺序一致时不报警', () => {
    const audit = auditFlowOrder(nodes, {
      n1: { start: 22, end: 60, matched: '小水滴', page: 0 },
      n2: { start: 75, end: 120, matched: '水蒸气', page: 0 },
      n3: { start: 140, end: 190, matched: '小水珠', page: 1 },
    });
    expect(audit.order).toEqual(['n1', 'n2', 'n3']);
    expect(audit.drift).toEqual([]);
  });

  it('旁白先说后面的节点时报警，并带上节点名与发音帧', () => {
    const audit = auditFlowOrder(nodes, {
      n1: { start: 22, end: 60, matched: '小水滴', page: 0 },
      n2: { start: 150, end: 190, matched: '水蒸气', page: 1 },
      n3: { start: 75, end: 120, matched: '小水珠', page: 0 },
    });
    expect(audit.spokenOrder).toEqual(['n1', 'n3', 'n2']);
    expect(audit.drift).toContain('水蒸气@150f');
  });

  it('没锚点的节点不参与顺序判断——它本来就不挂在旁白上', () => {
    const audit = auditFlowOrder(nodes, {
      n1: { start: 22, end: 60, matched: '小水滴', page: 0 },
      n2: { start: 75, end: 120, matched: '水蒸气', page: 0 },
    });
    expect(audit.order).toEqual(['n1', 'n2']);
    expect(audit.drift).toEqual([]);
  });

  // group 的类别按语言习惯排在旁白最后（"苹果、香蕉和葡萄，它们都是水果"），
  // 图上却必须是第一个节点。这不是漂移，是归类关系的固有顺序，报警只会误导排查。
  it('星形拓扑（split/group）不报顺序漂移', () => {
    const fruits = [
      { id: 'n1', label: '水果' },
      { id: 'n2', label: '苹果' },
      { id: 'n3', label: '香蕉' },
    ];
    const table = {
      n1: { start: 71, end: 120, matched: '水果', page: 1 },
      n2: { start: 1, end: 24, matched: '苹果', page: 0 },
      n3: { start: 24, end: 71, matched: '香蕉', page: 0 },
    };
    const linear = auditFlowOrder(fruits, table);
    expect(linear.drift.length).toBeGreaterThan(0);

    const star = auditFlowOrder(fruits, table, { relation: 'group' });
    expect(star.skipped).toBe(true);
    expect(star.drift).toEqual([]);
    // 顺序本身仍要如实给出，日志里能看出"旁白先说苹果、最后才是水果"
    expect(star.spokenOrder).toEqual(['n2', 'n3', 'n1']);

    expect(auditFlowOrder(fruits, table, { relation: 'split' }).skipped).toBe(true);
    // chain 这类一条路径串起所有节点的拓扑仍然要校验
    expect(auditFlowOrder(fruits, table, { relation: 'chain' }).skipped).toBe(false);
  });
});
