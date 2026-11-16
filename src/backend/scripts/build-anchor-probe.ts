/**
 * 语义动作锚点的渲染侧验收：把"真实配音 + 词边界 + 按词算好的动作窗"写成 props，
 * 供 remotion --props 渲染两组（锚点开 / 关），再用 scripts/measure-cue-anchors.py 对拍。
 *
 * 场景来源是规则开启后 LLM 的真实产出（out/narration-rule/new-*.json），
 * 这样测的是产品真会产出的内容，不是手写样例。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/build-anchor-probe.ts \
 *     --file ../video-remotion/out/narration-rule/new-水循环是怎么回事-1.json --scene 0
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors, summarizeActionAnchors } from '../src/modules/learning/action-anchors';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

const FPS = 30;
const TICKS = 1e7;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}

async function main() {
  const file = arg('file');
  const sceneIndex = Number(arg('scene', '0'));
  const tag = arg('tag', 'anchor');
  if (!file) throw new Error('--file 必填');

  const abs = path.resolve(process.cwd(), file);
  const lesson = JSON.parse(await fs.readFile(abs, 'utf8'));
  const raw = (lesson.scenes || [])[sceneIndex];
  if (!raw) throw new Error(`scene ${sceneIndex} not found in ${file}`);

  const graph = normalizeSceneGraph(raw.sceneGraph);
  if (!graph) throw new Error('sceneGraph 归一化失败');
  const narration = String(raw.narration || '').trim();
  if (!narration) throw new Error('场景没有旁白');

  const voice = new VoiceService();
  // TTS 连续请求会 429，按旁白文本缓存一次，重跑探针不再打服务
  const cacheFile = path.resolve(process.cwd(), '../video-remotion/out/.anchor-tts-cache.json');
  let cache: Record<string, { audio: string; boundaries: Array<{ text: string; offset: number; duration: number }> }> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
  let speech: { buffer: Buffer; wordBoundaries: Array<{ text: string; offset: number; duration: number }> };
  if (cache[narration]) {
    speech = {
      buffer: Buffer.from(cache[narration].audio, 'base64'),
      wordBoundaries: cache[narration].boundaries,
    };
    console.log('[tts] 用缓存');
  } else {
    const fresh = await voice.textToSpeechWithTiming(narration);
    speech = { buffer: fresh.buffer, wordBoundaries: fresh.wordBoundaries };
    cache[narration] = {
      audio: fresh.buffer.toString('base64'),
      boundaries: fresh.wordBoundaries,
    };
    await fs.writeFile(cacheFile, JSON.stringify(cache), 'utf8');
  }
  const lastEnd = speech.wordBoundaries.reduce((max, b) => Math.max(max, b.offset + b.duration), 0);
  const speechFrames = Math.ceil((lastEnd / TICKS) * FPS);
  // 与生产同口径：语音长度 + 0.8s 入画/收尾
  const durationFrames = Math.max(90, speechFrames + 24);

  const cues = buildSubtitleCues(narration, speech.wordBoundaries, { fps: FPS, sceneFrames: durationFrames });
  if (!cues) throw new Error('cues 对齐失败');

  const anchors = buildActionAnchors(graph.nodes, cues.pages, { durationFrames });
  const stats = summarizeActionAnchors(graph.nodes, anchors);

  const outDir = path.resolve(process.cwd(), '../video-remotion/out/anchor-probe');
  const publicDir = path.resolve(process.cwd(), '../video-remotion/public');
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });
  const audioName = `probe-anchor-${tag}.mp3`;
  await fs.writeFile(path.join(publicDir, audioName), speech.buffer);

  const scene = {
    ...raw,
    sceneGraph: graph,
    audioSrc: audioName,
    durationFrames,
    subtitlePages: cues.pages,
    actionAnchors: anchors,
    // LLM 产出没有配色时给个默认值：符号和卡片边框都取它，两臂一致不影响对照
    accentColor: raw.accentColor || '#4d96ff',
  };
  const props = { title: '锚点探针', topic: '动作挂词', scenes: [scene], durationFrames };
  await fs.writeFile(path.join(outDir, `props-${tag}.json`), JSON.stringify(props, null, 2));
  // 对照组：同一份 props，只关掉锚点（anchorSigns=false → 模板走 storyProgress）
  await fs.writeFile(
    path.join(outDir, `props-${tag}-off.json`),
    JSON.stringify({ ...props, scenes: [{ ...scene, anchorSigns: false }] }, null, 2),
  );

  const meta = {
    source: path.basename(abs),
    sceneIndex,
    title: raw.title,
    narration,
    relation: graph.relation,
    durationFrames,
    speechFrames,
    pages: cues.pages.map((p) => ({ text: p.tokens.join(''), start: p.starts[0], end: p.starts[p.starts.length - 1] })),
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, subject: n.subject, sign: n.sign, swell: n.swell })),
    anchors,
    coverage: stats,
  };
  await fs.writeFile(path.join(outDir, `meta-${tag}.json`), JSON.stringify(meta, null, 2));

  console.log(`scene=${raw.title} relation=${graph.relation} duration=${durationFrames}f (speech ${speechFrames}f)`);
  console.log(`pages: ${meta.pages.map((p) => `${p.text}[${p.start}-${p.end}]`).join(' | ')}`);
  console.log(`anchors ${stats.anchored}/${stats.total} = ${(stats.ratio * 100).toFixed(0)}%  missed=${stats.missed.join('/') || '-'}`);
  for (const node of graph.nodes) {
    const a = anchors[node.id];
    console.log(
      `  ${node.label.padEnd(5)} sign=${node.sign || '-'} swell=${node.swell || '-'} → ` +
        (a ? `匹配「${a.matched}」 窗口 ${a.start}-${a.end}f (${a.end - a.start}f)` : '无锚点，回退整屏进度'),
    );
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
