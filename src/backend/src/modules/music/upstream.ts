import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns';
import * as net from 'net';
import { ServerResponse } from 'http';
import { MusicError } from './music-error';
import { MusicConfig } from './music.config';
import { MediaSource } from './sources/types';
import { TrackCandidate } from './tracks';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const BAD_CONTENT_TYPES = new Set([
  'text/html', 'text/plain', 'application/json', 'application/xml',
  'text/xml', 'application/javascript', 'application/x-www-form-urlencoded',
]);
const SKIP_REQUEST_HEADERS = new Set([
  'host', 'connection', 'content-length', 'transfer-encoding',
  'proxy-authorization', 'proxy-connection', 'accept-encoding', 'range',
]);

function isPublicIPv4(address: string): boolean {
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast / reserved
  return true;
}

function isPublicIPv6(address: string): boolean {
  const lower = address.toLowerCase().split('%')[0];
  if (lower === '::' || lower === '::1') return false;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  if (/^f[cd]/.test(lower)) return false;        // fc00::/7
  if (/^fe[89ab]/.test(lower)) return false;     // fe80::/10
  if (lower.startsWith('ff')) return false;      // multicast
  if (lower.startsWith('2001:db8')) return false; // documentation
  return true;
}

function isPublic(address: string, family: number): boolean {
  return family === 6 ? isPublicIPv6(address) : isPublicIPv4(address);
}

function parseUrl(raw: string, config: MusicConfig): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MusicError('upstream_blocked', 'invalid url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MusicError('upstream_blocked', 'bad scheme');
  }
  if (url.username || url.password) {
    throw new MusicError('upstream_blocked', 'credentials in url');
  }
  if (url.protocol === 'http:' && !config.allowHttpUpstream) {
    throw new MusicError('upstream_blocked', 'http not allowed');
  }
  return url;
}

/**
 * Resolve and validate every answer, then pin the connection to the
 * validated IP — closes DNS rebinding between check and connect.
 */
async function pinnedAddress(
  url: URL,
  config: MusicConfig,
): Promise<{ address: string; family: number } | null> {
  if (config.allowPrivateUpstream) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const family = net.isIP(host);
  if (family) {
    if (!isPublic(host, family)) {
      throw new MusicError('upstream_blocked', 'private address');
    }
    return { address: host, family };
  }
  let answers: dns.LookupAddress[];
  try {
    answers = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new MusicError('upstream_blocked', 'dns failed');
  }
  if (!answers.length) throw new MusicError('upstream_blocked', 'dns empty');
  for (const answer of answers) {
    if (!isPublic(answer.address, answer.family)) {
      throw new MusicError('upstream_blocked', 'private address');
    }
  }
  return { address: answers[0].address, family: answers[0].family };
}

/** Only well-formed single ranges are forwarded; multi-range is dropped. */
export function sanitizeRange(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^bytes=(\d+-\d*|-\d+)$/.test(trimmed) ? trimmed : undefined;
}

function buildHeaders(media: MediaSource, url: URL, range?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(media.headers || {})) {
    const lower = key.toLowerCase();
    if (SKIP_REQUEST_HEADERS.has(lower)) continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    headers[lower] = String(value);
  }
  if (media.userAgent) headers['user-agent'] = media.userAgent;
  headers.host = url.host;
  headers.accept = '*/*';
  if (range) headers.range = range;
  return headers;
}

function openUpstream(
  url: URL,
  pinned: { address: string; family: number } | null,
  media: MediaSource,
  config: MusicConfig,
  range?: string,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const options: http.RequestOptions = {
      method: 'GET',
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: buildHeaders(media, url, range),
    };
    // Connect to the validated address; SNI/Host still use the original name.
    if (pinned) {
      options.lookup = (_hostname, lookupOptions, callback) => {
        const entry = { address: pinned.address, family: pinned.family };
        if (lookupOptions && (lookupOptions as any).all) callback(null, [entry]);
        else callback(null, pinned.address, pinned.family);
      };
    }
    const request = lib.request(options, resolve);
    request.setTimeout(config.upstreamTimeoutMs, () => {
      request.destroy(new MusicError('upstream_timeout', 'timeout'));
    });
    request.on('error', (error) => reject(
      error instanceof MusicError
        ? error
        : new MusicError('upstream_io', (error as any).code || 'io'),
    ));
    request.end();
  });
}

/**
 * An m3u8 playlist is not audio. Some sources serve #EXTM3U text under an
 * octet-stream header; detect it before response headers go out so the
 * fallback loop can switch sources instead of handing the player a text
 * file with a 200.
 */
function looksLikePlaylist(chunk: Buffer): boolean {
  if (!chunk || chunk.length < 7) return false;
  const head = chunk.toString('latin1', 0, Math.min(chunk.length, 16)).trimStart();
  return head.startsWith('#EXTM3U');
}

function pipeAudio(
  response: http.IncomingMessage,
  res: ServerResponse,
  config: MusicConfig,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const status = response.statusCode || 0;
    const partial = status === 206;
    if (!(status >= 200 && status < 300)) {
      response.destroy();
      reject(new MusicError('upstream_status', `HTTP ${status}`));
      return;
    }
    const contentType = String(response.headers['content-type'] || '')
      .split(';')[0].trim().toLowerCase();
    if (contentType.startsWith('text/') || BAD_CONTENT_TYPES.has(contentType)) {
      response.destroy();
      reject(new MusicError('upstream_not_audio', 'bad content type'));
      return;
    }
    const contentRange = partial ? String(response.headers['content-range'] || '') : '';
    if (partial && !/^bytes \d+-\d+\/(\d+|\*)$/.test(contentRange)) {
      response.destroy();
      reject(new MusicError('upstream_not_audio', 'bad content range'));
      return;
    }
    const declared = Number(response.headers['content-length']);
    const hasLength = Number.isFinite(declared) && declared > 0;
    if (hasLength && declared > config.maxBytes) {
      response.destroy();
      reject(new MusicError('upstream_too_large', 'declared'));
      return;
    }

    let total = 0;
    let settled = false;
    let started = false;
    const finish = (error?: MusicError) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    // Headers are deferred until the first chunk passes the playlist check;
    // any failure before that can still switch to another source.
    const startResponse = () => {
      if (started) return;
      started = true;
      res.writeHead(partial ? 206 : 200, {
        // Keep real audio/* types so players pick the right decoder;
        // everything else is forced to octet-stream.
        'content-type': contentType.startsWith('audio/') ? contentType : 'application/octet-stream',
        ...(hasLength ? { 'content-length': String(declared) } : {}),
        ...(partial ? { 'content-range': contentRange } : {}),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
    };

    response.on('data', (chunk: Buffer) => {
      if (!started) {
        if (looksLikePlaylist(chunk)) {
          response.destroy();
          finish(new MusicError('upstream_not_audio', 'hls playlist'));
          return;
        }
        startResponse();
      }
      total += chunk.length;
      if (total > config.maxBytes) {
        response.destroy();
        res.destroy();
        finish(new MusicError('upstream_too_large', 'body'));
        return;
      }
      if (!res.write(chunk)) response.pause();
    });
    res.on('drain', () => response.resume());
    response.on('end', () => {
      if (total === 0) {
        if (started) res.destroy();
        finish(new MusicError('upstream_empty'));
      } else {
        res.end();
        finish();
      }
    });
    response.on('error', (error) => {
      if (started) res.destroy();
      finish(new MusicError('upstream_io', (error as any).code || 'io'));
    });
    res.on('close', () => {
      if (!settled) {
        response.destroy();
        finish(new MusicError('client_gone'));
      }
    });
  });
}

/**
 * Some sources embed basic credentials in the media URL. The download
 * policy rejects credentials-in-URL, but the credentials themselves are
 * needed: convert them to an Authorization header and strip the URL.
 */
function normalizeCredentials(media: MediaSource): MediaSource {
  let url: URL;
  try {
    url = new URL(media.url);
  } catch {
    return media;
  }
  if (!url.username && !url.password) return media;
  const basic = Buffer.from(
    `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
  ).toString('base64');
  url.username = '';
  url.password = '';
  const headers = { ...(media.headers || {}) };
  const hasAuth = Object.keys(headers).some((key) => key.toLowerCase() === 'authorization');
  if (!hasAuth) headers.authorization = `Basic ${basic}`;
  return { ...media, url: url.toString(), headers };
}

export async function streamUpstream(
  rawMedia: MediaSource,
  res: ServerResponse,
  config: MusicConfig,
  rangeHeader?: string,
): Promise<void> {
  const media = normalizeCredentials(rawMedia);
  const range = sanitizeRange(rangeHeader);
  let current = media.url;
  for (let hop = 0; hop <= 2; hop += 1) {
    const url = parseUrl(current, config);
    const pinned = await pinnedAddress(url, config);
    const response = await openUpstream(url, pinned, media, config, range);
    if (REDIRECT_STATUS.has(response.statusCode)) {
      const location = response.headers.location;
      response.destroy();
      if (!location || hop === 2) {
        throw new MusicError('upstream_redirect_limit');
      }
      current = new URL(location, url).toString();
      continue;
    }
    await pipeAudio(response, res, config);
    return;
  }
  throw new MusicError('upstream_redirect_limit');
}

/**
 * Try candidates in order. Only failures BEFORE response headers are sent
 * may switch sources — once bytes are on the wire, switching would splice
 * a corrupt file. client_gone never retries (the player cancelled).
 * The total wall clock is capped by upstreamTimeoutMs so serial timeouts
 * cannot outlast the player's own timeout.
 */
export async function streamWithFallback(
  candidates: TrackCandidate[],
  resolve: (candidate: TrackCandidate) => Promise<MediaSource>,
  res: ServerResponse,
  config: MusicConfig,
  rangeHeader?: string,
  onFail?: (code: string, provider: string) => void,
): Promise<void> {
  const deadline = Date.now() + config.upstreamTimeoutMs;
  let lastCode = '';
  for (const candidate of candidates) {
    try {
      const media = await resolve(candidate);
      await streamUpstream(media, res, config, rangeHeader);
      return;
    } catch (error) {
      const code = error instanceof MusicError ? error.code : 'internal';
      lastCode = code;
      onFail?.(code, candidate.provider);
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded) res.destroy();
        return;
      }
      if (code === 'client_gone') return;
      if (Date.now() >= deadline) break;
    }
  }
  if (!res.headersSent) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'upstream_unavailable', last: lastCode || 'none' }));
  } else if (!res.writableEnded) {
    res.destroy();
  }
}