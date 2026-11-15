/**
 * 素材缺失归因报告。
 *
 * 背景：asset-misses.jsonl 原来只记 subject 和 topic，于是每次想知道"青草为什么没图"
 * 都得手工重跑一遍才知道是「库里没有」还是「叫法不同」。这两件事的动作完全不同：
 * 前者要补素材，后者要修匹配器。混在一起记录，等于没有记录。
 *
 * 用法：
 *   npx ts-node -T scripts/report-asset-misses.ts
 *   npx ts-node -T scripts/report-asset-misses.ts --recompute   # 旧记录也按新规则重算
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  classifyAssetMiss,
  type AssetMissReason,
} from '../src/modules/learning/visual-asset.service';

type MissRow = {
  at?: string;
  subject: string;
  topic?: string;
  reason?: AssetMissReason | string;
  nearest?: string;
  nearestAlias?: string;
  overlap?: number;
};

const logPath = path.resolve(__dirname, '../storage/asset-misses.jsonl');
const manifestPath = path.resolve(
  __dirname,
  '../../video-remotion/public/assets/vector/manifest.json',
);

const recompute = process.argv.includes('--recompute');

if (!fs.existsSync(logPath)) {
  console.log(`没有缺失记录：${logPath}`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  assets?: Array<{ role?: string; aliases?: string[]; tags?: string[] }>;
};
const aliases: Array<{ role: string; alias: string }> = [];
for (const asset of manifest.assets || []) {
  for (const alias of asset.aliases || asset.tags || []) {
    aliases.push({ role: String(asset.role || ''), alias: String(alias) });
  }
}

const rows: MissRow[] = fs
  .readFileSync(logPath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => {
    try {
      return JSON.parse(line) as MissRow;
    } catch {
      return null;
    }
  })
  .filter((row): row is MissRow => !!row && typeof row.subject === 'string');

for (const row of rows) {
  if (recompute || !row.reason) {
    const verdict = classifyAssetMiss(row.subject, aliases);
    row.reason = verdict.reason;
    row.nearest = verdict.nearestRole;
    row.nearestAlias = verdict.nearestAlias;
    row.overlap = verdict.overlap;
  }
}

const groups = new Map<string, MissRow[]>();
for (const row of rows) {
  const key = String(row.reason || 'unattributed');
  const bucket = groups.get(key) || [];
  bucket.push(row);
  groups.set(key, bucket);
}

const concepts = (list: MissRow[]) => {
  const seen = new Map<string, number>();
  for (const row of list) seen.set(row.subject, (seen.get(row.subject) || 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]);
};

const ACTIONS: Record<string, string> = {
  'not-in-library': '补素材（匹配器无能为力）',
  'degraded-candidate': '决定是否接受降级，或补精确素材',
  'no-match': '修匹配器（库里有，但没对上）',
  unattributed: '旧记录，加 --recompute 重算',
};

console.log(`\n素材缺失归因：${rows.length} 条记录 / ${new Set(rows.map((r) => r.subject)).size} 个概念\n`);
const order = ['not-in-library', 'degraded-candidate', 'no-match', 'unattributed'];
const keys = [...groups.keys()].sort(
  (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
);

for (const key of keys) {
  const list = groups.get(key) as MissRow[];
  const top = concepts(list);
  console.log(`【${key}】${list.length} 条 / ${top.length} 个概念 —— ${ACTIONS[key] || ''}`);
  for (const [subject, count] of top) {
    const sample = list.find((r) => r.subject === subject);
    const nearest = sample?.nearestAlias
      ? `  最近:${sample.nearestAlias}(${sample.nearest || '?'})`
      : '';
    console.log(`   ${String(count).padStart(2)}x  ${subject}${nearest}`);
  }
  console.log('');
}

const totalConcepts = new Set(rows.map((r) => r.subject)).size;
const countOf = (key: string) =>
  new Set((groups.get(key) || []).map((r) => r.subject)).size;
console.log(`结论：${totalConcepts} 个缺失概念里`);
console.log(`  ${countOf('not-in-library')} 个库里真的没有 → 补素材，或改走示意符号`);
console.log(`  ${countOf('degraded-candidate')} 个有降级空间 → 逐个定"接受降级 / 补精确素材"`);
console.log(`  ${countOf('no-match')} 个库里有却没对上 → 动匹配器`);
console.log(`  注意 degraded-candidate 会出"松树→松鼠"这种同字不同物，逐条看最近项，别照单全收。`);
