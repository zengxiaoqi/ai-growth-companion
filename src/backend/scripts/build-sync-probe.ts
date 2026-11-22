/**
 * 渲染侧验收：把某一场景的真实配音 + 词级时间轴写进 props，供 remotion --props 渲染，
 * 再用 scripts/measure-subtitle-steps.py 逐帧比对"字点亮在第几帧"。
 *
 * 生产链路一致：VoiceService.textToSpeechWithTiming → buildSubtitleCues → props.subtitlePages
 * 唯一差别是这里不落库、不走队列。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/build-sync-probe.ts --scene 0
 *   → 产出 ../video-remotion/out/sync-probe/props.json 与 public/probe-narration-<n>.mp3
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';

const FPS = 30;

async function loadPreviewScenes(): Promise<any[]> {
  const file = path.resolve(__dirname, '../../video-remotion/src/__preview/Root.tsx');
  const source = await fs.readFile(file, 'utf8');
  const matched = source.match(/const SCENES(?::\s*[^=]+)?\s*=\s*(\[[\s\S]*?\]);\n/);
  if (!matched) throw new Error(`SCENES not found in ${file}`);
  return JSON.parse(matched[1]);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const sceneIndex = Number(arg('scene', '0'));
  const scenes = await loadPreviewScenes();
  const scene = scenes[sceneIndex];
  if (!scene) throw new Error(`scene ${sceneIndex} not found`);

  const narration = String(scene.narration || '').trim();
  const voice = new VoiceService();
  const speech = await voice.textToSpeechWithTiming(narration);

  const audioFrames = Math.ceil(((speech.buffer.length * 8) / 96000) * FPS);
  const durationFrames = Math.max(6 * FPS, audioFrames + 24);
  const cues = buildSubtitleCues(narration, speech.wordBoundaries, { fps: FPS, sceneFrames: durationFrames });
  if (!cues) throw new Error('cues alignment failed');

  const outDir = path.resolve(process.cwd(), '../video-remotion/out/sync-probe');
  await fs.mkdir(outDir, { recursive: true });
  const publicDir = path.resolve(process.cwd(), '../video-remotion/public');
  await fs.mkdir(publicDir, { recursive: true });
  const audioName = `probe-narration-${sceneIndex}.mp3`;
  await fs.writeFile(path.join(publicDir, audioName), speech.buffer);

  const enriched = { ...scene, audioSrc: audioName, durationFrames, subtitlePages: cues.pages };
  const props = {
    title: '同步探针',
    topic: '字幕对拍',
    scenes: [enriched],
    durationFrames,
  };
  await fs.writeFile(path.join(outDir, 'props.json'), JSON.stringify(props, null, 2));
  // A/B 对照：同一份配音与时间轴，只关掉"发音驱动焦点"，用来量它到底有没有换来画面变化
  await fs.writeFile(
    path.join(outDir, 'props-off.json'),
    JSON.stringify({ ...props, scenes: [{ ...enriched, spokenFocus: false }] }, null, 2),
  );

  const meta = {
    scene: sceneIndex,
    title: scene.title,
    narration,
    durationFrames,
    audioSeconds: Math.round((audioFrames / FPS) * 10) / 10,
    coverage: cues.coverage,
    pages: cues.pages.map((page) => ({
      text: page.tokens.join(''),
      tokens: page.tokens,
      starts: page.starts,
    })),
  };
  await fs.writeFile(path.join(outDir, 'cues.json'), JSON.stringify(meta, null, 2));

  console.log(`scene=${sceneIndex} title=${scene.title} dur=${durationFrames} frames (${(durationFrames / FPS).toFixed(1)}s)`);
  console.log(`audio=${(audioFrames / FPS).toFixed(1)}s coverage=${(cues.coverage * 100).toFixed(0)}%`);
  cues.pages.forEach((page, i) => {
    console.log(`  page${i + 1}: ${page.tokens.join('')}`);
    console.log(`    starts: ${page.starts.join(',')}`);
  });
  console.log(`props -> ${path.join(outDir, 'props.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
