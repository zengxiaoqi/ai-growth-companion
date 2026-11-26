/**
 * 字幕时间轴：把 Edge-TTS 的 WordBoundary 映射成"每个字幕 token 在第几帧点亮"。
 *
 * 背景：字幕本来按场景时长把字平均铺开，是估算值。实测（scripts/probe-tts-timing.cjs）
 * 与真实语音的偏差中位 0.56 秒、最大 1.36 秒，67% 的字偏 >0.3 秒（≈1.5 个汉字）。
 * 对识字阶段的孩子，"指读指错字"是最不能容忍的错误信号，所以这里用真实时间戳。
 *
 * 数据来源：Edge-TTS 的 synthesize() 本来就把 WordBoundary 收进实例，
 * getWordBoundaries() 可取（offset/duration 单位 100ns）。全仓此前从未读过。
 *
 * 关键约束：
 * 1. 送进 TTS 的文本被 sanitizeForTTS 清洗过（去 emoji/markdown/空格），
 *    所以边界文本和屏幕文本不能按字面逐字对齐，只能按"能念的字"（去标点空白）对齐。
 * 2. 对齐失败不能悄悄降质：覆盖率不足（默认 <60%）时返回 null，调用方回退到估算口径。
 */

/** Edge-TTS 的词边界，offset/duration 单位是 100 纳秒 */
export type WordBoundary = { text: string; offset: number; duration: number };

/** 一屏字幕：tokens 与 starts 一一对应，starts 是场景内相对帧 */
export type SubtitlePageCue = { tokens: string[]; starts: number[] };

export type SubtitleCues = {
  pages: SubtitlePageCue[];
  /** 对齐覆盖率：成功对上的字数 / 屏幕总字数 */
  coverage: number;
  /** 相对"按屏长均分"的修正量，用于日志与验收（帧） */
  shiftFrames: { avg: number; max: number };
};

export type BuildSubtitleCueOptions = {
  fps?: number;
  /** 场景总帧数，只用于统计修正量；不传则不统计 */
  sceneFrames?: number;
  /** 每屏最多字数 / 行数，与模板 splitNarration 保持一致 */
  maxChars?: number;
  maxLines?: number;
};

const TICKS_PER_SECOND = 1e7;

/** 与模板 SUB_PUNCT 一致：切 token 时标点跟在前一个字后面，不单独占一拍 */
const TOKEN_PUNCT = /[，。！？；：、,.!?;:]/;

/** 对齐时忽略的字符：标点、空白、符号。两侧同一规则，避免"一边有一个一边没有" */
const NON_SPEECH = /[\s\p{P}\p{S}]/u;

const CJK_BREAK = /[，。！？；：、,.!?;:]/;

const splitGraphemes = (text: string): string[] => {
  const Segmenter = (Intl as any).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (entry: any) => entry.segment,
  );
};

/** 把一屏文字切成"字+尾随标点"的 token（与模板 subtitleTokens 同义） */
export function subtitleTokens(text: string): string[] {
  const out: string[] = [];
  for (const ch of splitGraphemes(text)) {
    if (out.length > 0 && TOKEN_PUNCT.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** 与模板 splitNarration 同义的分屏：按标点优先切，保证每屏不超过 maxChars*maxLines */
export function splitSubtitlePages(text: string, maxChars = 15, maxLines = 2): string[] {
  const limit = Math.max(1, maxChars * maxLines);
  const chars = splitGraphemes((text || '').trim());
  const out: string[] = [];
  let from = 0;
  while (from < chars.length) {
    const remaining = chars.length - from;
    if (remaining <= limit) {
      out.push(chars.slice(from).join(''));
      break;
    }
    const minCut = from + Math.max(1, Math.floor(limit * 0.6));
    let cut = -1;
    for (let i = from + limit; i > minCut; i -= 1) {
      if (CJK_BREAK.test(chars[i - 1])) {
        cut = i;
        break;
      }
    }
    if (cut < 0) cut = from + limit;
    // 不把最后一个字单独推到下一屏：孩子会看到“彩色条 / 纹”这种断裂。
    // 优先回退到附近的标点；没有标点就匀出两格，仍保持每屏容量上限。
    if (chars.length - cut < 3 && cut > minCut) {
      let target = Math.max(minCut, cut - (3 - (chars.length - cut)));
      for (let i = target; i > minCut; i -= 1) {
        if (CJK_BREAK.test(chars[i - 1])) {
          target = i;
          break;
        }
      }
      cut = target;
    }
    out.push(chars.slice(from, cut).join(''));
    from = cut;
  }
  return out.length > 0 ? out : [''];
}

const isSpeechChar = (ch: string) => !NON_SPEECH.test(ch);

/** token 里"能念的核心字"：第一个非标点字符；纯标点 token 返回空串 */
function coreOf(token: string): string {
  for (const ch of Array.from(token)) if (isSpeechChar(ch)) return ch;
  return '';
}

type SpeechChar = { ch: string; at: number };

/**
 * 把边界展开成逐字时间点。一个词的 duration 摊到它的每个字上（线性），
 * 这样"两个字一个词"不会两颗字同时亮。
 */
function expandBoundaries(boundaries: WordBoundary[]): SpeechChar[] {
  const out: SpeechChar[] = [];
  for (const b of boundaries) {
    if (!b || typeof b.text !== 'string') continue;
    const chars = Array.from(b.text).filter(isSpeechChar);
    if (chars.length === 0) continue;
    const step = (Number(b.duration) || 0) / chars.length;
    chars.forEach((ch, i) => {
      out.push({ ch, at: (Number(b.offset) || 0) + step * i });
    });
  }
  return out;
}

const ticksToFrames = (ticks: number, fps: number) => (ticks / TICKS_PER_SECOND) * fps;

/**
 * 把旁白 + 词边界转成每屏的逐字时间轴。
 *
 * 对齐策略：两侧都只保留"能念的字"（去标点/空白/符号），然后双指针匹配；
 * 遇到不一致时往后看 4 个位置找能对上的（sanitize 会去掉 emoji、markdown 符号，
 * 也可能因为跳读丢字，所以不能严格逐字断言）。
 */
export function buildSubtitleCues(
  narration: string,
  boundaries: WordBoundary[] | undefined,
  options: BuildSubtitleCueOptions = {},
): SubtitleCues | null {
  const text = (narration || '').trim();
  if (!text || !Array.isArray(boundaries) || boundaries.length === 0) return null;

  const fps = options.fps ?? 30;
  const pages = splitSubtitlePages(text, options.maxChars ?? 15, options.maxLines ?? 2);
  const pageTokens = pages.map((page) => subtitleTokens(page));

  type Slot = { page: number; index: number; core: string; at?: number };
  const slots: Slot[] = [];
  pageTokens.forEach((tokens, page) =>
    tokens.forEach((token, index) => slots.push({ page, index, core: coreOf(token) })),
  );

  const speech = expandBoundaries(boundaries);
  const totalCores = slots.filter((s) => s.core).length;
  if (totalCores === 0 || speech.length === 0) return null;

  // 双指针 + 4 格前瞻：跳过 emoji/markdown 残渣和偶发错字，不因此整句错位
  const LOOKAHEAD = 4;
  let i = 0;
  let j = 0;
  while (i < speech.length && j < slots.length) {
    const slot = slots[j];
    if (!slot.core) {
      j += 1;
      continue;
    }
    if (speech[i].ch === slot.core) {
      slot.at = speech[i].at;
      i += 1;
      j += 1;
      continue;
    }
    // speech[i] 对不上当前 token：看是不是当前 token 被说成了后面的字，或者当前 token 根本不会被念
    let skipSpeech = -1;
    for (let k = i + 1; k <= Math.min(i + LOOKAHEAD, speech.length - 1); k += 1) {
      if (speech[k].ch === slot.core) {
        skipSpeech = k;
        break;
      }
    }
    let skipSlots = -1;
    for (let k = j + 1; k <= Math.min(j + LOOKAHEAD, slots.length - 1); k += 1) {
      if (slots[k].core && slots[k].core === speech[i].ch) {
        skipSlots = k;
        break;
      }
    }
    if (skipSpeech >= 0 && (skipSlots < 0 || skipSpeech - i <= skipSlots - j)) {
      i = skipSpeech;
    } else if (skipSlots >= 0) {
      j = skipSlots;
    } else {
      // 两边都救不了：这个字不在语音里（emoji 之类），跳过它继续
      j += 1;
    }
  }

  const matched = slots.filter((s) => s.at !== undefined).length;
  const coverage = totalCores > 0 ? matched / totalCores : 0;
  if (coverage < 0.6) return null;

  // 没对上的 token 继承前一个（纯标点、被 TTS 吞掉的符号），保证单调、不留空洞
  const cuePages: SubtitlePageCue[] = [];
  let cursor = 0;
  let lastFrame = 0;
  for (const tokens of pageTokens) {
    const starts: number[] = [];
    for (let k = 0; k < tokens.length; k += 1) {
      const slot = slots[cursor];
      cursor += 1;
      let frame: number;
      if (slot?.at !== undefined) {
        frame = Math.round(ticksToFrames(slot.at, fps));
      } else if (starts.length > 0) {
        frame = starts[starts.length - 1] || 0;
      } else {
        // 屏首 token 没对上：从上一屏的结尾接着走，避免整屏时间轴塌到 0
        frame = lastFrame;
      }
      frame = Math.max(0, frame);
      if (starts.length > 0) frame = Math.max(frame, starts[starts.length - 1]);
      starts.push(frame);
      lastFrame = frame;
    }
    cuePages.push({ tokens, starts });
  }

  return {
    pages: cuePages,
    coverage,
    shiftFrames: measureShift(cuePages, options.sceneFrames, fps),
  };
}

/**
 * 与"按屏长均分"（现有估算口径的复刻）比，逐字修正了多少帧。
 * 只用于日志/验收，不参与渲染；估算口径变了这里要跟着改。
 */
function measureShift(
  pages: SubtitlePageCue[],
  sceneFrames: number | undefined,
  fps: number,
): { avg: number; max: number } {
  if (!sceneFrames || sceneFrames <= 0 || pages.length === 0) return { avg: 0, max: 0 };
  const perPage = Math.max(1, sceneFrames / pages.length);
  const diffs: number[] = [];
  pages.forEach((page, pageIndex) => {
    const beat = Math.min(10, perPage / Math.max(1, page.tokens.length));
    page.starts.forEach((start, i) => {
      const estimate = pageIndex * perPage + i * beat;
      diffs.push(Math.abs(start - estimate) / fps);
    });
  });
  if (diffs.length === 0) return { avg: 0, max: 0 };
  const sum = diffs.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round((sum / diffs.length) * 100) / 100,
    max: Math.round(Math.max(...diffs) * 100) / 100,
  };
}
