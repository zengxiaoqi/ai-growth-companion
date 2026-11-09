/**
 * One-command verification for the P0 game-bridge PoC.
 *
 *   node verify.mjs              # all checks, including a real headless Chromium run if available
 *   node verify.mjs --no-browser # skip the browser run
 *
 * Zero npm dependencies. Writes verification-report.md next to this file and
 * exits with code 1 if any check fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditDirectory, sha256 } from './audit-game-build.mjs';
import {
  createResultValidator,
  toAssignmentCompletion,
  CHANNEL,
} from './host-validator.mjs';
import { startServer } from './server.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');
const GAME_DIR = path.join(ROOT, 'games', 'count-bubbles');
const CANONICAL_BRIDGE = path.join(ROOT, 'bridge', 'lingxi-bridge.js');
const NO_BROWSER = process.argv.includes('--no-browser');

const cases = [];
let group = '未分组';
const section = (name) => { group = name; };
const must = (condition, message) => { if (!condition) throw new Error(message); };

async function test(name, fn) {
  try {
    const detail = await fn();
    cases.push({ group, name, status: 'PASS', detail: detail || '' });
  } catch (error) {
    cases.push({ group, name, status: 'FAIL', detail: error.message || String(error) });
  }
}
function skip(name, reason) {
  cases.push({ group, name, status: 'SKIP', detail: reason });
}

/* ---------- helpers ---------- */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lingxi-poc-'));
function fixture(name, files) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const bridgeSource = () => fs.readFileSync(CANONICAL_BRIDGE, 'utf8');

function request(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = data
      ? { 'Content-Type': 'application/json', 'Content-Length': data.length }
      : {};
    const req = http.request(
      { host: '127.0.0.1', port, method, path: pathname, headers },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { /* html or text */ }
          resolve({ status: res.statusCode, headers: res.headers, text: raw, json: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(fn, timeoutMs, label, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

function cdpCall(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`CDP ${method} timed out`));
    }, 8000);
    function onMessage(event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    }
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Drive headless Chromium over the DevTools Protocol instead of --dump-dom.
 * --dump-dom hangs on this Chromium build for any page with subresources; CDP
 * lets us poll the DOM ourselves. Must stay asynchronous so this process's
 * event loop can keep serving the PoC HTTP server to the browser.
 */
async function runCdpBrowser(binary, targetUrl, profile, timeoutMs = 45000) {
  const child = spawn(binary, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-proxy-server', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--disable-default-apps', '--mute-audio',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let ws = null;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile), 15000, 'DevToolsActivePort');
    const cdpPort = Number(fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/)[0]);
    const page = await until(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (!response.ok) return null;
        const targets = await response.json();
        return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
      } catch { return null; }
    }, 15000, 'CDP page target');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP websocket error')), { once: true });
    });

    let seq = 1;
    const call = (method, params) => cdpCall(ws, seq++, method, params);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.navigate', { url: targetUrl });

    const expression = `JSON.stringify({
      ready: document.readyState,
      status: (document.getElementById('status') || {}).textContent || null,
      origin: (document.getElementById('origin') || {}).textContent || null,
      result: (document.getElementById('result') || {}).textContent || null,
      events: (document.getElementById('events') || {}).textContent || ''
    })`;

    return await until(async () => {
      try {
        const response = await call('Runtime.evaluate', { expression, returnByValue: true });
        const value = response && response.result && response.result.value;
        if (!value) return null;
        const snap = JSON.parse(value);
        if (!snap.status) return null;
        if (snap.status === '回写成功' || snap.status.startsWith('回写失败') ||
            snap.status.startsWith('回写异常') || snap.status === '会话超时，未记分') {
          return snap;
        }
        return null;
      } catch { return null; }
    }, timeoutMs, 'game completion', 250);
  } finally {
    if (ws) { try { ws.close(); } catch { /* already closed */ } }
    child.kill();
  }
}

function findChromium() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const cache = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const builds = fs.readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse();
  for (const build of builds) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
      const candidate = path.join(cache, build, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/* ---------- A. static audit ---------- */

const canonicalHash = sha256(CANONICAL_BRIDGE);
section('A 静态审核');

await test('A1 审核通过样例包，bridge sha256 与固定源一致', () => {
  const report = auditDirectory(GAME_DIR);
  must(report.pass, `expected PASS, got ${JSON.stringify(report.denied.slice(0, 3))}`);
  must(report.bridgeHash === canonicalHash, 'injected bridge differs from canonical bridge');
  return `${report.files.length} files / ${report.totalBytes} bytes, hash ${canonicalHash.slice(0, 12)}…`;
});

await test('A2 拒绝既有 kids-brain-training 原型（外链字体 + localStorage + input）', () => {
  const report = auditDirectory(path.join(PROJECT_ROOT, 'kids-brain-training'));
  must(!report.pass, 'legacy prototype must be denied');
  const rules = new Set(report.denied.map((d) => d.rule));
  for (const rule of ['external-url', 'external-style', 'client-storage', 'form-input']) {
    must(rules.has(rule), `missing deny rule: ${rule}`);
  }
  must(report.checks.some((c) => c.name === 'bridge-present' && !c.ok),
    'bridge-present should fail for an unmanaged prototype');
  return `${report.denied.length} hits: ${[...rules].join(', ')}`;
});

await test('A3 造恶意包，8 类禁用能力全部命中', () => {
  const dir = fixture('evil', {
    'index.html': [
      '<!DOCTYPE html><html><body>',
      '<script src="https://cdn.example.com/evil.js"></script>',
      '<link rel="stylesheet" href="https://cdn.example.com/evil.css">',
      '<iframe src="./x.html"></iframe>',
      '<form><input type="text" contenteditable></form>',
      '<script>',
      "fetch('/api/user');",
      "new XMLHttpRequest();",
      "new WebSocket('wss://example.com');",
      "navigator.sendBeacon('/x');",
      "eval('1'); new Function('return 1')();",
      "localStorage.setItem('k','v'); sessionStorage.clear(); indexedDB.open('x');",
      "document.cookie = 'a=b'; navigator.geolocation.getCurrentPosition(function(){});",
      'navigator.mediaDevices.getUserMedia({});',
      '</script></body></html>',
    ].join('\n'),
    'lingxi-bridge.js': bridgeSource(),
  });
  const report = auditDirectory(dir);
  must(!report.pass, 'malicious build must be denied');
  const rules = new Set(report.denied.map((d) => d.rule));
  const expected = [
    'external-url', 'remote-script', 'external-style', 'network-api',
    'sensitive-api', 'client-storage', 'dynamic-code', 'nested-frame', 'form-input',
  ];
  for (const rule of expected) must(rules.has(rule), `missing deny rule: ${rule}`);
  return `${report.denied.length} hits across ${rules.size} rules`;
});

await test('A4 W3C SVG namespace 白名单不误报', () => {
  const dir = fixture('svg', {
    'index.html': '<!DOCTYPE html><html><body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg></body></html>',
    'lingxi-bridge.js': bridgeSource(),
  });
  const report = auditDirectory(dir);
  must(report.pass, `unexpected deny: ${JSON.stringify(report.denied)}`);
  return 'allowlisted namespace URLs accepted';
});

await test('A5 超过 5MB 的产物被体积上限拒绝', () => {
  const dir = fixture('oversize', {
    'index.html': '<!DOCTYPE html><html><body></body></html>',
    'lingxi-bridge.js': bridgeSource(),
  });
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.alloc(5 * 1024 * 1024 + 1));
  const report = auditDirectory(dir);
  must(!report.pass, 'oversize bundle must be denied');
  must(report.checks.some((c) => c.name === 'bundle-size' && !c.ok), 'bundle-size check must fail');
  return report.checks.find((c) => c.name === 'bundle-size').detail;
});

/* ---------- B/C/E/F need a live server ---------- */

const srv = await startServer({ port: 0 });
const port = srv.port;
const origin = `http://127.0.0.1:${port}`;

try {
  section('B 静态托管与响应头');

  await test('B1 宿主页下发父页 CSP（含 frame-ancestors）', async () => {
    const r = await request(port, 'GET', '/host.html');
    must(r.status === 200, `status ${r.status}`);
    must(r.headers['x-frame-options'] === 'SAMEORIGIN', 'missing X-Frame-Options');
    must(r.headers['x-content-type-options'] === 'nosniff', 'missing nosniff');
    const csp = r.headers['content-security-policy'] || '';
    must(csp.includes("frame-ancestors 'self'"), 'parent CSP lacks frame-ancestors');
    must(csp.includes("connect-src 'self'"), 'parent CSP lacks connect-src self');
    must(r.headers['cache-control'] === 'no-cache', 'host page must not be cached');
    return `CSP ${csp.split(';').length} directives, cache ${r.headers['cache-control']}`;
  });

  await test('B2 游戏产物 CSP 使用显式 origin + connect-src none', async () => {
    const r = await request(port, 'GET', '/games/count-bubbles/index.html');
    must(r.status === 200, `status ${r.status}`);
    const csp = r.headers['content-security-policy'] || '';
    must(csp.includes(`default-src ${origin}`), `CSP should name the explicit origin: ${csp}`);
    must(!csp.includes("default-src 'self'"), `'self' does not match an opaque-origin iframe`);
    must(csp.includes("connect-src 'none'"), 'game must have no network capability');
    must(csp.includes(`img-src ${origin} data:`), 'img-src should also name the explicit origin');
    must(csp.includes("form-action 'none'"), 'form-action must be disabled');
    must(r.headers['cache-control'] === 'public, max-age=300', 'game cache must not be 1y immutable');
    must(!String(r.headers['cache-control']).includes('immutable'), 'immutable must not be used');
    return `CSP default-src ${origin}, cache ${r.headers['cache-control']}`;
  });

  await test('B3 游戏内 bridge 与样式可正常加载', async () => {
    for (const rel of ['lingxi-bridge.js', 'game.js', 'style.css']) {
      const r = await request(port, 'GET', `/games/count-bubbles/${rel}`);
      must(r.status === 200, `${rel} status ${r.status}`);
      must(String(r.headers['content-type']).includes(rel.endsWith('.css') ? 'text/css' : 'javascript'),
        `${rel} wrong content-type`);
    }
    return '3 assets served with correct MIME';
  });

  await test('B4 /games/ 目录穿越被拒绝', async () => {
    const r = await request(port, 'GET', '/games/%2e%2e%2fserver.mjs');
    must(r.status === 403, `expected 403, got ${r.status}`);
    return 'encoded ../ traversal -> 403';
  });

  await test('B5 根路径重定向到宿主页', async () => {
    const r = await request(port, 'GET', '/');
    must(r.status === 302 && r.headers.location === '/host.html', `status ${r.status}`);
    return '302 -> /host.html';
  });

  await test('B6 未发布 / 未知 build 无法签发会话', async () => {
    const r = await request(port, 'POST', '/api/game-builds/not-published/session');
    must(r.status === 404, `expected 404, got ${r.status}`);
    return r.json.error;
  });

  section('C 会话签发');

  let sessionA;
  await test('C1 签发会话，字段齐全且 bridgeHash 与磁盘一致', async () => {
    const r = await request(port, 'POST', '/api/game-builds/count-bubbles/session');
    must(r.status === 200, `status ${r.status}`);
    sessionA = r.json;
    must(sessionA.sessionId && sessionA.sessionId.length >= 32, 'sessionId missing');
    must(sessionA.bridgeHash === canonicalHash, 'issued bridgeHash differs from disk');
    must(sessionA.buildUuid === 'count-bubbles' && sessionA.version === 1, 'build identity wrong');
    must(sessionA.playUrl === '/games/count-bubbles/index.html', 'playUrl wrong');
    return `session ${sessionA.sessionId.slice(0, 8)}…, bridge ${canonicalHash.slice(0, 12)}…`;
  });

  await test('C2 两次签发得到不同 sessionId', async () => {
    const r = await request(port, 'POST', '/api/game-builds/count-bubbles/session');
    must(r.status === 200 && r.json.sessionId !== sessionA.sessionId, 'sessionId reused');
    return 'sessionIds are unique';
  });

  /* ---------- D. postMessage validator ---------- */

  section('D postMessage 校验器');
  const source = {};
  const mk = (data, overrides = {}) => ({
    source: overrides.source === undefined ? source : overrides.source,
    origin: overrides.origin === undefined ? 'null' : overrides.origin,
    data,
  });
  const base = (type, payload = {}) => ({ channel: CHANNEL, type, sessionId: 'S', payload });
  const v = (opts = {}) => createResultValidator({
    expectedOrigin: 'null', sessionId: 'S', bridgeHash: 'H', ...opts,
  });
  const rejected = (verdict, reason) => {
    must(!verdict.ok, `expected rejection (${reason}) but got ok`);
    must(verdict.reason.includes(reason), `expected "${reason}", got "${verdict.reason}"`);
    return verdict.reason;
  };

  await test('D1 READY 校验 bridgeHash 后放行', () => {
    const verdict = v().validate(mk(base('READY', { bridgeHash: 'H' })), source);
    must(verdict.ok && verdict.type === 'READY', 'READY rejected');
    return 'READY accepted';
  });

  await test('D2 拒绝伪造 source / origin / channel / session', () => {
    const judges = [
      [v().validate(mk(base('READY', { bridgeHash: 'H' }), { source: {} }), source), 'source mismatch'],
      [v().validate(mk(base('READY', { bridgeHash: 'H' }), { origin }), source), 'origin mismatch'],
      [v().validate(mk({ ...base('READY', { bridgeHash: 'H' }), channel: 'other' }), source), 'channel mismatch'],
      [v().validate(mk({ ...base('READY', { bridgeHash: 'H' }), sessionId: 'OTHER' }), source), 'session mismatch'],
    ];
    judges.forEach(([verdict, reason], i) => rejected(verdict, reason));
    return `${judges.length} identity checks rejected`;
  });

  await test('D3 拒绝 bridgeHash 不匹配 / 子页发 INIT / 未知类型 / 非对象消息', () => {
    rejected(v().validate(mk(base('READY', { bridgeHash: 'BAD' })), source), 'bridge hash mismatch');
    rejected(v().validate(mk(base('INIT')), source), 'unexpected INIT from child');
    rejected(v().validate(mk(base('WAT')), source), 'unknown message type');
    rejected(v().validate(mk('plain string'), source), 'bad payload');
    return '4 protocol violations rejected';
  });

  await test('D4 HEARTBEAT / PROGRESS / ERROR 均放行且不记分', () => {
    const validator = v();
    for (const type of ['HEARTBEAT', 'PROGRESS', 'ERROR']) {
      must(validator.validate(mk(base(type)), source).ok, `${type} rejected`);
    }
    must(!validator.state.completed, 'non-COMPLETE messages must not complete the session');
    return `heartbeats=${validator.state.heartbeats}, completed=false`;
  });

  await test('D5 COMPLETE 分数 clamp 到 [0,100]，时长不为负', () => {
    const high = v().validate(mk(base('COMPLETE', { score: 150, totalQuestions: 3, correctAnswers: 3, timeSpent: -5 })), source);
    const low = v().validate(mk(base('COMPLETE', { score: -20, totalQuestions: 3, correctAnswers: 0, timeSpent: 'x' })), source);
    const nan = v().validate(mk(base('COMPLETE', { score: 'abc', totalQuestions: 3, correctAnswers: 1 })), source);
    must(high.ok && high.result.score === 100 && high.result.timeSpent === 0, 'high score clamp failed');
    must(low.ok && low.result.score === 0 && low.result.timeSpent === 0, 'low score clamp failed');
    must(nan.ok && nan.result.score === 0, 'NaN score should become 0');
    return '150 -> 100, -20 -> 0, NaN -> 0, negative time -> 0';
  });

  await test('D6 拒绝非法题目数与正确数', () => {
    rejected(v().validate(mk(base('COMPLETE', { score: 50, totalQuestions: 0, correctAnswers: 0 })), source), 'invalid totalQuestions');
    rejected(v().validate(mk(base('COMPLETE', { score: 50, totalQuestions: 1.5, correctAnswers: 0 })), source), 'invalid totalQuestions');
    rejected(v().validate(mk(base('COMPLETE', { score: 50, totalQuestions: 3, correctAnswers: 4 })), source), 'invalid correctAnswers');
    rejected(v().validate(mk(base('COMPLETE', { score: 50, totalQuestions: 3, correctAnswers: -1 })), source), 'invalid correctAnswers');
    return '4 invalid result shapes rejected';
  });

  await test('D7 COMPLETE 只接受一次', () => {
    const validator = v();
    const msg = mk(base('COMPLETE', { score: 80, totalQuestions: 3, correctAnswers: 2 }));
    must(validator.validate(msg, source).ok, 'first COMPLETE rejected');
    return rejected(validator.validate(msg, source), 'session already completed');
  });

  await test('D8 会话超时判定可用（注入时钟）', () => {
    let clock = 1000;
    const validator = createResultValidator({
      expectedOrigin: 'null', sessionId: 'S', bridgeHash: 'H',
      maxAgeMs: 5000, now: () => clock,
    });
    must(!validator.isExpired(), 'should not be expired yet');
    clock = 7000;
    must(validator.isExpired(), 'should be expired');
    return 'maxAgeMs=5000, clock advanced by 6s -> expired';
  });

  await test('D9 toAssignmentCompletion 合并交互数据且会话字段优先', () => {
    const payload = toAssignmentCompletion(
      { score: 67, correctAnswers: 2, totalQuestions: 3, timeSpent: 42,
        interactionData: { domain: 'math', rounds: [1, 2, 3], buildUuid: 'spoofed' } },
      { buildUuid: 'count-bubbles', version: 1, sessionId: 'S', bridgeHash: 'H' },
    );
    must(payload.score === 67, 'score lost');
    must(payload.resultData.correctAnswers === 2 && payload.resultData.timeSpent === 42, 'result fields lost');
    must(payload.resultData.buildUuid === 'count-bubbles', 'session extras must override game-supplied values');
    must(payload.resultData.rounds.length === 3, 'interactionData lost');
    return 'score/resultData preserved, spoofed buildUuid overridden';
  });

  /* ---------- E. end-to-end writeback ---------- */

  section('E 端到端回写闭环');
  let e2eRecord;
  await test('E1 完整消息序列 READY/PROGRESS/COMPLETE 通过，重放 COMPLETE 被拒', async () => {
    const s = await request(port, 'POST', '/api/game-builds/count-bubbles/session');
    must(s.status === 200, `session status ${s.status}`);
    const session = s.json;
    const validator = createResultValidator({
      expectedOrigin: 'null', sessionId: session.sessionId, bridgeHash: session.bridgeHash,
    });
    const frame = {};
    const msg = (type, payload) => {
      const event = mk(base(type, payload), { source: frame });
      event.data.sessionId = session.sessionId;
      return event;
    };
    const sequence = [
      msg('READY', { bridgeHash: session.bridgeHash }),
      msg('PROGRESS', { correctAnswers: 1, totalQuestions: 3 }),
      msg('COMPLETE', {
        score: 67, correctAnswers: 2, totalQuestions: 3, timeSpent: 42,
        interactionData: { domain: 'math', rounds: [{ round: 1, clean: true }] },
      }),
    ];
    for (const event of sequence) {
      const verdict = validator.validate(event, frame);
      must(verdict.ok, `message ${event.data.type} rejected: ${verdict.reason}`);
    }
    return rejected(validator.validate(sequence[2], frame), 'session already completed');
  });

  await test('E2 真实提交：contentId 取显式值 9001，不 fallback 到 1', async () => {
    const s = await request(port, 'POST', '/api/game-builds/count-bubbles/session');
    const session = s.json;
    const validator = createResultValidator({
      expectedOrigin: 'null', sessionId: session.sessionId, bridgeHash: session.bridgeHash,
    });
    const frame = {};
    const msg = (type, payload) => {
      const event = mk(base(type, payload), { source: frame });
      event.data.sessionId = session.sessionId;
      return event;
    };
    must(validator.validate(msg('READY', { bridgeHash: session.bridgeHash }), frame).ok, 'READY rejected');
    const verdict = validator.validate(msg('COMPLETE', {
      score: 67, correctAnswers: 2, totalQuestions: 3, timeSpent: 42,
      interactionData: { domain: 'math', rounds: [] },
    }), frame);
    must(verdict.ok && verdict.type === 'COMPLETE', 'COMPLETE rejected');
    const payload = toAssignmentCompletion(verdict.result, {
      buildUuid: session.buildUuid,
      version: session.version,
      sessionId: session.sessionId,
      bridgeHash: session.bridgeHash,
    });
    const r = await request(port, 'POST', '/api/assignments/42/complete', payload);
    must(r.status === 200, `complete status ${r.status}: ${r.text}`);
    e2eRecord = r.json;
    must(e2eRecord.status === 'completed' && e2eRecord.score === 67, 'assignment not completed with score');
    must(e2eRecord.learningRecord.contentId === 9001,
      `contentId must come from GameBuild, got ${e2eRecord.learningRecord.contentId}`);
    must(e2eRecord.learningRecord.interactionData.buildUuid === 'count-bubbles', 'buildUuid lost');
    return `assignment 42 -> score 67, learningRecord.contentId=9001`;
  });

  await test('E3 学习记录可从查询接口读回', async () => {
    const r = await request(port, 'GET', '/api/_poc/records');
    must(r.status === 200 && r.json.records.length >= 1, 'no records persisted');
    const found = r.json.records.find((rec) => rec.id === e2eRecord.id);
    must(found && found.learningRecord.contentId === 9001, 'persisted record lost contentId');
    return `${r.json.records.length} record(s) readable`;
  });

  /* ---------- F. server-side anti-forgery ---------- */

  section('F 服务端防伪造');
  const validPayload = (overrides = {}) => ({
    score: 80,
    resultData: {
      correctAnswers: 2, totalQuestions: 3, timeSpent: 10,
      buildUuid: 'count-bubbles', version: 1,
      sessionId: 'PLACEHOLDER', bridgeHash: canonicalHash,
      ...overrides,
    },
  });
  const freshSession = async () => {
    const r = await request(port, 'POST', '/api/game-builds/count-bubbles/session');
    must(r.status === 200, 'could not issue session');
    return r.json;
  };
  const post = (payload) => request(port, 'POST', '/api/assignments/42/complete', payload);

  await test('F1 同一 sessionId 重复提交 -> 409', async () => {
    const s = await freshSession();
    const p = validPayload({ sessionId: s.sessionId });
    must((await post(p)).status === 200, 'first submit failed');
    const r = await post(p);
    must(r.status === 409, `expected 409, got ${r.status}`);
    return r.json.error;
  });

  await test('F2 伪造 / 缺失 sessionId -> 404 / 400', async () => {
    must((await post(validPayload({ sessionId: 'forged' }))).status === 404, 'forged session accepted');
    const p = validPayload();
    delete p.resultData.sessionId;
    must((await post(p)).status === 400, 'missing sessionId accepted');
    return 'unknown -> 404, missing -> 400';
  });

  await test('F3 过期会话 -> 410', async () => {
    const s = await freshSession();
    srv.sessions.get(s.sessionId).expiresAt = Date.now() - 1;
    const r = await post(validPayload({ sessionId: s.sessionId }));
    must(r.status === 410, `expected 410, got ${r.status}`);
    return r.json.error;
  });

  await test('F4 buildUuid / bridgeHash 与会话不一致 -> 400', async () => {
    const s = await freshSession();
    must((await post(validPayload({ sessionId: s.sessionId, buildUuid: 'other-game' }))).status === 400,
      'mismatched buildUuid accepted');
    const s2 = await freshSession();
    must((await post(validPayload({ sessionId: s2.sessionId, bridgeHash: 'tampered' }))).status === 400,
      'tampered bridgeHash accepted');
    return 'both bindings enforced';
  });

  await test('F5 分数越界 -> 400', async () => {
    must((await post({ ...validPayload(), score: 101 })).status === 400, 'score 101 accepted');
    must((await post({ ...validPayload(), score: -1 })).status === 400, 'score -1 accepted');
    return '101 / -1 rejected';
  });

  /* ---------- G. real browser iframe run ---------- */

  section('G 真实浏览器 iframe 闭环');
  if (NO_BROWSER) {
    skip('G1 headless Chromium 自动通关并回写', '--no-browser 已指定');
  } else {
    const chrome = findChromium();
    if (!chrome) {
      skip('G1 headless Chromium 自动通关并回写', '未找到可用的 Chromium 二进制');
    } else {
      await test('G1 headless Chromium 自动通关并回写（CDP 实证 event.origin）', async () => {
        const profile = path.join(tmp, 'chrome-profile');
        const snap = await runCdpBrowser(chrome, `${origin}/host.html?autoplay=1`, profile);
        must(snap.origin === 'null',
          `sandbox iframe event.origin should be "null", got "${snap.origin}"`);
        must(snap.status === '回写成功',
          `expected 回写成功, got "${snap.status}" (events: ${String(snap.events).slice(0, 200)})`);
        must(String(snap.result).includes('"contentId": 9001'),
          `writeback result lacks learningRecord.contentId=9001: ${String(snap.result).slice(0, 200)}`);
        must(String(snap.events).includes('READY') && String(snap.events).includes('COMPLETE'),
          `READY/COMPLETE missing from message log: ${String(snap.events).slice(0, 200)}`);
        return `event.origin="null", 自动通关后回写成功, contentId=9001`;
      });
    }
  }
} finally {
  await srv.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (error) {
    // On Windows a just-exited Chromium may still hold its profile files.
    // A leftover temp directory must never turn a successful verification into a failure.
    console.warn(`[verify] temp cleanup skipped: ${error.code || error.message}`);
  }
}

/* ---------- report ---------- */

const passed = cases.filter((c) => c.status === 'PASS').length;
const failed = cases.filter((c) => c.status === 'FAIL').length;
const skipped = cases.filter((c) => c.status === 'SKIP').length;
const stamp = new Date().toISOString();

const lines = [
  '# P0 游戏桥接 PoC · 自动化验证报告',
  '',
  `- 生成时间：${stamp}`,
  `- Node：${process.version}`,
  `- 结论：**${failed === 0 ? 'PASS' : 'FAIL'}**（通过 ${passed} / 失败 ${failed} / 跳过 ${skipped}）`,
  `- 命令：\`node poc/game-bridge/verify.mjs\`${NO_BROWSER ? ' --no-browser' : ''}`,
  '',
];
let lastGroup = null;
for (const c of cases) {
  if (c.group !== lastGroup) {
    lines.push(`## ${c.group}`, '');
    lines.push('| 结果 | 检查项 | 说明 |', '| --- | --- | --- |');
    lastGroup = c.group;
  }
  lines.push(`| ${c.status} | ${c.name} | ${String(c.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
}
lines.push('');
lines.push('## 说明', '');
lines.push('- 本报告由 `verify.mjs` 自动生成，随验证脚本一起提交；重跑会覆盖本文件。');
lines.push('- G 组使用本机已有的 headless Chromium 真实加载 sandbox iframe，用于实证 `event.origin` 的取值。');
lines.push('- 全流程不改动任何生产代码，所有文件位于 `poc/game-bridge/`。');
lines.push('');

fs.writeFileSync(path.join(ROOT, 'verification-report.md'), lines.join('\n'), 'utf8');

for (const line of lines) console.log(line);
console.log(`\n[verify] ${passed} passed, ${failed} failed, ${skipped} skipped -> verification-report.md`);
process.exit(failed > 0 ? 1 : 0);
