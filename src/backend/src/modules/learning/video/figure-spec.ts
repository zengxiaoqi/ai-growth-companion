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
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
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
  | { kind: 'polygon'; points: string; fill: string };

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
  const width = toNum(entry.width || entry.strokeWidth, 4, 1, 60);

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
        r: toNum(entry.r, 60, 2, FIGURE_WIDTH),
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

  // 弧太小等于没画出弧
  const minArc = FIGURE_HEIGHT * 0.06;
  if (spec.shapes.some((s) => s.kind === 'arc' && s.r < minArc)) return 'tiny-arc';

  // 主线图元：至少要两条"贯穿画面"的元素，否则是一堆小点凑数。
  // 按最长边而不是按面积判断——光路图、坐标图、结构图的主体全是一条条线，
  // 线的包围盒面积恒为 0，按面积算会把合法的透镜成像图判成废稿。
  const mainLength = Math.min(FIGURE_WIDTH, FIGURE_HEIGHT) * 0.6;
  const mainShapes = boundsList.filter(
    (b) => Math.max(b.x2 - b.x1, b.y2 - b.y1) >= mainLength,
  );
  if (mainShapes.length < 2) return 'no-main-shape';

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
    // 完全相同的图元叠着画没有意义，只可能是模型在刷数量
    const key = JSON.stringify(normalized.shape);
    const count = seen.get(key) || 0;
    if (count >= MAX_IDENTICAL) continue;
    seen.set(key, count + 1);
    shapes.push({ ...normalized.shape, reveal: normalized.reveal });
  }

  if (shapes.length === 0) return { ok: false, reason: 'empty' };

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

  const spec: FigureSpec = { shapes, ...(labels.length ? { labels } : {}) };
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
    '- 几何要算准：光线要真的汇聚到交点，弧的圆心和半径要能对上两端落点。算不准就别用 figure，退回 sceneGraph。',
  ].join('\n');
}
