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

  it('单字在全篇出现多次 → 不锚（第一次出现未必指它）', () => {
    const cue = pages([
      { text: '天上的云很大', from: 0 },
      { text: '云里有很多水', from: 80 },
    ]);
    const table = buildActionAnchors([{ id: 'c', label: '云', subject: '云朵' }], cue, {
      durationFrames: 200,
    });
    expect(table.c).toBeUndefined();
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
});
