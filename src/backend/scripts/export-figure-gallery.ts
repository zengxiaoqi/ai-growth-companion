#!/usr/bin/env node
/**
 * export-figure-gallery.ts — 把实测报告里"通过校验"的 figure 导出成一份可渲染的画廊
 *
 * 为什么要这一步：数值指标只能回答"会不会被拒"，回答不了"画出来像不像"。
 * 几何阈值拦得住缩成一个角的图，拦不住比例难看。不看一眼就等于没验。
 *
 * 产出：src/video-remotion/src/__poc/gallery-specs.ts
 * 之后用 remotion still 逐张出图，拼成对照表人工核对。
 *
 * 用法：npx ts-node -T scripts/export-figure-gallery.ts [--report <path>]
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeFigureSpec } from '../src/modules/learning/video/figure-spec';

const argv = process.argv.slice(2);
const argOf = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const reportPath = path.resolve(
  argOf('report', path.resolve(__dirname, '../../../storage/figure-channel-report.json')) as string,
);
const outPath = path.resolve(
  argOf(
    'out',
    path.resolve(__dirname, '../../video-remotion/src/__poc/gallery-specs.ts'),
  ) as string,
);

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const palette = ['#F76B15', '#3E63DD', '#0F9D58', '#E5484D', '#8E4EC6', '#0091FF'];

type Item = { id: string; topic: string; title: string; accent: string; spec: unknown };

const items: Item[] = [];
(report.results || []).forEach((run: any) => {
  if (!run.ok || !run.raw) return;
  const accent =
    typeof run.raw?.visualTheme?.accentColor === 'string' ? run.raw.visualTheme.accentColor : '#3E63DD';
  (run.raw.scenes || []).forEach((scene: any, i: number) => {
    if (!scene?.figure) return;
    const normalized = normalizeFigureSpec(scene.figure, accent);
    if (!normalized.ok) return;
    items.push({
      id: `Fig${items.length + 1}`,
      topic: run.topic,
      title: String(scene.title ?? `场景${i + 1}`),
      accent: palette[items.length % palette.length],
      spec: normalized.spec,
    });
  });
});

const body = items
  .map(
    (it) =>
      `  {\n    id: '${it.id}',\n    topic: ${JSON.stringify(it.topic)},\n    title: ${JSON.stringify(it.title)},\n    accent: '${it.accent}',\n    spec: ${JSON.stringify(it.spec)},\n  },`,
  )
  .join('\n');

const content = `/* 自动生成，请勿手改：scripts/export-figure-gallery.ts
 * 来源：${path.relative(path.dirname(outPath), reportPath).replace(/\\/g, '/')}
 * 共 ${items.length} 张图，全部是真实模型输出 + 生产校验通过的原样 spec。
 */
import { FigureSpec } from './figure-spec';

export type GalleryItem = {
  id: string;
  topic: string;
  title: string;
  accent: string;
  spec: FigureSpec;
};

export const gallery: GalleryItem[] = [
${body}
];
`;

fs.writeFileSync(outPath, content);
console.log(`已导出 ${items.length} 张图 → ${outPath}`);
console.log(items.map((i) => `${i.id} ${i.topic} / ${i.title}`).join('\n'));
