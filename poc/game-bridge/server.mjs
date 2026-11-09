/**
 * Local PoC server: static hosting with CSP, session issuing and a simulated
 * assignment completion endpoint. Zero dependencies. Not production code.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GAMES = path.join(ROOT, 'games');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PARENT_FILES = new Set(['/host.html', '/host.css', '/host.js', '/host-validator.mjs']);

/* contentId is explicit here: this is the fix for resolveContentId falling back to 1. */
const BUILDS = {
  'count-bubbles': {
    uuid: 'count-bubbles',
    version: 1,
    contentId: 9001,
    status: 'published',
    playUrl: '/games/count-bubbles/index.html',
  },
};

const SESSION_TTL_MS = 5 * 60 * 1000;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function bridgeHash() {
  return sha256(path.join(GAMES, 'count-bubbles', 'lingxi-bridge.js'));
}

/** 'self' does not match an opaque-origin sandbox iframe, so the game CSP names the origin. */
function cspFor(kind, origin) {
  if (kind === 'parent') {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'none'",
    ].join('; ');
  }
  return [
    `default-src ${origin}`,
    `script-src ${origin}`,
    `style-src ${origin}`,
    `img-src ${origin} data:`,
    `media-src ${origin} data:`,
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function json(res, status, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(data);
}

function serveFile(res, filePath, kind, origin) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    json(res, 404, { error: 'not found' });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': kind === 'game' ? 'public, max-age=300' : 'no-cache',
    'Content-Security-Policy': cspFor(kind, origin),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function startServer({ port = 0 } = {}) {
  const sessions = new Map();
  const records = [];

  const server = http.createServer(async (req, res) => {
    const origin = `http://${req.headers.host || '127.0.0.1'}`;
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    } catch {
      json(res, 400, { error: 'bad path' });
      return;
    }

    try {
      if (req.method === 'POST' && /^\/api\/game-builds\/[^/]+\/session$/.test(pathname)) {
        const uuid = pathname.split('/')[3];
        const build = BUILDS[uuid];
        if (!build || build.status !== 'published') {
          json(res, 404, { error: 'build not published' });
          return;
        }
        const sessionId = crypto.randomUUID();
        sessions.set(sessionId, {
          uuid,
          used: false,
          bridgeHash: bridgeHash(),
          expiresAt: Date.now() + SESSION_TTL_MS,
        });
        json(res, 200, {
          playUrl: build.playUrl,
          sessionId,
          bridgeHash: bridgeHash(),
          buildUuid: build.uuid,
          version: build.version,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        });
        return;
      }

      if (req.method === 'POST' && /^\/api\/assignments\/\d+\/complete$/.test(pathname)) {
        const assignmentId = Number(pathname.split('/')[3]);
        const body = await readJson(req);
        const score = Number(body.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          json(res, 400, { error: 'invalid score' });
          return;
        }
        const resultData = body.resultData || {};
        if (!resultData.sessionId) {
          json(res, 400, { error: 'missing sessionId' });
          return;
        }
        const session = sessions.get(resultData.sessionId);
        if (!session) {
          json(res, 404, { error: 'unknown session' });
          return;
        }
        if (session.used) {
          json(res, 409, { error: 'session already used' });
          return;
        }
        if (session.expiresAt <= Date.now()) {
          sessions.delete(resultData.sessionId);
          json(res, 410, { error: 'session expired' });
          return;
        }
        if (resultData.buildUuid !== session.uuid) {
          json(res, 400, { error: 'buildUuid does not match session' });
          return;
        }
        if (resultData.bridgeHash !== session.bridgeHash) {
          json(res, 400, { error: 'bridgeHash does not match session' });
          return;
        }
        session.used = true;

        const build = BUILDS[resultData.buildUuid];
        const record = {
          id: records.length + 1,
          assignmentId,
          status: 'completed',
          score,
          resultData,
          learningRecord: {
            id: 1000 + records.length + 1,
            contentId: build ? build.contentId : null,
            score,
            interactionData: resultData,
            status: 'completed',
          },
        };
        records.push(record);
        json(res, 200, record);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/_poc/records') {
        json(res, 200, { records });
        return;
      }

      if (pathname === '/') {
        res.writeHead(302, { Location: '/host.html' });
        res.end();
        return;
      }

      if (PARENT_FILES.has(pathname)) {
        serveFile(res, path.join(ROOT, pathname.slice(1)), 'parent', origin);
        return;
      }

      if (pathname.startsWith('/games/')) {
        const rel = pathname.slice('/games/'.length);
        const full = path.resolve(GAMES, rel);
        if (full !== GAMES && !full.startsWith(GAMES + path.sep)) {
          json(res, 403, { error: 'path outside games directory' });
          return;
        }
        serveFile(res, full, 'game', origin);
        return;
      }

      json(res, 404, { error: 'not found' });
    } catch (error) {
      json(res, 400, { error: String(error && error.message ? error.message : error) });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        sessions,
        records,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT || 4173);
  startServer({ port }).then(({ port: actual }) => {
    console.log(`P0 PoC host page: http://127.0.0.1:${actual}/host.html`);
    console.log('Press Ctrl+C to stop.');
  });
}
