import {
  FIGURE_CANVAS_BG,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  MIN_CONTOUR_DELTA_E,
  MIN_RADIUS,
  MIN_STROKE,
  MIN_VISIBLE_DELTA_E,
  colorDistance,
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
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 490,
      from: 4,
      to: 176,
      stroke: '#E5484D',
      width: 34,
      reveal: 0,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 450,
      from: 4,
      to: 176,
      stroke: '#F76B15',
      width: 34,
      reveal: 0.1,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 410,
      from: 4,
      to: 176,
      stroke: '#FFC53D',
      width: 34,
      reveal: 0.2,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 370,
      from: 4,
      to: 176,
      stroke: '#30A46C',
      width: 34,
      reveal: 0.3,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 330,
      from: 4,
      to: 176,
      stroke: '#0091FF',
      width: 34,
      reveal: 0.4,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 290,
      from: 4,
      to: 176,
      stroke: '#3E63DD',
      width: 34,
      reveal: 0.5,
    },
    {
      kind: 'arc',
      cx: 800,
      cy: 640,
      r: 250,
      from: 4,
      to: 176,
      stroke: '#8E4EC6',
      width: 34,
      reveal: 0.6,
    },
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

  it('preserves safe glyph ids for beat-synchronized reveals', () => {
    const source: any = rainbow();
    source.shapes[0] = { ...source.shapes[0], id: 'arc1' };
    source.shapes[1] = { ...source.shapes[1], id: 'bad id with spaces' };
    const result = normalizeFigureSpec(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.shapes[0].id).toBe('arc1');
    expect(result.spec.shapes[1].id).toBeUndefined();
    expect(describeFigureGrammar()).toContain('beats.reveal 写 id');
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
        {
          kind: 'line',
          x1: -100,
          y1: 320,
          x2: 5000,
          y2: 320,
          stroke: '#5A6B7B',
          width: 4,
          reveal: 0,
        },
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
        {
          kind: 'line',
          x1: 100,
          y1: 100,
          x2: 1500,
          y2: 500,
          stroke: '#5A6B7B',
          width: 2,
          reveal: 0,
        },
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
        {
          kind: 'arc',
          cx: 800,
          cy: 900,
          r: 700,
          from: 10,
          to: 170,
          stroke: '#E5484D',
          width: 30,
          reveal: 0,
        },
        {
          kind: 'arc',
          cx: 800,
          cy: 900,
          r: 640,
          from: 10,
          to: 170,
          stroke: '#F76B15',
          width: 30,
          reveal: 1,
        },
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
        {
          kind: 'arc',
          cx: 800,
          cy: 640,
          r: 300,
          from: 90,
          to: 90,
          stroke: '#E5484D',
          width: 20,
          reveal: 0,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.shapes).toHaveLength(7);
  });

  it('完全相同的图元最多留三个，防止模型刷数量', () => {
    const dup = {
      kind: 'line',
      x1: 200,
      y1: 100,
      x2: 1400,
      y2: 100,
      stroke: '#5A6B7B',
      width: 6,
      reveal: 0,
    };
    const result = normalizeFigureSpec({ shapes: [dup, dup, dup, dup, dup] });
    // 只剩三个相同的线，覆盖率 1200*1 ≈ 0，会被几何检查拒掉——这里只看去重发生
    expect(result.ok).toBe(false);
    const longer = normalizeFigureSpec({
      shapes: [
        dup,
        dup,
        dup,
        dup,
        { kind: 'circle', cx: 800, cy: 400, r: 200, fill: '#3E63DD', reveal: 0 },
      ],
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
        {
          kind: 'arc',
          cx: 900,
          cy: 320,
          r: 12,
          from: 0,
          to: 180,
          stroke: '#E5484D',
          width: 6,
          reveal: 1,
        },
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
        {
          kind: 'arc',
          cx: 900,
          cy: 320,
          r: 12,
          from: 0,
          to: 180,
          stroke: '#E5484D',
          width: 6,
          reveal: 0,
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('标签压在实心图形上时只丢弃冲突标签，保留整张画板', () => {
    const result = normalizeFigureSpec({
      shapes: [
        { kind: 'rect', x: 160, y: 80, w: 1280, h: 480, rx: 8, fill: '#8B9AA8', reveal: 0 },
        { kind: 'circle', cx: 800, cy: 320, r: 200, fill: '#3E63DD', reveal: 0 },
      ],
      labels: [
        { text: '天空', x: 800, y: 320 },
        { text: '地面', x: 800, y: 620 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.shapes).toHaveLength(2);
      expect(result.spec.labels?.map((label) => label.text)).toEqual(['地面']);
    }
  });

  it('颜色过多时拒绝，防止画面变成一锅脏色', () => {
    const shapes = Array.from({ length: 12 }, (_, i) => ({
      kind: 'circle',
      cx: 200 + i * 110,
      cy: 320,
      r: 60,
      fill: [
        '#E5484D',
        '#F76B15',
        '#FFB020',
        '#FFC53D',
        '#30A46C',
        '#12A594',
        '#0091FF',
        '#3E63DD',
        '#8E4EC6',
        '#D6409F',
        '#8B9AA8',
        '#5A6B7B',
      ][i],
      reveal: i / 12,
    }));
    const result = normalizeFigureSpec({ shapes });
    // 12 色等于上限，通过；再加一色就超
    expect(rejectReason(result)).not.toBe('too-many-colors');
    const over = normalizeFigureSpec({
      shapes: [...shapes, { kind: 'circle', cx: 800, cy: 120, r: 40, fill: '#123456', reveal: 0 }],
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

/**
 * 轮廓兜底。实测 22 张真实成片里 9 张带纯白图元：彩虹那四张的"雨珠"是
 * 纯白圆 + 纯白触角，成片里只剩两颗蓝眼睛浮在背景上。白色是雨珠的正确颜色，
 * 该补的是轮廓，不是把白改成灰。
 */
describe('填充色对比度下限', () => {
  const drop = (fill = '#FFFFFF') => ({
    shapes: [...rainbow().shapes, { kind: 'circle', cx: 1470, cy: 520, r: 42, fill, reveal: 0.9 }],
  });

  it('纯白圆在白底上会补一圈看得见的轮廓', () => {
    const result = normalizeFigureSpec(drop());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const circle = result.spec.shapes.find((s) => s.kind === 'circle');
    expect(circle?.kind).toBe('circle');
    if (circle?.kind !== 'circle') return;
    // 填充保持白色——语义归模型，不改
    expect(circle.fill).toBe('#FFFFFF');
    expect(circle.stroke).toBeDefined();
    expect(circle.strokeWidth).toBe(MIN_STROKE);
    // 轮廓必须真的和填充、和底色都分得开，否则补了也白补
    expect(colorDistance(circle.stroke!, circle.fill)).toBeGreaterThanOrEqual(MIN_CONTOUR_DELTA_E);
    expect(colorDistance(circle.stroke!, FIGURE_CANVAS_BG)).toBeGreaterThanOrEqual(
      MIN_VISIBLE_DELTA_E,
    );
  });

  it('本身够显眼的填充不动——不能顺手给所有图元描边', () => {
    const result = normalizeFigureSpec(drop('#E5484D'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const circle = result.spec.shapes.find((s) => s.kind === 'circle');
    expect(circle).toBeDefined();
    expect(circle && 'stroke' in circle ? circle.stroke : undefined).toBeUndefined();
  });

  it('纯白线条没有"面"可描边，就把自己的颜色压深到看得见', () => {
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        {
          kind: 'curve',
          x1: 1452,
          y1: 432,
          c1x: 1440,
          c1y: 395,
          c2x: 1445,
          c2y: 360,
          x2: 1460,
          y2: 345,
          stroke: '#FFFFFF',
          width: 14,
          reveal: 0.9,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const curve = result.spec.shapes.find((s) => s.kind === 'curve');
    expect(curve?.kind).toBe('curve');
    if (curve?.kind !== 'curve') return;
    expect(colorDistance(curve.stroke, FIGURE_CANVAS_BG)).toBeGreaterThanOrEqual(
      MIN_VISIBLE_DELTA_E,
    );
  });

  it('画在深色底上的白色不补轮廓：边界已经由底下的颜色交代了', () => {
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'rect', x: 200, y: 420, w: 400, h: 200, rx: 12, fill: '#334155', reveal: 0.85 },
        { kind: 'circle', cx: 400, cy: 520, r: 40, fill: '#FFFFFF', reveal: 0.9 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const white = result.spec.shapes.filter((s) => s.kind === 'circle')[0];
    expect(white && 'stroke' in white ? white.stroke : undefined).toBeUndefined();
  });

  it('横贯画面的浅色色带不补轮廓：边界就是画布边界，加框像给地面装相框', () => {
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'rect', x: 0, y: 560, w: FIGURE_WIDTH, h: 80, rx: 0, fill: '#EAF8DF', reveal: 0.9 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const band = result.spec.shapes.find((s) => s.kind === 'rect');
    expect(band?.kind).toBe('rect');
    if (band?.kind !== 'rect') return;
    expect(band.fill).toBe('#EAF8DF');
    expect(band.stroke).toBeUndefined();
  });

  it('小到放不下一圈轮廓的淡色图元改压深填充，不描边', () => {
    // 铁钉那种 40×14 的细条：描边宽度会把整条填满，看起来像糊了一块深色
    const result = normalizeFigureSpec({
      shapes: [
        ...rainbow().shapes,
        { kind: 'rect', x: 1300, y: 480, w: 40, h: 14, rx: 7, fill: '#DDE3EA', reveal: 0.9 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nail = result.spec.shapes.find((s) => s.kind === 'rect');
    expect(nail?.kind).toBe('rect');
    if (nail?.kind !== 'rect') return;
    expect(nail.stroke).toBeUndefined();
    expect(colorDistance(nail.fill, FIGURE_CANVAS_BG)).toBeGreaterThanOrEqual(MIN_VISIBLE_DELTA_E);
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
  it('七种图元与画布尺寸都写进了 prompt 说明', () => {
    const grammar = describeFigureGrammar();
    ['arc', 'line', 'curve', 'circle', 'rect', 'polygon', 'subjectIcon'].forEach((kind) => {
      expect(grammar).toContain(kind);
    });
    expect(grammar).toContain(String(FIGURE_WIDTH));
    expect(grammar).toContain(String(FIGURE_HEIGHT));
    expect(grammar).toContain('labels');
  });
});

describe('subjectIcon 图元', () => {
  /** 合法基准：一道弧 + 一个主体图标（彩虹下的蝌蚪） */
  const withIcon = (icon: Record<string, unknown>) => ({
    shapes: [
      {
        kind: 'arc',
        cx: 800,
        cy: 640,
        r: 490,
        from: 4,
        to: 176,
        stroke: '#E5484D',
        width: 34,
        reveal: 0,
      },
      {
        kind: 'arc',
        cx: 800,
        cy: 640,
        r: 430,
        from: 4,
        to: 176,
        stroke: '#0091FF',
        width: 34,
        reveal: 0.2,
      },
      icon,
    ],
  });

  it('接受合法 subjectIcon 并保留 subject/坐标/尺寸', () => {
    const result = normalizeFigureSpec(
      withIcon({ kind: 'subjectIcon', subject: '小蝌蚪', x: 400, y: 460, size: 160, reveal: 0.5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icon = result.spec.shapes[2];
    expect(icon.kind).toBe('subjectIcon');
    if (icon.kind !== 'subjectIcon') return;
    expect(icon.subject).toBe('小蝌蚪');
    expect(icon.x).toBe(400);
    expect(icon.y).toBe(460);
    expect(icon.size).toBe(160);
    expect(icon.iconSrc).toBeUndefined();
  });

  it('kind 大小写不敏感（subjecticon → subjectIcon）', () => {
    const result = normalizeFigureSpec(
      withIcon({ kind: 'subjecticon', subject: '鸟', x: 1200, y: 200, size: 120 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.shapes[2].kind).toBe('subjectIcon');
  });

  it('空 subject 的图标被丢弃，不废整份 spec', () => {
    const result = normalizeFigureSpec(
      withIcon({ kind: 'subjectIcon', subject: '  ', x: 400, y: 460 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.shapes).toHaveLength(2);
  });

  it('subject 截断到 8 字，尺寸 clamp 到上下限', () => {
    const result = normalizeFigureSpec(
      withIcon({
        kind: 'subjectIcon',
        subject: '一二三四五六七八九十',
        x: 400,
        y: 460,
        size: 9999,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icon = result.spec.shapes[2];
    if (icon.kind !== 'subjectIcon') return;
    expect(icon.subject).toHaveLength(8);
    expect(icon.size).toBe(480);
  });

  it('坐标 clamp 在画布内，包围盒按尺寸计算', () => {
    const result = normalizeFigureSpec(
      withIcon({ kind: 'subjectIcon', subject: '石头', x: -100, y: 9999, size: 200 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icon = result.spec.shapes[2];
    if (icon.kind !== 'subjectIcon') return;
    expect(icon.x).toBe(0);
    expect(icon.y).toBe(FIGURE_HEIGHT);
    expect(shapeBounds(icon)).toEqual({
      x1: -100,
      y1: FIGURE_HEIGHT - 100,
      x2: 100,
      y2: FIGURE_HEIGHT + 100,
    });
  });

  it('图标不占颜色配额，也不被补轮廓', () => {
    const result = normalizeFigureSpec(
      withIcon({ kind: 'subjectIcon', subject: '白云', x: 400, y: 200, size: 160 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icon = result.spec.shapes[2];
    expect('stroke' in icon).toBe(false);
    expect('fill' in icon).toBe(false);
  });
});
