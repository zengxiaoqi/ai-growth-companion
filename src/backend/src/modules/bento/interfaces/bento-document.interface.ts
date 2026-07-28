// Core Bento document types for slide generation
// Reference: Bento internal model (model.ts) - simplified subset

export interface BentoDoc {
  format: string;
  version: number;
  docId: string;
  title: string;
  size: { w: number; h: number };
  theme: Theme;
  slides: Slide[];
  assets: Record<string, string>;
}

export interface Theme {
  background: string;
  color: string;
  accent: string;
  fontFamily: string;
}

export interface Slide {
  id: string;
  background?: string;
  transition?: string;
  elements: ElementBase[];
  notes?: string;
}

export interface ElementBase {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  style?: Record<string, unknown>;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;
  lineHeight?: number;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shapeType: 'rect' | 'circle' | 'line' | 'path';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  borderRadius?: number;
}

export interface ChartElement extends ElementBase {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  data: Record<string, unknown>;
  labels?: string[];
  colors?: string[];
}

export interface TableElement extends ElementBase {
  type: 'table';
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, string | number>[];
  headerStyle?: Record<string, unknown>;
  cellStyle?: Record<string, unknown>;
}

export type BentoElement = TextElement | ShapeElement | ImageElement | ChartElement | TableElement;
