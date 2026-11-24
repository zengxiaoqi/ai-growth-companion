/**
 * 跑一节课的提交+轮询小工具（跑批脚本的单主题版）。
 *
 * 与 accept-agent-remotion.ts 的区别只有两点：指定单主题、可直接选引擎。
 * 用来验证"某个开关打开后成片到底变成什么样"——看完片子就删，不留在仓库里。
 *
 * 用法（src/backend 下）：
 *   npx ts-node -T scripts/run-one-lesson.ts 小熊浇花 remotion
 *
 * 第二个参数是**入口引擎**，只接受 auto/hyperframes/remotion/dsh/agent-remotion。
 * 别传 dynamic-remotion：队列的 normalizeRenderEngine 不认这个词，会静默回落
 * 成 auto，然后默认先跑 agent-remotion（模型自己写组件），并不是想验的链路。
 * 传 remotion 才会把 dynamic-remotion 排到首位（见 baseEngineOrder）。
 */
const API = process.env.API_BASE || 'http://localhost:3001/api';
const PHONE = process.env.TEST_PHONE || '13800000001';
const PASSWORD = process.env.TEST_PASSWORD || 'password123';
const CHILD_ID = Number(process.env.TEST_CHILD_ID || 2);

async function main() {
  const topic = process.argv[2] || '小熊浇花';
  const engine = process.argv[3] || 'remotion';

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  }).then((r) => r.json() as Promise<any>);
  const token = login.accessToken || login.token;
  if (!token) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${API}/learning/video/quick-generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic, ageGroup: '5-6', childId: CHILD_ID, renderEngine: engine, force: true }),
  }).then((r) => r.json() as Promise<any>);
  if (!res.taskId) throw new Error(`enqueue failed: ${JSON.stringify(res).slice(0, 300)}`);
  console.log(`submitted "${topic}" engine=${engine} → taskId=${res.taskId}`);

  const deadline = Date.now() + 40 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const list = await fetch(
      `${API}/learning/video/quick-generate/tasks?childId=${CHILD_ID}&limit=50`,
      { headers },
    ).then((r) => r.json() as Promise<any[]>);
    const task = list.find((t) => t.taskId === res.taskId);
    if (!task) {
      console.log('task not in list yet');
      continue;
    }
    console.log(`  ${task.status} progress=${task.progress} ${task.errorMessage || ''}`);
    if (task.status === 'completed' || task.status === 'failed') {
      console.log(JSON.stringify(task, null, 2).slice(0, 1200));
      return;
    }
  }
  console.warn('timeout');
}

main().catch((error) => {
  console.error('failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
