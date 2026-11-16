/**
 * probe-flow-topology.ts — 量 split / group 这两张图上的光点与高亮，究竟有没有挂到旁白上。
 *
 * 为什么单独拉一个探针：
 * cycle / chain 只有一条路径（target 逐个串起来），光点挂词已在真实渲染里对拍过。
 * split / group 是"多条互不相交的路径"，模板里有两条额外分支：
 *   - split：每条路径 target = 一个部件
 *   - group：每条路径 target = **同一个** 类别节点（箭头朝上）
 * 后者的 target 全部相同，意味着只要挂词，"三条路径同时出发、同时到达"，
 * 而时钟驱动时它们是错开走的（spread/slot）。这类问题在画面上不报错，
 * 只会表现为"光点一起动、成员一个都没亮过"——必须在数字上先看见。
 *
 * 这个脚本只算时间轴，不渲染：
 *   1. 用生产代码（buildSubtitleCues + buildActionAnchors）拿到词边界与动作窗
 *   2. 按模板 layoutGraph 的 split/group 分支重建节点坐标与路径
 *   3. 逐帧重放模板里 flowStops / tAtStops / activeIds 这套判定
 * 第 3 步是模板代码的镜像，改模板要同步改这里；真正的证据仍以
 * scripts/measure-highlight-onset.py 的逐帧像素测量为准。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-flow-topology.ts --only s5,s6,b2
 *   npx ts-node --transpile-only scripts/probe-flow-topology.ts --only s5 --props
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors, auditFlowOrder, type ActionAnchorTable } from '../src/modules/learning/action-anchors';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

const FPS = 30;
const TICKS = 1e7;
const WARMUP = 18;
const FLOW_PERIOD = 84;
/** 与模板 FLOW_MIN_SEG 同步：一段短于 12 帧（0.4s）就看不清"经过了什么" */
const FLOW_MIN_SEG = 12;

type Edge = { x1: number; y1: number; x2: number; y2: number; delay: number };
type Flow = { edges: Edge[]; loop: boolean; target: string[]; focus?: string[] };
type Item = { id: string; label: string; x: number; y: number; size: number };

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

/** 模板 layoutGraph 的 split/group 分支（坐标、尺寸、路径朝向逐项同步） */
function layoutSplitGroup(relation: string, nodes: Array<{ id: string; label: string }>) {
  const parent = nodes[0];
  const children = nodes.slice(1);
  const parentSize = relation === 'group' ? 216 : 228;
  const parentY = relation === 'group' ? 292 : 286;
  const childY = relation === 'group' ? 660 : 672;
  const items: Item[] = [{ id: parent.id, label: parent.label, x: 960, y: parentY, size: parentSize }];
  const spacing = Math.min(350, 1420 / Math.max(1, children.length));
  const startX = 960 - ((children.length - 1) * spacing) / 2;
  const flows: Flow[] = [];
  children.forEach((node, i) => {
    const size = relation === 'group' ? 192 : 180;
    const x = startX + i * spacing;
    const top = parentY + parentSize / 2 + 58;
    const bottom = childY - size / 2 - 6;
    items.push({ id: node.id, label: node.label, x, y: childY, size });
    const edge: Edge =
      relation === 'group'
        ? { x1: x, y1: bottom, x2: 960, y2: top, delay: 16 + i * 10 }
        : { x1: 960, y1: top, x2: x, y2: bottom, delay: 16 + i * 10 };
    flows.push({
      edges: [edge],
      loop: false,
      target: [relation === 'group' ? parent.id : node.id],
      focus: [node.id],
    });
  });
  return { items, flows, parentId: parent.id };
}

const edgeLength = (edge: Edge): number =>
  Math.sqrt((edge.x2 - edge.x1) ** 2 + (edge.y2 - edge.y1) ** 2);

/** 逐帧重放模板的 activeIds 推导（只保留与"谁亮着"相关的部分） */
function simulate(opts: {
  nodes: Array<{ id: string }>;
  flows: Flow[];
  anchors: ActionAnchorTable;
  duration: number;
  flowAnchors: boolean;
  spreadWhenMulti: boolean;
  relation?: string;
}) {
  const { nodes, flows, duration } = opts;
  const storyStart = WARMUP;
  const storyEnd = Math.max(storyStart + 40, duration - 28);
  const cueWindows = opts.flowAnchors ? opts.anchors : {};
  const cueSpokenFrames = Object.keys(cueWindows)
    .map((id) => cueWindows[id].start)
    .sort((a, b) => a - b);
  const spokenBefore = (f: number): number | null => {
    let prev: number | null = null;
    for (const at of cueSpokenFrames) {
      if (at < f - 1) prev = at;
      else break;
    }
    return prev;
  };
  const flowStops = (flow: Flow): number[] | null => {
    if (!opts.flowAnchors) return null;
    const targets = flow.target;
    if (!targets || targets.length === 0) return null;
    if (flow.edges.length !== targets.length) return null;
    const arrive = (id: string): number | null => (cueWindows[id] ? cueWindows[id].start : null);
    const first = arrive(targets[0]);
    if (first === null) return null;
    // group：成员点名出发 → 类别点名落地（与模板 flowStops 的 focus 分支同步）
    if (flow.focus && flow.focus[0] && flow.focus[0] !== targets[0]) {
      const start = arrive(flow.focus[0]);
      const land = arrive(targets[0]);
      if (start === null || land === null) return null;
      if (land - start < FLOW_MIN_SEG) return null;
      return [start, land];
    }
    const depart = spokenBefore(first);
    if (depart === null) return null;
    const stops: number[] = [depart];
    for (let i = 0; i < targets.length; i += 1) {
      if (flow.loop && i === targets.length - 1) {
        stops.push(Math.max(stops[stops.length - 1] + FLOW_MIN_SEG, storyEnd));
        continue;
      }
      const at = arrive(targets[i]);
      if (at === null) return null;
      stops.push(at);
    }
    for (let i = 1; i < stops.length; i += 1) {
      if (stops[i] - stops[i - 1] < FLOW_MIN_SEG) return null;
    }
    return stops;
  };
  const tAtStops = (stops: number[], frame: number, flow: Flow): number => {
    const lengths = flow.edges.map(edgeLength);
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    const bounds: number[] = [0];
    let acc = 0;
    for (let i = 0; i < lengths.length; i += 1) {
      acc += lengths[i];
      bounds.push(acc / total);
    }
    if (frame <= stops[0]) return 0;
    for (let i = 0; i < stops.length - 1; i += 1) {
      if (frame <= stops[i + 1]) {
        const span = Math.max(1, stops[i + 1] - stops[i]);
        const u = (frame - stops[i]) / span;
        return bounds[i] + u * (bounds[i + 1] - bounds[i]);
      }
    }
    return 1;
  };
  const localAt = (flow: Flow, t: number): { segment: number; local: number } => {
    const lengths = flow.edges.map(edgeLength);
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let remain = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < lengths.length; i += 1) {
      if (remain <= lengths[i] || i === lengths.length - 1) {
        return { segment: i, local: lengths[i] > 0 ? Math.min(1, remain / lengths[i]) : 0 };
      }
      remain -= lengths[i];
    }
    return { segment: 0, local: 0 };
  };

  const flowCount = flows.length;
  const stopsByFlow = flows.map((flow) => flowStops(flow));
  const perFrame: Set<string>[] = [];
  const tSeries: number[][] = flows.map(() => []);
  // 星形拓扑：按"被念到的先后"取本帧之前最后一次点名（与模板 starSpoken 同步）
  const starSpoken =
    opts.relation === 'split' || opts.relation === 'group'
      ? nodes.every((node) => cueWindows[node.id])
        ? nodes
            .map((node) => ({ id: node.id, at: cueWindows[node.id].start }))
            .sort((a, b) => a.at - b.at)
        : null
      : null;

  for (let frame = 0; frame < duration; frame += 1) {
    const storyProgress = Math.max(0, Math.min(1, (frame - storyStart) / (storyEnd - storyStart)));
    const active = new Set<string>();
    if (starSpoken) {
      let spoken = -1;
      for (let i = 0; i < starSpoken.length; i += 1) {
        if (starSpoken[i].at <= frame) spoken = i;
        else break;
      }
      if (spoken >= 0) active.add(starSpoken[spoken].id);
    }
    flows.forEach((flow, index) => {
      const stops = stopsByFlow[index];
      let t: number;
      let anchored = false;
      if (stops) {
        t = tAtStops(stops, frame, flow);
        anchored = true;
      } else if (flow.loop) {
        const raw = (frame - WARMUP) / FLOW_PERIOD;
        t = ((raw % 1) + 1) % 1;
      } else {
        const spread = opts.spreadWhenMulti && flowCount > 1 ? 0.58 : 0;
        const slot = flowCount > 1 ? spread / flowCount : 0;
        const begin = index * slot;
        const span = Math.max(0.3, 1 - spread);
        t = Math.max(0, Math.min(1, (storyProgress - begin) / span));
      }
      tSeries[index][frame] = t;
      if (frame < WARMUP || starSpoken) return;
      const { segment, local } = localAt(flow, t);
      const seg = Math.max(0, Math.min(flow.target.length - 1, segment));
      const focusIds = flow.focus || flow.target;
      const fromId = seg === 0 ? nodes[0].id : focusIds[seg - 1];
      const toId = focusIds[seg];
      const handoff = anchored ? 0.999 : 0.5;
      const target = local >= handoff ? toId : fromId;
      if (target) active.add(target);
    });
    perFrame.push(active);
  }

  const summaries = nodes.map((node) => {
    let onset: number | null = null;
    let episodes = 0;
    let lit = 0;
    let prev = false;
    for (let f = 0; f < duration; f += 1) {
      const now = perFrame[f].has(node.id);
      if (now && !prev) {
        episodes += 1;
        if (onset === null) onset = f;
      }
      if (now) lit += 1;
      prev = now;
    }
    return { id: node.id, onset, episodes, lit };
  });

  return { stopsByFlow, summaries, perFrame, tSeries };
}

function fmtStops(stops: number[] | null): string {
  return stops ? `[${stops.join('→')}]` : '回退时钟';
}

async function main(): Promise<void> {
  const onlyArg = arg('only');
  const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()) : null;
  const wantProps = arg('props') === 'true';
  const scenes = await loadPreviewScenes();
  const voice = new VoiceService();

  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-boundary-cache.json');
  let cache: Record<string, Array<{ text: string; offset: number; duration: number }>> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }

  const outDir = path.resolve(__dirname, '../../video-remotion/out/flow-probe');
  if (wantProps) await fs.mkdir(outDir, { recursive: true });

  for (const scene of scenes) {
    if (only && !only.includes(String(scene.id))) continue;
    const graph = normalizeSceneGraph(scene?.sceneGraph);
    if (!graph) continue;
    if (graph.relation !== 'split' && graph.relation !== 'group') continue;
    const narration = String(scene.narration || '').trim();
    if (!narration) continue;

    let boundaries = cache[narration];
    const audioPath = path.resolve(__dirname, `../../video-remotion/public/probe-flow-${scene.id}.mp3`);
    const needAudio = wantProps && !(await fs.stat(audioPath).then(() => true).catch(() => false));
    if (!boundaries || needAudio) {
      try {
        const timing = await voice.textToSpeechWithTiming(narration);
        boundaries = timing.wordBoundaries;
        cache[narration] = boundaries;
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
        if (wantProps) {
          await fs.mkdir(path.dirname(audioPath), { recursive: true });
          await fs.writeFile(audioPath, timing.buffer);
        }
      } catch (error: any) {
        console.error(`[skip] ${scene.id} TTS 失败: ${error?.message || error}`);
        continue;
      }
    }

    const lastEnd = boundaries.reduce((max, b) => Math.max(max, b.offset + b.duration), 0);
    const speechFrames = Math.ceil((lastEnd / TICKS) * FPS);
    const duration = Math.max(90, speechFrames + 24);
    const cues = buildSubtitleCues(narration, boundaries, { fps: FPS, sceneFrames: duration });
    if (!cues) continue;

    const anchors = buildActionAnchors(graph.nodes, cues.pages, { durationFrames: duration });
    const order = auditFlowOrder(graph.nodes, anchors, { relation: graph.relation });
    const { items, flows } = layoutSplitGroup(graph.relation, graph.nodes);

    const on = simulate({
      nodes: graph.nodes,
      flows,
      anchors,
      duration,
      flowAnchors: true,
      spreadWhenMulti: true,
      relation: graph.relation,
    });
    const off = simulate({
      nodes: graph.nodes,
      flows,
      anchors,
      duration,
      flowAnchors: false,
      spreadWhenMulti: true,
      relation: graph.relation,
    });

    console.log(`\n=== ${scene.id} ${scene.title}  ${graph.relation}  ${duration}f ===`);
    console.log(`旁白：${narration}`);
    console.log(
      `节点：${graph.nodes.map((n) => `${n.label}${anchors[n.id] ? `@${anchors[n.id].start}f` : '(无锚点)'}`).join('  ')}`,
    );
    console.log(`路径：${flows.map((f) => `→${graph.nodes.find((n) => n.id === f.target[0])?.label}`).join('  ')}`);

    console.log('—'.repeat(74));
    console.log('挂词臂（flowAnchors=on）');
    flows.forEach((flow, i) => {
      const stops = on.stopsByFlow[i];
      const tag = `路径${i} → ${graph.nodes.find((n) => n.id === flow.target[0])?.label}`;
      const seg = stops ? stops[stops.length - 1] - stops[0] : null;
      console.log(`  ${tag.padEnd(20)} ${fmtStops(stops).padEnd(18)}${seg === null ? '' : ` 走 ${seg}f`}`);
    });
    const printSummaries = (label: string, sim: ReturnType<typeof simulate>) => {
      for (const s of sim.summaries) {
        const node = graph.nodes.find((n) => n.id === s.id)!;
        const anchor = anchors[s.id];
        const delta = s.onset !== null && anchor ? `${s.onset - anchor.start >= 0 ? '+' : ''}${s.onset - anchor.start}f` : '—';
        console.log(
          `  ${label} ${String(node.label).padEnd(5)} 亮起@${String(s.onset ?? '从不').padStart(4)}  ` +
            `念到@${String(anchor ? anchor.start : '—').padStart(4)}  偏差 ${delta.padEnd(6)} ` +
            `亮${String(s.lit).padStart(3)}帧  亮起${s.episodes}次`,
        );
      }
    };
    printSummaries('挂词', on);
    console.log('时钟臂（flowAnchors=off，现状基线）');
    printSummaries('时钟', off);

    // 多条路径同时出发 = 这一屏只有一个视觉事件，错开走的收益被抹掉。
    // 同时到达对 group 是设计意图（三个成员一起归入同一个类别），只有 split 才是异常。
    const departs = on.stopsByFlow.filter(Boolean).map((s) => s![0]);
    const sameDepart = departs.length > 1 && new Set(departs).size === 1;
    const arrivals = on.stopsByFlow.filter(Boolean).map((s) => s![s!.length - 1]);
    const sameArrive = arrivals.length > 1 && new Set(arrivals).size === 1;
    const litOn = on.summaries.filter((s) => s.lit > 0).length;
    const litOff = off.summaries.filter((s) => s.lit > 0).length;
    console.log('—'.repeat(74));
    const arriveNote = sameArrive
      ? graph.relation === 'group'
        ? '   （同时到达＝一起归入类别，符合设计）'
        : '   ⚠ 多条路径同时到达'
      : '';
    console.log(
      `点亮过的节点：挂词 ${litOn}/${graph.nodes.length}  时钟 ${litOff}/${graph.nodes.length}` +
        (sameDepart ? '   ⚠ 多条路径同时出发' : '') +
        arriveNote,
    );
    if (order.skipped) {
      console.log('（星形拓扑，不校验"图上顺序=旁白顺序"）');
    } else if (order.drift.length) {
      console.log(`⚠ 图上顺序≠旁白顺序：${order.drift.join(' / ')}`);
    }

    if (wantProps) {
      const sceneProps = {
        ...scene,
        sceneGraph: graph,
        audioSrc: `probe-flow-${scene.id}.mp3`,
        durationFrames: duration,
        subtitlePages: cues.pages,
        actionAnchors: anchors,
        accentColor: scene.accentColor || '#4d96ff',
      };
      const props = { title: '拓扑探针', topic: '光点挂词', scenes: [sceneProps], durationFrames: duration };
      await fs.writeFile(path.join(outDir, `props-${scene.id}.json`), JSON.stringify(props, null, 2));
      await fs.writeFile(
        path.join(outDir, `props-${scene.id}-off.json`),
        JSON.stringify({ ...props, scenes: [{ ...sceneProps, flowAnchors: false }] }, null, 2),
      );
      await fs.writeFile(
        path.join(outDir, `meta-${scene.id}.json`),
        JSON.stringify(
          {
            id: scene.id,
            title: scene.title,
            relation: graph.relation,
            durationFrames: duration,
            accent: sceneProps.accentColor,
            narration,
            items,
            anchors,
            nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label })),
          },
          null,
          2,
        ),
      );
      console.log(`props → ${outDir}/props-${scene.id}.json`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
