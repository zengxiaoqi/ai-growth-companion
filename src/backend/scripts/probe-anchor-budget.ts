/**
 * probe-anchor-budget.ts — 「这个词被念到之后，画面上还有多久能把它亮出来」。
 *
 * 为什么需要这个探针：
 * 高亮现在跟旁白（念到谁亮谁），但卡片不是瞬间出现的——它要 spring 落位。
 * 于是有两道预算，任一不够，那个词就等于没被强调：
 *
 *   1. 落位预算：词被念到的那一刻，卡片还没飞到位 → 亮起时卡片仍在放大/淡入，
 *      实测像素读不出「强调色”，看起来像没亮。
 *   2. 停留预算：这个词到下一个词之间太短 → 卡片刚亮就被切走，
 *      一屏连续点名时中间那两三个只闪一下。
 *
 * 两道都不报错、画面也不崩，只是“讲了但没强调”。这个脚本把它们算成数字。
 *
 * 落位帧 = 入场 delay + spring 落位时间：
 *   原地弹出（damping 13 / stiffness 150）90% 在 6 帧、100% 在 7 帧
 *   飞入（damping 26 / stiffness 62，group/split 成员）90% 在 16 帧、100% 在 37 帧
 * delay 取各拓扑的最小值（下界）：cycle/chain/growth 8，split/group 父 8 成员 20，
 * compare 8/18。实际 delay 只会更大，所以这里是“至少这么多节点受影响”。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-anchor-budget.ts
 *   npx ts-node --transpile-only scripts/probe-anchor-budget.ts --only s5,a1
 *   npx ts-node --transpile-only scripts/probe-anchor-budget.ts --json ../video-remotion/out/anchor-budget.json
 *   （默认只读 out/.tts-boundary-cache.json，不调 TTS；加 --tts 才对缺失的补跑）
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors, type ActionAnchorTable } from '../src/modules/learning/action-anchors';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

const FPS = 30;
const TICKS = 1e7;

/** 各拓扑的最小入场 delay（layoutGraph 的下界，实际只会更大） */
function minDelay(relation: string, nodeIndex: number): number {
  switch (relation) {
    case 'split':
    case 'group':
      return nodeIndex === 0 ? 8 : 20;
    case 'compare':
      return nodeIndex === 0 ? 8 : 18;
    default:
      return 8;
  }
}

/** 落位帧：spring 到 90% 所需的帧数 */
const SETTLE_POP = 6;
const SETTLE_TRAVEL = 16;

/** group/split 的成员是“飞进来”的，其余原地弹出 */
function settleFrames(relation: string, nodeIndex: number): number {
  const travel = (relation === 'split' || relation === 'group') && nodeIndex > 0;
  return travel ? SETTLE_TRAVEL : SETTLE_POP;
}

/**
 * 模板里 `cueEnterAt` 的镜像：星形成员把入场提前到「词帧 − 20」，
 * 只提前不推迟（min 比较），且第一个节点（整体/类别）不参与。
 * 不做这一步，量出来的落位帧会比真实值晚 20 帧左右。
 */
const CUE_ENTER_LEAD = 20;
function enterDelay(relation: string, nodeIndex: number, spokenAt: number): number {
  const base = minDelay(relation, nodeIndex);
  if ((relation === 'split' || relation === 'group') && nodeIndex > 0) {
    return Math.min(Math.max(0, spokenAt - CUE_ENTER_LEAD), base);
  }
  return base;
}

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return process.argv.includes(`--${name}`) ? 'true' : fallback;
}

async function loadPreviewScenes(): Promise<any[]> {
  const file = path.resolve(__dirname, '../../video-remotion/src/__preview/Root.tsx');
  const source = await fs.readFile(file, 'utf8');
  const matched = source.match(/const SCENES = (\[[\s\S]*?\]);\n/);
  if (!matched) throw new Error('Root.tsx 里没找到 SCENES');
  return JSON.parse(matched[1]);
}

type Row = {
  scene: string;
  relation: string;
  label: string;
  spokenAt: number | null;
  readyAt: number;
  nextAt: number;
  /** 词帧之后、下一词之前，卡片真正“亮着”的帧数（落位到被切走） */
  litFrames: number;
  /** 卡片落位时这个词是否已经被讲完 */
  missed: boolean;
};

async function main(): Promise<void> {
  const only = flag('only', '');
  const wantJson = flag('json', '');
  const useTts = process.argv.includes('--tts');
  const filter = new Set(only ? only.split(',').map((s) => s.trim()).filter(Boolean) : []);

  const scenes = await loadPreviewScenes();
  const voice = new VoiceService();
  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-boundary-cache.json');
  let cache: Record<string, Array<{ text: string; offset: number; duration: number }>> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }

  const rows: Row[] = [];
  const skipped: string[] = [];

  for (const scene of scenes) {
    const id = String(scene?.id || '');
    if (filter.size && !filter.has(id)) continue;
    const graph = normalizeSceneGraph(scene?.sceneGraph);
    if (!graph) continue;
    const narration = String(scene?.narration || '').trim();
    if (!narration) continue;
    const duration = Number(scene?.durationFrames) || 180;

    let boundaries = cache[narration];
    if (!boundaries && useTts) {
      try {
        const timing = await voice.textToSpeechWithTiming(narration);
        boundaries = timing.wordBoundaries;
        cache[narration] = boundaries;
        await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
      } catch (error: any) {
        skipped.push(`${id}（TTS 失败：${error?.message || error}）`);
        continue;
      }
    }
    if (!boundaries) {
      skipped.push(`${id}（无词边界缓存）`);
      continue;
    }

    const cues = buildSubtitleCues(narration, boundaries, { fps: FPS, sceneFrames: duration });
    if (!cues) {
      skipped.push(`${id}（字幕对齐失败）`);
      continue;
    }
    const anchors: ActionAnchorTable = buildActionAnchors(graph.nodes, cues.pages, {
      durationFrames: duration,
      boundaries,
      fps: FPS,
    });

    const timed = graph.nodes
      .map((node, index) => ({
        node,
        index,
        at: anchors[String(node.id)] ? anchors[String(node.id)].start : null,
      }))
      .filter((row) => row.at !== null)
      .sort((a, b) => (a.at as number) - (b.at as number));

    timed.forEach((row, i) => {
      const spokenAt = row.at as number;
      const readyAt = enterDelay(graph.relation, row.index, spokenAt) + settleFrames(graph.relation, row.index);
      const nextAt = i + 1 < timed.length ? (timed[i + 1].at as number) : duration;
      const litFrames = Math.max(0, nextAt - Math.max(spokenAt, readyAt));
      rows.push({
        scene: id,
        relation: graph.relation,
        label: String(row.node.label),
        spokenAt,
        readyAt,
        nextAt,
        litFrames,
        missed: readyAt >= nextAt,
      });
    });
  }

  if (rows.length === 0) {
    console.log('没有可统计的场景。加 --tts 补跑词边界。');
    if (skipped.length) console.log('跳过：', skipped.join('，'));
    return;
  }

  console.log(`场景 ${new Set(rows.map((r) => r.scene)).size} 个 / 节点 ${rows.length} 个`);
  if (skipped.length) console.log(`跳过 ${skipped.length} 个：${skipped.join('，')}`);
  console.log('—'.repeat(78));
  console.log(
    `${'场景'.padEnd(6)}${'关系'.padEnd(9)}${'节点'.padEnd(10)}${'念到'.padEnd(8)}${'落位'.padEnd(8)}${'下一词'.padEnd(9)}亮着`,
  );
  console.log('—'.repeat(78));
  for (const r of rows) {
    const mark = r.missed ? '  ✗ 落位前就被讲完' : r.litFrames <= 8 ? '  ⚠ 只闪一下' : '';
    console.log(
      `${r.scene.padEnd(6)}${r.relation.padEnd(9)}${r.label.slice(0, 8).padEnd(10)}` +
        `${String(r.spokenAt).padEnd(8)}${String(r.readyAt).padEnd(8)}${String(r.nextAt).padEnd(9)}` +
        `${String(r.litFrames).padStart(4)}f${mark}`,
    );
  }

  const missed = rows.filter((r) => r.missed);
  const short = rows.filter((r) => !r.missed && r.litFrames <= 8);
  console.log('—'.repeat(78));
  console.log(`落位前就被讲完：${missed.length}/${rows.length}（${((100 * missed.length) / rows.length).toFixed(1)}%）`);
  console.log(`落位后只亮 ≤8 帧：${short.length}/${rows.length}（${((100 * short.length) / rows.length).toFixed(1)}%）`);
  if (missed.length) {
    console.log(`完全没强调的节点：${missed.map((r) => `${r.scene}/${r.label}@${r.spokenAt}f`).join('，')}`);
  }
  console.log(
    `\n口径：落位帧 = 该拓扑最小入场 delay + spring 到 90% 的帧数（原地 6 / 飞入 16）。\n` +
      `实际 delay 只会更大，所以上面是“至少这么多”。`,
  );

  if (wantJson && wantJson !== 'true') {
    const out = path.resolve(__dirname, '../../video-remotion/out', wantJson.replace(/^.*[\\/]out[\\/]/, ''));
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(
      out,
      JSON.stringify({ rows, missed: missed.length, short: short.length, skipped }, null, 2),
      'utf8',
    );
    console.log(`已写入 ${out}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
