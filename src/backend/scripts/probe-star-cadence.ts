/**
 * probe-star-cadence.ts — 星形拓扑（group/split）成员"每个亮多久"，以及一组连报能不能合并。
 *
 * 背景：高亮改成"念到谁亮谁"之后，成员之间是逐个交棒的。但旁白里并列列举的写法
 * （「苹果、香蕉和葡萄」）词与词只隔 8-12 帧——第一个成员亮不到 10 帧就被下一个接走，
 * 画面看起来只是闪了一下。prompt 里已经写了"每项跟半句描述"，实测模型不遵守（见
 * probe-graph-narration-rule 的 dump：new 臂仍有「苹果33/香蕉35/葡萄37」这种 2 字间隔）。
 *
 * 这个探针不猜，直接量：
 *   - 现状：每个成员按"下一个词被念到"交棒，能亮多少帧（落位门槛 36 帧照算）
 *   - 合并：把相邻间隔 < MERGE_TH 的成员视作"同时被点名"，整组一起亮到下一组开始
 *
 * 只读 dump，不调 LLM。TTS 走本地缓存，同一句只配一次。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-star-cadence.ts
 *   npx ts-node --transpile-only scripts/probe-star-cadence.ts --merge 20
 *   npx ts-node --transpile-only scripts/probe-star-cadence.ts --dir ../../video-remotion/out/narration-rule
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors } from '../src/modules/learning/action-anchors';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const FPS = 30;
const TICKS = 1e7;
/** 成员卡片入场 20 帧 + 飞入 spring 落位约 16 帧 */
const READY_MEMBER = 36;
/** 第一个成员不叠 20 帧入场 delay，原地弹出约 6 帧 */
const READY_FIRST = 6;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

type Row = { label: string; at: number; gap: number; litNow: number; litMerged: number };

type SceneReport = {
  file: string;
  arm: string;
  relation: string;
  members: number;
  rows: Row[];
  /** 首词距开场多少帧：小于 36 说明"话已经说了、卡片还没落位" */
  opening: number;
};

function slugOf(file: string): string {
  const base = path.basename(file, '.json');
  const arm = base.startsWith('old-') ? 'old' : 'new';
  return `${arm}-${base}`;
}

async function main(): Promise<void> {
  const dir = path.resolve(
    __dirname,
    arg('dir') || '../../video-remotion/out/narration-rule',
  );
  const mergeTh = Math.max(1, Number(arg('merge') || 26));
  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-cadence-cache.json');
  let cache: Record<string, Array<{ text: string; offset: number; duration: number }>> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
  const voice = new VoiceService();
  let cacheDirty = false;

  const files = (await fs.readdir(dir))
    .filter((name) => /^(old|new)-.+-\d+\.json$/.test(name))
    .sort();
  if (!files.length) {
    console.error(`${dir} 下没有 dump，先跑 probe-graph-narration-rule.ts`);
    process.exit(1);
  }

  const reports: SceneReport[] = [];
  const skipped: string[] = [];

  for (const name of files) {
    const arm = slugOf(name).split('-')[0];
    const raw = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    for (const scene of raw?.scenes || []) {
      const graph = normalizeSceneGraph(scene?.sceneGraph);
      if (!graph || (graph.relation !== 'group' && graph.relation !== 'split')) continue;
      const narration = String(scene?.narration || '');
      if (!narration) continue;

      let boundaries = cache[narration];
      if (!boundaries) {
        try {
          const timing = await voice.textToSpeechWithTiming(narration);
          boundaries = timing.wordBoundaries as any;
          cache[narration] = boundaries as any;
          cacheDirty = true;
        } catch (error: any) {
          skipped.push(`${name} / ${scene?.id}: TTS ${error?.message || error}`);
          continue;
        }
      }

      const last = boundaries[boundaries.length - 1];
      const spokenSec = last ? (Number(last.offset) + Number(last.duration)) / TICKS : 0;
      const duration = Math.max(90, Math.round(spokenSec * FPS) + 30);
      const cues = buildSubtitleCues(narration, boundaries, { fps: FPS, sceneFrames: duration });
      if (!cues) {
        skipped.push(`${name} / ${scene?.id}: 字幕对齐失败`);
        continue;
      }
      const anchors = buildActionAnchors(graph.nodes, cues.pages, {
        durationFrames: duration,
        boundaries,
        fps: FPS,
      });

      // 与模板一致：第 0 个节点是这一屏的主题（类别/整体），不参与成员交棒
      const timed = graph.nodes
        .slice(1)
        .map((node) => ({ label: node.label, at: anchors[node.id] ? anchors[node.id].start : null }))
        .filter((r) => r.at !== null)
        .sort((a, b) => (a.at as number) - (b.at as number)) as Array<{ label: string; at: number }>;
      if (timed.length < 2) continue;

      // 合并：把"间距短到听不出先后"的相邻成员并成一组，组起点 = 组内第一个词
      const groups: Array<{ labels: string[]; at: number; lastAt: number }> = [];
      for (const item of timed) {
        const prev = groups[groups.length - 1];
        // 与模板同口径：跟组里上一个名字比，不是跟组首比
        if (prev && item.at - prev.lastAt < mergeTh) {
          prev.labels.push(item.label);
          prev.lastAt = item.at;
        } else {
          groups.push({ labels: [item.label], at: item.at, lastAt: item.at });
        }
      }

      const rows: Row[] = timed.map((item) => {
        const nextIdx = timed.findIndex((x) => x.at === item.at);
        const next = nextIdx + 1 < timed.length ? timed[nextIdx + 1].at : duration;
        const ready = nextIdx === 0 ? READY_FIRST : READY_MEMBER;
        const litNow = Math.max(0, next - Math.max(item.at, ready));
        const group = groups.find((g) => g.labels.includes(item.label))!;
        const gi = groups.indexOf(group);
        const groupEnd = gi + 1 < groups.length ? groups[gi + 1].at : duration;
        const litMerged = Math.max(0, groupEnd - Math.max(group.at, ready));
        return { label: item.label, at: item.at, gap: next - item.at, litNow, litMerged };
      });

      reports.push({
        file: name,
        arm,
        relation: graph.relation,
        members: timed.length,
        rows,
        opening: timed[0].at,
      });
    }
  }

  if (cacheDirty) {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
  }

  // ── 逐场景 ──
  for (const report of reports) {
    console.log(`■ ${report.arm} ${report.relation.padEnd(5)} ${report.file}  首词@${report.opening}f`);
    for (const row of report.rows) {
      const mark = row.litNow <= 8 ? ' ✗' : '';
      const better = row.litMerged - row.litNow;
      console.log(
        `    ${row.label.padEnd(6)} @${String(row.at).padStart(4)}f  间隔 ${String(row.gap).padStart(3)}f  ` +
          `现状亮 ${String(row.litNow).padStart(3)}f${mark}  合并后 ${String(row.litMerged).padStart(3)}f` +
          (better > 0 ? `  (+${better})` : ''),
      );
    }
  }

  // ── 汇总 ──
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
  console.log(`\n合并阈值 ${mergeTh} 帧；落位门槛 成员 ${READY_MEMBER} 帧 / 首个 ${READY_FIRST} 帧`);
  for (const arm of ['old', 'new']) {
    const list = reports.filter((r) => r.arm === arm);
    if (!list.length) continue;
    const rows = list.flatMap((r) => r.rows);
    const bad = rows.filter((r) => r.litNow <= 8).length;
    const badMerged = rows.filter((r) => r.litMerged <= 8).length;
    const tight = rows.filter((r) => r.gap < READY_MEMBER).length;
    const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
    console.log(
      `\n[${arm}] 场景 ${list.length}  成员 ${rows.length}\n` +
        `  现状 ≤8 帧：${bad}/${rows.length} = ${pct(bad, rows.length)}   平均亮 ${avg(rows.map((r) => r.litNow)).toFixed(1)}f\n` +
        `  合并后 ≤8 帧：${badMerged}/${rows.length} = ${pct(badMerged, rows.length)}   平均亮 ${avg(rows.map((r) => r.litMerged)).toFixed(1)}f\n` +
        `  间隔 < ${READY_MEMBER} 帧的相邻对：${tight}/${rows.length} = ${pct(tight, rows.length)}\n` +
        `  首词早于落位（<${READY_MEMBER}f）的场景：${list.filter((r) => r.opening < READY_MEMBER).length}/${list.length}`,
    );
  }
  if (skipped.length) {
    console.log(`\n跳过 ${skipped.length} 条：`);
    for (const line of skipped.slice(0, 8)) console.log(`  ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
