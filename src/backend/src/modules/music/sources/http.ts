import { MusicError } from '../music-error';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  userAgent?: string;
  accept?: string;
}

export interface TextResponse {
  body: Buffer;
  contentType: string;
  status: number;
  finalUrl: string;
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new MusicError('source_too_large');
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new MusicError('source_too_large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch text with a hard timeout, a byte cap, and a redirect hop limit.
 * A 200 HTML error page must not be parsed as JSON — CN music sites return
 * exactly that when rate-limited, and treating it as "no results" hides
 * real failures.
 */
export async function getText(url: string, opts: FetchOptions = {}): Promise<TextResponse> {
  const timeoutMs = opts.timeoutMs || 4000;
  const maxBytes = opts.maxBytes || 512 * 1024;
  const headers = {
    'user-agent': opts.userAgent || 'LingxiMusic/1.0',
    accept: opts.accept || 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(opts.headers || {}),
  };
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as Error)?.name === 'TimeoutError';
      throw new MusicError(timedOut ? 'source_timeout' : 'source_io');
    }
    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new MusicError('source_http', `HTTP ${response.status}`);
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new MusicError('source_http', `HTTP ${response.status}`);
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const body = await readLimited(response, maxBytes);
    return { body, contentType, status: response.status, finalUrl: current };
  }
  throw new MusicError('source_redirect_limit');
}

export async function getJson(url: string, opts: FetchOptions = {}): Promise<any> {
  const { body, contentType } = await getText(url, {
    ...opts,
    accept: opts.accept || 'application/json, */*',
  });
  if (contentType.includes('text/html')) {
    throw new MusicError('source_bad_payload', 'html');
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new MusicError('source_bad_payload', 'json');
  }
}