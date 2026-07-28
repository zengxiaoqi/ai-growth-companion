// ===== Bento 文档类型定义 =====
// 按照 Bento 官方 format.md (v1.0.6) 规范编写
// 参考: https://raw.githubusercontent.com/nyblnet/bento/main/docs/format.md

// ===== 元素基础 =====

export interface ElementBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  shadow?: ShadowSpec | ShadowSpec[];
  fx?: Fx;
  link?: string;
  group?: string;
  groupId?: string;
  showOnHover?: string;
  role?: string;
}

export interface ShadowSpec {
  x?: number;
  y?: number;
  blur: number;
  color: string;
}

// ===== 元素类型 =====

export interface TextElement extends ElementBase {
  type: 'text';
  html: string; // 支持 <b> <i> <u> <s> <code> <br> <span>
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number;
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing?: number;
  placeholder?: string; // 空文本时显示的提示
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'triangle' | 'arrow' | 'line' | 'path';
  fill: string; // CSS 颜色，line 取色自 fill
  stroke: string;
  strokeWidth: number;
  radius: number; // rect 圆角 (不是 borderRadius)
  fillGradient?: {
    angle: number; // 0=下→上, 90=左→右
    stops: Array<{ at: number; color: string }>;
  };
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  lineStart?: 'none' | 'arrow' | 'dot' | 'bar';
  lineEnd?: 'none' | 'arrow' | 'dot' | 'bar';
  d?: string; // SVG path data (仅 path)
  pathBox?: [number, number, number, number]; // [x, y, w, h] viewBox
  from?: { el: string; side: string };
  to?: { el: string; side: string };
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string; // data: URI 或 "asset:<key>"
  fit: 'contain' | 'cover' | 'fill';
  radius: number;
}

export interface SvgElement extends ElementBase {
  type: 'svg';
  asset?: string; // key into doc.assets
  markup?: string; // inline SVG
  css?: string; // scoped CSS
}

export interface ChartElement extends ElementBase {
  type: 'chart';
  preset: 'bar' | 'line' | 'pie' | 'scatter';
  option: Record<string, any>; // ECharts-shaped pure JSON
  source?: { tableId: string }; // live binding to a table element
}

export interface TableCell {
  html: string;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bg?: string;
  bold?: boolean;
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableStyle {
  headerBg: string;
  headerColor: string;
  zebra?: string;
  borderColor: string;
  borderWidth: number;
  cellPadX: number;
  cellPadY: number;
  fontSize: number;
  fontFamily?: string;
  color: string;
  radius: number;
}

export interface TableElement extends ElementBase {
  type: 'table';
  columns: Array<{ w: number }>; // 权重数组
  rows: TableRow[];
  header: boolean;
  style: TableStyle;
}

export interface MediaElement extends ElementBase {
  type: 'media';
  kind: 'video' | 'audio';
  src: string; // data: URI, 外部 URL, 或 "asset:<key>"
  poster?: string; // 仅 video
  fit?: 'contain' | 'cover' | 'fill';
  radius?: number;
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | SvgElement
  | ChartElement
  | TableElement
  | MediaElement;

// ===== 特效 =====

export interface Fx {
  enter?:
    | 'fade-up'
    | 'fade'
    | 'fade-down'
    | 'slide-left'
    | 'slide-right'
    | 'slide-up'
    | 'slide-down';
  order?: number;
  countUp?: boolean;
  ambient?: 'kenburns';
  ken?: { dir?: 'drift' | 'out' | 'in'; scale?: number; duration?: number };
  loop?: FxLoop;
}

export type FxLoop =
  | { type: 'dash-march'; distance?: number; duration?: number }
  | {
      type: 'motion-path';
      path: any;
      duration: number;
      delay?: number;
      ease?: number;
      speeds?: number[];
    };

// ===== 主题 =====

export interface Theme {
  background: string;
  color: string;
  accent: string;
  fontFamily: string;
  chartPalette?: string[];
  table?: Partial<TableStyle>;
}

// ===== 幻灯片 =====

export type TransitionKind = 'none' | 'fade' | 'slide' | 'zoom' | 'morph';

export interface Comment {
  id: string;
  author: string;
  text: string;
  at: string; // ISO timestamp
  elementId?: string;
  x?: number;
  y?: number;
  resolved?: boolean;
  replies?: Array<{ id: string; author: string; text: string; at: string }>;
}

export interface Slide {
  id: string;
  background: string; // CSS color
  transition: TransitionKind;
  elements: SlideElement[];
  notes: string; // speaker notes
  name?: string;
  stateOf?: string; // parent slide id
  hover?: {
    type: 'focus-group' | 'reveal';
    dim?: boolean;
    default?: string;
  };
  comments?: Comment[];
}

// ===== 顶层文档 =====

export interface BentoDoc {
  format: 'bento/slides'; // 固定值
  version: number; // 当前: 1
  docId: string; // uuid，生成时创建
  title: string;
  size: { width: number; height: number }; // 默认 1280×720
  theme: Theme;
  slides: Slide[];
  modified: string; // ISO 时间戳，必填
  present?: {
    slideNumber?: boolean;
    controls?: boolean;
    progress?: boolean;
  };
  assets?: Record<string, string>; // key → data: URI 或 SVG markup
  fonts?: Array<{ family: string; asset: string; weight?: number; style?: string }>;
  layouts?: Slide[];
  collab?: {
    room: string;
    key: string;
    on?: boolean;
    sync?: any;
    writerPub?: string;
    writerPriv?: string;
    role?: 'writer' | 'reader';
  };
  template?: boolean;
  readonly?: boolean;
  meta?: {
    author?: string;
    company?: string;
    subject?: string;
    event?: string;
    keywords?: string;
  };
}

// ===== 辅助类型 =====

export interface GenerateBentoDto {
  childId: string;
  period: 'week' | 'month' | 'year';
  data: Record<string, any>;
}
