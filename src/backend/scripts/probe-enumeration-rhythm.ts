/**
 * probe-enumeration-rhythm.ts — 一屏连着报几个名词时，卡片跟得上吗。
 *
 * 背景：高亮现在跟旁白（念到谁亮谁），但卡片要 spring 落位（原地 6 帧 / 飞入 16 帧）。
 * 星形拓扑的成员还要叠 20 帧入场 delay，于是「苹果、香蕉和葡萄」这种纯名单会撞墙：
 * 三个词间隔 16-23 帧，而第一张卡最快 16 帧落位、后两张 36 帧——
 * 第一个词整句讲完了，画面上那张卡还在飞。
 *
 * 这个探针不比模板，比的是**旁白写法**：
 * 同一屏概念，写成"纯名单"和"每个都带一句描述"，词与词的间隔差多少。
 * 结论用来决定生成端的约束该写"别列 3 个以上"还是"列了就要各带一句"。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-enumeration-rhythm.ts
 *   npx ts-node --transpile-only scripts/probe-enumeration-rhythm.ts --tts   # 忽略缓存重新配音
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { VoiceService } from '../src/modules/voice/voice.service';
import { buildSubtitleCues } from '../src/modules/learning/subtitle-timing';
import { buildActionAnchors } from '../src/modules/learning/action-anchors';

const FPS = 30;
const TICKS = 1e7;
/** 与模板 cueEnterAt 的 span 同步 */
const CUE_LEAD = 20;
/** group/split 成员：20 帧入场 delay + 飞入 spring 到 90% 约 16 帧 */
const READY_MEMBER = 20 + 16;

type Case = {
  name: string;
  narration: string;
  /** 按旁白顺序列出这一屏的成员标签（不含最后的类别） */
  members: string[];
  kind: string;
};

const CASES: Case[] = [
  {
    name: '纯名单',
    kind: 'group',
    narration: '苹果、香蕉和葡萄，它们都是水果。水果是植物结出来的果实，吃起来甜甜的。',
    members: ['苹果', '香蕉', '葡萄'],
  },
  {
    name: '每项带半句',
    kind: 'group',
    narration: '苹果红红的，香蕉弯弯的，葡萄一串一串的，它们都是水果。水果是植物结出来的果实，吃起来甜甜的。',
    members: ['苹果', '香蕉', '葡萄'],
  },
  {
    name: '每项带整句',
    kind: 'group',
    narration: '苹果红红的，咬一口脆脆的。香蕉弯弯的，像一条小船。葡萄一串一串的，甜甜的。它们都是水果。',
    members: ['苹果', '香蕉', '葡萄'],
  },
];

async function main(): Promise<void> {
  const forceTts = process.argv.includes('--tts');
  const voice = new VoiceService();
  const cacheFile = path.resolve(__dirname, '../../video-remotion/out/.tts-boundary-cache.json');
  let cache: Record<string, Array<{ text: string; offset: number; duration: number }>> = {};
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }

  console.log(`口径：成员卡落位需 ${READY_MEMBER} 帧（20 帧入场 + 飞入 16 帧）；` +
    `相邻两个词间隔短于它，后一个会"还没亮就被切走"。\n`);

  for (const item of CASES) {
    let boundaries = forceTts ? undefined : cache[item.narration];
    if (!boundaries) {
      try {
        const timing = await voice.textToSpeechWithTiming(item.narration);
        boundaries = timing.wordBoundaries;
        cache[item.narration] = boundaries;
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
      } catch (error: any) {
        console.error(`[skip] ${item.name} TTS 失败: ${error?.message || error}`);
        continue;
      }
    }

    const last = boundaries[boundaries.length - 1];
    const spokenSec = last ? (Number(last.offset) + Number(last.duration)) / TICKS : 0;
    const duration = Math.max(60, Math.round(spokenSec * FPS) + 30);

    const cues = buildSubtitleCues(item.narration, boundaries, { fps: FPS, sceneFrames: duration });
    if (!cues) {
      console.error(`[skip] ${item.name} 字幕对齐失败`);
      continue;
    }
    const nodes = item.members.map((label, i) => ({
      id: `m${i + 1}`,
      label,
      subject: label,
    }));
    const anchors = buildActionAnchors(nodes, cues.pages, { durationFrames: duration, boundaries, fps: FPS });

    const timed = nodes
      .map((node) => ({ label: node.label, at: anchors[node.id] ? anchors[node.id].start : null }))
      .filter((row) => row.at !== null) as Array<{ label: string; at: number }>;

    console.log(`■ ${item.name}   语音 ${spokenSec.toFixed(1)}s / ${duration} 帧`);
    console.log(`  ${timed.map((r) => `${r.label}@${r.at}f`).join('  ')}`);
    const gaps: number[] = [];
    for (let i = 0; i < timed.length; i += 1) {
      const next = i + 1 < timed.length ? timed[i + 1].at : duration;
      const gap = next - timed[i].at;
      gaps.push(gap);
      // 第一个成员不叠 20 帧 delay（模板把它当"主题"先立起来），其余叠
      const ready = i === 0 ? 6 : READY_MEMBER;
      const lit = Math.max(0, next - Math.max(timed[i].at, ready));
      const flag = lit <= 8 ? ' ✗ 闪一下' : '';
      console.log(
        `    ${timed[i].label.padEnd(4)} 间隔 ${String(gap).padStart(3)}f  落位 ${String(ready).padStart(2)}f  ` +
          `亮 ${String(lit).padStart(3)}f${flag}`,
      );
    }
    const bad = gaps.filter((g) => g < READY_MEMBER).length;
    console.log(`  → 间隔短于 ${READY_MEMBER} 帧的相邻对：${bad}/${gaps.length}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
