import type { SceneGraph } from './scene-graph';

/**
 * 编排（choreography）层：把"旁白讲到哪、画面强调谁、何时揭示、用什么动效"
 * 变成可校验的数据。确定性路径靠它去呆板，QA 修复靠它改参数，创作 agent 拿它当指导。
 * 节奏与幅度的年龄差异在代码层兜底，不交给模型自觉。
 */

export const MOTION_PRESETS = [
  'focus-ring',
  'spring-pop',
  'trace-on',
  'stagger',
  'swell',
  'orbit',
  'camera-push',
  'fade-rise',
] as const;

export type MotionPreset = (typeof MOTION_PRESETS)[number];

const PRESET_SET = new Set<string>(MOTION_PRESETS);

export const MOTION_PRESET_DESCRIPTIONS: Record<MotionPreset, string> = {
  'focus-ring': '描边圈套住被讲主体并随旁白转移到下一个主体，其余元素退后缩小',
  'spring-pop': '主体带弹性过冲地弹出（spring），落定后轻微呼吸',
  'trace-on': '线条/笔画/弧按讲解进度逐段长出来（stroke 揭示）',
  stagger: '一组元素按先后间隔依次进入（cascade），不要同时淡入',
  swell: '主体体量随讲解连续变大/变小（生长、融化、膨胀）',
  orbit: '子元素绕主体旋转（行星、循环箭头）',
  'camera-push': '整幅画面缓慢推近被讲区域（scale+translate），制造注视感',
  'fade-rise': '兜底：淡入+上浮，仅在没有更贴切动效时使用',
};

export type Beat = {
  /** 对应旁白第几句（0-based，按 。！？； 切句） */
  sentenceIndex: number;
  /** 覆盖几句（合并短句子时 >1） */
  span?: number;
  /** 被强调主体：sceneGraph 节点 id/label/subject 或 figure 标签文字 */
  focus?: string;
  /** 本拍首次揭示的元素 id/标签 */
  reveal?: string[];
  motion: MotionPreset;
  params?: Record<string, any>;
};

export type AgeMotionProfile = {
  minBeatSec: number;
  amplitude: number;
  allowOverlapReveal: boolean;
  /** TTS 时长未知前的合并代理：每拍最少字数 */
  minCharsPerBeat: number;
};

export function ageMotionProfile(ageGroup?: string): AgeMotionProfile {
  return ageGroup === '3-4'
    ? { minBeatSec: 2.5, amplitude: 1.25, allowOverlapReveal: false, minCharsPerBeat: 14 }
    : { minBeatSec: 1.6, amplitude: 1.12, allowOverlapReveal: true, minCharsPerBeat: 8 };
}

export function splitSentences(narration: string): string[] {
  return (narration || '')
    .split(/(?<=[。！？；!?;])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function describeChoreographyGrammar(ageGroup?: string): string {
  const profile = ageMotionProfile(ageGroup);
  const presets = MOTION_PRESETS.map(
    (p) => `- ${p}: ${MOTION_PRESET_DESCRIPTIONS[p]}`,
  ).join('\n');
  return [
    '## Choreography beats (MANDATORY per scene)',
    '- Split the narration into sentences (。！？；). Each beat covers one sentence',
    '  (merge adjacent short sentences into one beat when they are shorter than',
    `  ${profile.minCharsPerBeat} chars).`,
    '- beats[]: {sentenceIndex, span?, focus?, reveal[]?, motion, params?}.',
    '- focus = the node id/label/subject (graph) or label text (figure) being spoken',
    '  about in that sentence. The renderer puts the emphasis ring on it.',
    '- reveal = elements that first appear at this beat; earlier elements stay visible.',
    '- motion presets:',
    presets,
    `- Age ${ageGroup || '5-6'}: beat >= ${profile.minBeatSec}s, emphasis amplitude x${profile.amplitude},`,
    `  overlap reveal ${profile.allowOverlapReveal ? 'allowed' : 'FORBIDDEN (one new element per beat)'}.`,
    '- Choose motion that matches WHAT the sentence says (growth->swell, cycle->orbit,',
    '  writing/drawing->trace-on, listing->stagger, pointing->focus-ring).',
    '- If omitted, the system derives beats from sentences; deriving loses your intent,',
    '  so always provide them.',
  ].join('\n');
}

type DeriveContext = {
  graph?: SceneGraph | null;
  figureLabels?: string[];
};

function mentionIndex(text: string, names: string[]): number {
  // 中文单字标签会撞进长词里（「水」⊂「水蒸气」）：同位置取最长匹配，
  // 不同位置取句中最先出现的——否则焦点永远落在第一个短名节点上。
  let best = -1;
  let bestPos = Infinity;
  let bestLen = 0;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    if (!name) continue;
    const pos = text.indexOf(name);
    if (pos < 0) continue;
    if (pos < bestPos || (pos === bestPos && name.length > bestLen)) {
      best = i;
      bestPos = pos;
      bestLen = name.length;
    }
  }
  return best;
}

/** LLM 没给 beats 时的确定性推导：一句一拍、焦点=句中最先提到的主体。 */
export function deriveBeats(
  input: { narration: string } & DeriveContext,
  ageGroup?: string,
): Beat[] {
  const profile = ageMotionProfile(ageGroup);
  const sentences = splitSentences(input.narration);
  const nodes = input.graph?.nodes || [];
  const names = nodes.flatMap((n) => [n.label, n.subject, n.id]);
  const labels = input.figureLabels || [];

  const groups: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  sentences.forEach((s, i) => {
    current.push(i);
    chars += s.length;
    if (chars >= profile.minCharsPerBeat) {
      groups.push(current);
      current = [];
      chars = 0;
    }
  });
  if (current.length) {
    if (groups.length) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }

  const seen = new Set<string>();
  return groups.map((group) => {
    const text = group.map((i) => sentences[i]).join('');
    const nodeIdx = mentionIndex(text, names);
    const node = nodeIdx >= 0 ? nodes[Math.floor(nodeIdx / 3)] : undefined;
    const labelIdx = node ? -1 : mentionIndex(text, labels);
    const focus = node ? node.id : labelIdx >= 0 ? labels[labelIdx] : undefined;
    const reveal: string[] = [];
    for (const n of nodes) {
      if (!seen.has(n.id) && (text.includes(n.label) || text.includes(n.subject))) {
        seen.add(n.id);
        reveal.push(n.id);
      }
    }
    const motion: MotionPreset = node?.swell
      ? 'swell'
      : input.graph
        ? input.graph.relation === 'cycle'
          ? 'orbit'
          : 'focus-ring'
        : labels.length
          ? 'trace-on'
          : 'fade-rise';
    return {
      sentenceIndex: group[0],
      span: group.length,
      focus,
      reveal: profile.allowOverlapReveal ? reveal : reveal.slice(0, 1),
      motion,
    };
  });
}

/** 校验 LLM 给的 beats；非法/缺失回退推导。保证渲染层拿到的永远是可解释的 beats。 */
export function sanitizeBeats(
  raw: unknown,
  input: { narration: string } & DeriveContext,
  ageGroup?: string,
): Beat[] {
  const sentences = splitSentences(input.narration);
  if (!Array.isArray(raw) || raw.length === 0 || sentences.length === 0) {
    return deriveBeats(input, ageGroup);
  }
  const profile = ageMotionProfile(ageGroup);
  const defaultMotion: MotionPreset = input.graph ? 'focus-ring' : 'trace-on';
  const beats: Beat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, any>;
    const sentenceIndex = Math.max(
      0,
      Math.min(sentences.length - 1, Math.trunc(Number(r.sentenceIndex) || 0)),
    );
    const span = Math.max(
      1,
      Math.min(sentences.length - sentenceIndex, Math.trunc(Number(r.span) || 1)),
    );
    const focus = typeof r.focus === 'string' && r.focus.trim() ? r.focus.trim().slice(0, 24) : undefined;
    const reveal = Array.isArray(r.reveal)
      ? r.reveal.filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 6)
      : undefined;
    const motion = PRESET_SET.has(r.motion) ? (r.motion as MotionPreset) : defaultMotion;
    beats.push({
      sentenceIndex,
      span,
      focus,
      reveal: reveal
        ? profile.allowOverlapReveal
          ? reveal
          : reveal.slice(0, 1)
        : undefined,
      motion,
      params: r.params && typeof r.params === 'object' ? r.params : undefined,
    });
  }
  if (!beats.length) return deriveBeats(input, ageGroup);
  beats.sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  return beats.filter((b, i) => i === 0 || b.sentenceIndex !== beats[i - 1].sentenceIndex);
}

export type BeatWindow = { beat: Beat; startSec: number; endSec: number };

/**
 * 年龄拍长下限的代码层强制：LLM 给的 beats 可能比 profile 允许的更快，
 * prompt 自觉不可靠。相邻拍合并到 ≥ minBeatSec；reveal 取并集但 3-4 仍单揭示。
 * 合并保留首拍的 focus/motion——焦点转移变慢正是低龄需要的节奏。
 */
export function enforceAgeProfile(windows: BeatWindow[], profile: AgeMotionProfile): BeatWindow[] {
  const merged: BeatWindow[] = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.endSec - prev.startSec < profile.minBeatSec) {
      prev.endSec = w.endSec;
      prev.beat = {
        ...prev.beat,
        span: (prev.beat.span || 1) + (w.beat.span || 1),
        reveal: mergeReveal(prev.beat.reveal, w.beat.reveal, profile),
      };
    } else {
      merged.push({ beat: { ...w.beat }, startSec: w.startSec, endSec: w.endSec });
    }
  }
  const last = merged[merged.length - 1];
  const before = merged[merged.length - 2];
  if (last && before && last.endSec - last.startSec < profile.minBeatSec) {
    before.endSec = last.endSec;
    before.beat = {
      ...before.beat,
      span: (before.beat.span || 1) + (last.beat.span || 1),
      reveal: mergeReveal(before.beat.reveal, last.beat.reveal, profile),
    };
    merged.pop();
  }
  return merged;
}

function mergeReveal(a?: string[], b?: string[], profile?: AgeMotionProfile): string[] | undefined {
  const union = Array.from(new Set([...(a || []), ...(b || [])]));
  if (!union.length) return undefined;
  return profile && !profile.allowOverlapReveal ? union.slice(0, 1) : union.slice(0, 6);
}

/** 句字数比例分配场景时长 → 每拍的时间窗。TTS 有词级时间戳后可替换此分配。 */
export function beatWindows(
  beats: Beat[],
  narration: string,
  durationSec: number,
): BeatWindow[] {
  const sentences = splitSentences(narration);
  if (!sentences.length || !beats.length) return [];
  const totalChars = sentences.reduce((s, x) => s + x.length, 0) || 1;
  const starts: number[] = [];
  let acc = 0;
  for (const s of sentences) {
    starts.push((acc / totalChars) * durationSec);
    acc += s.length;
  }
  const ends = sentences.map((s, i) =>
    i + 1 < sentences.length ? starts[i + 1] : durationSec,
  );
  return beats.map((beat) => {
    const last = Math.min(sentences.length - 1, beat.sentenceIndex + (beat.span || 1) - 1);
    return {
      beat,
      startSec: starts[beat.sentenceIndex],
      endSec: Math.max(ends[last], starts[beat.sentenceIndex] + 0.5),
    };
  });
}