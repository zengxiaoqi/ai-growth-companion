/**
 * Parent page controller. Mirrors the intended production HtmlGame.tsx logic.
 * The child iframe is sandboxed without allow-same-origin, so its origin is the
 * string "null" and both postMessage directions must use targetOrigin "*".
 * Identity is assured by event.source === iframe.contentWindow plus a one-time sessionId.
 */
import { createResultValidator, toAssignmentCompletion, CHANNEL } from './host-validator.mjs';

const ASSIGNMENT_ID = 42;
const AUTOPLAY = new URLSearchParams(window.location.search).get('autoplay') === '1';
const byId = (id) => document.getElementById(id);
let ctx = null;

function log(kind, text) {
  const item = document.createElement('li');
  item.className = kind;
  item.textContent = text;
  byId('events').prepend(item);
  const list = byId('events');
  while (list.children.length > 60) list.lastChild.remove();
}

function setStatus(text) {
  byId('status').textContent = text;
}

function short(value) {
  return value ? String(value).slice(0, 16) + '…' : '—';
}

function onMessage(event) {
  if (!ctx) return;
  const verdict = ctx.validator.validate(event, byId('frame').contentWindow);
  if (!verdict.ok) {
    log('warn', 'rejected: ' + verdict.reason);
    return;
  }
  byId('origin').textContent = event.origin || '(empty)';
  log('ok', verdict.type + ' (origin=' + event.origin + ')');
  if (verdict.type === 'READY') setStatus('游戏已就绪');
  if (verdict.type === 'ERROR') setStatus('游戏报错');
  if (verdict.type === 'COMPLETE') {
    setStatus('已通关，正在回写');
    submit(verdict.result);
  }
}

async function submit(result) {
  const payload = toAssignmentCompletion(result, {
    buildUuid: ctx.session.buildUuid,
    version: ctx.session.version,
    sessionId: ctx.session.sessionId,
    bridgeHash: ctx.session.bridgeHash,
  });
  try {
    const response = await fetch('/api/assignments/' + ASSIGNMENT_ID + '/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const record = await response.json();
    if (!response.ok) {
      setStatus('回写失败: ' + (record.error || response.status));
      byId('result').textContent = JSON.stringify(record, null, 2);
      return;
    }
    setStatus('回写成功');
    byId('result').textContent = JSON.stringify(record, null, 2);
    log('ok', 'learningRecord.contentId = ' + record.learningRecord.contentId);
  } catch (error) {
    setStatus('回写异常');
    log('warn', String(error));
  }
}

async function boot() {
  window.removeEventListener('message', onMessage);
  if (ctx && ctx.timer) clearInterval(ctx.timer);
  byId('events').textContent = '';
  byId('result').textContent = '等待游戏结果…';
  byId('origin').textContent = '—';
  setStatus('准备中');

  const response = await fetch('/api/game-builds/count-bubbles/session', { method: 'POST' });
  if (!response.ok) {
    setStatus('签发会话失败');
    return;
  }
  const session = await response.json();

  ctx = {
    session,
    validator: createResultValidator({
      expectedOrigin: 'null',
      sessionId: session.sessionId,
      bridgeHash: session.bridgeHash,
    }),
    timer: null,
  };

  byId('session').textContent = short(session.sessionId);
  byId('hash').textContent = short(session.bridgeHash);
  setStatus('会话已签发');

  const frame = byId('frame');
  frame.addEventListener('load', function onLoad() {
    frame.removeEventListener('load', onLoad);
    frame.contentWindow.postMessage(
      {
        channel: CHANNEL,
        type: 'INIT',
        sessionId: session.sessionId,
        payload: {
          buildUuid: session.buildUuid,
          version: session.version,
          bridgeHash: session.bridgeHash,
          ageGroup: '3-4',
          difficulty: 1,
          locale: 'zh-CN',
        },
      },
      '*'
    );
    log('ok', 'INIT sent');
  });

  window.addEventListener('message', onMessage);
  ctx.timer = setInterval(function () {
    if (ctx && ctx.validator.isExpired() && !ctx.validator.state.completed) {
      setStatus('会话超时，未记分');
      clearInterval(ctx.timer);
    }
  }, 1000);

  frame.src = session.playUrl + (AUTOPLAY ? '?autoplay=1' : '');
}

byId('restart').addEventListener('click', boot);
boot();
