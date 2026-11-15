#!/usr/bin/env node
/**
 * measure-figure-channel.ts — 用真实主题跑分镜生成，量出 figure 通道的接入率与拒绝率
 *
 * 为什么要有这个脚本：方案文档里的两条硬指标（figure 占比 25%~60%、拒绝率 < 20%）
 * 只能靠真实模型输出测，不能靠单测。单测喂的是我手写的 spec，模型爱画什么它不知道。
 *
 * 关键约束：prompt 必须与生产完全一致。所以这里不复制 prompt，而是直接调
 * GenerateVideoContentTool.prototype.buildPrompt（该方法是纯函数，不碰实例状态），
 * 生产那边改一个字，这里立刻跟着变，不会出现"脚本测的是另一套 prompt"。
 * 校验同理，直接调 normalizeFigureSpec / normalizeSceneGraph，
 * 不重新实现一遍阈值。
 *
 * 用法：
 *   npx ts-node -T scripts/measure-figure-channel.ts [--limit N] [--concurrency N]
 *        [--out <path>] [--topics <file>]
 *
 * 输出：控制台汇总 + storage/figure-channel-report.json（含每条原始分镜，便于复盘）
 */
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { GenerateVideoContentTool } from '../src/agent-framework/tools/impl/generate-video-content';
import { normalizeFigureSpec, type FigureRejectReason } from '../src/modules/learning/video/figure-spec';
import { normalizeSceneGraph } from '../src/modules/learning/video/scene-graph';
import { repairFigures, type FigureReject } from '../src/modules/learning/video/figure-repair';

type TopicCase = { topic: string; domain: string };

/** 刻意混合：一半是"图形即知识"，一半是"概念关系"，还有几个是纯场景。
 *  如果模型把所有题都判成 figure，说明它在滥用；全判成 graph 说明它不敢用。 */
const TOPICS: TopicCase[] = [
  { topic: '彩虹是怎么形成的', domain: 'science' },
  { topic: '太阳系有哪几颗行星', domain: 'science' },
  { topic: '凸透镜为什么能成像', domain: 'science' },
  { topic: '地球里面长什么样', domain: 'science' },
  { topic: '杠杆为什么能省力', domain: 'science' },
  { topic: '水循环是怎么回事', domain: 'science' },
  { topic: '食物链是什么', domain: 'science' },
  { topic: '种子是怎么发芽的', domain: 'science' },
  { topic: '蝴蝶的一生', domain: 'science' },
  { topic: '青蛙和蝌蚪有什么不一样', domain: 'science' },
  { topic: '认识小兔子', domain: 'science' },
  { topic: '为什么会有白天和黑夜', domain: 'science' },
  { topic: '磁铁为什么能吸铁', domain: 'science' },
  { topic: '声音是怎么产生的', domain: 'science' },
  { topic: '一年有哪四个季节', domain: 'science' },
  { topic: '垃圾怎么分类', domain: 'social' },
  { topic: '认识数字1到5', domain: 'math' },
  { topic: '三角形和正方形有什么不同', domain: 'math' },
  { topic: '月亮为什么会变圆变缺', domain: 'science' },
  { topic: '为什么要刷牙', domain: 'social' },
];

function readEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env');
  const out: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

/** 模型是思考型的：正文之前会有一大段 <think>。生产侧的 stripThinking 同理，
 *  这里必须剥掉，否则"最后一个 }"会落在思考内容里，解析出一堆垃圾。 */
function stripThought(text: string): string {
  if (!text) return '';
  const close = text.lastIndexOf('</think');
  if (close >= 0) {
    const after = text.indexOf('>', close);
    return after >= 0 ? text.slice(after + 1) : text;
  }
  return text.replace(/<think[\s\S]*$/i, '');
}

function extractJson(text: string): any | null {
  const body = stripThought(text);
  if (!body) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(body);
  const payload = fenced ? fenced[1] : body;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(payload.slice(start, end + 1));
  } catch {
    return null;
  }
}

type SceneVerdict = {
  index: number;
  title: string;
  channel: 'figure' | 'figure-rejected' | 'graph' | 'graph-rejected' | 'none';
  reason?: FigureRejectReason | 'graph-invalid';
  shapes?: number;
  kinds?: string[];
  labels?: number;
};

/** 把一份分镜的每个场景判成走 figure / graph / 降级。校验用的是生产同一个函数，
 *  所以改了阈值可以直接用旧样本回放，不必重新烧 token。 */
function evaluateStoryboard(parsed: any): SceneVerdict[] {
  const rawScenes: any[] = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const accent =
    typeof parsed?.visualTheme?.accentColor === 'string' ? parsed.visualTheme.accentColor : '#3E63DD';

  return rawScenes.map((s, i) => {
    const title = String(s?.title ?? `scene-${i + 1}`);
    const hasFigure = s?.figure && typeof s.figure === 'object';
    if (hasFigure) {
      const r = normalizeFigureSpec(s.figure, accent);
      if (r.ok) {
        return {
          index: i,
          title,
          channel: 'figure',
          shapes: r.spec.shapes.length,
          labels: r.spec.labels?.length ?? 0,
          kinds: Array.from(new Set(r.spec.shapes.map((x) => x.kind))),
        };
      }
      return { index: i, title, channel: 'figure-rejected', reason: (r as { ok: false; reason: FigureRejectReason }).reason };
    }
    const hasGraph = s?.sceneGraph && typeof s.sceneGraph === 'object';
    if (hasGraph) {
      const g = normalizeSceneGraph(s.sceneGraph);
      return g
        ? { index: i, title, channel: 'graph' }
        : { index: i, title, channel: 'graph-rejected', reason: 'graph-invalid' };
    }
    return { index: i, title, channel: 'none' };
  });
}

type TopicResult = {
  topic: string;
  domain: string;
  ok: boolean;
  error?: string;
  /** 被思考链吃满预算导致没吐出正文的次数，单独记：它不是"内容不合规" */
  truncated?: boolean;
  completionTokens?: number;
  latencyMs?: number;
  /** ≤1 轮 figure 修复的结果（与生产 tool 走同一个 repairFigures） */
  repair?: { rejected: number; fixed: number };
  scenes: SceneVerdict[];
  raw?: any;
};

async function runTopic(
  client: OpenAI,
  model: string,
  maxTokens: number,
  item: TopicCase,
): Promise<TopicResult> {
  const sceneCount = 5;
  const prompt = (GenerateVideoContentTool.prototype as any).buildPrompt(
    item.topic,
    item.domain,
    '5-6',
    sceneCount,
  );

  const startedAt = Date.now();
  let text = '';
  let finish = '';
  let lastErr = '';
  let completionTokens = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      } as any);
      text = res.choices?.[0]?.message?.content || '';
      finish = res.choices?.[0]?.finish_reason || '';
      completionTokens = res.usage?.completion_tokens ?? completionTokens;
      if (text) break;
      lastErr = 'empty response';
    } catch (e: any) {
      lastErr = e?.message || String(e);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const latencyMs = Date.now() - startedAt;
  const parsed = extractJson(text);
  if (!parsed) {
    return {
      topic: item.topic,
      domain: item.domain,
      ok: false,
      error: finish === 'length' ? 'truncated (all budget spent on <think>)' : lastErr || 'invalid JSON',
      truncated: finish === 'length',
      completionTokens,
      latencyMs,
      scenes: [],
    };
  }

  let scenes = evaluateStoryboard(parsed);

  // ≤1 轮 figure 修复：与生产 tool 同一条 repairFigures 代码路径。
  // 修好的 figure 写回 parsed.scenes，报告里的 raw 即修复后版本，replay 可直接复核。
  const accent =
    typeof parsed?.visualTheme?.accentColor === 'string' ? parsed.visualTheme.accentColor : '#3E63DD';
  const rejects: FigureReject[] = [];
  scenes.forEach((v, i) => {
    if (v.channel !== 'figure-rejected') return;
    rejects.push({
      sceneIndex: i,
      title: v.title,
      narration: String(parsed.scenes[i]?.narration ?? ''),
      accent,
      reason: String(v.reason ?? ''),
      figure: parsed.scenes[i].figure,
    });
  });
  let repair: TopicResult['repair'];
  if (rejects.length) {
    const adapter = {
      generateJson: async (prompt: string, _sys?: string, options?: { temperature?: number; maxTokens?: number }) => {
        const res = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options?.maxTokens ?? 6000,
          temperature: options?.temperature ?? 0.2,
        } as any);
        return res.choices?.[0]?.message?.content || '';
      },
    };
    const fixed = await repairFigures(adapter, rejects, model);
    repair = { rejected: rejects.length, fixed: fixed?.size ?? 0 };
    if (fixed) {
      for (const [index, spec] of fixed) parsed.scenes[index].figure = spec;
      scenes = evaluateStoryboard(parsed);
    }
  }

  return { topic: item.topic, domain: item.domain, ok: true, completionTokens, latencyMs, repair, scenes, raw: parsed };
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}%`;
}

async function main() {
  const argv = process.argv.slice(2);
  const argOf = (name: string, def?: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : def;
  };
  const limit = Number(argOf('limit', String(TOPICS.length)));
  const concurrency = Math.max(1, Number(argOf('concurrency', '3')));
  const replayPath = argOf('replay') as string | undefined;
  const outPath = path.resolve(
    argOf(
      'out',
      replayPath
        ? replayPath.replace(/\.json$/, '') + '.replay.json'
        : path.resolve(__dirname, '../../../storage/figure-channel-report.json'),
    ) as string,
  );

  const env = { ...readEnv(), ...process.env } as Record<string, string>;
  const client = new OpenAI({
    baseURL: env.LLM_BASE_URL || 'http://localhost:11434/v1',
    apiKey: env.LLM_API_KEY || 'unused',
  });
  const model = argOf('model', env.LLM_MODEL || 'qwen2.5:7b') as string;
  // MiniMax-M3 是思考型模型，压测实测单次 <think> 能吃掉 28k completion tokens，
  // 生产侧 16384 的升级上限根本到不了正文。这里给足预算，量的是"内容决策"，
  // token 预算另算一笔账（见报告里的 completionTokens）。
  const maxTokens = Number(argOf('max-tokens', '32000'));

  let results: TopicResult[] = [];

  if (replayPath) {
    // 离线回放：同一批模型输出，用当前阈值重新判一遍。改阈值不必重烧 token。
    const src = JSON.parse(fs.readFileSync(path.resolve(replayPath), 'utf8'));
    results = (src.results || []).map((r: any) => ({
      ...r,
      scenes: r.raw ? evaluateStoryboard(r.raw) : [],
    }));
    console.log(`[replay] ${replayPath} → 用当前阈值重新判定 ${results.length} 份分镜`);
    results.forEach((r) => {
      const tag = r.ok
        ? r.scenes.map((s) => `${s.channel}${s.reason ? `(${s.reason})` : ''}`).join(',')
        : `ERROR ${r.error}`;
      console.log(`  ${r.topic} → ${tag}`);
    });
  } else {
    const cases = TOPICS.slice(0, limit);
    console.log(`[measure] model=${model} topics=${cases.length} concurrency=${concurrency}`);

    let cursor = 0;
    async function worker(id: number) {
      while (cursor < cases.length) {
        const item = cases[cursor++];
        const r = await runTopic(client, model, maxTokens, item);
        results.push(r);
        const tag = r.ok
          ? r.scenes.map((s) => `${s.channel}${s.reason ? `(${s.reason})` : ''}`).join(',')
          : `ERROR ${r.error}`;
        console.log(`[${id}] ${item.topic} → ${tag}`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, (_, i) => worker(i + 1)));
  }

  // ---- 汇总 ----
  const okRuns = results.filter((r) => r.ok);
  const allScenes = okRuns.flatMap((r) => r.scenes);
  const count = (c: string) => allScenes.filter((s) => s.channel === c).length;

  const figure = count('figure');
  const figureRejected = count('figure-rejected');
  const graph = count('graph');
  const graphRejected = count('graph-rejected');
  const none = count('none');
  const figureAttempts = figure + figureRejected;

  const lessonWithFigure = okRuns.filter((r) => r.scenes.some((s) => s.channel === 'figure')).length;

  const repairRuns = okRuns.filter((r) => r.repair);
  const repairRejected = repairRuns.reduce((a, r) => a + (r.repair?.rejected ?? 0), 0);
  const repairFixed = repairRuns.reduce((a, r) => a + (r.repair?.fixed ?? 0), 0);

  const reasonTally: Record<string, number> = {};
  allScenes.forEach((s) => {
    if (s.channel === 'figure-rejected' && s.reason) reasonTally[s.reason] = (reasonTally[s.reason] || 0) + 1;
  });

  const kindsTally: Record<string, number> = {};
  allScenes.forEach((s) => (s.kinds || []).forEach((k) => (kindsTally[k] = (kindsTally[k] || 0) + 1)));

  console.log('\n===== figure 通道实测 =====');
  console.log(`成功分镜数        : ${okRuns.length}/${results.length}`);
  const truncated = results.filter((r) => r.truncated).length;
  if (truncated) console.log(`思考链吃满预算    : ${truncated}（未产出正文，不计入场景统计）`);
  const tokens = results.map((r) => r.completionTokens || 0).filter((n) => n > 0);
  if (tokens.length) {
    const avg = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length);
    console.log(`平均 completion   : ${avg} tokens/次（max ${Math.max(...tokens)}）`);
  }
  console.log(`总场景数          : ${allScenes.length}`);
  console.log(`figure 通过       : ${figure} (${pct(figure, allScenes.length)})`);
  console.log(`figure 被拒       : ${figureRejected} (占 figure 提交 ${pct(figureRejected, figureAttempts)})`);
  console.log(`graph 通过        : ${graph} (${pct(graph, allScenes.length)})`);
  console.log(`graph 非法        : ${graphRejected}`);
  console.log(`两者皆无          : ${none} (${pct(none, allScenes.length)})`);
  console.log(`含 figure 的课节  : ${lessonWithFigure}/${okRuns.length}`);
  if (repairRuns.length) {
    console.log(`figure 修复轮     : ${repairRuns.length} 份分镜触发，修好 ${repairFixed}/${repairRejected} 个被拒 figure`);
  }
  console.log('拒绝原因分布      :', Object.keys(reasonTally).length ? reasonTally : '无');
  console.log('图元使用分布      :', kindsTally);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        model,
        totals: {
          runs: results.length,
          okRuns: okRuns.length,
          truncated,
          avgCompletionTokens: tokens.length
            ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)
            : 0,
          scenes: allScenes.length,
          figure,
          figureRejected,
          graph,
          graphRejected,
          none,
          lessonsWithFigure: lessonWithFigure,
          repairRuns: repairRuns.length,
          repairRejected,
          repairFixed,
          reasonTally,
          kindsTally,
        },
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n报告已写入 ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
