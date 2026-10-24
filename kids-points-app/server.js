'use strict';

/**
 * 儿童打卡积分乐园 — 动态页面服务（Node.js 内置模块，无第三方依赖）
 * 数据存储：Supabase REST（SUPABASE_URL / SUPABASE_ANON_KEY 由 Page 运行时注入，不落盘、不出现在前端）
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const PORT = Number.parseInt(process.env.PORT || '8081', 10) || 8081;
const HOST = process.env.HOST || '0.0.0.0';
const SB_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = String(process.env.SUPABASE_ANON_KEY || '');
const AUTH_SECRET = String(process.env.SUPABASE_INSTANCE_ID || 'kids-points-local-secret');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 家长登录态 12 小时

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PIN = '1234';

if (!SB_URL || !SB_KEY) {
  console.error('[boot] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY 未注入，API 将不可用');
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

// ---------------- Supabase REST 帮助函数 ----------------

function sbHeaders(extra) {
  return Object.assign(
    {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    extra || {}
  );
}

async function sbFetch(pathWithQuery, opts) {
  if (!SB_URL || !SB_KEY) {
    const e = new Error('数据库未配置');
    e.status = 500;
    throw e;
  }
  const o = opts || {};
  const res = await fetch(`${SB_URL}/rest/v1/${pathWithQuery}`, {
    method: o.method || 'GET',
    headers: sbHeaders(o.prefer ? { Prefer: o.prefer } : null),
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }
  if (!res.ok) {
    const err = new Error(`Supabase ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.code = data && data.code ? String(data.code) : '';
    throw err;
  }
  return data;
}

function sbQ(params) {
  const sp = new URLSearchParams();
  for (const k of Object.keys(params)) sp.append(k, String(params[k]));
  return sp.toString();
}

function sbSelect(table, params) {
  return sbFetch(`${table}?${sbQ(params)}`);
}

function sbInsert(table, row, select) {
  return sbFetch(`${table}?select=${select || '*'}`, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
}

function sbUpdate(table, match, patch) {
  return sbFetch(`${table}?${sbQ(match)}&select=*`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
}

function sbDelete(table, match) {
  return sbFetch(`${table}?${sbQ(match)}`, { method: 'DELETE' });
}

// ---------------- 通用工具 ----------------

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function jsonError(res, code, msg) {
  send(res, code, { error: msg });
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体太大'), { status: 400 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readRaw(req, 20 * 1024);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    throw Object.assign(new Error('请求格式不对'), { status: 400 });
  }
}

function asInt(v, min, max) {
  const n = Number(v);
  const lo = min === undefined ? -1e9 : min;
  const hi = max === undefined ? 1e9 : max;
  if (!Number.isInteger(n) || n < lo || n > hi) return null;
  return n;
}

function asStr(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > (max || 100)) return null;
  return t;
}

function addDaysStr(dateStr, delta) {
  const p = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

function calcStreak(dateSet, todayStr) {
  let cur = dateSet.has(todayStr) ? todayStr : addDaysStr(todayStr, -1);
  if (!dateSet.has(cur)) return 0;
  let n = 0;
  while (dateSet.has(cur)) {
    n += 1;
    cur = addDaysStr(cur, -1);
  }
  return n;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------------- 家长登录态 ----------------

function signToken(pin) {
  const payload = String(Date.now() + TOKEN_TTL_MS);
  const sig = crypto.createHmac('sha256', `${AUTH_SECRET}|${pin}`).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token, currentPin) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.indexOf('.');
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = crypto.createHmac('sha256', `${AUTH_SECRET}|${currentPin}`).update(payload).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  } catch (e) {
    return false;
  }
}

async function getParentPin() {
  const rows = await sbSelect('settings', { select: 'value', key: 'eq.parent_password', limit: '1' });
  return rows && rows[0] && rows[0].value ? String(rows[0].value) : DEFAULT_PIN;
}

async function parentAuth(req, res) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const pin = await getParentPin();
  if (!token || !verifyToken(token, pin)) {
    jsonError(res, 401, '请先输入家长密码');
    return false;
  }
  return true;
}

// ---------------- 业务查询 ----------------

async function computePoints(kidId) {
  const [cs, ads, rs] = await Promise.all([
    sbSelect('checkins', { select: 'points', kid_id: `eq.${kidId}` }),
    sbSelect('adjustments', { select: 'points', kid_id: `eq.${kidId}` }),
    sbSelect('redemptions', { select: 'cost', kid_id: `eq.${kidId}` }),
  ]);
  const sum = (arr, k) => arr.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const earned = sum(cs, 'points') + sum(ads, 'points');
  const spent = sum(rs, 'cost');
  return { earned, spent, balance: earned - spent };
}

async function nextSortOrder(table) {
  const rows = await sbSelect(table, { select: 'sort_order', order: 'sort_order.desc', limit: '1' });
  const max = rows && rows[0] ? Number(rows[0].sort_order) || 0 : 0;
  return max + 1;
}

// ---------------- API 处理 ----------------

async function handleApi(req, res, pathname, searchParams) {
  const method = req.method;

  // ---- 公开接口 ----

  if (method === 'GET' && pathname === '/api/kids') {
    const kids = await sbSelect('kids', { select: 'id,name,emoji,sort_order', order: 'sort_order.asc,id.asc' });
    return send(res, 200, { kids });
  }

  if (method === 'GET' && pathname === '/api/state') {
    let kidId = asInt(searchParams.get('kid'), 1);
    const date = asStr(searchParams.get('date'), 10);
    if (!date || !DATE_RE.test(date)) return jsonError(res, 400, '日期不对');

    if (!kidId) {
      const first = await sbSelect('kids', { select: 'id', order: 'sort_order.asc,id.asc', limit: '1' });
      if (!first || !first.length) return send(res, 200, { noKids: true, kids: [] });
      kidId = first[0].id;
    }

    const fromParam = asStr(searchParams.get('from'), 10);
    const from = fromParam && DATE_RE.test(fromParam) ? fromParam : addDaysStr(date, -6);

    const [kidRows, habits, rewards, todayCheckins, weekRows, allDates, pts, redemptions, adjustments, recentCheckins, allHabits] =
      await Promise.all([
        sbSelect('kids', { select: 'id,name,emoji', id: `eq.${kidId}`, limit: '1' }),
        sbSelect('habits', { select: 'id,name,emoji,category,points,sort_order', active: 'eq.true', order: 'sort_order.asc,id.asc' }),
        sbSelect('rewards', { select: 'id,name,emoji,cost,sort_order', active: 'eq.true', order: 'sort_order.asc,id.asc' }),
        sbSelect('checkins', { select: 'habit_id,points', kid_id: `eq.${kidId}`, check_date: `eq.${date}` }),
        sbFetch(`checkins?select=check_date,points&kid_id=eq.${kidId}&check_date=gte.${from}&check_date=lte.${date}`),
        sbSelect('checkins', { select: 'check_date', kid_id: `eq.${kidId}` }),
        computePoints(kidId),
        sbSelect('redemptions', { select: 'id,reward_name,reward_emoji,cost,status,created_at', kid_id: `eq.${kidId}`, order: 'id.desc', limit: '10' }),
        sbSelect('adjustments', { select: 'id,points,note,adj_date,created_at', kid_id: `eq.${kidId}`, order: 'id.desc', limit: '10' }),
        sbSelect('checkins', { select: 'id,habit_id,points,check_date,created_at', kid_id: `eq.${kidId}`, order: 'id.desc', limit: '12' }),
        sbSelect('habits', { select: 'id,name,emoji' }),
      ]);

    if (!kidRows.length) return jsonError(res, 404, '孩子不存在');

    const weekMap = {};
    for (const r of weekRows || []) {
      const d = String(r.check_date).slice(0, 10);
      weekMap[d] = (weekMap[d] || 0) + (Number(r.points) || 0);
    }
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDaysStr(from, i);
      week.push({ date: d, points: weekMap[d] || 0 });
    }

    const dateSet = new Set((allDates || []).map((r) => String(r.check_date).slice(0, 10)));

    const habitMap = {};
    for (const h of allHabits || []) habitMap[h.id] = h;
    const checkins = (recentCheckins || []).map((c) => ({
      id: c.id,
      habit_id: c.habit_id,
      points: c.points,
      check_date: c.check_date,
      created_at: c.created_at,
      habit_name: habitMap[c.habit_id] ? habitMap[c.habit_id].name : '已删除的项目',
      habit_emoji: habitMap[c.habit_id] ? habitMap[c.habit_id].emoji : '✅',
    }));

    return send(res, 200, {
      kid: kidRows[0],
      habits,
      rewards,
      todayCheckins,
      checkins,
      week,
      streak: calcStreak(dateSet, date),
      totalDays: dateSet.size,
      earned: pts.earned,
      spent: pts.spent,
      balance: pts.balance,
      redemptions,
      adjustments,
      today: date,
      from,
    });
  }

  if (method === 'POST' && pathname === '/api/checkin') {
    const body = await readJson(req);
    const kidId = asInt(body.kidId, 1);
    const habitId = asInt(body.habitId, 1);
    const date = asStr(body.date, 10);
    if (!kidId || !habitId) return jsonError(res, 400, '参数不对');
    if (!date || !DATE_RE.test(date)) return jsonError(res, 400, '日期不对');

    const habitRows = await sbSelect('habits', { select: 'id,points,active', id: `eq.${habitId}`, limit: '1' });
    if (!habitRows.length || !habitRows[0].active) return jsonError(res, 400, '打卡项目不存在或已下架');

    let already = false;
    try {
      await sbFetch('checkins?select=id', {
        method: 'POST',
        body: { kid_id: kidId, habit_id: habitId, check_date: date, points: Number(habitRows[0].points) || 1 },
        prefer: 'return=minimal',
      });
    } catch (err) {
      if (err.code === '23505') already = true;
      else if (err.code === '23503') return jsonError(res, 400, '数据不存在');
      else throw err;
    }

    const pts = await computePoints(kidId);
    return send(res, 200, Object.assign({ ok: true, already, points: Number(habitRows[0].points) || 1 }, pts));
  }

  if (method === 'POST' && pathname === '/api/uncheck') {
    const body = await readJson(req);
    const kidId = asInt(body.kidId, 1);
    const habitId = asInt(body.habitId, 1);
    const date = asStr(body.date, 10);
    if (!kidId || !habitId) return jsonError(res, 400, '参数不对');
    if (!date || !DATE_RE.test(date)) return jsonError(res, 400, '日期不对');

    await sbDelete('checkins', { kid_id: `eq.${kidId}`, habit_id: `eq.${habitId}`, check_date: `eq.${date}` });
    const pts = await computePoints(kidId);
    return send(res, 200, Object.assign({ ok: true }, pts));
  }

  if (method === 'POST' && pathname === '/api/redeem') {
    const body = await readJson(req);
    const kidId = asInt(body.kidId, 1);
    const rewardId = asInt(body.rewardId, 1);
    if (!kidId || !rewardId) return jsonError(res, 400, '参数不对');

    const rewardRows = await sbSelect('rewards', { select: 'id,name,emoji,cost,active', id: `eq.${rewardId}`, limit: '1' });
    if (!rewardRows.length || !rewardRows[0].active) return jsonError(res, 400, '礼物不存在或已下架');
    const reward = rewardRows[0];

    const pts = await computePoints(kidId);
    if (pts.balance < reward.cost) {
      return jsonError(res, 400, `积分还不够哦，还差 ${reward.cost - pts.balance} 分`);
    }

    const ins = await sbInsert(
      'redemptions',
      { kid_id: kidId, reward_id: reward.id, reward_name: reward.name, reward_emoji: reward.emoji, cost: reward.cost, status: 'pending' },
      'id,status,created_at'
    );
    const pts2 = await computePoints(kidId);
    return send(res, 200, Object.assign({ ok: true, redemption: ins && ins[0] }, pts2));
  }

  // ---- 家长接口 ----

  if (method === 'POST' && pathname === '/api/parent/login') {
    const body = await readJson(req);
    const pin = asStr(body.pin, 20);
    if (!pin) return jsonError(res, 400, '请输入密码');
    const cur = await getParentPin();
    if (!safeEqual(pin, cur)) return jsonError(res, 401, '密码不对，再试试');
    return send(res, 200, { ok: true, token: signToken(cur), expiresInHours: 12 });
  }

  if (method === 'POST' && pathname === '/api/parent/verify') {
    const body = await readJson(req);
    const pin = await getParentPin();
    if (!verifyToken(asStr(body.token, 200), pin)) return jsonError(res, 401, '登录已过期，请重新输入密码');
    return send(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/parent/summary') {
    if (!(await parentAuth(req, res))) return;
    const date = asStr(searchParams.get('date'), 10);
    const validDate = date && DATE_RE.test(date) ? date : null;

    const kids = await sbSelect('kids', { select: 'id,name,emoji,sort_order', order: 'sort_order.asc,id.asc' });
    const kidPts = await Promise.all(kids.map((k) => computePoints(k.id)));
    const [habits, rewards, pending, adjustments, todayCheckins] = await Promise.all([
      sbSelect('habits', { select: 'id,name,emoji,category,points,sort_order,active', order: 'sort_order.asc,id.asc' }),
      sbSelect('rewards', { select: 'id,name,emoji,cost,sort_order,active', order: 'sort_order.asc,id.asc' }),
      sbSelect('redemptions', { select: 'id,kid_id,reward_name,reward_emoji,cost,status,created_at', status: 'eq.pending', order: 'id.desc', limit: '50' }),
      sbSelect('adjustments', { select: 'id,kid_id,points,note,adj_date,created_at', order: 'id.desc', limit: '30' }),
      validDate ? sbSelect('checkins', { select: 'kid_id,habit_id,points', check_date: `eq.${validDate}` }) : Promise.resolve([]),
    ]);

    return send(res, 200, {
      kids: kids.map((k, i) => Object.assign({}, k, kidPts[i])),
      habits,
      rewards,
      pending,
      adjustments,
      todayCheckins,
      today: validDate,
    });
  }

  if (method === 'POST' && pathname === '/api/parent/kids') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const action = asStr(body.action, 20);

    if (action === 'create') {
      const name = asStr(body.name, 12);
      const emoji = asStr(body.emoji, 8) || '🐻';
      if (!name) return jsonError(res, 400, '请填写孩子名字');
      const sortOrder = await nextSortOrder('kids');
      const kid = await sbInsert('kids', { name, emoji, sort_order: sortOrder }, 'id,name,emoji,sort_order');
      return send(res, 200, { ok: true, kid: kid && kid[0] });
    }

    if (action === 'update') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      const patch = {};
      if (body.name !== undefined) {
        const name = asStr(body.name, 12);
        if (!name) return jsonError(res, 400, '名字不能为空');
        patch.name = name;
      }
      if (body.emoji !== undefined) patch.emoji = asStr(body.emoji, 8) || '🐻';
      if (!Object.keys(patch).length) return jsonError(res, 400, '没有要修改的内容');
      await sbUpdate('kids', { id: `eq.${id}` }, patch);
      return send(res, 200, { ok: true });
    }

    if (action === 'delete') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      await sbDelete('kids', { id: `eq.${id}` });
      return send(res, 200, { ok: true });
    }

    return jsonError(res, 400, '不支持的操作');
  }

  if (method === 'POST' && pathname === '/api/parent/habits') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const action = asStr(body.action, 20);

    if (action === 'create') {
      const name = asStr(body.name, 20);
      const emoji = asStr(body.emoji, 8) || '⭐';
      const category = asStr(body.category, 20);
      const points = asInt(body.points, 1, 999);
      if (!name) return jsonError(res, 400, '请填写项目名称');
      if (category !== 'learning' && category !== 'behavior') return jsonError(res, 400, '分类不对');
      if (points === null) return jsonError(res, 400, '积分要在 1-999 之间');
      const sortOrder = await nextSortOrder('habits');
      const habit = await sbInsert('habits', { name, emoji, category, points, sort_order: sortOrder, active: true }, 'id');
      return send(res, 200, { ok: true, habit: habit && habit[0] });
    }

    if (action === 'update') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      const patch = {};
      if (body.name !== undefined) {
        const name = asStr(body.name, 20);
        if (!name) return jsonError(res, 400, '名称不能为空');
        patch.name = name;
      }
      if (body.emoji !== undefined) patch.emoji = asStr(body.emoji, 8) || '⭐';
      if (body.category !== undefined) {
        const c = asStr(body.category, 20);
        if (c !== 'learning' && c !== 'behavior') return jsonError(res, 400, '分类不对');
        patch.category = c;
      }
      if (body.points !== undefined) {
        const p = asInt(body.points, 1, 999);
        if (p === null) return jsonError(res, 400, '积分要在 1-999 之间');
        patch.points = p;
      }
      if (body.active !== undefined) patch.active = body.active === true;
      if (body.sortOrder !== undefined) {
        const s = asInt(body.sortOrder, 0, 99999);
        if (s === null) return jsonError(res, 400, '排序不对');
        patch.sort_order = s;
      }
      if (!Object.keys(patch).length) return jsonError(res, 400, '没有要修改的内容');
      await sbUpdate('habits', { id: `eq.${id}` }, patch);
      return send(res, 200, { ok: true });
    }

    if (action === 'delete') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      await sbDelete('habits', { id: `eq.${id}` });
      return send(res, 200, { ok: true });
    }

    return jsonError(res, 400, '不支持的操作');
  }

  if (method === 'POST' && pathname === '/api/parent/rewards') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const action = asStr(body.action, 20);

    if (action === 'create') {
      const name = asStr(body.name, 30);
      const emoji = asStr(body.emoji, 8) || '🎁';
      const cost = asInt(body.cost, 1, 9999);
      if (!name) return jsonError(res, 400, '请填写礼物名称');
      if (cost === null) return jsonError(res, 400, '所需积分要在 1-9999 之间');
      const sortOrder = await nextSortOrder('rewards');
      const reward = await sbInsert('rewards', { name, emoji, cost, sort_order: sortOrder, active: true }, 'id');
      return send(res, 200, { ok: true, reward: reward && reward[0] });
    }

    if (action === 'update') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      const patch = {};
      if (body.name !== undefined) {
        const name = asStr(body.name, 30);
        if (!name) return jsonError(res, 400, '名称不能为空');
        patch.name = name;
      }
      if (body.emoji !== undefined) patch.emoji = asStr(body.emoji, 8) || '🎁';
      if (body.cost !== undefined) {
        const c = asInt(body.cost, 1, 9999);
        if (c === null) return jsonError(res, 400, '所需积分要在 1-9999 之间');
        patch.cost = c;
      }
      if (body.active !== undefined) patch.active = body.active === true;
      if (!Object.keys(patch).length) return jsonError(res, 400, '没有要修改的内容');
      await sbUpdate('rewards', { id: `eq.${id}` }, patch);
      return send(res, 200, { ok: true });
    }

    if (action === 'delete') {
      const id = asInt(body.id, 1);
      if (!id) return jsonError(res, 400, '参数不对');
      await sbDelete('rewards', { id: `eq.${id}` });
      return send(res, 200, { ok: true });
    }

    return jsonError(res, 400, '不支持的操作');
  }

  if (method === 'POST' && pathname === '/api/parent/adjust') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const kidId = asInt(body.kidId, 1);
    const points = asInt(body.points, -999, 999);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 30) : '';
    const date = asStr(body.date, 10);
    if (!kidId) return jsonError(res, 400, '参数不对');
    if (points === null || points === 0) return jsonError(res, 400, '分值要在 1-999 或 -999 到 -1 之间');
    if (!date || !DATE_RE.test(date)) return jsonError(res, 400, '日期不对');
    const ins = await sbInsert('adjustments', { kid_id: kidId, points, note, adj_date: date }, 'id');
    return send(res, 200, { ok: true, adjustment: ins && ins[0] });
  }

  if (method === 'POST' && pathname === '/api/parent/redeem-status') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const id = asInt(body.id, 1);
    const status = asStr(body.status, 10);
    if (!id) return jsonError(res, 400, '参数不对');
    if (status === 'done') {
      await sbUpdate('redemptions', { id: `eq.${id}` }, { status: 'done' });
      return send(res, 200, { ok: true });
    }
    if (status === 'cancel') {
      await sbDelete('redemptions', { id: `eq.${id}` }); // 删除即退回积分（余额实时计算）
      return send(res, 200, { ok: true });
    }
    return jsonError(res, 400, '不支持的状态');
  }

  if (method === 'POST' && pathname === '/api/parent/password') {
    if (!(await parentAuth(req, res))) return;
    const body = await readJson(req);
    const oldPin = asStr(body.oldPin, 20);
    const newPin = asStr(body.newPin, 20);
    if (!oldPin || !newPin) return jsonError(res, 400, '请填写完整');
    if (newPin.length < 4) return jsonError(res, 400, '新密码至少 4 位');
    const cur = await getParentPin();
    if (!safeEqual(oldPin, cur)) return jsonError(res, 400, '原密码不对');
    await sbFetch('settings?select=key', {
      method: 'POST',
      body: { key: 'parent_password', value: newPin },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return send(res, 200, { ok: true });
  }

  return jsonError(res, 404, '接口不存在');
}

// ---------------- 静态文件 ----------------

function serveStatic(req, res, pathname) {
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }
  let html;
  try {
    html = fs.readFileSync(`${__dirname}/index.html`);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('index.html missing');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : html);
}

// ---------------- 服务器 ----------------

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;

    if (pathname === '/healthz') return send(res, 200, { ok: true });

    if (pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, pathname, u.searchParams);
      if (result !== undefined) return result;
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    return jsonError(res, 405, '不支持的请求');
  } catch (err) {
    console.error(`[server] ${req.method} ${req.url} ->`, (err && err.stack) || err);
    if (res.headersSent) {
      try {
        res.end();
      } catch (e) {
        /* ignore */
      }
      return;
    }
    if (err && err.status === 400) return jsonError(res, 400, err.message);
    jsonError(res, 500, '服务器开小差了，请稍后再试');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[boot] 儿童打卡积分乐园 running at http://${HOST}:${PORT}`);
});
