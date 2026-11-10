#!/usr/bin/env node
/**
 * measure-activity-pass-rate.js — 参数化活动「LLM 一次通过率」离线统计
 *
 * 数据来源：两套 generate-activity 工具已输出的结构化日志（无需改动生产代码）：
 *   2026-11-10 23:45:14 [info] [Context] [generateActivity] success {"runId":...,"attempt":1,...}
 * 事件：start / llm_request / llm_response / attempt_failed / attempt_exception /
 *       success / failed_after_retries
 *
 * 一次通过（firstPass）定义：该 run 的 success 事件 attempt === 1，即 LLM 首次
 * 生成的参数 JSON 直接通过 sanitize → validate → simulate 三段式校验，未触发
 * 反射重试。分母默认取「成功完成的 run」，失败 run 单独统计失败率。
 *
 * 用法：
 *   node scripts/measure-activity-pass-rate.js [--log <path>] [--since YYYY-MM-DD]
 *        [--type <activityType>] [--json]
 *   默认读取 logs/app.log（相对 backend 根目录）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const EVENT_RE =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+\[([^\]]+)\](?:\s+\[[^\]]+\])?\s+\[generateActivity\]\s+([a-z_]+)\s+(\{.*\})\s*$/;

/** 从一行 winston 文本日志中解析出生成事件；非生成事件返回 null。 */
function parseLine(line) {
  const match = EVENT_RE.exec(line.trim());
  if (!match) return null;
  const [, timestamp, level, event, rawJson] = match;
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch {
    // winston 可能在 message 之后再追加 meta JSON，逐个候选 } 回退解析。
    for (let end = rawJson.lastIndexOf('}'); end > 0; end = rawJson.lastIndexOf('}', end - 1)) {
      try {
        data = JSON.parse(rawJson.slice(0, end + 1));
        break;
      } catch {
        /* keep trying */
      }
    }
    if (!data) return null;
  }
  return { timestamp, level, event, data };
}

function emptyBucket() {
  return {
    runs: 0,
    success: 0,
    firstPass: 0,
    failed: 0,
    incomplete: 0,
    totalSuccessAttempts: 0,
    failureReasons: Object.create(null),
  };
}

function addRunToBucket(bucket, run) {
  if (!run.started) return; // 只统计有 start 的完整 run
  bucket.runs += 1;
  if (run.success) {
    bucket.success += 1;
    const attempt = Number(run.success.attempt) || 1;
    bucket.totalSuccessAttempts += attempt;
    if (attempt === 1) bucket.firstPass += 1;
  } else if (run.failed) {
    bucket.failed += 1;
  } else {
    bucket.incomplete += 1;
  }
  for (const reason of run.reasons) {
    bucket.failureReasons[reason] = (bucket.failureReasons[reason] || 0) + 1;
  }
}

function finalizeBucket(bucket) {
  return {
    runs: bucket.runs,
    success: bucket.success,
    firstPass: bucket.firstPass,
    failed: bucket.failed,
    incomplete: bucket.incomplete,
    completed: bucket.success + bucket.failed,
    firstPassRate: bucket.success ? +(bucket.firstPass / bucket.success).toFixed(4) : null,
    overallFirstPassRate:
      bucket.success + bucket.failed
        ? +(bucket.firstPass / (bucket.success + bucket.failed)).toFixed(4)
        : null,
    failureRate:
      bucket.success + bucket.failed
        ? +(bucket.failed / (bucket.success + bucket.failed)).toFixed(4)
        : null,
    avgSuccessAttempts: bucket.success
      ? +(bucket.totalSuccessAttempts / bucket.success).toFixed(2)
      : null,
    topFailureReasons: Object.entries(bucket.failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * 把事件流按 runId 聚合为统计结果。
 * @param {Array<{timestamp:string,level:string,event:string,data:object}>} events
 * @param {{type?:string, since?:string}} opts
 */
function aggregate(events, opts = {}) {
  const runs = new Map();
  const getRun = (runId) => {
    if (!runs.has(runId)) {
      runs.set(runId, {
        runId,
        started: false,
        type: null,
        topic: null,
        timestamp: null,
        success: null,
        failed: null,
        reasons: [],
      });
    }
    return runs.get(runId);
  };

  for (const ev of events) {
    const { data } = ev;
    if (!data || !data.runId) continue;
    if (opts.since && ev.timestamp.slice(0, 10) < opts.since) continue;
    const run = getRun(data.runId);
    switch (ev.event) {
      case 'start':
        run.started = true;
        run.type = data.type || null;
        run.topic = data.topic || null;
        run.timestamp = ev.timestamp;
        break;
      case 'success':
        run.success = data;
        // 兼容缺少 start 的日志片段
        if (!run.started) {
          run.started = true;
          run.type = data.type || null;
          run.topic = data.topic || null;
          run.timestamp = ev.timestamp;
        }
        break;
      case 'failed_after_retries':
        run.failed = data;
        if (!run.started) {
          run.started = true;
          run.type = data.type || null;
          run.topic = data.topic || null;
          run.timestamp = ev.timestamp;
        }
        for (const f of Array.isArray(data.failures) ? data.failures : []) {
          const reason = String(f).replace(/^attempt \d+:\s*/, '').slice(0, 120);
          run.reasons.push(reason);
        }
        break;
      case 'attempt_failed':
      case 'attempt_exception':
        if (data.reason) {
          run.reasons.push(String(data.reason).slice(0, 120));
        }
        break;
      default:
        break; // llm_request / llm_response 不影响统计
    }
  }

  const global = emptyBucket();
  const byType = new Map();
  let skippedByType = 0;

  for (const run of runs.values()) {
    if (opts.type && run.type !== opts.type) {
      skippedByType += 1;
      continue;
    }
    addRunToBucket(global, run);
    const key = run.type || '(unknown)';
    if (!byType.has(key)) byType.set(key, emptyBucket());
    addRunToBucket(byType.get(key), run);
  }

  const byTypeFinal = {};
  for (const [type, bucket] of [...byType.entries()].sort()) {
    byTypeFinal[type] = finalizeBucket(bucket);
  }
  return {
    ...finalizeBucket(global),
    byType: byTypeFinal,
    skippedByType,
    filters: { type: opts.type || null, since: opts.since || null },
  };
}

function pct(value) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

/** 渲染 Markdown 报告。 */
function renderReport(stats, meta = {}) {
  const lines = [
    '# 参数化活动 LLM 一次通过率报告',
    '',
    `- 日志：${meta.logPath || '(events)'}`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 过滤：题型 ${stats.filters.type || '全部'}，起始日期 ${stats.filters.since || '不限'}`,
    '',
    '## 总体',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 生成 run 总数 | ${stats.runs} |`,
    `| 成功完成 | ${stats.success} |`,
    `| 首次即通过（attempt=1） | ${stats.firstPass} |`,
    `| **一次通过率（成功为分母）** | **${pct(stats.firstPassRate)}** |`,
    `| 一次通过率（含失败为分母） | ${pct(stats.overallFirstPassRate)} |`,
    `| 重试后失败 | ${stats.failed}（失败率 ${pct(stats.failureRate)}） |`,
    `| 未完成（无终结事件） | ${stats.incomplete} |`,
    `| 成功 run 平均尝试次数 | ${stats.avgSuccessAttempts ?? '—'} |`,
    '',
    '## 按题型',
    '',
    '| 题型 | run | 成功 | 首次通过 | 一次通过率 | 失败 | 平均尝试 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const types = Object.keys(stats.byType);
  if (types.length === 0) {
    lines.push('| （无数据） | 0 | 0 | 0 | — | 0 | — |');
  } else {
    for (const type of types) {
      const b = stats.byType[type];
      lines.push(
        `| ${type} | ${b.runs} | ${b.success} | ${b.firstPass} | ${pct(b.firstPassRate)} | ${b.failed} | ${b.avgSuccessAttempts ?? '—'} |`,
      );
    }
  }
  lines.push('', '## 高频失败原因', '');
  if (stats.topFailureReasons.length === 0) {
    lines.push('（无失败记录）');
  } else {
    for (const { reason, count } of stats.topFailureReasons) {
      lines.push(`- ${count} 次：${reason}`);
    }
  }
  if (stats.runs === 0) {
    lines.push(
      '',
      '> ⚠️ 当前日志中没有 `[generateActivity]` 事件：尚无生产基线。请先通过对话触发',
      '> generateActivity（两套工具之一）生成若干活动，再运行本脚本；也可对历史日志',
      '> 指定 `--log <path>`。',
    );
  }
  lines.push('');
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--log':
        opts.log = argv[++i];
        break;
      case '--since':
        opts.since = argv[++i];
        break;
      case '--type':
        opts.type = argv[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--events':
        opts.events = argv[++i];
        break;
      default:
        break;
    }
  }
  return opts;
}

async function readEvents(logPath, since) {
  const stream = fs.createReadStream(logPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const events = [];
  for await (const line of rl) {
    if (since && line.slice(0, 10) < since) continue;
    const ev = parseLine(line);
    if (ev) events.push(ev);
  }
  return events;
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const defaultLog = path.resolve(__dirname, '..', 'logs', 'app.log');
  const logPath = opts.log
    ? path.resolve(opts.log)
    : opts.events
      ? null
      : defaultLog;

  let events;
  if (opts.events) {
    events = JSON.parse(fs.readFileSync(opts.events, 'utf8'));
    if (!Array.isArray(events)) throw new Error('--events 文件必须是事件数组');
  } else {
    if (!fs.existsSync(logPath)) {
      console.error(`日志文件不存在：${logPath}`);
      process.exitCode = 1;
      return null;
    }
    events = await readEvents(logPath, opts.since);
  }

  const stats = aggregate(events, { type: opts.type, since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(renderReport(stats, { logPath }));
  }
  return stats;
}

module.exports = { parseLine, aggregate, renderReport, parseArgs, readEvents, main };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
