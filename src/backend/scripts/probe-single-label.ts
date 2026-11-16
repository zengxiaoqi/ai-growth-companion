/**
 * probe-single-label.ts — 单字标签到底能不能锚上，靠真实词边界说话。
 *
 * 要验证的是三件事，都是"看起来有、实际没有"的反例：
 *   1. 「水」出现在「水果」里 —— 不该锚（否则动效演在错误的那一刻）
 *   2. 「水」独立成词且出现两次 —— 该锚在第一次（旁白重复指的多半是同一个概念）
 *   3. 「云」独立成词但夹在长句里 —— 该锚在它被念出来的那一帧
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-single-label.ts
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors } from '../src/modules/learning/action-anchors';

const FPS = 30;
const TICKS = 1e7;

const CASES: Array<{ name: string; narration: string; label: string; expect: 'anchor' | 'skip' }> = [
  {
    name: '「水」藏在「水果」里',
    narration: '苹果、香蕉和葡萄，它们都是水果。',
    label: '水',
    expect: 'skip',
  },
  {
    name: '「水」独立成词并出现两次',
    narration: '太阳把水晒热，水变成水汽飞到天上。',
    label: '水',
    expect: 'anchor',
  },
  {
    name: '「云」夹在长句里',
    narration: '太阳把水晒热，水变成看不见的水汽飞到天上，遇冷又变回小水珠落下来，就变成了云。',
    label: '云',
    expect: 'anchor',
  },
];

async function main(): Promise<void> {
  const voice = new VoiceService();
  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-boundary-cache.json');
  let cache: Record<string, Array<{ text: string; offset: number; duration: number }>> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }

  let pass = 0;
  for (const item of CASES) {
    let boundaries = cache[item.narration];
    if (!boundaries) {
      try {
        const timing = await voice.textToSpeechWithTiming(item.narration);
        boundaries = timing.wordBoundaries;
        cache[item.narration] = boundaries;
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
      } catch (error: any) {
        console.error(`[skip] ${item.name}: TTS 失败 ${error?.message || error}`);
        continue;
      }
    }
    const last = boundaries[boundaries.length - 1];
    const duration = Math.max(60, Math.round(((Number(last.offset) + Number(last.duration)) / TICKS) * FPS) + 30);
    const cues = buildSubtitleCues(item.narration, boundaries, { fps: FPS, sceneFrames: duration });
    if (!cues) {
      console.error(`[skip] ${item.name}: 字幕对齐失败`);
      continue;
    }
    const table = buildActionAnchors([{ id: 'x', label: item.label, subject: item.label }], cues.pages, {
      durationFrames: duration,
      boundaries,
      fps: FPS,
    });
    const got = table.x ? 'anchor' : 'skip';
    const ok = got === item.expect;
    if (ok) pass += 1;
    // 词边界里有没有这个单字独立成词——这是判据，不是结论
    const words = boundaries.map((w) => w.text).filter((t) => t.includes(item.label));
    console.log(
      `${ok ? '✓' : '✗'} ${item.name.padEnd(22)} 期望 ${item.expect.padEnd(6)} 实际 ${got.padEnd(6)}` +
        (table.x ? ` 命中「${table.x.matched}」@${table.x.start}f` : ' 无锚点') +
        `   含该字的词：${words.join('/') || '（无）'}`,
    );
  }
  console.log(`\n${pass}/${CASES.length} 通过`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
