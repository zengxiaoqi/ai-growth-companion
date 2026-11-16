/**
 * probe-graph-narration-rule.ts — 提示词里那条「label 必须被旁白念到」到底管不管用。
 *
 * 光把规则写进 describeGraphGrammar() 不够：模型可能照样写出「图上有白云、旁白说水珠」。
 * 这个探针用**生产提示词原文**跑受控 A/B，唯一变量是这条规则在不在：
 *   arm=new  —— buildStoryboardPrompt() 原样（含规则）
 *   arm=old  —— 同一份提示词，把规则那几行和 schema 里改过的描述还原成旧文案
 *
 * 度量用生产侧的 auditGraphNarration（与提示词规则同一口径），不另写匹配器。
 *
 * 用法：
 *   npx ts-node --transpile-only scripts/probe-graph-narration-rule.ts
 *   npx ts-node --transpile-only scripts/probe-graph-narration-rule.ts --topics 水循环,种子发芽
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { GenerateVideoContentTool } from '../src/agent-framework/tools/impl/generate-video-content';
import {
  auditGraphNarration,
  formatCoverageFeedback,
  normalizeSceneGraph,
} from '../src/modules/learning/video/scene-graph';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_TOPICS = ['水循环是怎么回事', '种子发芽长成大树', '彩虹是怎么来的'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

/** 布尔开关：`--dry` 这种不带值的参数 */
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** 把提示词还原成"规则上线前"的样子：删掉 label 相关的约束行，schema 描述改回旧文案 */
function stripCoverageRule(prompt: string): string {
  // 按行首关键字整行删除。新增一条 label 约束时必须同步加进这个列表，
  // 否则 old 臂会偷偷保留新规则，A/B 就变成"新规则 vs 新规则"，读数全是 0 差。
  const NEW_RULE_LINES = [
    'label 必须逐字出现在本场景 narration 里',
    '宁可 3 个节点都讲过',
    '写完 narration 再回头对一遍',
    '不要为了凑节点去改 narration 的叙事',
    'subject 取旁白里的说法',
    // 列举节奏：一屏连报三个名词时，成员卡片跟不上点名
    '旁白的节奏要求',
    '一屏里并列列出 3 个以上概念时',
    '不要写成「苹果、香蕉和葡萄」这种纯名单',
    '写成「苹果红红的',
    '一屏旁白 3-5 句',
  ];
  const lines = prompt.split('\n');
  const kept = lines.filter((line) => !NEW_RULE_LINES.some((marker) => line.includes(marker)));
  return kept
    .join('\n')
    // 只替换描述文字，不碰引号：schema 在提示词里是 JSON.stringify 的转义形式
    // （\"label\": ...），按整段带引号的字符串替换永远匹配不上，会静默留下新文案，
    // old 臂于是仍带着新约束，A/B 读出差值就失真了。
    .replace('画面标签，≤6字；必须逐字出现在本场景 narration 里', '画面标签，≤6字')
    .replace('屏幕上显示的字(2-6字)', '屏幕上显示的字(≤6字)')
    .replace(
      /可检索到图标的具体名词；取旁白里的说法[^)"]*/,
      "可检索到图标的具体名词，如 '小水滴' '苹果'",
    );
}

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

type ArmResult = {
  topic: string;
  arm: string;
  nodes: number;
  missing: number;
  /** 单字标签总数：这类标签只要在旁白里重复就彻底锚不上 */
  singles: number;
  /** 其中"单字且在旁白里出现多次"的数量——上一版审计看不见这一档 */
  ambiguous: number;
  details: string[];
  retriedMissing: number | null;
  retriedNodes: number | null;
};

async function main(): Promise<void> {
  const topics = (arg('topics') || '').split(',').filter(Boolean);
  const list = topics.length ? topics : DEFAULT_TOPICS;

  const baseURL = process.env.LLM_BASE_URL || '';
  const apiKey = process.env.LLM_API_KEY || '';
  const model = (process.env.LLM_AUTHOR_MODEL || process.env.LLM_MODEL || '').trim();
  if (!baseURL || !apiKey || !model) {
    throw new Error('LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 未配置，跑不了真实生成');
  }

  const client = new OpenAI({ baseURL, apiKey });
  // buildPrompt 不读 this，只依赖模块级语法说明函数；传 null 即可，不必起 Nest 容器
  const tool = new GenerateVideoContentTool(null as any);
  const buildPrompt = (tool as any).buildPrompt.bind(tool) as (
    topic: string,
    domain: string,
    ageGroup: string,
    sceneCount: number,
    style?: string,
    narration?: string,
    attempt?: number,
    failures?: string[],
  ) => string;

  const results: ArmResult[] = [];
  const arms = ((arg('arm') || 'old,new').split(',') as Array<'old' | 'new'>).filter(
    (a) => a === 'old' || a === 'new',
  );
  const dumpDir = path.resolve(__dirname, '../../video-remotion/out/narration-rule');
  const samples = Math.max(1, Number(arg('samples') || 1));
  const withRetry = flag('retry');

  if (flag('dry')) {
    const raw = buildPrompt('水循环是怎么回事', 'science', '5-6', 5, undefined, undefined, 1, []);
    const stripped = stripCoverageRule(raw);
    console.log('rule 提示词长度', raw.length, '→ 还原后', stripped.length, '差', raw.length - stripped.length);
    for (const probe of [
      '逐字出现在本场景 narration',
      '宁可 3 个节点都讲过',
      '取旁白里的说法',
      '一屏里并列列出 3 个以上概念时',
      '一屏旁白 3-5 句',
      '≤6字；必须逐字',
    ]) {
      console.log(`  含「${probe}」: 规则开=${raw.includes(probe)}  规则关=${stripped.includes(probe)}`);
    }
    return;
  }

  const generate = async (topic: string, arm: 'old' | 'new', attempt: number, failures: string[]) => {
    const raw = buildPrompt(topic, 'science', '5-6', 5, undefined, undefined, attempt, failures);
    const prompt = arm === 'old' ? stripCoverageRule(raw) : raw;
    const response = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });
    return extractJson(response.choices?.[0]?.message?.content || '');
  };

  /** 与生产 auditNarrationCoverage 同口径：逐场景审计，最多回喂 2 条 */
  const auditStoryboard = (parsed: any) => {
    let nodes = 0;
    let missing = 0;
    let singles = 0;
    let ambiguous = 0;
    const details: string[] = [];
    const issues: string[] = [];
    for (const scene of parsed?.scenes || []) {
      const graph = normalizeSceneGraph(scene?.sceneGraph);
      if (!graph) continue;
      const coverage = auditGraphNarration(graph, String(scene?.narration || ''));
      nodes += coverage.total;
      missing += coverage.missing.length;
      for (const node of graph.nodes) {
        const bare = Array.from(String(node.label || '')).filter((ch) => !/[\s\p{P}\p{S}]/u.test(ch));
        if (bare.length === 1) singles += 1;
      }
      const bad = coverage.missing.filter((m) => m.reason === 'ambiguous-single');
      ambiguous += bad.length;
      if (coverage.missing.length) {
        const tags = coverage.missing.map((m) => (m.reason === 'ambiguous-single' ? `${m.label}(歧义)` : m.label));
        details.push(`${scene.title || scene.id}: ${tags.join('/')}`);
        if (issues.length < 2) {
          issues.push(formatCoverageFeedback(String(scene?.title || scene?.id || ''), String(scene?.narration || ''), coverage));
        }
      }
    }
    return { nodes, missing, singles, ambiguous, details, issues };
  };

  const pct = (nodes: number, missing: number) =>
    nodes ? `${Math.round(((nodes - missing) / nodes) * 100)}%` : 'n/a';

  for (const topic of list) {
    for (const arm of arms) {
      for (let s = 1; s <= samples; s += 1) {
        const parsed = await generate(topic, arm, 1, []);
        if (!parsed) {
          console.error(`[skip] ${topic}/${arm}#${s}: 返回不是 JSON`);
          continue;
        }
        const first = auditStoryboard(parsed);
        await fs.mkdir(dumpDir, { recursive: true });
        const slug = `${arm}-${topic.replace(/[\\/:*?"<>|]/g, '_')}-${s}`;
        await fs.writeFile(path.join(dumpDir, `${slug}.json`), JSON.stringify(parsed, null, 2), 'utf8');

        let retried: { nodes: number; missing: number } | null = null;
        if (withRetry && first.missing > 0) {
          // 复刻生产重试：把首轮的具体缺失话术回喂，看模型能不能自己补齐
          const second = await generate(topic, arm, 2, first.issues);
          if (second) {
            const a2 = auditStoryboard(second);
            retried = { nodes: a2.nodes, missing: a2.missing };
            await fs.writeFile(path.join(dumpDir, `${slug}-retry.json`), JSON.stringify(second, null, 2), 'utf8');
          }
        }

        results.push({
          topic,
          arm,
          nodes: first.nodes,
          missing: first.missing,
          singles: first.singles,
          ambiguous: first.ambiguous,
          details: first.details,
          retriedMissing: retried ? retried.missing : null,
          retriedNodes: retried ? retried.nodes : null,
        });
        console.log(
          `${arm} | ${topic.padEnd(10)} #${s} 节点 ${String(first.nodes).padStart(2)}  缺 ${String(first.missing).padStart(2)}  ` +
            `覆盖 ${pct(first.nodes, first.missing)}  单字 ${first.singles} 歧义 ${first.ambiguous}` +
            (retried ? `  → 回喂后缺 ${retried.missing} (${pct(retried.nodes, retried.missing)})` : '') +
            (first.details.length ? `  [${first.details.join('; ')}]` : ''),
        );
      }
    }
  }

  const sum = (arm: string) => {
    const rows = results.filter((r) => r.arm === arm);
    const nodes = rows.reduce((a, r) => a + r.nodes, 0);
    const missing = rows.reduce((a, r) => a + r.missing, 0);
    const singles = rows.reduce((a, r) => a + r.singles, 0);
    const ambiguous = rows.reduce((a, r) => a + r.ambiguous, 0);
    return { topics: rows.length, nodes, missing, singles, ambiguous, ratio: nodes ? (nodes - missing) / nodes : 0 };
  };
  const oldSum = sum('old');
  const newSum = sum('new');
  console.log('\n=== 汇总（首轮，不重试）===');
  console.log(
    `规则关：${oldSum.nodes - oldSum.missing}/${oldSum.nodes} = ${(oldSum.ratio * 100).toFixed(0)}%   缺 ${oldSum.missing} 个节点` +
      `   单字 ${oldSum.singles}（其中歧义 ${oldSum.ambiguous}）`,
  );
  console.log(
    `规则开：${newSum.nodes - newSum.missing}/${newSum.nodes} = ${(newSum.ratio * 100).toFixed(0)}%   缺 ${newSum.missing} 个节点` +
      `   单字 ${newSum.singles}（其中歧义 ${newSum.ambiguous}）`,
  );

  const retriedRows = results.filter((r) => r.retriedMissing !== null);
  if (retriedRows.length > 0) {
    const before = retriedRows.reduce((a, r) => a + r.missing, 0);
    const after = retriedRows.reduce((a, r) => a + (r.retriedMissing || 0), 0);
    console.log(
      `\n=== 重试补齐（仅首轮有缺失的 ${retriedRows.length} 个样本）===\n` +
        `首轮缺 ${before} 个节点 → 回喂后缺 ${after} 个（补回 ${before - after}，` +
        `剩 ${retriedRows.filter((r) => (r.retriedMissing || 0) > 0).length} 个样本仍有缺口）`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
