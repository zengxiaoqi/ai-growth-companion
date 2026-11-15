/**
 * 受控画板（Figure）语法层
 *
 * 解决的是 scene-graph 覆盖不到的一类知识：**图形本身就是知识**。
 * 彩虹是一道七色弧，太阳系是一圈圈轨道，凸透镜成像是两条光线交于像点——
 * 这些内容用"节点 + 标签 + 箭头"永远表达不出来，因为它们的载体是形状，不是概念。
 *
 * 与"给科学类做几个专用示意图组件"的区别：组件枚举的是主题（彩虹、太阳系、透镜），
 * 主题是无穷的；这里枚举的是**图元**（弧、线、曲线、圆、矩形、多边形），图元是有限的。
 * 六个图元组合能覆盖绝大多数平面示意图形，加任何新主题都只是换一组坐标。
 *
 * 边界由这一层守死：
 * - 坐标 clamp 在画布内，物理上画不出界
 * - 图元白名单，没有 transform / filter / 外部引用 / text（文字由模板渲染，字体才一致）
 * - 数量、颜色数、重复度都有上限
 * - 几何合理性检查：覆盖率、居中、弧半径、标签压图、主线图元
 * 任一项不过就整份拒绝，让上层降级到 sceneGraph，绝不把脏图带进渲染器。
 */

export const FIGURE_WIDTH = 1600;
export const FIGURE_HEIGHT = 640;

export const FIGURE_KINDS = ['arc', 'line', 'rect', 'circle', 'curve', 'polygon'] as const;

export type FigureKind = (typeof FIGURE_KINDS)[number];

/** 推荐色板。不是白名单——合法 hex 都接受，但整份 spec 的颜色数受 MAX_COLORS 限制 */
export const FIGURE_PALETTE = [
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
] as const;

export const MAX_SHAPES = 48;
export const MAX_LABELS = 6;
export const MAX_LABEL_CHARS = 6;
export const MAX_COLORS = 12;
/** 完全相同的图元最多几个——防止 LLM 循环刷同一条线充数 */
export const MAX_IDENTICAL = 3;
/** 弧半径下限。小于画布高的 6% 肉眼看不见，装配阶段直接丢掉，不废整张图 */
export const MIN_ARC_R = FIGURE_HEIGHT * 0.06;
/** 可读性下限：线宽 / 圆半径。这两项不是模型该操心的事，是成片能不能看清的问题 */
export const MIN_STROKE = 6;
export const MIN_RADIUS = 12;

/** 画布中性底色，与模板 SceneBackground 的 neutral 分支一致——对比度按它算 */
export const FIGURE_CANVAS_BG = '#FCFEFF';
/** 图元颜色与底色的最小 CIE76 色差。低于它的图元在白底上等于没画 */
export const MIN_VISIBLE_DELTA_E = 12;
/** 轮廓与填充的最小色差——轮廓得看出是一条边，不能只是浅一点点 */
export const MIN_CONTOUR_DELTA_E = 22;
/** 补轮廓时往这个深色混：石板灰，与色板同族，不引入新色相 */
const CONTOUR_INK = '#334155';
/** 横贯画面的色带（草地、天空、水层）不补轮廓：它的边界就是画布边界，加框反而怪 */
const BAND_WIDTH = FIGURE_WIDTH * 0.6;

export type FigureShape =
  | {
      kind: 'arc';
      cx: number;
      cy: number;
      r: number;
      /** 起始角，单位度。0° 在右，逆时针为正（数学约定，y 向上） */
      from: number;
      /** 结束角，单位度。沿逆时针从 from 走到 to */
      to: number;
      stroke: string;
      width: number;
    }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      fill: string;
      /** 仅当填充色离底色太近时由校验层补上，模型不填 */
      stroke?: string;
      strokeWidth?: number;
    }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; strokeWidth?: number }
  | {
      kind: 'curve';
      x1: number;
      y1: number;
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x2: number;
      y2: number;
      stroke: string;
      width: number;
    }
  | { kind: 'polygon'; points: string; fill: string; stroke?: string; strokeWidth?: number };

export type FigureGlyph = FigureShape & {
  /** 0..1，只表达先后；同一数值同时出现。渲染器负责映射到讲解进度 */
  reveal: number;
};

export type FigureLabel = {
  /** ≤ 6 字。字号与字体由模板锁定，LLM 不能改 */
  text: string;
  x: number;
  y: number;
  color?: string;
};

export type FigureSpec = {
  shapes: FigureGlyph[];
  labels?: FigureLabel[];
};

export type Bounds = { x1: number; y1: number; x2: number; y2: number };

const KIND_SET = new Set<string>(FIGURE_KINDS);
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanText(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNum(input: unknown, fallback: number, min: number, max: number): number {
  const value = typeof input === 'string' ? Number(input) : input;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function toColor(input: unknown, fallback: string): string {
  const value = cleanText(input);
  return HEX_COLOR.test(value) ? value : fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const body = hex.replace('#', '');
  const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const toLinear = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIE76 色差。用来回答的只有一个问题：**这两个颜色在白底上分得开吗**。
 * 不做 CIEDE2000 那套权重——那是给印刷配色用的精度，这里差 2 和差 3 没有区别。
 * 非法色值返回 Infinity：看不懂的颜色不动它，宁可漏补也不乱改模型的稿子。
 */
export function colorDistance(a: string, b: string): number {
  if (!HEX_COLOR.test(a) || !HEX_COLOR.test(b)) return Number.POSITIVE_INFINITY;
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * ratio));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 画布内 clamp：普通图元一律不许出界 */
const inX = (input: unknown, fallback: number) => toNum(input, fallback, 0, FIGURE_WIDTH);
const inY = (input: unknown, fallback: number) => toNum(input, fallback, 0, FIGURE_HEIGHT);

/**
 * 弧的圆心允许落在画布外。
 * 彩虹的正确画法是"圆心压在画布底边之下"——虹本是整圆，下半被地面挡住，
 * 把圆心限死在画布内就只能画出又小又圆的一坨，看着像彩虹埋在地里。
 */
const arcX = (input: unknown, fallback: number) => toNum(input, fallback, -600, FIGURE_WIDTH + 600);
const arcY = (input: unknown, fallback: number) => toNum(input, fallback, -600, FIGURE_HEIGHT + 900);

function normalizePoints(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const nums = input
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
  if (nums.length < 6 || nums.length > 24 || nums.length % 2 !== 0) return null;
  const pairs: string[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    const x = Math.max(0, Math.min(FIGURE_WIDTH, nums[i]));
    const y = Math.max(0, Math.min(FIGURE_HEIGHT, nums[i + 1]));
    pairs.push(`${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`);
  }
  return pairs.join(' ');
}

function normalizeShape(
  raw: unknown,
  accent: string,
): { shape: FigureShape; reveal: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const kind = cleanText(entry.kind || entry.type).toLowerCase();
  if (!KIND_SET.has(kind)) return null;

  const reveal = toNum(entry.reveal, 0, 0, 1);
  const stroke = toColor(entry.stroke || entry.color, accent);
  const fill = toColor(entry.fill || entry.color, accent);
  // 实测模型爱给 width=2 的细线（太阳系的轨道），在 1600 宽画布里缩到成片是 1~1.5px，
  // 肉眼几乎看不见。线宽是可读性问题，不该由模型决定，这里抬到下限。
  const width = toNum(entry.width || entry.strokeWidth, 8, MIN_STROKE, 60);

  if (kind === 'arc') {
    const from = toNum(entry.from, 0, -720, 720);
    let to = toNum(entry.to, 180, -720, 720);
    // 起止角完全相同画不出东西，直接视为非法
    if (Math.abs(to - from) < 0.5) return null;
    return {
      shape: {
        kind: 'arc',
        cx: arcX(entry.cx, FIGURE_WIDTH / 2),
        cy: arcY(entry.cy, FIGURE_HEIGHT),
        r: toNum(entry.r, 200, 2, 2400),
        from,
        to,
        stroke,
        width,
      },
      reveal,
    };
  }

  if (kind === 'line') {
    const x1 = inX(entry.x1, 0);
    const y1 = inY(entry.y1, FIGURE_HEIGHT / 2);
    const x2 = inX(entry.x2, FIGURE_WIDTH);
    const y2 = inY(entry.y2, FIGURE_HEIGHT / 2);
    if (Math.hypot(x2 - x1, y2 - y1) < 4) return null;
    return { shape: { kind: 'line', x1, y1, x2, y2, stroke, width }, reveal };
  }

  if (kind === 'rect') {
    // 宽高不能只 clamp 到画布尺寸，还得减去起点，否则 x+w 依然会溢出
    const x = inX(entry.x, 0);
    const y = inY(entry.y, 0);
    return {
      shape: {
        kind: 'rect',
        x,
        y,
        w: toNum(entry.w || entry.width, 120, 8, Math.max(8, FIGURE_WIDTH - x)),
        h: toNum(entry.h || entry.height, 120, 8, Math.max(8, FIGURE_HEIGHT - y)),
        rx: toNum(entry.rx, 0, 0, 200),
        fill,
      },
      reveal,
    };
  }

  if (kind === 'circle') {
    return {
      shape: {
        kind: 'circle',
        cx: inX(entry.cx, FIGURE_WIDTH / 2),
        cy: inY(entry.cy, FIGURE_HEIGHT / 2),
        // 同理：行星那种 r=7 的小圆在成片里就是几粒灰，抬到 r=12 才看得见
        r: toNum(entry.r, 60, MIN_RADIUS, FIGURE_WIDTH),
        fill,
      },
      reveal,
    };
  }

  if (kind === 'curve') {
    return {
      shape: {
        kind: 'curve',
        x1: inX(entry.x1, 0),
        y1: inY(entry.y1, 0),
        c1x: inX(entry.c1x, FIGURE_WIDTH / 3),
        c1y: inY(entry.c1y, 0),
        c2x: inX(entry.c2x, (FIGURE_WIDTH * 2) / 3),
        c2y: inY(entry.c2y, FIGURE_HEIGHT),
        x2: inX(entry.x2, FIGURE_WIDTH),
        y2: inY(entry.y2, FIGURE_HEIGHT),
        stroke,
        width,
      },
      reveal,
    };
  }

  const points = normalizePoints(entry.points);
  if (!points) return null;
  return { shape: { kind: 'polygon', points, fill }, reveal };
}

const pointAt = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
};

/** 图元的包围盒。弧和曲线用采样近似——只为几何校验服务，不参与渲染 */
export function shapeBounds(shape: FigureShape): Bounds {
  if (shape.kind === 'line') {
    return {
      x1: Math.min(shape.x1, shape.x2),
      y1: Math.min(shape.y1, shape.y2),
      x2: Math.max(shape.x1, shape.x2),
      y2: Math.max(shape.y1, shape.y2),
    };
  }

  if (shape.kind === 'rect') {
    return { x1: shape.x, y1: shape.y, x2: shape.x + shape.w, y2: shape.y + shape.h };
  }

  if (shape.kind === 'circle') {
    return {
      x1: shape.cx - shape.r,
      y1: shape.cy - shape.r,
      x2: shape.cx + shape.r,
      y2: shape.cy + shape.r,
    };
  }

  if (shape.kind === 'arc') {
    let from = shape.from;
    let to = shape.to;
    if (to < from) [from, to] = [to, from];
    const xs: number[] = [];
    const ys: number[] = [];
    const steps = Math.max(4, Math.min(72, Math.round(Math.abs(to - from) / 4)));
    for (let i = 0; i <= steps; i += 1) {
      const p = pointAt(shape.cx, shape.cy, shape.r, from + ((to - from) * i) / steps);
      xs.push(p.x);
      ys.push(p.y);
    }
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    };
  }

  if (shape.kind === 'curve') {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const mt = 1 - t;
      xs.push(
        mt * mt * mt * shape.x1 +
          3 * mt * mt * t * shape.c1x +
          3 * mt * t * t * shape.c2x +
          t * t * t * shape.x2,
      );
      ys.push(
        mt * mt * mt * shape.y1 +
          3 * mt * mt * t * shape.c1y +
          3 * mt * t * t * shape.c2y +
          t * t * t * shape.y2,
      );
    }
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    };
  }

  const nums = shape.points
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  if (xs.length === 0) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  return list.reduce((acc, b) => ({
    x1: Math.min(acc.x1, b.x1),
    y1: Math.min(acc.y1, b.y1),
    x2: Math.max(acc.x2, b.x2),
    y2: Math.max(acc.y2, b.y2),
  }));
}

const area = (b: Bounds) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);

const overlapArea = (a: Bounds, b: Bounds) => {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
};

type FilledShape = Extract<FigureShape, { fill: string }>;

const isFilled = (shape: FigureShape): shape is FilledShape =>
  shape.kind === 'circle' || shape.kind === 'rect' || shape.kind === 'polygon';

/** 轮廓色：填充色向深石板灰混，保持同一色相，不引入新颜色 */
function contourOf(fill: string): string {
  const ink = mixHex(fill, CONTOUR_INK, 0.55);
  if (colorDistance(ink, fill) >= MIN_CONTOUR_DELTA_E) return ink;
  return mixHex(fill, '#1F2937', 0.72);
}

/** 线类图元没有"面"可描边，只能把自己压深到看得见 */
function deepenInk(color: string): string {
  for (const ratio of [0.5, 0.65, 0.8]) {
    const next = mixHex(color, CONTOUR_INK, ratio);
    if (colorDistance(next, FIGURE_CANVAS_BG) >= MIN_VISIBLE_DELTA_E) return next;
  }
  return mixHex(color, '#1F2937', 0.85);
}

/**
 * 这个图元是不是画在另一块已经带色的图上——是的话它不缺轮廓。
 * 例如深色眼珠上的一块白高光，白自己不显眼，但底下的颜色已经把边界交代清楚了。
 * 只认画在它之前（更靠底层）的实心图元。
 */
function hasBackdrop(shape: FigureShape, index: number, shapes: FigureShape[]): boolean {
  if (!isFilled(shape)) return false;
  const box = shapeBounds(shape);
  for (let i = 0; i < index; i += 1) {
    const under = shapes[i];
    if (!isFilled(under)) continue;
    const b = shapeBounds(under);
    if (b.x1 <= box.x1 && b.y1 <= box.y1 && b.x2 >= box.x2 && b.y2 >= box.y2) {
      if (colorDistance(under.fill, shape.fill) >= MIN_VISIBLE_DELTA_E) return true;
    }
  }
  return false;
}

/**
 * 可读性兜底：颜色离底色太近的图元，在白底上等于没画。
 *
 * 实测 22 张成片里 9 张（41%）带纯白图元——彩虹那四张的"雨珠"是纯白圆 +
 * 纯白触角曲线，成片里只剩两颗蓝眼睛浮在背景上；小兔子的身体、牙齿、
 * 月亮也都是白的。这些不是模型画错，白色本来就是雨珠和月亮的正确颜色。
 *
 * 所以不改语义色，只补轮廓：实心图元加一圈深色描边，线类图元把自己的颜色压深。
 * 「什么颜色」归模型，「能不能看见」归代码——和线宽下限、圆半径下限同一条原则。
 */
function withReadableInk(shapes: FigureGlyph[]): FigureGlyph[] {
  return shapes.map((shape, index) => {
    if (isFilled(shape)) {
      if (colorDistance(shape.fill, FIGURE_CANVAS_BG) >= MIN_VISIBLE_DELTA_E) return shape;
      // 横贯画面的色带不需要框：边界就是画布边界，加一圈描边像给地面画了个相框
      if (shape.kind === 'rect' && shapeBounds(shape).x2 - shapeBounds(shape).x1 >= BAND_WIDTH) return shape;
      if (hasBackdrop(shape, index, shapes)) return shape;
      // 小到放不下一圈轮廓的图形（铁钉那种 14px 细条），描边会把里面填满、
      // 看起来像糊了一块深色 —— 这种直接压深填充，别描边
      const box = shapeBounds(shape);
      if (Math.min(box.x2 - box.x1, box.y2 - box.y1) < MIN_STROKE * 3) {
        return { ...shape, fill: deepenInk(shape.fill) };
      }
      return { ...shape, stroke: contourOf(shape.fill), strokeWidth: MIN_STROKE };
    }
    if (colorDistance(shape.stroke, FIGURE_CANVAS_BG) >= MIN_VISIBLE_DELTA_E) return shape;
    if (hasBackdrop(shape, index, shapes)) return shape;
    return { ...shape, stroke: deepenInk(shape.stroke) };
  });
}

/** 标签包围盒按字号 34 估算，宁可估宽一点，避免字压在图形上还判定通过 */
const labelBounds = (label: FigureLabel): Bounds => {
  const halfW = (Math.max(1, label.text.length) * 34) / 2;
  return { x1: label.x - halfW, y1: label.y - 34, x2: label.x + halfW, y2: label.y + 8 };
};

export type FigureRejectReason =
  | 'empty'
  | 'coverage'
  | 'off-center'
  | 'tiny-arc'
  | 'label-cover'
  | 'no-main-shape'
  | 'too-many-colors';

export type FigureResult =
  | { ok: true; spec: FigureSpec }
  | { ok: false; reason: FigureRejectReason };

/**
 * 几何合理性。语法合法不等于画得对：LLM 完全可能交出一堆坐标都在范围内的
 * 图元，却缩在一个角上、或者字压在线上。这几条都是可计算的，不靠人眼。
 */
function checkGeometry(spec: FigureSpec): FigureRejectReason | null {
  const canvas = FIGURE_WIDTH * FIGURE_HEIGHT;
  const boundsList = spec.shapes.map((s) => shapeBounds(s));
  const whole = unionBounds(boundsList);
  if (!whole) return 'empty';

  // 覆盖率：缩成一个角 或 撑爆画面，都不像"一张图"
  const ratio = area(whole) / canvas;
  if (ratio < 0.12 || ratio > 0.92) return 'coverage';

  // 居中：全挤在左半边是常见的 LLM 输出
  const cx = (whole.x1 + whole.x2) / 2;
  const cy = (whole.y1 + whole.y2) / 2;
  if (Math.abs(cx - FIGURE_WIDTH / 2) > FIGURE_WIDTH * 0.22) return 'off-center';
  if (Math.abs(cy - FIGURE_HEIGHT / 2) > FIGURE_HEIGHT * 0.3) return 'off-center';

  // 弧太小等于没画出弧。但**不能因为一条小弧废掉整张图**：
  // 实测 20 条主题里，"太阳系"那份 8 条轨道 + 太阳 + 行星的稿子，
  // 就因为土星环被画成 r=18 的小弧而整体被拒——一条装饰性小弧不该毁掉一张正确的图。
  // 所以小弧在装配阶段就丢掉（见 normalizeFigureSpec），这里只兜底。
  if (spec.shapes.every((s) => s.kind === 'arc' && s.r < MIN_ARC_R)) return 'tiny-arc';

  // 主体判定：**去掉背景条之后，内容本身还得是一张图**。
  // 原规则要求"至少两个图元各自贯穿 60% 高度"，实测把三类正确的图判死：
  // 同心圆（地球分层 r=260/175/95，只有最外圈够长）、排成一行的小图元
  // （月亮圆缺、数字 1-5）、短线段拼出来的图形（木棒搭三角形）。
  // 但也不能只看整体包围盒——"一条贯穿画面的草地色带 + 几个小图标"整体包围盒
  // 很满，内容却还是小图标，正是要淘汰的旧观感。
  // 所以先剔掉横贯画面的背景条（rect 宽 ≥ 60% 画布宽），再看剩下的内容边界。
  const contentBounds =
    unionBounds(
      spec.shapes
        .map((shape) => ({ shape, box: shapeBounds(shape) }))
        .filter(({ shape, box }) => !(shape.kind === 'rect' && box.x2 - box.x1 >= BAND_WIDTH))
        .map(({ box }) => box),
    ) ?? whole;
  const cbw = contentBounds.x2 - contentBounds.x1;
  const cbh = contentBounds.y2 - contentBounds.y1;
  if (Math.max(cbw, cbh) < FIGURE_HEIGHT * 0.55) return 'no-main-shape';
  if (Math.min(cbw, cbh) < FIGURE_HEIGHT * 0.12) return 'no-main-shape';

  // 标签压在实心图形上读不出来。线条类不比，包围盒判断线条太粗会大量误伤
  const solid = spec.shapes
    .filter((s) => s.kind === 'circle' || s.kind === 'rect' || s.kind === 'polygon')
    .map((s) => shapeBounds(s));
  for (const label of spec.labels || []) {
    const box = labelBounds(label);
    for (const solidBox of solid) {
      if (overlapArea(box, solidBox) / Math.max(1, area(box)) > 0.6) return 'label-cover';
    }
  }

  const colors = new Set<string>();
  spec.shapes.forEach((s) => colors.add('stroke' in s ? s.stroke : s.fill));
  (spec.labels || []).forEach((l) => colors.add(l.color || ''));
  colors.delete('');
  if (colors.size > MAX_COLORS) return 'too-many-colors';

  return null;
}

export function normalizeFigureSpec(raw: unknown, accent = '#3E63DD'): FigureResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'empty' };
  const source = raw as Record<string, unknown>;
  const rawShapes = Array.isArray(source.shapes)
    ? source.shapes
    : Array.isArray(source.elements)
      ? source.elements
      : [];
  if (rawShapes.length === 0) return { ok: false, reason: 'empty' };

  const shapes: FigureGlyph[] = [];
  const seen = new Map<string, number>();

  for (const item of rawShapes) {
    if (shapes.length >= MAX_SHAPES) break;
    const normalized = normalizeShape(item, accent);
    if (!normalized) continue;
    // 看不见的小弧（土星环、装饰性的小弧线）单独丢掉，别让它废掉整份 spec
    if (normalized.shape.kind === 'arc' && normalized.shape.r < MIN_ARC_R) continue;
    // 完全相同的图元叠着画没有意义，只可能是模型在刷数量
    const key = JSON.stringify(normalized.shape);
    const count = seen.get(key) || 0;
    if (count >= MAX_IDENTICAL) continue;
    seen.set(key, count + 1);
    shapes.push({ ...normalized.shape, reveal: normalized.reveal });
  }

  if (shapes.length === 0) return { ok: false, reason: 'empty' };

  // 补轮廓要在几何校验之前：轮廓不影响包围盒，但「太阳」这类标签的压图判断
  // 与顺序无关，放在这里是为了让校验看到的就是最终要渲染的那份 spec
  const inked = withReadableInk(shapes);

  const rawLabels = Array.isArray(source.labels) ? source.labels : [];
  const labels: FigureLabel[] = [];
  for (const item of rawLabels) {
    if (labels.length >= MAX_LABELS) break;
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const text = cleanText(entry.text || entry.label).slice(0, MAX_LABEL_CHARS);
    if (!text) continue;
    labels.push({
      text,
      x: inX(entry.x, FIGURE_WIDTH / 2),
      y: inY(entry.y, FIGURE_HEIGHT - 40),
      ...(entry.color ? { color: toColor(entry.color, accent) } : {}),
    });
  }

  const spec: FigureSpec = { shapes: inked, ...(labels.length ? { labels } : {}) };
  const reject = checkGeometry(spec);
  if (reject) return { ok: false, reason: reject };
  return { ok: true, spec };
}

/** 提供给 prompt 的语法说明，和上面的实现必须同步——改一处要改两处 */
export function describeFigureGrammar(): string {
  return [
    '## figure（画面图形，和 sceneGraph 二选一）',
    '有些知识本身就是一张图：彩虹是一道七色弧，太阳系是一圈圈轨道，凸透镜成像是两条光线交于像点。',
    '这类内容用"节点+标签"画不出来，请改用 figure：你直接给图元的坐标。',
    `画布固定 ${FIGURE_WIDTH}×${FIGURE_HEIGHT}，原点在左上角，中心在 (${FIGURE_WIDTH / 2}, ${FIGURE_HEIGHT / 2})。`,
    '图元只能取六种，kind 字段区分：',
    '- {"kind":"arc","cx":800,"cy":640,"r":490,"from":4,"to":176,"stroke":"#E5484D","width":34,"reveal":0}',
    '  弧。角度单位是度，0°在右、逆时针为正。画彩虹要让圆心落在画布底边之下(cy≥640)，弧才宽。',
    '- {"kind":"line","x1":330,"y1":150,"x2":800,"y2":150,"stroke":"#F76B15","width":4,"reveal":0}',
    '  直线。光轴、标尺、连线、箭头杆。',
    '- {"kind":"curve","x1":800,"y1":90,"c1x":700,"c1y":180,"c2x":700,"c2y":420,"x2":800,"y2":510,"stroke":"#3E63DD","width":7,"reveal":0}',
    '  三次贝塞尔曲线，c1/c2 是两个控制点。画轮廓、抛物线、透镜侧面。',
    '- {"kind":"circle","cx":800,"cy":285,"r":60,"fill":"#FFB020","reveal":0}  圆。天体、水滴、粒子、节点。',
    '- {"kind":"rect","x":200,"y":400,"w":1200,"h":80,"rx":12,"fill":"#8B9AA8","reveal":0}  矩形。地层、容器、格子。',
    '- {"kind":"polygon","points":"330,124 313,166 347,166","fill":"#E5484D","reveal":0}  多边形。箭头尖、山形、棱锥。',
    '规则：',
    '- reveal 取 0~1，只表达"先画哪个"，同一数值同时出现。不用你管时长和动画。',
    '- 文字一律不要画。需要标位置时用 labels：[{"text":"水滴","x":250,"y":520}]，每个 ≤6 字，并且不要压在图形上。',
    '- 图元总数 ≤ 32，颜色 ≤ 8 种。',
    '- 图形要铺开：内容占画布面积 1/5 到 4/5，别缩在角落，别撑满。',
    '- 同一份 figure 里至少有两个"主体图元"（比如七条弧、几条光线），不要一堆小圆点凑数。',
    '- 颜色按实物来就行：雨珠白、月亮白、牙齿白都可以。太接近底色的图元会被自动补一圈深色轮廓，不用为了"看得见"把白色改成灰的。',
    '- 几何要算准：光线要真的汇聚到交点，弧的圆心和半径要能对上两端落点。算不准就别用 figure，退回 sceneGraph。',
  ].join('\n');
}
