#!/usr/bin/env node
/**
 * probe-tts-timing.cjs — 用真实配音的时间戳，量字幕"估算节奏"到底偏了多少。
 *
 * 背景：字幕逐字跟读的节拍是算出来的（每字 = 屏长 / 字数，封顶 10 帧/字）。
 * 生产里场景时长来自音频，但 parseMp3DurationFrames 会额外加 0.3s 入场 + 0.5s 尾巴，
 * 而 <Audio> 是从场景第 0 帧就响的——于是"铺满整个场景"等于把字往后拖了 0.8 秒。
 *
 * Edge-TTS 的 synthesize() 本来就把 WordBoundary 收进 word_boundaries（getWordBoundaries 可取），
 * 只是我们从来没用。这个脚本把它读出来当基准，比较两种估算口径与真实语音的偏差：
 *   A = 按 durationFrames 铺满（当前实现）
 *   B = 按语音实际时长铺满（去掉入场/尾巴的垫片）
 *
 * 用法：node scripts/probe-tts-timing.cjs [--json out.json] [--limit 6]
 */
const fs = require("fs");
const path = require("path");

const { EdgeTTS } = require("../node_modules/@andresaya/edge-tts/dist/index.js");

const FPS = 30;
const VOICE = "zh-CN-XiaoyiNeural";
const RATE = "+12%";
const PITCH = "+2Hz";
const MAX_CHARS_PER_PAGE = 15;
const MAX_LINES = 2;
const CJK_BREAK = /[。！？；，、]$/;
const SUB_PUNCT = /[，。！？；、,.!?;:]/;
const LEAD_FRAMES = Math.ceil(0.3 * FPS);
const TAIL_FRAMES = Math.ceil(0.5 * FPS);
const MIN_FRAMES = 6 * FPS;

function splitNarration(text, maxChars, maxLines) {
  const limit = maxChars * maxLines;
  const out = [];
  let rest = (text || "").trim();
  if (!rest) return [""];
  while (rest.length > 0) {
    if (rest.length <= limit) {
      out.push(rest);
      break;
    }
    let cut = -1;
    for (let i = Math.min(rest.length, limit); i > Math.floor(limit * 0.6); i -= 1) {
      if (CJK_BREAK.test(rest.charAt(i - 1))) {
        cut = i;
        break;
      }
    }
    if (cut < 0) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return out.length > 0 ? out : [""];
}

function subtitleTokens(text) {
  const out = [];
  for (const ch of Array.from(text)) {
    if (out.length > 0 && SUB_PUNCT.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** 模板当前的估算公式（与 SubtitleTrack 对齐），span 可传 durationFrames 或语音时长 */
function estimateCharTimes(pages, span) {
  const perPage = span / pages.length;
  const rows = [];
  pages.forEach((page, pageIndex) => {
    const tokens = subtitleTokens(page);
    const beat = Math.min(10, perPage / Math.max(1, tokens.length));
    tokens.forEach((tk, i) => rows.push({ token: tk, estFrame: pageIndex * perPage + i * beat }));
  });
  return rows;
}

/** 复刻 parseMp3DurationFrames（逐帧算，不是按字节估），额外把"语音时长"单独返回 */
function parseMp3(buffer) {
  const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const SR_V1 = [44100, 48000, 32000, 0];
  const SR_V2 = [22050, 24000, 16000, 0];
  const SR_V25 = [11025, 12000, 8000, 0];
  const scanLimit = Math.min(buffer.length - 4, 65536);
  for (let i = 0; i < scanLimit; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const h = (buffer[i] << 24) | (buffer[i + 1] << 16) | (buffer[i + 2] << 8) | buffer[i + 3];
    const mpegVersion = (h >> 19) & 0x3;
    const layerBits = (h >> 17) & 0x3;
    const bitrateIdx = (h >> 12) & 0xf;
    const srateIdx = (h >> 10) & 0x3;
    const padding = (h >> 9) & 0x1;
    if (mpegVersion === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srateIdx === 3) continue;
    const isV1 = mpegVersion === 3;
    const isL3 = layerBits === 1;
    const bitrate = (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx] * 1000;
    const srate = (isV1 ? SR_V1 : mpegVersion === 2 ? SR_V2 : SR_V25)[srateIdx];
    if (!bitrate || !srate || !isL3) continue;
    const samplesPerFrame = isV1 ? 1152 : 576;
    const frameBytes = Math.floor((samplesPerFrame * bitrate) / 8 / srate) + padding;
    if (frameBytes < 24 || frameBytes > 1442) continue;
    const frameCount = Math.max(1, Math.floor((buffer.length - i) / frameBytes));
    const speechFrames = Math.ceil(((frameCount * samplesPerFrame) / srate) * FPS);
    return {
      speechFrames,
      sceneFrames: Math.max(MIN_FRAMES, speechFrames + LEAD_FRAMES + TAIL_FRAMES),
    };
  }
  const speechFrames = Math.ceil((buffer.length / 5000) * FPS);
  return { speechFrames, sceneFrames: Math.max(MIN_FRAMES, speechFrames + LEAD_FRAMES + TAIL_FRAMES) };
}

function ticksToFrames(ticks) {
  return (ticks / 1e7) * FPS;
}

function stats(diffsFrames) {
  const abs = diffsFrames.map((d) => Math.abs(d) / FPS);
  const sorted = [...abs].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))] || 0;
  return {
    mean: +(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(3),
    p50: +p(0.5).toFixed(3),
    p95: +p(0.95).toFixed(3),
    max: +Math.max(...abs).toFixed(3),
    over300: Math.round((abs.filter((x) => x > 0.3).length / abs.length) * 100),
    over500: Math.round((abs.filter((x) => x > 0.5).length / abs.length) * 100),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonAt = args.indexOf("--json");
  const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : null;
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 6;

  const root = path.resolve(__dirname, "..", "..", "video-remotion", "src", "__preview", "Root.tsx");
  const src = fs.readFileSync(root, "utf8");
  const m = src.match(/const SCENES = (\[[\s\S]*?\]);\n/);
  if (!m) throw new Error("Root.tsx 里找不到 SCENES");
  const scenes = JSON.parse(m[1]).slice(0, limit);

  const report = [];
  for (let idx = 0; idx < scenes.length; idx += 1) {
    const scene = scenes[idx];
    const narration = String(scene.narration || "").trim();
    if (!narration) continue;

    const tts = new EdgeTTS();
    await tts.synthesize(narration, VOICE, {
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      rate: RATE,
      pitch: PITCH,
    });
    const buffer = tts.toBuffer();
    const boundaries = tts.getWordBoundaries() || [];
    const parsed = parseMp3(buffer);
    // 生产口径：场景时长 = max(分镜原时长, 音频帧数)
    const sceneFrames = Math.max(Number(scene.durationFrames) || 0, parsed.sceneFrames);
    const speechFrames = parsed.speechFrames;

    const pages = splitNarration(narration, MAX_CHARS_PER_PAGE, MAX_LINES);
    const estA = estimateCharTimes(pages, sceneFrames);
    const estB = estimateCharTimes(pages, speechFrames);

    const actual = [];
    for (const b of boundaries) {
      const chars = subtitleTokens(b.text);
      const span = b.duration / Math.max(1, chars.length);
      chars.forEach((tk, i) => actual.push({ token: tk, at: b.offset + span * i }));
    }

    const n = Math.min(estA.length, actual.length);
    if (n < 3) continue;
    const diffA = [];
    const diffB = [];
    for (let i = 0; i < n; i += 1) {
      const act = ticksToFrames(actual[i].at);
      diffA.push(act - estA[i].estFrame);
      diffB.push(act - estB[i].estFrame);
    }

    const row = {
      index: idx + 1,
      title: scene.title,
      chars: narration.length,
      tokens: estA.length,
      words: boundaries.length,
      pages: pages.length,
      speechSec: +(speechFrames / FPS).toFixed(2),
      sceneSec: +(sceneFrames / FPS).toFixed(2),
      padSec: +((sceneFrames - speechFrames) / FPS).toFixed(2),
      current: stats(diffA),
      speechSpan: stats(diffB),
    };
    report.push(row);
    console.log(
      `场景${row.index} ${String(row.title).slice(0, 10).padEnd(10)} 字 ${String(row.chars).padStart(2)} 词 ${String(row.words).padStart(2)} ` +
        `语音 ${row.speechSec}s 场景 ${row.sceneSec}s（垫 ${row.padSec}s）| ` +
        `当前 中位 ${row.current.p50}s 最大 ${row.current.max}s >0.3s ${row.current.over300}% | ` +
        `按语音铺满 中位 ${row.speechSpan.p50}s 最大 ${row.speechSpan.max}s`,
    );
  }

  const avg = (f) => +(report.reduce((a, r) => a + f(r), 0) / report.length).toFixed(3);
  console.log(
    `\n合计 ${report.length} 个场景：\n` +
      `  当前（按场景时长铺满）  中位 ${avg((r) => r.current.p50)}s / P95 ${avg((r) => r.current.p95)}s / 最大 ${avg((r) => r.current.max)}s / >0.3s ${Math.round(avg((r) => r.current.over300))}%\n` +
      `  按语音时长铺满        中位 ${avg((r) => r.speechSpan.p50)}s / P95 ${avg((r) => r.speechSpan.p95)}s / 最大 ${avg((r) => r.speechSpan.max)}s / >0.3s ${Math.round(avg((r) => r.speechSpan.over300))}%\n` +
      `  接词级时间戳          中位 0s / 最大 0.03s（只剩帧取整）`,
  );

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 1));
    console.log("明细已写入 " + jsonPath);
  }
}

main().catch((e) => {
  console.error("probe failed:", e && e.message ? e.message : e);
  process.exit(1);
});
