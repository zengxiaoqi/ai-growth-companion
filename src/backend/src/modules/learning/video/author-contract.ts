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
  /** 部位讲解场景：服务层从标题/旁白推导。存在时必须用 ./part-focus 的
   * PartFocusStage 渲染（组件自带角色几何与放大裁剪，保证放大区域==部位）。 */
  partFocus?: { subject: string; part: string; callout?: string };
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
  partFocus?: { subject: string; part: string; callout?: string };
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

/** 预置进任务目录的 motion-helpers.ts：从确定性引擎内联配方提取的动效原语。
 * 常规动效（焦点/入场/stagger/pop/swell）调它拿质量下限；bespoke 场景仍可写
 * 原始 interpolate/spring。参数与 video-generation-agent 的已验证配方同口径。 */
export const AUTHOR_MOTION_HELPERS_TS = `import { interpolate, spring } from "remotion";

/** 年龄动效幅度：3-4 岁大而慢 1.25，5-6 岁稍收敛 1.12。所有 scale/swell 乘它。 */
export const ageAmplitude = (ageGroup: string): number => (ageGroup === "3-4" ? 1.25 : 1.12);

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** [start,end] 帧窗内的 clamp 进度 0→1。帧的纯函数，任意静帧可复现。 */
export const progress = (frame: number, start: number, end: number): number =>
  interpolate(frame, [start, Math.max(start + 1, end)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** spring 入场 0→1。pop=原地弹性过冲；travel=远处飞入近乎无回弹。enterFrame 必须是进入帧而非全局帧。 */
export const springEnter = (
  frame: number,
  enterFrame: number,
  fps: number,
  kind: "pop" | "travel" = "pop",
): number =>
  spring({
    frame: frame - enterFrame,
    fps,
    config: kind === "travel" ? { damping: 26, stiffness: 62, mass: 1.1 } : { damping: 13, stiffness: 150, mass: 0.85 },
  });

/** 焦点三档缩放：active 推前+呼吸（周期约 36 帧），visited 归位，pending 退后。amp 取 ageAmplitude。 */
export const focusScale = (frame: number, state: "active" | "visited" | "pending", amp = 1): number =>
  state === "active"
    ? 1 + 0.16 * amp + Math.sin(frame / 5.7) * 0.05 * amp
    : state === "visited"
      ? 0.97
      : 0.86;

/** stagger 入场：兄弟元素逐个错开 offset 帧（规格 6-10，默认 8）。返回该项入场 spring 0→1。 */
export const staggerEnter = (frame: number, enterFrame: number, index: number, fps: number, offset = 8): number =>
  springEnter(frame, enterFrame + index * offset, fps);

/** spring-pop 强调：0.62→1 弹性弹出，落定后接 focusScale 呼吸档。popFrame=旁白念到该主体的帧。 */
export const popScale = (frame: number, popFrame: number, fps: number): number =>
  0.62 + 0.38 * spring({ frame: frame - popFrame, fps, config: { damping: 8, stiffness: 170, mass: 0.7 } });

/** swell 体量：跟讲解进度 0→1，grow +28% / shrink -28%，够看出变化又不挤到邻居。 */
export const swellScale = (progress01: number, direction: "grow" | "shrink"): number =>
  direction === "grow" ? 1 + 0.28 * clamp01(progress01) : 1 - 0.28 * clamp01(progress01);
`;

/** 预置进任务目录的 part-focus.tsx：部位讲解的"正确即构造"组件。
 * 角色几何与放大镜裁剪共用同一张 CAT_PARTS 坐标表与同一个 CatFigure，
 * 放大区域必然等于被讲部位——作者只传 part/callout，无法再画错裁剪。
 * 未知部位退化为整只角色居中（不给出误导性的局部裁剪）。 */
export const AUTHOR_PART_FOCUS_TSX = `import React, { useId } from "react";
import { ageAmplitude, progress, springEnter } from "./motion-helpers";

type Part = { cx: number; cy: number; r: number };

/** 猫角色坐标表（CatFigure 的 400×440 空间）。左卡与放大镜共用，单一真源。 */
const CAT_PARTS: Record<string, Part> = {
  头: { cx: 200, cy: 185, r: 150 },
  眼睛: { cx: 200, cy: 168, r: 88 },
  鼻子: { cx: 200, cy: 236, r: 48 },
  耳朵: { cx: 200, cy: 78, r: 122 },
  胡须: { cx: 200, cy: 252, r: 122 },
  嘴巴: { cx: 200, cy: 268, r: 54 },
  尾巴: { cx: 320, cy: 330, r: 96 },
  条纹: { cx: 200, cy: 360, r: 122 },
  爪子: { cx: 200, cy: 408, r: 92 },
};

const resolvePart = (part: string): Part => {
  const key = Object.keys(CAT_PARTS).find((k) => part.includes(k));
  return key ? CAT_PARTS[key] : { cx: 200, cy: 220, r: 210 };
};

/** 纯 SVG 猫角色（400×440 坐标），左卡与放大镜裁剪复用同一份。 */
const CatFigure: React.FC = () => (
  <g>
    <path d="M310 340 q70 -10 62 -78 q-4 -34 -34 -40" fill="none" stroke="#F6A94E" strokeWidth="26" strokeLinecap="round" />
    <ellipse cx="200" cy="360" rx="118" ry="68" fill="#F6A94E" stroke="#7A4A1F" strokeWidth="6" />
    <path d="M150 312 q6 26 0 44 M185 306 q6 30 0 52 M220 306 q6 30 0 52 M252 312 q6 26 0 44" fill="none" stroke="#D3883E" strokeWidth="9" strokeLinecap="round" />
    <ellipse cx="160" cy="408" rx="30" ry="17" fill="#F6A94E" stroke="#7A4A1F" strokeWidth="5" />
    <ellipse cx="240" cy="408" rx="30" ry="17" fill="#F6A94E" stroke="#7A4A1F" strokeWidth="5" />
    <path d="M120 122 L92 30 L178 74 Z" fill="#F6A94E" stroke="#7A4A1F" strokeWidth="6" strokeLinejoin="round" />
    <path d="M124 104 L108 52 L160 78 Z" fill="#F7BFC6" />
    <path d="M280 122 L308 30 L222 74 Z" fill="#F6A94E" stroke="#7A4A1F" strokeWidth="6" strokeLinejoin="round" />
    <path d="M276 104 L292 52 L240 78 Z" fill="#F7BFC6" />
    <circle cx="200" cy="185" r="148" fill="#FBF3DC" stroke="#C9BFA8" strokeWidth="5" />
    <path d="M170 52 q4 20 0 40 M200 46 q4 22 0 44 M230 52 q4 20 0 40" fill="none" stroke="#E8D9B8" strokeWidth="7" strokeLinecap="round" />
    <ellipse cx="150" cy="168" rx="27" ry="35" fill="#FFFFFF" stroke="#4A3B2A" strokeWidth="5" />
    <ellipse cx="150" cy="170" rx="13" ry="25" fill="#35C46B" />
    <ellipse cx="150" cy="172" rx="5" ry="16" fill="#1E5B36" />
    <circle cx="145" cy="158" r="6" fill="#FFFFFF" />
    <ellipse cx="250" cy="168" rx="27" ry="35" fill="#FFFFFF" stroke="#4A3B2A" strokeWidth="5" />
    <ellipse cx="250" cy="170" rx="13" ry="25" fill="#35C46B" />
    <ellipse cx="250" cy="172" rx="5" ry="16" fill="#1E5B36" />
    <circle cx="245" cy="158" r="6" fill="#FFFFFF" />
    <path d="M182 228 L218 228 L200 250 Z" fill="#F26D9C" stroke="#7A4A1F" strokeWidth="4" strokeLinejoin="round" />
    <path d="M200 250 q0 12 -14 15 M200 250 q0 12 14 15" fill="none" stroke="#7A4A1F" strokeWidth="4" strokeLinecap="round" />
    <path d="M62 236 L120 244 M62 260 L120 258 M338 236 L280 244 M338 260 L280 258" fill="none" stroke="#C9BFA8" strokeWidth="4" strokeLinecap="round" />
  </g>
);

export type PartFocusProps = {
  frame: number;
  fps: number;
  part: string;
  callout: string;
  accent: string;
  ageGroup: string;
};

const CARD = { x: 110, y: 170, w: 760, h: 760 };
const MAG = { cx: 1360, cy: 250, r: 150 };
const CALL = { x: 1180, y: 430, w: 640, h: 240 };
const S = 1.5;
const OX = CARD.x + (CARD.w - 400 * S) / 2;
const OY = CARD.y + (CARD.h - 440 * S) / 2;

const wrap = (text: string, n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
  return out.length ? out : [""];
};

/** 部位讲解舞台：左卡角色+虚线焦点圈，右上放大镜（裁剪==部位），右下讲解卡。
 * frame 传场景局部帧。标题/背景/进度条由作者的场景外壳负责。 */
export const PartFocusStage: React.FC<PartFocusProps> = ({ frame, fps, part, callout, accent, ageGroup }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = resolvePart(part);
  const amp = ageAmplitude(ageGroup);
  const cardK = springEnter(frame, 0, fps, "pop");
  const magK = springEnter(frame, 10, fps, "pop");
  const callK = springEnter(frame, 18, fps, "pop");
  const guideO = progress(frame, 12, 26);
  const breath = 1 + 0.04 * amp * Math.sin(frame / 5.7);
  const px = OX + S * p.cx;
  const py = OY + S * p.cy;
  const zoom = ((MAG.r * 0.82) / p.r) * (1 + 0.03 * amp * Math.sin(frame / 6));
  const ccx = CARD.x + CARD.w / 2;
  const ccy = CARD.y + CARD.h / 2;
  const lines = wrap(callout, 13);
  const clipId = "mag-" + uid;
  return (
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={MAG.cx} cy={MAG.cy} r={MAG.r - 7} />
        </clipPath>
      </defs>
      <g opacity={cardK} transform={"translate(" + ccx + " " + ccy + ") scale(" + cardK + ") translate(" + -ccx + " " + -ccy + ")"}>
        <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx="40" fill="#FFFFFF" opacity="0.92" />
        <g transform={"translate(" + OX + " " + OY + ") scale(" + S + ")"}>
          <CatFigure />
        </g>
      </g>
      <g opacity={guideO}>
        <path d={"M" + px + " " + py + " Q " + (px + MAG.cx) / 2 + " " + (py - 60) + " " + MAG.cx + " " + MAG.cy} fill="none" stroke={accent} strokeWidth="6" strokeDasharray="14 12" strokeLinecap="round" />
        <circle cx={px} cy={py} r="12" fill={accent} />
        <circle cx={px} cy={py} r={S * p.r * 0.95 * breath} fill="none" stroke="#35C4E0" strokeWidth="7" strokeDasharray="20 14" strokeLinecap="round" />
      </g>
      <g opacity={magK} transform={"translate(" + MAG.cx + " " + MAG.cy + ") scale(" + magK + ") translate(" + -MAG.cx + " " + -MAG.cy + ")"}>
        <g clipPath={"url(#" + clipId + ")"}>
          <circle cx={MAG.cx} cy={MAG.cy} r={MAG.r} fill="#FFFFFF" />
          <g transform={"translate(" + MAG.cx + " " + MAG.cy + ") scale(" + zoom + ") translate(" + -p.cx + " " + -p.cy + ")"}>
            <CatFigure />
          </g>
        </g>
        <circle cx={MAG.cx} cy={MAG.cy} r={MAG.r} fill="none" stroke={accent} strokeWidth="9" />
      </g>
      <g opacity={callK} transform={"translate(" + (CALL.x + CALL.w / 2) + " " + (CALL.y + CALL.h / 2) + ") scale(" + callK + ") translate(" + -(CALL.x + CALL.w / 2) + " " + -(CALL.y + CALL.h / 2) + ")"}>
        <rect x={CALL.x} y={CALL.y} width={CALL.w} height={CALL.h} rx="28" fill="#FFFFFF" stroke={accent} strokeWidth="6" />
        <rect x={CALL.x + 28} y={CALL.y - 26} width={part.length * 44 + 40} height="56" rx="28" fill={accent} />
        <text x={CALL.x + 48} y={CALL.y + 14} fontSize="38" fontWeight="700" fill="#FFFFFF" fontFamily="sans-serif">{part}</text>
        {lines.map((ln, i) => (
          <text key={i} x={CALL.x + 40} y={CALL.y + 88 + i * 56} fontSize="40" fontWeight="600" fill="#203040" fontFamily="sans-serif">{ln}</text>
        ))}
      </g>
    </svg>
  );
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

const ALLOWED_IMPORT = /^(react|react\/[a-z-]+|remotion|\.\/contract|\.\/motion-helpers|\.\/part-focus)$/;

/** 剥离注释与单/双引号字符串内容（保留模板字面量——${} 里可能是真代码）。
 * 禁项检查只应落在真实代码上：注释里的 "document"/"window" 曾让 task 15 反复
 * 误报 browser globals，模型怎么改都过不了契约。注释按字符替换成空格但保留
 * 换行，使剥离后的行号与源码对齐（linear 豁免注释按行匹配依赖这一点）。 */
function stripCommentsAndStrings(source: string): string {
  return source.replace(
    /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => (m.startsWith('//') || m.startsWith('/*') ? m.replace(/[^\n]/g, ' ') : '""'),
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
    if (!ALLOWED_IMPORT.test(m[1])) {
      errors.push(`import not allowed: ${m[1]} (only react / remotion / ./contract / ./motion-helpers / ./part-focus)`);
    }
  }
  // 入场/退场禁用线性缓动（skill 硬规则里唯一可静态强制的一条）。连续运动
  // （旋转/进度条）用同/上行 "// linear-ok: 原因" 注释豁免；按行匹配避免误伤。
  const codeLines = code.split('\n');
  const srcLines = source.split('\n');
  codeLines.forEach((line, i) => {
    if (!/Easing\.linear\b/.test(line)) return;
    const exempt =
      /\/\/\s*linear-ok\b/.test(srcLines[i]) || (i > 0 && /\/\/\s*linear-ok\b/.test(srcLines[i - 1]));
    if (!exempt) {
      errors.push(
        `Easing.linear at line ${i + 1}: entrances/exits must use spring() or ease-out (prefer ./motion-helpers). ` +
          'For continuous motion (rotation/progress) add "// linear-ok: <reason>" on the same or previous line.',
      );
    }
  });
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