/**
 * 道具几何（数据层）：**glyph 长什么样**，与它怎么被渲染分开。
 *
 * 拆成 .ts + .tsx 两个文件，和场地那套（`venue-recipes.ts` 配方 / `venue-assets.tsx`
 * 组件）一致，理由是同一个：数据要能被后端单测直接 import。
 * `prop-glyph.tsx` 里有 JSX，后端 tsconfig 不认；而"内置了哪几个道具、每条 markup
 * 有没有被注入脚本"这类断言，恰恰应该在没有任何渲染的情况下就能跑。
 *
 * 为什么道具是 markup 字符串而不是 React 组件：
 *  - 内置道具与"装配期现画"的道具必须走**同一条**渲染路径，否则又是两套代码；
 *  - 现画的产物是 SVG 文本（asset-gen 的输出），只有字符串能同时容纳两者；
 *  - 组件形式要靠 `if (id === ...)` 分派，字符串形式不需要——加道具就是加一条数据。
 */
import { ACTOR } from './pose';

/**
 * 道具几何的来源。
 *  - `builtin`：仓库自带（markup 写在本文件的 `PROP_BUILTIN_MARKUP`）；
 *  - `library`：命中矢量库；
 *  - `generated`：装配期由 asset-gen 现画；
 *  - `placeholder`：以上都没得到，画占位件（**不再静默消失**）。
 */
export type ScenePropSource = 'builtin' | 'library' | 'generated' | 'placeholder';

/**
 * 渲染层吃的道具数据。
 *
 * `canvas` / `fill` 是**两个数**，不是两个分支：
 *  - `canvas`：markup 的绘图盒边长（内置 160，生成 256）；
 *  - `fill`：内容占盒高的比例（内置画满 = 1，生成约 0.75）。
 * 换任何道具都只有这两个数，它们描述"这张图怎么画的"，不是"这是什么道具"。
 */
export interface ScenePropGlyph {
  /** 规范化后的名字；同课同一道具共用一份 markup，用于一致性断言 */
  id: string;
  /** 中文名，用于标签/气泡；占位件用它取首字 */
  label: string;
  /** 世界单位高度 = ACTOR.standHeight × heightRatio；渲染时再乘 ppu */
  size: number;
  /** 已消毒的几何，不含外层 <svg>；缺失即走占位件 */
  markup?: string;
  canvas: number;
  fill: number;
  /**
   * 内容水平中心 / 底边在画布坐标里的位置（生成物光栅化后量出来的真实值）。
   *
   * 缺省表示"内容垂直居中、水平居中"——内置道具的几何本来就按这个约定写，
   * 所以它们不传这两个字段，渲染结果与加这个字段之前完全一致。
   */
  anchorX?: number;
  anchorY?: number;
  fallback?: 'placeholder';
  source: ScenePropSource;
}

/** 内置道具的绘图盒边长。改了它所有内置道具会同时缩放，别单独改。 */
export const PROP_BUILTIN_CANVAS = 160;

/**
 * 内置道具的几何。
 *
 * 每条都是"原来的 JSX 逐节点翻译成字符串"，坐标保持 −80..80 不变——外层包一个
 * `translate(80 80)` 平移到 0..160 的盒子里。**不做坐标重写**是刻意的：
 * 手抄一遍 80 个数会错，而错了的表现是"某个道具整体偏移半个身位"，
 * 在整幅画面里很难一眼看出来。
 *
 * 属性必须写成 HTML 形式（`stroke-width` 而不是 `strokeWidth`）：这段字符串
 * 不经 React 的属性转换，直接交给浏览器解析。
 *
 * 这些是**风格基线**，不是"允许出现的道具清单"：新道具走 asset-gen 生成，
 * 这里不再扩。保留它们是因为它们零成本、零调用，且定义了"我们想要的画风"。
 */
export const PROP_BUILTIN_MARKUP: Record<string, string> = {
  ball: `<circle cx="0" cy="0" r="58" fill="#ff5252" stroke="#b71c1c" stroke-width="5"/><path d="M-56 -16 Q0 8 56 -16 M-56 16 Q0 -8 56 16 M-16 -56 Q16 0 -16 56 M16 -56 Q-16 0 16 56" fill="none" stroke="#fff4e6" stroke-width="5"/>`,
  cookie: `<circle cx="0" cy="0" r="52" fill="#e6a23c" stroke="#a86a1e" stroke-width="5"/><circle cx="-22" cy="-14" r="6" fill="#6d3f12"/><circle cx="16" cy="-24" r="6" fill="#6d3f12"/><circle cx="28" cy="12" r="6" fill="#6d3f12"/><circle cx="-12" cy="25" r="6" fill="#6d3f12"/><circle cx="2" cy="2" r="6" fill="#6d3f12"/>`,
  apple: `<path d="M0 -36 C30 -58 58 -30 48 10 C40 44 12 58 0 50 C-12 58 -40 44 -48 10 C-58 -30 -30 -58 0 -36 Z" fill="#f44336" stroke="#a82017" stroke-width="5"/><path d="M0 -38 Q6 -64 28 -66" fill="none" stroke="#5d4037" stroke-width="7" stroke-linecap="round"/><ellipse cx="22" cy="-56" rx="18" ry="9" fill="#4caf50" transform="rotate(-24 22 -56)"/>`,
  banana: `<path d="M-46 -34 C-44 30 -6 58 42 40 C56 34 60 18 50 12 C18 34 -18 16 -20 -36 C-22 -52 -46 -50 -46 -34 Z" fill="#ffd54f" stroke="#c79a00" stroke-width="5"/>`,
  book: `<path d="M-58 -36 L-4 -28 L-4 42 L-58 34 Z" fill="#fff8e1" stroke="#8d6e63" stroke-width="5"/><path d="M58 -36 L4 -28 L4 42 L58 34 Z" fill="#fff8e1" stroke="#8d6e63" stroke-width="5"/><path d="M0 -28 L0 42" stroke="#8d6e63" stroke-width="6"/>`,
  block: `<rect x="-52" y="-28" width="48" height="48" rx="8" fill="#42a5f5" stroke="#1565c0" stroke-width="5"/><rect x="4" y="-18" width="48" height="48" rx="8" fill="#66bb6a" stroke="#2e7d32" stroke-width="5"/><rect x="-28" y="18" width="48" height="48" rx="8" fill="#ffca28" stroke="#ef6c00" stroke-width="5"/>`,
  table: `<rect x="-66" y="-30" width="132" height="22" rx="6" fill="#c98a4b" stroke="#8d5524" stroke-width="5"/><rect x="-54" y="-8" width="12" height="60" rx="4" fill="#a86a34" stroke="#8d5524" stroke-width="4"/><rect x="42" y="-8" width="12" height="60" rx="4" fill="#a86a34" stroke="#8d5524" stroke-width="4"/>`,
  slide: `<path d="M-58 -44 L-58 12 L44 56" fill="none" stroke="#ff8a65" stroke-width="18" stroke-linecap="round"/><path d="M-58 -44 L58 -44 M-58 12 L58 12" stroke="#4dd0e1" stroke-width="12" stroke-linecap="round"/><path d="M-58 12 L-58 56 M58 12 L58 56" stroke="#26a69a" stroke-width="10" stroke-linecap="round"/>`,
  star: `<path d="M0 -52 L15 -17 L53 -12 L26 15 L34 52 L0 33 L-34 52 L-26 15 L-53 -12 L-15 -17 Z" fill="#ffd54f" stroke="#f9a825" stroke-width="5"/>`,
  heart: `<path d="M0 46 C-56 12 -54 -34 -26 -38 C-10 -40 0 -28 0 -20 C0 -28 10 -40 26 -38 C54 -34 56 12 0 46 Z" fill="#ff6b81" stroke="#c2185b" stroke-width="5"/>`,
};

/** 内置道具的 id 清单（只表示"自带哪几个"，不表示"道具一共只有这些"） */
export const PROP_BUILTIN_IDS = Object.keys(PROP_BUILTIN_MARKUP);

/**
 * 内置道具的"身高比"：道具高度 ÷ 角色身高。
 *
 * 这是一张**尺寸标定表**，不是内容清单——它回答的是"苹果该多大"，
 * 不回答"能不能有苹果"。表里只有自带的 10 个；新道具的尺寸由分镜声明
 * （`props[].heightRatio`）或调用方的缺省值决定。
 *
 * 以前所有道具共用一个 `PROP_SIZE = standHeight × 0.57`，于是苹果和桌子
 * 一样高（都到熊胸口），"水桶比熊掌还大"。尺寸错了，画得再对也不像。
 */
export const PROP_BUILTIN_RATIO: Record<string, number> = {
  apple: 0.1,
  cookie: 0.12,
  book: 0.12,
  star: 0.14,
  heart: 0.14,
  banana: 0.18,
  block: 0.2,
  ball: 0.22,
  table: 0.55,
  slide: 0.9,
};

/** 没有尺寸线索时的兜底比例：与旧常量 PROP_SIZE（standHeight × 0.57）等价 */
export const PROP_DEFAULT_RATIO = 0.57;

/** 道具的身高比：先查标定表，再退到调用方给的缺省值 */
export function propHeightRatio(id: string | undefined, fallback = PROP_DEFAULT_RATIO): number {
  const key = String(id || '').trim().toLowerCase();
  const ratio = PROP_BUILTIN_RATIO[key];
  if (typeof ratio === 'number' && ratio > 0) return ratio;
  return fallback;
}

/**
 * 身高比 → 世界单位高度。
 *
 * 唯一一处把"比例"换成"世界单位"的地方：渲染层与后端都用它，避免两边
 * 各自乘一遍 1.67（乘错一次就是"道具大一倍"，而画面上看起来只是"有点怪"）。
 */
export function propSizeFor(heightRatio: number): number {
  return ACTOR.standHeight * heightRatio;
}

/**
 * 取一个内置道具的 glyph。
 *
 * 未登记返回 `null` —— **由调用方决定**是画占位件还是什么都不画。这里不做兜底，
 * 因为两种"没有"的期望不同：旧词表推出的 id 可能根本不存在（不该凭空多出一个盒子），
 * 而分镜明确声明的道具画不出来时必须让人看见（占位件）。
 */
export function builtinPropGlyph(
  id: string,
  label = '',
  size = propSizeFor(PROP_DEFAULT_RATIO),
): ScenePropGlyph | null {
  const key = String(id || '').trim().toLowerCase();
  const art = PROP_BUILTIN_MARKUP[key];
  if (!art) return null;
  return {
    id: key,
    label: label || key,
    size,
    // 外层那层平移是坐标约定（−80..80 → 0..160），不属于"这个道具长什么样"，
    // 所以不写进 markup 常量里，免得每条数据都要抄一遍 80。
    markup: `<g transform="translate(${PROP_BUILTIN_CANVAS / 2} ${PROP_BUILTIN_CANVAS / 2})">${art}</g>`,
    canvas: PROP_BUILTIN_CANVAS,
    fill: 1,
    source: 'builtin',
  };
}
