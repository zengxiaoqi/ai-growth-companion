import { promises as fs } from 'fs';
import * as path from 'path';
import { checkGeneratedFiles } from '../remotion-ts-validator';

/**
 * agent-remotion 引擎的单代码路径契约。
 *
 * 服务层预置 contract.ts / index.ts / Root.tsx / props.json，创作 agent 只写
 * GeneratedLesson.tsx。契约 = 固定导出 + 固定 props 类型 + 禁 fs/network/eval/
 * 非帧驱动 + 真 tsc 类型检查（复用 remotion-ts-validator，与确定性引擎同一套）。
 * render-stills 工具与引擎服务共用本模块，避免"两条路径校验覆盖不全"。
 */

export type AuthorBeat = {
  sentenceIndex: number;
  span?: number;
  focus?: string;
  reveal?: string[];
  motion: string;
  params?: Record<string, unknown>;
};

export type AuthorScene = {
  id: string;
  title: string;
  narration: string;
  /** 服务层预生成的 TTS mp3（public 相对路径），可空串（该场景无配音） */
  narrationSrc: string;
  onScreenText: string;
  visualDescription?: string;
  durationFrames: number;
  accentColor: string;
  beats: AuthorBeat[];
  figure?: {
    shapes: Array<Record<string, unknown>>;
    labels?: Array<{ text: string; x: number; y: number; color?: string }>;
  };
  sceneGraph?: {
    relation: string;
    caption?: string;
    nodes: Array<Record<string, unknown>>;
  };
  characterSrc?: string;
  backgroundSrc?: string;
  overlaySrcs?: string[];
  /** sceneGraph 节点 id → 图标素材（public 相对路径） */
  graphIcons?: Record<string, string>;
};

export type AuthorLessonProps = {
  title: string;
  topic: string;
  domain: string;
  ageGroup: string;
  fps: number;
  durationFrames: number;
  accentColor: string;
  backgroundColor: string;
  scenes: AuthorScene[];
};

/** 预置进任务目录的 contract.ts：remotion 项目内自包含，不引 backend 模块 */
export const AUTHOR_CONTRACT_TS = `export type AuthorBeat = {
  sentenceIndex: number;
  span?: number;
  focus?: string;
  reveal?: string[];
  motion: string;
  params?: Record<string, unknown>;
};

export type AuthorScene = {
  id: string;
  title: string;
  narration: string;
  narrationSrc: string;
  onScreenText: string;
  visualDescription?: string;
  durationFrames: number;
  accentColor: string;
  beats: AuthorBeat[];
  figure?: {
    shapes: Array<Record<string, unknown>>;
    labels?: Array<{ text: string; x: number; y: number; color?: string }>;
  };
  sceneGraph?: {
    relation: string;
    caption?: string;
    nodes: Array<Record<string, unknown>>;
  };
  characterSrc?: string;
  backgroundSrc?: string;
  overlaySrcs?: string[];
  graphIcons?: Record<string, string>;
};

export type AuthorLessonProps = {
  title: string;
  topic: string;
  domain: string;
  ageGroup: string;
  fps: number;
  durationFrames: number;
  accentColor: string;
  backgroundColor: string;
  scenes: AuthorScene[];
};
`;

export const AUTHOR_INDEX_TS = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`;

export function buildAuthorRootTsx(compositionId: string, durationFrames: number): string {
  return [
    'import React from "react";',
    'import { Composition } from "remotion";',
    'import { GeneratedLesson } from "./GeneratedLesson";',
    'import type { AuthorLessonProps } from "./contract";',
    '',
    'export const RemotionRoot: React.FC = () => {',
    `  const defaultProps: AuthorLessonProps = { title: "", topic: "", domain: "science", ageGroup: "5-6", fps: 30, durationFrames: ${durationFrames}, accentColor: "#00B4D8", backgroundColor: "#E8F8FF", scenes: [] };`,
    '  return (',
    '    <Composition',
    `      id=${JSON.stringify(compositionId)}`,
    '      component={GeneratedLesson}',
    '      fps={30}',
    '      width={1920}',
    '      height={1080}',
    '      defaultProps={defaultProps}',
    '      calculateMetadata={({ props }) => ({',
    '        durationInFrames: Number(props.durationFrames) || defaultProps.durationFrames,',
    '        props,',
    '      })}',
    '    />',
    '  );',
    '};',
    '',
  ].join('\n');
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\brequire\s*\(/, 'require()'],
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bprocess\s*\./, 'process.*'],
  [/Date\.now\s*\(/, 'Date.now()'],
  [/Math\.random\s*\(/, 'Math.random()'],
  [/setTimeout\s*\(/, 'setTimeout()'],
  [/setInterval\s*\(/, 'setInterval()'],
  [/\bwindow\b|\bdocument\b|localStorage/, 'browser globals'],
  [/from\s+["'](fs|child_process|net|http|https|os|path|node:[a-z_]+)["']/, 'node builtin import'],
];

const ALLOWED_IMPORT = /^(react|react\/[a-z-]+|remotion|\.\/contract)$/;

/** 剥离注释与单/双引号字符串内容（保留模板字面量——${} 里可能是真代码）。
 * 禁项检查只应落在真实代码上：注释里的 "document"/"window" 曾让 task 15 反复
 * 误报 browser globals，模型怎么改都过不了契约。 */
function stripCommentsAndStrings(source: string): string {
  return source.replace(
    /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => (m.startsWith('//') || m.startsWith('/*') ? ' '.repeat(m.length) : '""'),
  );
}

/** 静态契约：固定导出/props 类型/帧驱动/禁项。错误回喂 agent，不静默。 */
export function validateAuthorSource(source: string): string[] {
  const errors: string[] = [];
  if (!/export\s+(const|function)\s+GeneratedLesson\b/.test(source)) {
    errors.push('must export const GeneratedLesson (fixed composition entry)');
  }
  if (!/import\s+type\s+\{[^}]*AuthorLessonProps[^}]*\}\s+from\s+["']\.\/contract["']/.test(source)) {
    errors.push('must import type { AuthorLessonProps } from "./contract" and type the component with it');
  }
  if (!/useCurrentFrame\s*\(/.test(source)) {
    errors.push('must be frame-driven: use useCurrentFrame()');
  }
  const code = stripCommentsAndStrings(source);
  for (const [re, label] of FORBIDDEN) {
    // node builtin import 的模块名在字符串里，剥离后就没了，须查原始源码
    // （ALLOWED_IMPORT 白名单也兜底，但这里给出更明确的错误标签）。
    if (re.test(label === 'node builtin import' ? source : code)) {
      errors.push(`forbidden in authored code: ${label}`);
    }
  }
  const importRe = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) {
    if (!ALLOWED_IMPORT.test(m[1])) errors.push(`import not allowed: ${m[1]} (only react / remotion / ./contract)`);
  }
  return errors;
}

/** 静态契约 + 真 tsc（任务目录内，继承 remotion tsconfig）。 */
export async function validateAuthorTaskDir(
  taskDir: string,
  remotionDir: string,
): Promise<{ ok: boolean; errors: string[] }> {
  let source: string;
  try {
    source = await fs.readFile(path.join(taskDir, 'GeneratedLesson.tsx'), 'utf8');
  } catch {
    return { ok: false, errors: ['GeneratedLesson.tsx not written yet'] };
  }
  const errors = validateAuthorSource(source);
  const ts = await checkGeneratedFiles(taskDir, remotionDir);
  if (!ts.passed) {
    errors.push(
      ...ts.errors.slice(0, 12).map((e) => `${path.basename(e.file)}(${e.line},${e.col}): ${e.message}`),
    );
  }
  return { ok: errors.length === 0, errors };
}