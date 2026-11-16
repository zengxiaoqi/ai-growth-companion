#!/usr/bin/env node
/**
 * accept-asset-gen.ts — Phase 3 验收：20 主题 miss 率前后对比 + 生成素材验收通过率
 *
 * 数据源是 measure-figure-channel.ts 缓存的真实分镜（storage/figure-channel-report.json），
 * 不重烧分镜 token。校验与素材解析全部走生产代码：
 *   normalizeSceneGraph / normalizeFigureSpec → VisualAssetService.resolveGraphIcons /
 *   resolveFigureIcons → AssetGenService（层1 SVG + vision 验收 + 哈希缓存）。
 *
 * 两遍跑法：
 *   baseline：VisualAssetService 不接 AssetGenService（纯矢量库），miss 全记 rescued=false
 *   after   ：接上 AssetGenService，miss 能救则救（rescued=true），救不回的照记
 * miss 日志的写盘被拦截到内存（不污染运营用的 asset-misses.jsonl），按遍分组计数。
 *
 * 用法：
 *   npx ts-node -T scripts/accept-asset-gen.ts [--baseline-only] [--limit N]
 *        [--report <path>] [--no-gallery]
 *
 * 输出：控制台汇总 + storage/asset-gen-acceptance.json + storage/asset-gen-gallery/*.png
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { AssetGenService } from '../src/modules/learning/asset-gen.service';
import { VisualAssetService } from '../src/modules/learning/visual-asset.service';
import { normalizeFigureSpec } from '../src/modules/learning/video/figure-spec';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

type MissLine = { subject: string; topic: string; reason: string; rescued?: boolean };
type TopicRow = {
  topic: string;
  subjects: number;
  vectorHits: number;
  baselineMisses: number;
  rescued: number;
  stillMissing: number;
};

const REPORT_DEFAULT = path.resolve(__dirname, '../../../storage/figure-channel-report.json');
const OUT_PATH = path.resolve(__dirname, '../storage/asset-gen-acceptance.json');
const GALLERY_DIR = path.resolve(__dirname, '../storage/asset-gen-gallery');
const GENERATED_MANIFEST = path.resolve(
  __dirname,
  '../../video-remotion/public/.generated/assets/asset-manifest.json',
);

function argOf(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

/** 拦截 miss 日志写盘：脚本跑两遍对照，不能把对照数据混进运营日志。
 *  两个 service 都是 import { promises as fs }，patch 同一个对象即可。 */
function interceptMissLog(): { lines: MissLine[]; restore: () => void } {
  const lines: MissLine[] = [];
  const orig = fs.appendFile;
  (fs as any).appendFile = async (p: any, data: any, ...rest: any[]) => {
    if (String(p).endsWith('asset-misses.jsonl')) {
      for (const raw of String(data).split('\n')) {
        if (!raw.trim()) continue;
        try {
          lines.push(JSON.parse(raw));
        } catch {
          /* ignore */
        }
      }
      return;
    }
    return (orig as any)(p, data, ...rest);
  };
  return { lines, restore: () => ((fs as any).appendFile = orig) };
}

function tallyReasons(lines: MissLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.reason] = (out[l.reason] || 0) + 1;
  return out;
}

async function main() {
  const baselineOnly = process.argv.includes('--baseline-only');
  const noGallery = process.argv.includes('--no-gallery');
  const limit = Number(argOf('limit', '999'));
  const reportPath = path.resolve(argOf('report', REPORT_DEFAULT) as string);

  const src = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const results: any[] = (src.results || []).filter((r: any) => r.ok && r.raw).slice(0, limit);
  console.log(`[accept-asset-gen] ${results.length} 份缓存分镜（model=${src.model}） baselineOnly=${baselineOnly}`);

  // 生产同款 LLM client：stub ConfigService 直读 env（与 Nest 注入等价）
  const configStub = { get: (key: string, def?: any) => process.env[key] ?? def } as any;
  const llm = new LlmClientService(configStub);
  await (llm as any).onModuleInit();
  const assetGen = new AssetGenService(llm);
  console.log(`[accept-asset-gen] assetGen enabled=${assetGen.isEnabled} imageLayer=${assetGen.imageGenConfigured}`);

  const baselineService = new VisualAssetService();
  const afterService = baselineOnly ? null : new VisualAssetService(assetGen);

  const rows: TopicRow[] = [];
  const baselineLines: MissLine[] = [];
  const afterLines: MissLine[] = [];
  let subjectTotal = 0;
  let vectorHitTotal = 0;
  let graphScenes = 0;
  let figureScenes = 0;

  for (const r of results) {
    const scenes: any[] = Array.isArray(r.raw?.scenes) ? r.raw.scenes : [];
    const accent =
      typeof r.raw?.visualTheme?.accentColor === 'string' ? r.raw.visualTheme.accentColor : '#3E63DD';
    const subjects = new Set<string>();
    const graphs: any[] = [];
    const figures: any[] = [];

    for (const s of scenes) {
      if (s?.figure && typeof s.figure === 'object') {
        const norm = normalizeFigureSpec(s.figure, accent);
        if (norm.ok) {
          figures.push(norm.spec);
          figureScenes += 1;
          for (const shape of norm.spec.shapes) {
            if (shape.kind === 'subjectIcon') subjects.add(shape.subject);
          }
        }
      }
      if (s?.sceneGraph && typeof s.sceneGraph === 'object') {
        const g = normalizeSceneGraph(s.sceneGraph);
        if (g) {
          graphs.push(g);
          graphScenes += 1;
          for (const node of g.nodes) subjects.add(node.subject);
        }
      }
    }
    if (subjects.size === 0) continue;
    subjectTotal += subjects.size;

    // 与生产一致：逐场景解析（buildDynamicSceneProps 每个场景各调一次，
    // 生成预算 MAX_GEN_PER_CALL 也是按场景给的）。跨场景重复主体由
    // AssetGenService 的 inFlight 去重 + 磁盘缓存兜住，不会重复烧 token。
    const capB = interceptMissLog();
    let hitsB = 0;
    for (const g of graphs) {
      const icons = await baselineService.resolveGraphIcons(g, r.topic);
      hitsB += Object.keys(icons).length;
    }
    for (const f of figures) {
      await baselineService.resolveFigureIcons(f, r.topic);
      hitsB += f.shapes.filter((s: any) => s.kind === 'subjectIcon' && s.iconSrc).length;
    }
    capB.restore();
    vectorHitTotal += hitsB;
    baselineLines.push(...capB.lines);

    let rescued = 0;
    let stillMissing = capB.lines.length;
    if (afterService) {
      const capA = interceptMissLog();
      for (const g of graphs) await afterService.resolveGraphIcons(g, r.topic);
      for (const f of figures) await afterService.resolveFigureIcons(f, r.topic);
      capA.restore();
      rescued = capA.lines.filter((l) => l.rescued).length;
      stillMissing = capA.lines.filter((l) => !l.rescued).length;
      afterLines.push(...capA.lines);
      console.log(
        `[after] ${r.topic}: subjects=${subjects.size} vectorHits=${hitsB} rescued=${rescued} missing=${stillMissing}`,
      );
    } else {
      console.log(`[baseline] ${r.topic}: subjects=${subjects.size} vectorHits=${hitsB} missOccurrences=${capB.lines.length}`);
    }

    rows.push({
      topic: r.topic,
      subjects: subjects.size,
      vectorHits: hitsB,
      baselineMisses: capB.lines.length,
      rescued,
      stillMissing,
    });
  }

  // subjectIcon 语法探针：缓存分镜产自 subjectIcon 上线前，figure 通道没有现成样本。
  // 造一个最小合法 figure（两弧 + 两个库外主体），验证 resolveFigureIcons 写回 iconSrc。
  let figureProbe: Record<string, unknown> = { skipped: true };
  if (afterService) {
    const probeSpec = normalizeFigureSpec(
      {
        shapes: [
          { kind: 'arc', cx: 400, cy: 320, r: 200, from: 200, to: 340, stroke: '#3E63DD', strokeWidth: 10 },
          { kind: 'arc', cx: 1200, cy: 320, r: 200, from: 200, to: 340, stroke: '#3E63DD', strokeWidth: 10 },
          { kind: 'subjectIcon', subject: '蝌蚪', x: 400, y: 320, size: 160 },
          { kind: 'subjectIcon', subject: '石头', x: 1200, y: 320, size: 160 },
        ],
        labels: [],
      },
      '#3E63DD',
    );
    if (probeSpec.ok) {
      const capF = interceptMissLog();
      await afterService.resolveFigureIcons(probeSpec.spec, 'subjectIcon 探针');
      capF.restore();
      const icons = probeSpec.spec.shapes.filter((s) => s.kind === 'subjectIcon');
      figureProbe = {
        skipped: false,
        resolved: icons.filter((s) => s.kind === 'subjectIcon' && s.iconSrc).length,
        total: icons.length,
        srcs: icons.map((s) => (s.kind === 'subjectIcon' ? s.iconSrc ?? null : null)),
        misses: capF.lines,
      };
      afterLines.push(...capF.lines);
      console.log(`[figure-probe] subjectIcon 写回 ${figureProbe.resolved}/${figureProbe.total}`, figureProbe.srcs);
    } else {
      figureProbe = { skipped: false, error: (probeSpec as any).reason };
    }
  }

  // 生成素材验收统计：读 shared manifest 里 provider=generated 的条目
  let genStats = { entries: 0, visionPassed: 0, visionFailed: 0, visionUnknown: 0, layers: {} as Record<string, number> };
  const genEntries: any[] = [];
  try {
    const manifest = JSON.parse(await fs.readFile(GENERATED_MANIFEST, 'utf8'));
    for (const a of manifest?.assets || []) {
      if (a?.provider !== 'generated') continue;
      genEntries.push(a);
      genStats.entries += 1;
      genStats.layers[a.layer || 'unknown'] = (genStats.layers[a.layer || 'unknown'] || 0) + 1;
      if (a.visionPassed === true) genStats.visionPassed += 1;
      else if (a.visionPassed === false) genStats.visionFailed += 1;
      else genStats.visionUnknown += 1;
    }
  } catch {
    /* manifest 不存在 = 还没生成过 */
  }

  // 画廊：把生成的 SVG 栅格化成 PNG，供人工复看（resvg 与生产光栅化同款）
  let galleryCount = 0;
  if (!noGallery && genEntries.length) {
    const { Resvg } = require('@resvg/resvg-js');
    await fs.mkdir(GALLERY_DIR, { recursive: true });
    for (const a of genEntries) {
      try {
        const filePath = path.resolve(__dirname, '../../video-remotion/public', a.staticPath.replace(/^\//, ''));
        const svg = await fs.readFile(filePath, 'utf8');
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
        const name = `${String(a.subject || a.id).replace(/[^\w\u4e00-\u9fff-]/g, '_')}.png`;
        await fs.writeFile(path.join(GALLERY_DIR, name), png);
        galleryCount += 1;
      } catch (e: any) {
        console.warn(`[gallery] ${a.subject}: ${e?.message}`);
      }
    }
    console.log(`[gallery] ${galleryCount} 张 PNG → ${GALLERY_DIR}`);
  }

  const baselineMissTotal = baselineLines.length;
  const rescuedTotal = afterLines.filter((l) => l.rescued).length;
  const stillMissingTotal = afterLines.filter((l) => !l.rescued).length;
  // miss 率按"场景内出现次数"算（与生产 miss 日志同口径）；subjectsTotal 是去重主体数
  const occurrences = vectorHitTotal + baselineMissTotal;

  const summary = {
    measuredAt: new Date().toISOString(),
    sourceReport: reportPath,
    baselineOnly,
    topics: rows.length,
    graphScenes,
    figureScenes,
    subjectsTotal: subjectTotal,
    vectorHits: vectorHitTotal,
    baseline: { misses: baselineMissTotal, byReason: tallyReasons(baselineLines) },
    after: baselineOnly
      ? null
      : { rescued: rescuedTotal, stillMissing: stillMissingTotal, byReason: tallyReasons(afterLines.filter((l) => !l.rescued)) },
    missRateBefore: occurrences ? +(baselineMissTotal / occurrences).toFixed(3) : null,
    missRateAfter: occurrences && !baselineOnly ? +(stillMissingTotal / occurrences).toFixed(3) : null,
    generated: genStats,
    figureProbe,
    galleryCount,
    rows,
  };

  console.log('\n===== Phase 3 素材生成验收 =====');
  console.log(`主题数            : ${rows.length}（graph 场景 ${graphScenes} / figure 场景 ${figureScenes}）`);
  console.log(`去重主体数        : ${subjectTotal}；场景内出现 ${occurrences} 次，矢量库命中 ${vectorHitTotal} 次`);
  console.log(`baseline miss     : ${baselineMissTotal}（${summary.missRateBefore !== null ? (summary.missRateBefore * 100).toFixed(0) + '%' : '—'}）`, summary.baseline.byReason);
  if (!baselineOnly) {
    console.log(`生成救回          : ${rescuedTotal}`);
    console.log(`仍然缺失          : ${stillMissingTotal}（${summary.missRateAfter !== null ? (summary.missRateAfter * 100).toFixed(0) + '%' : '—'}）`, summary.after?.byReason);
    console.log(`生成素材入库      : ${genStats.entries}（vision 通过 ${genStats.visionPassed} / 拒绝 ${genStats.visionFailed} / 未评 ${genStats.visionUnknown}）`, genStats.layers);
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n报告已写入 ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});