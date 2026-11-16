/**
 * probe-cue-anchors.ts — 量「图形语义动作能不能挂到旁白的词上」。
 *
 * 背景：`AbstractSign` 的 rise/swell/grow 挂在 storyProgress（这一屏播到第几秒），
 * 所以「水汽」从第 18 帧开始升、第 sceneFrames-28 帧升完，跟旁白念到哪个词无关。
 * 要改成「念到这个节点时才动」，前提是每个节点的标签能在旁白里被找到。
 *
 * 这个脚本只做测量，不动渲染代码，回答三件事：
 *   1. 覆盖率：节点标签（和 subject 别名）能在旁白里命中的比例
 *   2. 锚点帧：命中的节点，标签首次被念到是第几帧
 *   3. 错位量：按现在的实现，念到该词时动作已经推进了多少（100% = 已经讲完了）
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-cue-anchors.ts
 *   npx ts-node --transpile-only scripts/probe-cue-anchors.ts --json ../video-remotion/out/cue-anchors.json
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import type { WordBoundary } from '../src/modules/learning/subtitle-timing';

const FPS = 30;
const TICKS = 1e7;
const PUNCT = /[，。！？；：、,.!?;:（）()「」『』“”"'’‘\s]/g;
const LEAD_FRAMES = Math.ceil(0.3 * FPS);
const TAIL_FRAMES = Math.ceil(0.5 * FPS);
const MIN_SCENE_FRAMES = 6 * FPS;
const WARMUP = 18;

type SpokenChar = { ch: string; frame: number; word: string };

type MatchKind = 'exact' | 'subject' | 'partial2' | 'single' | 'miss';

type NodeRow = {
  label: string;
  subject: string;
  sign?: string;
  swell?: string;
  kind: MatchKind;
  /** 实际命中的字/词，用来看出「单字命中」到底命中了什么 */
  matched: string | null;
  charIndex: number | null;
  anchorFrame: number | null;
  /** 按现在的 storyProgress 实现，念到这个词时动作推进到几成（1 = 已经讲完） */
  progressAtAnchor: number | null;
  /** 动作结束帧 − 锚点帧：负数表示旁白说出口时画面已经做完 */
  finishMinusAnchor: number | null;
};

type SceneRow = {
  id: string;
  title: string;
  durationFrames: number;
  sceneFrames: number;
  speechSec: number;
  chars: number;
  words: number;
  nodes: NodeRow[];
  hitExact: number;
  hitLenient: number;
  total: number;
};

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return process.argv.includes(`--${name}`) ? 'true' : fallback;
}

async function loadPreviewScenes(): Promise<any[]> {
  const file = path.resolve(__dirname, '../../video-remotion/src/__preview/Root.tsx');
  const source = await fs.readFile(file, 'utf8');
  const matched = source.match(/const SCENES = (\[[\s\S]*?\]);\n/);
  if (!matched) throw new Error(`SCENES not found in ${file}`);
  return JSON.parse(matched[1]);
}

/** 把词边界摊成"每个字 + 它被念到的帧"，标点不进序列（与字幕同一口径） */
function spokenChars(boundaries: WordBoundary[]): SpokenChar[] {
  const out: SpokenChar[] = [];
  for (const b of boundaries) {
    const chars = Array.from(String(b.text || '').replace(PUNCT, ''));
    if (chars.length === 0) continue;
    const span = b.duration / chars.length;
    chars.forEach((ch, i) => {
      out.push({ ch, frame: ((b.offset + span * i) / TICKS) * FPS, word: String(b.text || '') });
    });
  }
  return out;
}

/** 在念字序列里找 needle 首次出现的位置 */
function findSeq(seq: SpokenChar[], needle: string): number {
  const target = Array.from(needle.replace(PUNCT, ''));
  if (target.length === 0) return -1;
  for (let i = 0; i + target.length <= seq.length; i += 1) {
    let ok = true;
    for (let j = 0; j < target.length; j += 1) {
      if (seq[i + j].ch !== target[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * 三级匹配，越往后越弱：
 *   exact   —— 标签原样出现
 *   subject —— 语义别名出现（水汽→水蒸气、雨滴→雨）
 *   partial2—— 标签里连续两个字出现（树根→树干）
 *   single  —— 只有 1 个字对上（这种锚点会把动作定到错误的位置，单独列出）
 */
function matchNode(
  seq: SpokenChar[],
  label: string,
  subject: string,
): { kind: MatchKind; index: number | null; matched: string | null } {
  const labelClean = Array.from(label.replace(PUNCT, '')).join('');
  const subjectClean = Array.from(String(subject || '').replace(PUNCT, '')).join('');

  const exact = findSeq(seq, labelClean);
  if (exact >= 0) return { kind: 'exact', index: exact, matched: labelClean };

  if (subjectClean && subjectClean !== labelClean) {
    const bySubject = findSeq(seq, subjectClean);
    if (bySubject >= 0) return { kind: 'subject', index: bySubject, matched: subjectClean };
  }

  // 连续两字：取标签前两字/后两字，避免「树根」被「树干」以外的偶然组合命中
  const pairs: string[] = [];
  if (labelClean.length >= 2) {
    pairs.push(labelClean.slice(0, 2), labelClean.slice(-2));
  }
  for (const c of pairs) {
    if (c.length < 2) continue;
    const hit = findSeq(seq, c);
    if (hit >= 0) return { kind: 'partial2', index: hit, matched: c };
  }

  // 只剩单字：把标签里每个字都试一遍，取最早出现的那个
  // （「白云」在 A/B 版旁白里说成「遇冷变云」，靠末字「云」才能命中）
  let best: { index: number; ch: string } | null = null;
  for (const ch of Array.from(labelClean)) {
    const hit = findSeq(seq, ch);
    if (hit >= 0 && (best === null || hit < best.index)) best = { index: hit, ch };
  }
  if (best) return { kind: 'single', index: best.index, matched: best.ch };

  return { kind: 'miss', index: null, matched: null };
}

/** 当前实现的动作时间窗：storyStart=18，storyEnd=max(58, duration-28) */
function actionWindow(sceneFrames: number): { start: number; end: number } {
  const start = WARMUP;
  const end = Math.max(start + 40, sceneFrames - 28);
  return { start, end };
}

async function main(): Promise<void> {
  const jsonPath = arg('json');
  const only = arg('only');
  const scenes = await loadPreviewScenes();
  const voice = new VoiceService();

  // 词边界缓存：同一句旁白的 TTS 结果不重复请求（探针要反复跑，网络调用是唯一慢点）
  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-boundary-cache.json');
  let cache: Record<string, WordBoundary[]> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }

  const rows: SceneRow[] = [];

  for (const scene of scenes) {
    if (!scene?.sceneGraph) continue;
    if (only && scene.id !== only) continue;
    const narration = String(scene.narration || '').trim();
    if (!narration) continue;

    let boundaries = cache[narration];
    if (!boundaries) {
      try {
        const timing = await voice.textToSpeechWithTiming(narration);
        boundaries = timing.wordBoundaries;
        cache[narration] = boundaries;
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
      } catch (error: any) {
        console.error(`[skip] ${scene.id} TTS 失败: ${error?.message || error}`);
        continue;
      }
    }

    const seq = spokenChars(boundaries);
    if (seq.length < 3) continue;

    // 语音结束帧取词边界的末端：getDuration() 是按字节估算的（实测失真的量级），
    // 生产侧也不用它，用 parseMp3DurationFrames(buffer) 走逐帧扫描。
    const lastEnd = boundaries.reduce((max, b) => Math.max(max, b.offset + b.duration), 0);
    const speechFrames = Math.ceil((lastEnd / TICKS) * FPS);
    const sceneFrames = Math.max(
      MIN_SCENE_FRAMES,
      speechFrames + LEAD_FRAMES + TAIL_FRAMES,
      Number(scene.durationFrames) || 0,
    );
    const { start, end } = actionWindow(sceneFrames);

    const nodes: NodeRow[] = (scene.sceneGraph.nodes || []).map((node: any) => {
      const label = String(node.label || '');
      const subject = String(node.subject || '');
      const { kind, index, matched } = matchNode(seq, label, subject);
      // 只有 exact/subject 才算"可挂锚点"；partial2 会把动作定错位置，single 更不用说
      const anchorFrame = index === null ? null : Math.round(seq[index].frame);
      const progressAtAnchor =
        anchorFrame === null ? null : Math.max(0, Math.min(1, (anchorFrame - start) / (end - start)));
      return {
        label,
        subject,
        sign: node.sign,
        swell: node.swell,
        kind,
        matched,
        charIndex: index,
        anchorFrame,
        progressAtAnchor: progressAtAnchor === null ? null : Number(progressAtAnchor.toFixed(2)),
        finishMinusAnchor: anchorFrame === null ? null : Math.round(end - anchorFrame),
      };
    });

    const row: SceneRow = {
      id: String(scene.id),
      title: String(scene.title || ''),
      durationFrames: Number(scene.durationFrames) || 0,
      sceneFrames,
      speechSec: Number((speechFrames / FPS).toFixed(2)),
      chars: Array.from(narration.replace(PUNCT, '')).length,
      words: boundaries.length,
      nodes,
      hitExact: nodes.filter((n) => n.kind === 'exact' || n.kind === 'subject').length,
      hitLenient: nodes.filter((n) => n.kind !== 'miss').length,
      total: nodes.length,
    };
    rows.push(row);
  }

  // ---- 报告 ----
  console.log('\n=== 锚点覆盖率（exact + subject 才算命中）===');
  console.log('场景               时长   语音   节点  命中  弱命中  锚点帧 / 动作推进');
  let sumHit = 0;
  let sumLenient = 0;
  let sumTotal = 0;
  for (const r of rows) {
    sumHit += r.hitExact;
    sumLenient += r.hitLenient;
    sumTotal += r.total;
    const head = `${r.id.padEnd(4)} ${r.title.slice(0, 8).padEnd(9)} ${String(r.sceneFrames).padStart(4)}f ${String(r.speechSec).padStart(5)}s ${String(r.total).padStart(2)}/${String(r.hitExact).padStart(2)} ${String(r.hitLenient - r.hitExact).padStart(2)}`;
    console.log(head);
    for (const n of r.nodes) {
      const tag = n.label + (n.subject && n.subject !== n.label ? `(${n.subject})` : '');
      const mark = { exact: '✓', subject: '≈', partial2: '?', single: '!', miss: '✗' }[n.kind];
      const detail =
        n.anchorFrame === null
          ? `${mark} ${tag} 旁白里没有`
          : `${mark} ${tag}${n.kind === 'single' ? `「${n.matched}」` : ''} @${String(n.anchorFrame).padStart(3)}f 动作已推进 ${Math.round((n.progressAtAnchor || 0) * 100)}%${n.finishMinusAnchor! < 0 ? ' (动作已结束)' : ''}`;
      console.log(`      ${detail}`);
    }
  }

  console.log(`\n合计命中 ${sumHit}/${sumTotal} = ${((sumHit / sumTotal) * 100).toFixed(0)}%   （宽松含单字近似 ${sumLenient}/${sumTotal} = ${((sumLenient / sumTotal) * 100).toFixed(0)}%）`);

  // 只统计带语义动作的节点：这些才是真正会被改动的对象
  const actionNodes = rows.flatMap((r) =>
    r.nodes
      .filter((n) => n.sign || n.swell)
      .map((n) => ({ scene: r.id, sceneFrames: r.sceneFrames, ...n })),
  );
  if (actionNodes.length > 0) {
    console.log('\n=== 带语义动作的节点（真正要改的对象）===');
    for (const n of actionNodes) {
      const tag = `${n.scene} ${n.label}${n.sign ? `[${n.sign}]` : ''}${n.swell ? `[${n.swell}]` : ''}`;
      if (n.anchorFrame === null) {
        console.log(`  ${tag.padEnd(22)} 匹配=${n.kind}  无锚点 → 只能回退 storyProgress`);
      } else {
        console.log(
          `  ${tag.padEnd(22)} 匹配=${n.kind}  锚点 ${n.anchorFrame}f  动作窗 ${WARMUP}→${Math.max(WARMUP + 40, n.sceneFrames - 28)}f  ` +
            `念到时已推进 ${Math.round((n.progressAtAnchor || 0) * 100)}%  ${n.finishMinusAnchor! < 0 ? `画面早 ${-n.finishMinusAnchor!}f 就演完了` : `还剩 ${n.finishMinusAnchor}f`}`,
        );
      }
    }
  }

  if (jsonPath) {
    const out = path.resolve(process.cwd(), jsonPath);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), 'utf8');
    console.log(`\n写出 ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
