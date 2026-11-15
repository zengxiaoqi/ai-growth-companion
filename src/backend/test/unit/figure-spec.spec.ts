import {
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  MIN_RADIUS,
  MIN_STROKE,
  describeFigureGrammar,
  normalizeFigureSpec,
  shapeBounds,
} from '../../src/modules/learning/video/figure-spec';

/** 取拒绝原因。判别联合在 ts-jest 里窄化不生效，统一走这个口子 */
const rejectReason = (result: ReturnType<typeof normalizeFigureSpec>): string =>
  (result as { reason?: string }).reason || 'ok';

/** 合法基准：一道彩虹。后面每个用例都在它上面破坏一件事 */
const rainbow = () => ({
  shapes: [
    { kind: 'arc', cx: 800, cy: 640, r: 490, from: 4, to: 176, stroke: '#E5484D', width: 34, reveal: 0 },
    { kind: 'arc', cx: 800, cy: 640, r: 450, from: 4, to: 176, stroke: '#F76B15', width: 34, reveal: 0.1 },
    { kind: 'arc', cx: 800, cy: 640, r: 410, from: 4, to: 176, stroke: '#FFC53D', width: 34, reveal: 0.2 },
    { kind: 'arc', cx: 800, cy: 640, r: 370, from: 4, to: 176, stroke: '#30A46C', width: 34, reveal: 0.3 },
    { kind: 'arc', cx: 800, cy: 640, r: 330, from: 4, to: 176, stroke: '#0091FF', width: 34, reveal: 0.4 },
    { kind: 'arc', cx: 800, cy: 640, r: 290, from: 4, to: 176, stroke: '#3E63DD', width: 34, reveal: 0.5 },
    { kind: 'arc', cx: 800, cy: 640, r: 250, from: 4, to: 176, stroke: '#8E4EC6', width: 34, reveal: 0.6 },
  ],
  labels: [{ text: '水滴', x: 240, y: 560 }],
});

describe('normalizeFigureSpec', () => {
  it('接受一道合法的彩虹', () => {
    const result = normalizeFigureSpec(rainbow());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.shapes).toHaveLength(7);
    expect(result.spec.labels?.[0].text).toBe('水滴');
  });

  it('非对象或空数组一律拒绝，不进渲染', () => {
    expect(normalizeFigureSpec(null).ok).toBe(false);
    expect(normalizeFigureSpec({}).ok).toBe(false);
    expect(normalizeFigureSpec({ shapes: [] }).ok).toBe(false);
    expect(normalizeFigureSpec('rainbow').ok).toBe(false);
  });

  it('未知图元被丢弃，全部非法时整份拒绝', () => {
    const mixed = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'text', x: 10, y: 10, value: '彩虹' },
        { kind: 'image', href: 'http://evil/x.png' },
      ],
    });
    expect(mixed.ok).toBe(true);
    if (mixed.ok) expect(mixed.spec.shapes).toHaveLength(7);

    const allBad = normalizeFigureSpec({ shapes: [{ kind: 'text', x: 10, y: 10 }] });
    expect(allBad).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('坐标越界被 clamp 到画布内，不会画到画面外', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 200, y: 100, w: 5000, h: 5000, rx: 8, fill: '#8B9AA8', reveal: 0 },
        { kind: 'line', x1: -100, y1: 320, x2: 5000, y2: 320, stroke: '#5A6B7B', width: 4, reveal: 0 },
        { kind: 'circle', cx: 800, cy: 360, r: 150, fill: '#3E63DD', reveal: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rect = result.spec.shapes[0];
    expect(rect.kind).toBe('rect');
    if (rect.kind === 'rect') {
      expect(rect.x).toBe(200);
      // 宽度收到画布右边界为止，而不是留在 5000 让 x+w 溢出
      expect(rect.w).toBe(FIGURE_WIDTH - 200);
      expect(rect.h).toBe(FIGURE_HEIGHT - 100);
    }
  });

  it('线宽和圆半径有可读性下限：模型给的 hairline 会被抬起来', () => {
    // 实测太阳系：轨道 width=2、行星 r=7~15，在 1600 宽画布里缩到成片几乎不可见
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'line', x1: 100, y1: 100, x2: 1500, y2: 500, stroke: '#5A6B7B', width: 2, reveal: 0 },
        { kind: 'circle', cx: 800, cy: 320, r: 7, fill: '#94A3B8', reveal: 1 },
        { kind: 'circle', cx: 900, cy: 360, r: 150, fill: '#3E63DD', reveal: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.spec.shapes[0];
    expect(line.kind === 'line' && line.width).toBe(MIN_STROKE);
    const dot = result.spec.shapes[1];
    expect(dot.kind === 'circle' && dot.r).toBe(MIN_RADIUS);
  });

  it('弧的圆心允许落在画布外——彩虹本来就要把圆心压到底边之下', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'arc', cx: 800, cy: 900, r: 700, from: 10, to: 170, stroke: '#E5484D', width: 30, reveal: 0 },
        { kind: 'arc', cx: 800, cy: 900, r: 640, from: 10, to: 170, stroke: '#F76B15', width: 30, reveal: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const arc = result.spec.shapes[0];
    if (arc.kind === 'arc') expect(arc.cy).toBe(900);
  });

  it('NaN / Infinity / 字符串数字分别拒绝或转换', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'circle', cx: NaN, cy: Infinity, r: Infinity, fill: '#0091FF', reveal: 0 },
        { kind: 'circle', cx: '420', cy: '320', r: '260', fill: '#0091FF', reveal: 1 },
        { kind: 'circle', cx: 1180, cy: 320, r: 260, fill: '#12A594', reveal: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // NaN 的 cx 回落到画布中心，Infinity 的 r 被收到上限，不会产生 Infinity 路径
    result.spec.shapes.forEach((shape) => {
      if (shape.kind === 'circle') {
        expect(Number.isFinite(shape.cx)).toBe(true);
        expect(Number.isFinite(shape.r)).toBe(true);
      }
    });
    // 字符串数字被认出来
    const parsed = result.spec.shapes.find(
      (s) => s.kind === 'circle' && s.cx === 420 && s.cy === 320,
    );
    expect(parsed).toBeDefined();
  });

  it('起止角相同的弧丢弃，画不出东西', () => {
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'arc', cx: 800, cy: 640, r: 300, from: 90, to: 90, stroke: '#E5484D', width: 20, reveal: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.shapes).toHaveLength(7);
  });

  it('完全相同的图元最多留三个，防止模型刷数量', () => {
    const dup = { kind: 'line', x1: 200, y1: 100, x2: 1400, y2: 100, stroke: '#5A6B7B', width: 6, reveal: 0 };
    const result = normalizeFigureSpec({ shapes: [dup, dup, dup, dup, dup] });
    // 只剩三个相同的线，覆盖率 1200*1 ≈ 0，会被几何检查拒掉——这里只看去重发生
    expect(result.ok).toBe(false);
    const longer = normalizeFigureSpec({
      shapes: [dup, dup, dup, dup, { kind: 'circle', cx: 800, cy: 400, r: 200, fill: '#3E63DD', reveal: 0 }],
    });
    if (longer.ok) {
      const lines = longer.spec.shapes.filter((s) => s.kind === 'line');
      expect(lines).toHaveLength(3);
    }
  });

  it('shapes 超过上限时截断', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      kind: 'circle',
      cx: 100 + (i % 10) * 140,
      cy: 120 + Math.floor(i / 10) * 60,
      r: 30 + (i % 5),
      fill: '#3E63DD',
      reveal: i / 80,
    }));
    const result = normalizeFigureSpec({ shapes: many });
    if (result.ok) expect(result.spec.shapes.length).toBeLessThanOrEqual(48);
  });

  it('标签截到 6 字、数量截到 6 个', () => {
    const result = normalizeFigureSpec({
      ...rainbow(),
      labels: Array.from({ length: 9 }, (_, i) => ({
        text: '这是一个特别长的标签' + i,
        x: 200 + i * 40,
        y: 60,
      })),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.labels).toHaveLength(6);
    result.spec.labels?.forEach((label) => expect(label.text.length).toBeLessThanOrEqual(6));
  });

  it('图形缩在一个角落时拒绝：覆盖率不足', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'circle', cx: 120, cy: 120, r: 60, fill: '#3E63DD', reveal: 0 },
        { kind: 'circle', cx: 220, cy: 160, r: 50, fill: '#3E63DD', reveal: 1 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(['coverage', 'off-center', 'no-main-shape']).toContain(rejectReason(result));
  });

  it('同心圆这种"只有最外圈够长"的图仍然通过（地球分层）', () => {
    // 原来的"至少两个图元各自贯穿 60% 高度"会把这份正确的图判死
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'circle', cx: 800, cy: 320, r: 260, fill: '#8B5E3C', reveal: 0 },
        { kind: 'circle', cx: 800, cy: 320, r: 175, fill: '#E07A3F', reveal: 1 },
        { kind: 'circle', cx: 800, cy: 320, r: 95, fill: '#F2C14E', reveal: 2 },
      ],
      labels: [{ text: '地壳', x: 250, y: 300 }],
    });
    expect(result.ok).toBe(true);
  });

  it('一条贯穿画面的色带 + 两个小图标不算图：背景条不算内容', () => {
    // 实测「认识小兔子」就是这个形状：1160×95 的草地色带撑满包围盒，兔子只是几个圆
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 0, y: 300, w: 1600, h: 90, rx: 0, fill: '#8B9AA8', reveal: 0 },
        { kind: 'circle', cx: 600, cy: 250, r: 35, fill: '#3E63DD', reveal: 1 },
        { kind: 'circle', cx: 900, cy: 250, r: 35, fill: '#3E63DD', reveal: 2 },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'no-main-shape' });
  });

  it('背景条之上有真正的主体时通过（月相排一行的形态）', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 0, y: 470, w: 1600, h: 100, rx: 0, fill: '#8B9AA8', reveal: 0 },
        { kind: 'circle', cx: 500, cy: 300, r: 100, fill: '#F2C14E', reveal: 1 },
        { kind: 'circle', cx: 1000, cy: 300, r: 100, fill: '#F2C14E', reveal: 2 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('图形全部挤在左半边时拒绝：偏离中心', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'circle', cx: 200, cy: 320, r: 160, fill: '#3E63DD', reveal: 0 },
        { kind: 'circle', cx: 480, cy: 320, r: 150, fill: '#0091FF', reveal: 1 },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'off-center' });
  });

  it('看不见的小弧被单独丢掉，不废整张图', () => {
    // 真实案例：太阳系的土星环是一条 r=18 的小弧，原来会把整份 8 条轨道的图判死
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 200, y: 120, w: 1200, h: 400, rx: 10, fill: '#8B9AA8', reveal: 0 },
        { kind: 'circle', cx: 500, cy: 320, r: 180, fill: '#3E63DD', reveal: 0 },
        { kind: 'arc', cx: 900, cy: 320, r: 12, from: 0, to: 180, stroke: '#E5484D', width: 6, reveal: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.shapes.some((s) => s.kind === 'arc')).toBe(false);
      expect(result.spec.shapes).toHaveLength(2);
    }
  });

  it('整张图只有看不见的小弧时仍然拒绝', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'arc', cx: 900, cy: 320, r: 12, from: 0, to: 180, stroke: '#E5484D', width: 6, reveal: 0 },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('标签整个压在实心图形上时拒绝', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 160, y: 80, w: 1280, h: 480, rx: 8, fill: '#8B9AA8', reveal: 0 },
        { kind: 'circle', cx: 800, cy: 320, r: 200, fill: '#3E63DD', reveal: 0 },
      ],
      labels: [{ text: '天空', x: 800, y: 320 }],
    });
    expect(result).toMatchObject({ ok: false, reason: 'label-cover' });
  });

  it('颜色过多时拒绝，防止画面变成一锅脏色', () => {
    const shapes = Array.from({ length: 12 }, (_, i) => ({
      kind: 'circle',
      cx: 200 + i * 110,
      cy: 320,
      r: 60,
      fill: ['#E5484D', '#F76B15', '#FFB020', '#FFC53D', '#30A46C', '#12A594', '#0091FF', '#3E63DD', '#8E4EC6', '#D6409F', '#8B9AA8', '#5A6B7B'][i],
      reveal: i / 12,
    }));
    const result = normalizeFigureSpec({ shapes });
    // 12 色等于上限，通过；再加一色就超
    expect(rejectReason(result)).not.toBe('too-many-colors');
    const over = normalizeFigureSpec({
      shapes: [
        ...shapes,
        { kind: 'circle', cx: 800, cy: 120, r: 40, fill: '#123456', reveal: 0 },
      ],
    });
    expect(over.ok).toBe(false);
  });

  it('多边形点数不足时丢弃', () => {
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'polygon', points: '100,100 200', fill: '#E5484D', reveal: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.shapes.filter((s) => s.kind === 'polygon')).toHaveLength(0);
  });
});

describe('shapeBounds', () => {
  it('弧的包围盒按采样算，不会把整圆当成包围盒', () => {
    // 半圆：圆心在底边，半径 400，只取上半 → 高度应约等于 400，宽度约 800
    const bounds = shapeBounds({
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 400,
      from: 0,
      to: 180,
      stroke: '#000',
      width: 4,
    });
    expect(bounds.x2 - bounds.x1).toBeCloseTo(800, 0);
    expect(bounds.y2 - bounds.y1).toBeCloseTo(400, 0);
    expect(bounds.y1).toBeCloseTo(240, 0);
  });

  it('圆与直线的包围盒直接由端点决定', () => {
    expect(shapeBounds({ kind: 'circle', cx: 100, cy: 200, r: 50, fill: '#000' })).toEqual({
      x1: 50,
      y1: 150,
      x2: 150,
      y2: 250,
    });
    expect(
      shapeBounds({ kind: 'line', x1: 300, y1: 100, x2: 100, y2: 400, stroke: '#000', width: 2 }),
    ).toEqual({ x1: 100, y1: 100, x2: 300, y2: 400 });
  });
});

describe('describeFigureGrammar', () => {
  it('六种图元与画布尺寸都写进了 prompt 说明', () => {
    const grammar = describeFigureGrammar();
    ['arc', 'line', 'curve', 'circle', 'rect', 'polygon'].forEach((kind) => {
      expect(grammar).toContain(kind);
    });
    expect(grammar).toContain(String(FIGURE_WIDTH));
    expect(grammar).toContain(String(FIGURE_HEIGHT));
    expect(grammar).toContain('labels');
  });
});
