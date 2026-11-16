/**
 * agent-remotion 引擎验收跑批（Phase 2）。
 *
 * 用法：npx ts-node -T scripts/accept-agent-remotion.ts [topic ...]
 * 默认提交 Phase 0 三主题 + 2 新主题（force=true, renderEngine=agent-remotion），
 * 轮询到全部终态，再从 lingxi.db 读 actualEngine/qaScore/qaRounds/延迟，
 * 落 storage/agent-remotion-acceptance.json。QA 帧在 storage/qa/<taskId>/round-0/。
 *
 * 注意：跑批期间不要重启后端（sql.js 撕库风险）。
 */
import { promises as fs } from 'fs';
import * as path from 'path';

const API = process.env.API_BASE || 'http://localhost:3001/api';
const PHONE = process.env.TEST_PHONE || '13800000001';
const PASSWORD = process.env.TEST_PASSWORD || 'password123';
const CHILD_ID = Number(process.env.TEST_CHILD_ID || 2);

const DEFAULT_TOPICS: Array<{ topic: string; ageGroup: string }> = [
  { topic: '彩虹', ageGroup: '5-6' },
  { topic: '大树的样子', ageGroup: '5-6' },
  { topic: '认识汉字', ageGroup: '5-6' },
  { topic: '小蝌蚪找妈妈', ageGroup: '3-4' },
  { topic: '认识时钟', ageGroup: '5-6' },
];

async function main() {
  const argTopics = process.argv.slice(2);
  const allTargets = argTopics.length
    ? argTopics.map((t) => ({ topic: t, ageGroup: '5-6' }))
    : DEFAULT_TOPICS;
  // LIMIT=N 只提交前 N 个主题（避免在 Windows shell 内联中文导致 GBK 乱码）。
  const limit = Number(process.env.LIMIT);
  const targets =
    Number.isFinite(limit) && limit > 0 ? allTargets.slice(0, limit) : allTargets;

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  }).then((r) => r.json() as Promise<any>);
  const token = login.accessToken || login.token;
  if (!token) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const submitted: Array<{ topic: string; taskId: number }> = [];
  // POLL_IDS=17,18 只轮询已提交的任务（跑批进程被杀后恢复用），不再重复提交。
  const pollIds = (process.env.POLL_IDS || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (pollIds.length) {
    submitted.push(...pollIds.map((taskId) => ({ topic: '', taskId })));
    console.log(`poll-only mode: ${pollIds.join(',')}`);
  }
  for (const t of pollIds.length ? [] : targets) {
    const res = await fetch(`${API}/learning/video/quick-generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        topic: t.topic,
        ageGroup: t.ageGroup,
        childId: CHILD_ID,
        renderEngine: 'agent-remotion',
        force: true,
      }),
    }).then((r) => r.json() as Promise<any>);
    if (!res.taskId) throw new Error(`enqueue failed for ${t.topic}: ${JSON.stringify(res)}`);
    submitted.push({ topic: t.topic, taskId: res.taskId });
    console.log(`submitted ${t.topic} (${t.ageGroup}) → taskId=${res.taskId}`);
  }

  const deadline = Date.now() + 90 * 60 * 1000;
  const pending = new Set(submitted.map((s) => s.taskId));
  while (pending.size && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20_000));
    const list = await fetch(
      `${API}/learning/video/quick-generate/tasks?childId=${CHILD_ID}&limit=100`,
      { headers },
    ).then((r) => r.json() as Promise<any[]>);
    for (const task of list) {
      if (!pending.has(task.taskId)) continue;
      if (task.status === 'completed' || task.status === 'failed') {
        pending.delete(task.taskId);
        console.log(
          `taskId=${task.taskId} ${task.status} progress=${task.progress} error=${task.errorMessage || '-'}`,
        );
      } else {
        console.log(`taskId=${task.taskId} ${task.status} progress=${task.progress}`);
      }
    }
  }
  if (pending.size) console.warn(`timeout: still pending ${[...pending].join(',')}`);

  // 终态指标从 DB 读（task-list API 不暴露 qaScore/actualEngine）
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dbPath = path.resolve(__dirname, '../lingxi.db');
  const db = new SQL.Database(await fs.readFile(dbPath));
  const ids = submitted.map((s) => s.taskId);
  const rows = db
    .exec(
      `SELECT id, status, renderEngine, actualEngine, provider, qaScore, qaPassed, qaRounds, errorMessage, startedAt, completedAt, requestPayload FROM video_generation_tasks WHERE id IN (${ids.join(',')})`,
    )[0]
    ?.values || [];
  const report = rows.map((row: any[]) => {
    const [id, status, renderEngine, actualEngine, provider, qaScore, qaPassed, qaRounds, errorMessage, startedAt, completedAt, requestPayload] = row;
    let topic = '';
    try {
      topic = JSON.parse(requestPayload || '{}').topic || '';
    } catch {}
    const durationSec =
      startedAt && completedAt
        ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : null;
    return {
      taskId: id,
      topic,
      status,
      requestedEngine: renderEngine,
      actualEngine,
      provider,
      qaScore,
      qaPassed: Boolean(qaPassed),
      qaRounds,
      durationSec,
      errorMessage,
      qaFramesDir: path.resolve(__dirname, `../../../storage/qa/${id}/round-0`),
    };
  });
  db.close();

  const outDir = path.resolve(__dirname, '../storage');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'agent-remotion-acceptance.json');
  await fs.writeFile(outFile, JSON.stringify({ ranAt: new Date().toISOString(), report }, null, 2));
  console.table(report);
  console.log(`report → ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});