#!/usr/bin/env node
/**
 * probe-prop-draw.ts — 道具"按名字现画"的探针 + 画廊。
 *
 * 为什么需要人看这一屏：道具的正确性有两个来源，机器只能验一半——
 * 结构校验（纯图形、无文字、无外链）与 vision 验收（"像不像 X"）能挡住
 * 明显错误，但"风格是否统一""大小是否离谱""有没有画成一个奇怪的东西"
 * 只有人眼扫一遍才知道。20 个名字摆一屏，配一只 1.67 高的熊做标尺，
 * 一眼就能看出哪几个不能用。
 *
 * 走的是**生产同一套代码**：AssetGenService.loadSubjectSvg（层1 SVG →
 * 结构校验 → vision → 磁盘缓存），返回的 markup/canvas 与装配期下发给渲染层的
 * 完全一致；尺寸换算用的是 PropGlyph 的公式（scale = h / (canvas × fill)）。
 *
 * 用法（src/backend 下）：
 *   npx ts-node -T scripts/probe-prop-draw.ts
 *   npx ts-node -T scripts/probe-prop-draw.ts --names 水桶,洒水壶,风筝,向日葵,地球仪,书包
 *   npx ts-node -T scripts/probe-prop-draw.ts --names 水桶 --ratio 0.22
 *
 * 输出：控制台表 + src/backend/storage/prop-gallery.png
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { AssetGenService } from '../src/modules/learning/asset-gen.service';
import { PROP_GEN_FILL } from '../src/modules/learning/video/prop-resolver';

const OUT_DIR = path.resolve(__dirname, '../storage');
const OUT_PNG = path.join(OUT_DIR, 'prop-gallery.png');

/** 与渲染层 ACTOR.standHeight 同源（character/pose.ts），熊的标尺用 */
const STAND_HEIGHT = 1.67;

const DEFAULT_NAMES = [
  '水桶',
  '洒水壶',
  '风筝',
  '向日葵',
  '地球仪',
  '书包',
  '雨伞',
  '毛巾',
  '铲子',
  '球拍',
  '椅子',
  '杯子',
];

function argOf(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

type Row = {
  name: string;
  ok: boolean;
  canvas: number;
  ms: number;
  cached: boolean;
  bytes: number;
  markup?: string;
};

async function main() {
  const names = (argOf('names') || DEFAULT_NAMES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ratio = Number(argOf('ratio', '0.35')) || 0.35;

  const configStub = { get: (key: string, def?: any) => process.env[key] ?? def } as any;
  const llm = new LlmClientService(configStub);
  await (llm as any).onModuleInit();
  const assetGen = new AssetGenService(llm);
  if (!assetGen.isEnabled) {
    console.error('[probe-prop] assetGen 未启用（ASSET_GEN=off 或 LLM 未配置），无法现画');
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const name of names) {
    const key = assetGen.cacheKey(name);
    const cachePath = path.join(
      path.resolve(__dirname, '../../video-remotion/public/.generated/assets/generated'),
      `${key}.svg`,
    );
    const cached = await fs
      .access(cachePath)
      .then(() => true)
      .catch(() => false);
    const t0 = Date.now();
    const svg = await assetGen.loadSubjectSvg(name);
    const ms = Date.now() - t0;
    rows.push({
      name,
      ok: !!svg,
      canvas: svg?.canvas || 0,
      ms,
      cached,
      bytes: svg ? Buffer.byteLength(svg.markup, 'utf-8') : 0,
      markup: svg?.markup,
    });
    const flag = svg ? '✓' : '✗';
    console.log(
      `  ${flag} ${name.padEnd(4)} ${svg ? `canvas=${svg.canvas} bytes=${Buffer.byteLength(svg.markup, 'utf-8')}` : '占位件'} ${ms}ms${cached ? ' (缓存)' : ''}`,
    );
  }

  const okCount = rows.filter((r) => r.ok).length;
  console.log(`\n[probe-prop] ${okCount}/${rows.length} 画出（阈值 ≥80% 才允许灰度上线）`);

  // ---- 画廊：一行排开，每格下方是名字，右侧一只 1.67 的熊做标尺 ----
  const CELL = 260;
  const PAD = 24;
  const W = Math.max(1, rows.length) * CELL + PAD * 2 + 220;
  const H = CELL + PAD * 2 + 60;
  const groundY = H - 70;

  const cells = rows
    .map((row, i) => {
      const x = PAD + i * CELL + CELL / 2;
      if (!row.markup) {
        return `<rect x="${x - 70}" y="${groundY - 140}" width="140" height="140" rx="18" fill="#ffe9b8" stroke="#c9a227" stroke-width="4" stroke-dasharray="12 8"/><text x="${x}" y="${groundY - 55}" text-anchor="middle" font-size="56" font-weight="900" fill="#8a6a12">${row.name.slice(0, 1)}</text>`;
      }
      // 与 PropGlyph 同一行换算：内容高 = ratio × standHeight，画布为 canvas，
      // 内容占盒高 fill —— 反解出缩放系数
      const targetH = ratio * STAND_HEIGHT * 220; // 220 px / 世界单位，仅画廊用
      const k = targetH / (row.canvas * PROP_GEN_FILL);
      return `<g transform="translate(${x} ${groundY}) scale(${k}) translate(${-row.canvas / 2} ${-row.canvas * (0.5 + PROP_GEN_FILL / 2)})">${row.markup}</g>`;
    })
    .join('\n');

  const labels = rows
    .map((row, i) => {
      const x = PAD + i * CELL + CELL / 2;
      const bad = row.ok ? '#12303a' : '#b3261e';
      return `<text x="${x}" y="${groundY + 34}" text-anchor="middle" font-size="26" font-weight="900" fill="${bad}">${row.name}</text>`;
    })
    .join('\n');

  const bearX = W - PAD - 90;
  const bearH = STAND_HEIGHT * 220;
  const bear = `<g transform="translate(${bearX} ${groundY})">
    <ellipse cx="0" cy="-${bearH * 0.46}" rx="${bearH * 0.22}" ry="${bearH * 0.42}" fill="#a9744f"/>
    <circle cx="0" cy="-${bearH * 0.88}" r="${bearH * 0.17}" fill="#a9744f"/>
    <circle cx="${-bearH * 0.1}" cy="-${bearH * 0.99}" r="${bearH * 0.055}" fill="#a9744f"/>
    <circle cx="${bearH * 0.1}" cy="-${bearH * 0.99}" r="${bearH * 0.055}" fill="#a9744f"/>
    <ellipse cx="0" cy="-${bearH * 0.8}" rx="${bearH * 0.075}" ry="${bearH * 0.055}" fill="#f0d3b2"/>
    <text x="0" y="30" text-anchor="middle" font-size="22" font-weight="900" fill="#6d4c41">1.67</text>
  </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f7fff9"/>
  <line x1="0" y1="${groundY}" x2="${W}" y2="${groundY}" stroke="#cfe3d4" stroke-width="3"/>
  ${cells}
  ${labels}
  ${bear}
  <text x="${PAD}" y="30" font-size="22" font-weight="900" fill="#607d8b">道具画廊 · heightRatio=${ratio} · ${okCount}/${rows.length} 生成成功</text>
</svg>`;

  await fs.mkdir(OUT_DIR, { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Resvg } = require('@resvg/resvg-js');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  await fs.writeFile(OUT_PNG, png);
  console.log(`[probe-prop] gallery → ${OUT_PNG}`);
}

main().catch((error) => {
  console.error('[probe-prop] failed:', error);
  process.exit(1);
});
