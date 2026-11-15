/**
 * 验收：字幕逐字时间轴 vs 真实 TTS 语音。
 *
 * 做三件事（都用真实配音，不是估算）：
 * 1. 覆盖率：对齐成功了多少字（emoji/markdown/跳读会不会把对齐带偏）
 * 2. 独立交叉验证：用"严格逐字对齐"当基准（真实旁白里没有 emoji 时它一定成立），
 *    比对 buildSubtitleCues 的产出，逐字偏差应为 0~1 帧
 * 3. 与旧口径（按屏长均分估算）的偏差分布，以及语音结束后的空等帧数
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/verify-subtitle-sync.ts --limit 6
 *   npx ts-node --transpile-only scripts/verify-subtitle-sync.ts --limit 6 --json ../video-remotion/out/subtitle-sync.json
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues, subtitleTokens, type WordBoundary } from '../src/modules/learning/subtitle-timing';

const FPS = 30;
const TICKS = 1e7;
const NON_SPEECH = /[\s\p{P}\p{S}]/u;
const PUNCT = /[，。！？；：、,.!?;:]/;

type Row = {
  index: number;
  title: string;
  chars: number;
  words: number;
  coverage: number;
  strictComparable: boolean;
  maxDiffFrames: number | null;
  oldErrorMedian: number;
  oldErrorMax: number;
  speechSeconds: number;
  sceneSeconds: number;
  tailAfterSpeech: number;
  oldTailAfterSpeech: number;
  oldSceneSeconds: number;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return process.argv.includes(`--${name}`) ? 'true' : fallback;
}

/** 96kbps 单声道 mp3 → 帧数（与 parseMp3DurationFrames 的字节口径同源，只用于统计尾部空等） */
const audioFrames = (bytes: number) => Math.ceil(((bytes * 8) / 96000) * FPS);

/** 从 Root.tsx 的预览数据里取旁白：用真实课程旁白做验收，不用造句子 */
async function loadPreviewScenes(): Promise<any[]> {
  const file = path.resolve(__dirname, '../../video-remotion/src/__preview/Root.tsx');
  const source = await fs.readFile(file, 'utf8');
  const matched = source.match(/const SCENES = (\[[\s\S]*?\]);\n/);
  if (!matched) throw new Error(`SCENES not found in ${file}`);
  return JSON.parse(matched[1]);
}

/**
 * 严格基准：把旁白和词边界都剥成"能念的字"序列，逐位对应。
 * 序列完全一致时它无歧义，可以当独立参照；不一致说明旁白里有 emoji/markdown，
 * 这种情况不做交叉验证（只报覆盖率）。
 */
function strictTimeline(narration: string, boundaries: WordBoundary[]) {
  const display = Array.from(narration).filter((ch) => !NON_SPEECH.test(ch));
  const speech: { ch: string; at: number }[] = [];
  for (const b of boundaries) {
    const chars = Array.from(b.text || '').filter((ch) => !NON_SPEECH.test(ch));
    if (chars.length === 0) continue;
    const step = (Number(b.duration) || 0) / chars.length;
    chars.forEach((ch, i) => speech.push({ ch, at: (Number(b.offset) || 0) + step * i }));
  }
  const same =
    display.length === speech.length && display.every((ch, i) => ch === speech[i].ch);
  return { display, speech, comparable: same };
}

/** 旧口径（模板 fallback）：按屏长均分，封顶 10 帧/字。用于计算"改前偏差" */
function estimateFrames(pagesTokens: string[][], sceneFrames: number): number[][] {
  const perPage = Math.max(1, sceneFrames / pagesTokens.length);
  return pagesTokens.map((tokens, pageIndex) => {
    const beat = Math.min(10, perPage / Math.max(1, tokens.length));
    return tokens.map((_, i) => pageIndex * perPage + i * beat);
  });
}

async function main() {
  const limit = Number(arg('limit', '6'));
  const jsonPath = arg('json');
  const scenes = await loadPreviewScenes();
  const voice = new VoiceService();

  const rows: Row[] = [];
  const targets = scenes.slice(0, limit);
  for (let i = 0; i < targets.length; i += 1) {
    const narration = String(targets[i]?.narration || '').trim();
    if (!narration) continue;
    const label = String(targets[i]?.title || `scene-${i + 1}`);
    const speech = await voice.textToSpeechWithTiming(narration);
    const boundaries = speech.wordBoundaries;
    const audioFrameCount = audioFrames(speech.buffer.length);
    // 与生产同口径：parseMp3DurationFrames = max(6s, 语音 + 0.8s 垫片)
    const withPad = Math.max(6 * FPS, audioFrameCount + 24);
    // 拿到时间轴后场景时长以语音为准（生产逻辑），估算偏长的那部分被裁掉
    const oldSceneFrames = Math.max(Number(targets[i]?.durationFrames) || 0, withPad);
    const sceneFrames = withPad;

    const cues = buildSubtitleCues(narration, boundaries, { fps: FPS, sceneFrames });
    const pagesTokens = (cues?.pages.map((p) => p.tokens) || []).length
      ? cues!.pages.map((p) => p.tokens)
      : [subtitleTokens(narration)];
    const est = estimateFrames(pagesTokens, sceneFrames);

    const strict = strictTimeline(narration, boundaries);
    let maxDiff: number | null = null;
    if (cues && strict.comparable) {
      // 逐字比对：cue 帧 vs 严格基准帧
      let cursor = 0;
      let worst = 0;
      cues.pages.forEach((page, pageIndex) => {
        page.tokens.forEach((token, tokenIndex) => {
          const core = Array.from(token).find((ch) => !NON_SPEECH.test(ch));
          if (!core) return;
          // 严格基准按同一顺序推进
          while (cursor < strict.speech.length && strict.speech[cursor].ch !== core) cursor += 1;
          if (cursor >= strict.speech.length) return;
          const trueFrame = Math.round((strict.speech[cursor].at / TICKS) * FPS);
          worst = Math.max(worst, Math.abs(page.starts[tokenIndex] - trueFrame));
          cursor += 1;
          void pageIndex;
        });
      });
      maxDiff = worst;
    }

    // 旧口径偏差：同一批字，"估算帧"与严格基准帧的差
    const diffs: number[] = [];
    if (strict.comparable) {
      let cursor = 0;
      pagesTokens.forEach((tokens, pageIndex) => {
        tokens.forEach((token, tokenIndex) => {
          const core = Array.from(token).find((ch) => !NON_SPEECH.test(ch));
          if (!core) return;
          while (cursor < strict.speech.length && strict.speech[cursor].ch !== core) cursor += 1;
          if (cursor >= strict.speech.length) return;
          const trueFrame = Math.round((strict.speech[cursor].at / TICKS) * FPS);
          diffs.push(Math.abs(est[pageIndex][tokenIndex] - trueFrame) / FPS);
          cursor += 1;
        });
      });
    }
    diffs.sort((a, b) => a - b);
    const median = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    const lastTrue = strict.speech.length
      ? (strict.speech[strict.speech.length - 1].at / TICKS) * FPS
      : 0;

    rows.push({
      index: i + 1,
      title: label,
      chars: Array.from(narration).filter((ch) => !NON_SPEECH.test(ch)).length,
      words: boundaries.length,
      coverage: cues?.coverage ?? 0,
      strictComparable: strict.comparable,
      maxDiffFrames: maxDiff,
      oldErrorMedian: Math.round(median * 100) / 100,
      oldErrorMax: Math.round((diffs[diffs.length - 1] || 0) * 100) / 100,
      speechSeconds: Math.round((audioFrameCount / FPS) * 10) / 10,
      sceneSeconds: Math.round((sceneFrames / FPS) * 10) / 10,
      tailAfterSpeech: Math.round(((sceneFrames - lastTrue) / FPS) * 10) / 10,
      oldTailAfterSpeech: Math.round(((oldSceneFrames - lastTrue) / FPS) * 10) / 10,
      oldSceneSeconds: Math.round((oldSceneFrames / FPS) * 10) / 10,
    });

    console.log(
      `scene${i + 1} ${label.slice(0, 10)} chars=${rows[rows.length - 1].chars} words=${boundaries.length} ` +
        `coverage=${(rows[rows.length - 1].coverage * 100).toFixed(0)}% ` +
        `strict=${strict.comparable ? 'yes' : 'no'} diffFrames=${maxDiff ?? '-'} ` +
        `oldMed=${rows[rows.length - 1].oldErrorMedian}s oldMax=${rows[rows.length - 1].oldErrorMax}s ` +
        `speech=${rows[rows.length - 1].speechSeconds}s scene=${rows[rows.length - 1].sceneSeconds}s ` +
        `tail=${rows[rows.length - 1].tailAfterSpeech}s (改前 ${rows[rows.length - 1].oldTailAfterSpeech}s)`,
    );
  }

  const comparable = rows.filter((r) => r.strictComparable);
  const worst = comparable.reduce((n, r) => Math.max(n, r.maxDiffFrames ?? 0), 0);
  console.log('');
  console.log(`===== 汇总（${rows.length} 个真实场景） =====`);
  console.log(`覆盖率           : 最低 ${(Math.min(...rows.map((r) => r.coverage)) * 100).toFixed(0)}%`);
  console.log(`可严格交叉验证   : ${comparable.length}/${rows.length}`);
  console.log(`逐字最大偏差     : ${worst} 帧（${(worst / FPS).toFixed(3)}s）`);
  console.log(
    `旧口径偏差       : 中位 ${(comparable.reduce((n, r) => n + r.oldErrorMedian, 0) / Math.max(1, comparable.length)).toFixed(2)}s，最大 ${Math.max(...rows.map((r) => r.oldErrorMax)).toFixed(2)}s`,
  );
  const med = (list: number[]) => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
  console.log(
    `语音后空等       : 中位 ${med(rows.map((r) => r.tailAfterSpeech)).toFixed(1)}s（改前 ${med(rows.map((r) => r.oldTailAfterSpeech)).toFixed(1)}s）`,
  );
  console.log(
    `本课总时长       : ${rows.reduce((n, r) => n + r.sceneSeconds, 0).toFixed(1)}s（改前 ${rows.reduce((n, r) => n + r.oldSceneSeconds, 0).toFixed(1)}s）`,
  );

  if (jsonPath) {
    const out = path.resolve(process.cwd(), jsonPath);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify({ rows }, null, 2));
    console.log(`json -> ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
