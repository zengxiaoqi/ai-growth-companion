/**
 * probe-narration-dump-audit.ts — 对已生成的分镜 JSON 复算覆盖率，不调模型。
 *
 * 为什么单独拉一个：A/B 探针里口径一改就要重跑 LLM，成本高且不可复现。
 * 把生成结果落盘之后，审计口径的每次修正都可以在**同一批样本**上重新算，
 * 这样"规则改了有效"和"审计口径改了"两件事才分得开。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-narration-dump-audit.ts
 *   npx ts-node --transpile-only scripts/probe-narration-dump-audit.ts --dir ../video-remotion/out/narration-rule
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { auditGraphNarration, normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

type Row = {
  file: string;
  arm: string;
  topic: string;
  nodes: number;
  missing: number;
  single: number;
  ambiguous: number;
  details: string[];
};

async function main(): Promise<void> {
  const dir = path.resolve(__dirname, arg('dir', '../../video-remotion/out/narration-rule'));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json') && !f.includes('-retry'));

  const rows: Row[] = [];
  for (const file of files.sort()) {
    const parsed = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    let nodes = 0;
    let missing = 0;
    let single = 0;
    let ambiguous = 0;
    const details: string[] = [];
    for (const scene of parsed?.scenes || []) {
      const graph = normalizeSceneGraph(scene?.sceneGraph);
      if (!graph) continue;
      const coverage = auditGraphNarration(graph, String(scene?.narration || ''));
      nodes += coverage.total;
      missing += coverage.missing.length;
      for (const node of graph.nodes) {
        const bare = Array.from(String(node.label || '')).filter((ch) => !/[\s\p{P}\p{S}]/u.test(ch));
        if (bare.length === 1) single += 1;
      }
      const bad = coverage.missing.filter((m) => m.reason === 'ambiguous-single');
      ambiguous += bad.length;
      if (coverage.missing.length) {
        details.push(
          `${scene.title || scene.id}: ` +
            coverage.missing
              .map((m) => (m.reason === 'ambiguous-single' ? `${m.label}(歧义)` : m.label))
              .join('/'),
        );
      }
    }
    const [arm, ...rest] = file.replace(/\.json$/, '').split('-');
    rows.push({ file, arm, topic: rest.join('-'), nodes, missing, single, ambiguous, details });
  }

  console.log(`${'臂'.padEnd(5)}${'主题'.padEnd(22)}${'节点'.padEnd(6)}${'缺'.padEnd(5)}${'覆盖'.padEnd(8)}单字  歧义`);
  console.log('—'.repeat(80));
  for (const row of rows) {
    const pct = row.nodes ? `${Math.round(((row.nodes - row.missing) / row.nodes) * 100)}%` : 'n/a';
    console.log(
      `${row.arm.padEnd(5)}${row.topic.slice(0, 20).padEnd(22)}${String(row.nodes).padEnd(6)}` +
        `${String(row.missing).padEnd(5)}${pct.padEnd(8)}${String(row.single).padEnd(6)}${row.ambiguous}` +
        (row.details.length ? `  [${row.details.join('; ')}]` : ''),
    );
  }

  const sum = (arm: string) => {
    const list = rows.filter((r) => r.arm === arm);
    const nodes = list.reduce((a, r) => a + r.nodes, 0);
    const missing = list.reduce((a, r) => a + r.missing, 0);
    return { nodes, missing, single: list.reduce((a, r) => a + r.single, 0), ambiguous: list.reduce((a, r) => a + r.ambiguous, 0) };
  };
  console.log('—'.repeat(80));
  for (const arm of ['old', 'new']) {
    const s = sum(arm);
    if (!s.nodes) continue;
    console.log(
      `${arm}：${s.nodes - s.missing}/${s.nodes} = ${Math.round(((s.nodes - s.missing) / s.nodes) * 100)}%` +
        `   缺 ${s.missing}   单字 ${s.single}（歧义 ${s.ambiguous}）`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
