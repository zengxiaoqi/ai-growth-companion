/**
 * probe-beat-timing.ts — 量「拍」的边界有没有落在旁白真的换句的地方。
 *
 * 拍的定时原来是"句字数占全篇比例 × 场景时长"（`beatWindows`，注释里就写着
 * "TTS 有词级时间戳后可替换此分配"）。中文里长句读得快、短句念得慢，
 * 数字数算出来的拍界会偏——偏多少，只能在真实语音上量。
 *
 * 这个脚本对同一个场景造两臂 props：
 *   props-<id>.json         拍界 = 按词边界重排（beatFramesFromSpeech）
 *   props-<id>-charbased.json 拍界 = 原样（字数比例分配）
 * 两臂只有拍界不同，其余 props 完全一致，渲染后逐帧像素对拍。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-beat-timing.ts --only a1,a2 --props
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors } from '../src/modules/learning/action-anchors';
import { beatFramesFromSpeech, splitSentences } from '../src/modules/learning/video/choreography';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

const FPS = 30;
const TICKS = 1e7;

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
  // --relabel 白云=云：旧预览场景里有节点名在旁白里从未出现（"遇冷变云" vs 标签"白云"），
  // 而现在的生成端强制"节点标签必须逐字出现在旁白里"，这种场景不会再产出。
  // 改掉标签是为了造一个"今天真会产出的场景"来量拍内焦点，不是绕过规则。
  const relabel = (arg('relabel') || '')
    .split(',')
    .map((pair) => pair.split('=').map((s) => s.trim()))
    .filter((pair) => pair.length === 2 && pair[0] && pair[1]);

  const outDir = path.resolve(__dirname, '../../video-remotion/out/beat-probe');
  if (wantProps) await fs.mkdir(outDir, { recursive: true });

  for (const scene of scenes) {
    if (only && !only.includes(String(scene.id))) continue;
    const rawBeats = scene?.choreography?.beats;
    if (!Array.isArray(rawBeats) || rawBeats.length === 0) continue;
    const narration = String(scene.narration || '').trim();
    if (!narration) continue;

    let boundaries = cache[narration];
    const audioPath = path.resolve(__dirname, `../../video-remotion/public/probe-beat-${scene.id}.mp3`);
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
    const graph = normalizeSceneGraph(scene?.sceneGraph);
    if (graph && relabel.length) {
      for (const node of graph.nodes) {
        const hit = relabel.find(([from]) => from === node.label);
        if (hit) {
          node.label = hit[1];
          node.subject = hit[1];
        }
      }
    }
    const anchors = graph ? buildActionAnchors(graph.nodes, cues.pages, { durationFrames: duration }) : {};

    const retimed = beatFramesFromSpeech(rawBeats, narration, boundaries, { sceneFrames: duration });
    const sentences = splitSentences(narration);

    console.log(`\n=== ${scene.id} ${scene.title}  ${duration}f（语音 ${speechFrames}f，${sentences.length} 句）===`);
    console.log(`旁白：${narration}`);
    const totalChars = sentences.reduce((s, x) => s + x.length, 0) || 1;
    let acc = 0;
    const charStarts = sentences.map((s) => {
      const at = Math.round((acc / totalChars) * duration);
      acc += s.length;
      return at;
    });
    rawBeats.forEach((beat: any, i: number) => {
      const next = retimed ? retimed[i] : null;
      const delta = next ? next.startFrame - Number(beat.startFrame) : null;
      console.log(
        `  拍${i} 句${beat.sentenceIndex}(+${beat.span || 1}) focus=${beat.focus || '-'}  ` +
          `字数比例 ${String(beat.startFrame).padStart(4)}-${String(beat.endFrame).padStart(4)}f  ` +
          (next
            ? `按词 ${String(next.startFrame).padStart(4)}-${String(next.endFrame).padStart(4)}f  偏差 ${delta! >= 0 ? '+' : ''}${delta}f`
            : '按词：对不上词边界，保留原分配'),
      );
    });
    // 逐句的真实词界：拿"每句一拍"喂给同一个函数，出来的就是每句的起止帧
    const perSentence = beatFramesFromSpeech(
      sentences.map((_, i) => ({ sentenceIndex: i })),
      narration,
      boundaries,
      { sceneFrames: duration },
    );
    if (perSentence) {
      console.log(
        `  逐句真实词界：${perSentence.map((w, i) => `「${sentences[i].slice(0, 6)}」${w.startFrame}-${w.endFrame}f`).join(' ')}`,
      );
    }

    if (wantProps && retimed) {
      const sceneProps = {
        ...scene,
        sceneGraph: graph || undefined,
        audioSrc: `probe-beat-${scene.id}.mp3`,
        durationFrames: duration,
        subtitlePages: cues.pages,
        actionAnchors: anchors,
        accentColor: scene.accentColor || '#4d96ff',
      };
      const withFrames = (frames: Array<{ startFrame: number; endFrame: number }>) => ({
        ...sceneProps,
        choreography: {
          ...scene.choreography,
          beats: scene.choreography.beats.map((beat: any, i: number) => ({
            ...beat,
            startFrame: frames[i].startFrame,
            endFrame: frames[i].endFrame,
          })),
        },
      });
      const original = rawBeats.map((b: any) => ({
        startFrame: Number(b.startFrame),
        endFrame: Number(b.endFrame),
      }));
      await fs.writeFile(
        path.join(outDir, `props-${scene.id}.json`),
        JSON.stringify({ title: '拍定时探针', topic: '按词排拍', scenes: [withFrames(retimed)], durationFrames: duration }, null, 2),
      );
      await fs.writeFile(
        path.join(outDir, `props-${scene.id}-charbased.json`),
        JSON.stringify({ title: '拍定时探针', topic: '按字数排拍', scenes: [withFrames(original)], durationFrames: duration }, null, 2),
      );
      await fs.writeFile(
        path.join(outDir, `meta-${scene.id}.json`),
        JSON.stringify(
          {
            id: scene.id,
            title: scene.title,
            relation: graph ? graph.relation : 'none',
            durationFrames: duration,
            accent: sceneProps.accentColor,
            narration,
            anchors,
            nodes: (graph ? graph.nodes : []).map((n) => ({ id: n.id, label: n.label })),
            beats: retimed,
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
