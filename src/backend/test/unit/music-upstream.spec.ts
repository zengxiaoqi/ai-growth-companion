/**
 * Ported from suinian music-bridge test/failover.js plus new Range cases:
 * multi-source fallback, SSRF discipline, m3u8 detection, and the Range
 * passthrough that in-app players need for seeking (the bridge downloaded
 * whole files and had no Range support).
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import { loadMusicConfig, MusicConfig } from '../../src/modules/music/music.config';
import { sanitizeRange, streamUpstream, streamWithFallback } from '../../src/modules/music/upstream';
import { TrackCandidate } from '../../src/modules/music/tracks';

const AUDIO = Buffer.from('FAILOVER-AUDIO-BYTES-0123456789');

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

function makeConfig(overrides: Partial<MusicConfig> = {}): MusicConfig {
  const config = loadMusicConfig({ get: () => undefined } as unknown as ConfigService);
  return { ...config, allowHttpUpstream: true, allowPrivateUpstream: true, ...overrides };
}

function candidate(provider: string): TrackCandidate {
  return { provider, item: { id: provider, title: '兜底', artist: 'x' }, full: true, duration: null };
}

/** Serve streamWithFallback over real HTTP so headersSent semantics are real. */
async function withEndpoint(
  config: MusicConfig,
  candidates: TrackCandidate[],
  resolve: (c: TrackCandidate) => Promise<{ url: string; headers?: Record<string, string> }>,
  fn: (base: string) => Promise<void>,
) {
  const server = http.createServer((req, res) => {
    streamWithFallback(candidates, resolve, res, config, req.headers.range).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  const port = await listen(server);
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await close(server);
  }
}

describe('upstream failover (offline fake)', () => {
  let upstream: http.Server;
  let upstreamBase: string;
  const config = makeConfig();

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      if (req.url.startsWith('/dead/')) {
        // "Copyright expired" in the real world: 200 + an HTML error page.
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body>该歌曲暂时无法播放</body></html>');
        return;
      }
      if (req.url.startsWith('/hls/')) {
        const playlist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n';
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(playlist.length),
        });
        res.end(playlist);
        return;
      }
      if (req.url.startsWith('/loop/')) {
        res.writeHead(302, { location: `${upstreamBase}/loop/again` });
        res.end();
        return;
      }
      if (req.url.startsWith('/range/')) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Math.min(Number(range[2]), AUDIO.length - 1) : AUDIO.length - 1;
          const slice = AUDIO.slice(start, end + 1);
          res.writeHead(206, {
            'content-type': 'audio/mpeg',
            'content-length': String(slice.length),
            'content-range': `bytes ${start}-${end}/${AUDIO.length}`,
          });
          res.end(slice);
          return;
        }
        // This path deliberately ignores Range and always returns 200.
      }
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': String(AUDIO.length) });
      res.end(AUDIO);
    });
    const port = await listen(upstream);
    upstreamBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await close(upstream);
  });

  it('single dead source → honest 502 with a fixed error code', async () => {
    await withEndpoint(config, [candidate('dead')], async () => ({ url: `${upstreamBase}/dead/x` }), async (base) => {
      const response = await fetch(base);
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).toBe('upstream_unavailable');
      expect(JSON.stringify(body)).not.toContain(upstreamBase);
    });
  });

  it('dead then good source → 200 with real audio bytes', async () => {
    await withEndpoint(
      config,
      [candidate('dead'), candidate('good')],
      async (c) => ({ url: `${upstreamBase}/${c.provider}/x` }),
      async (base) => {
        const response = await fetch(base);
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(AUDIO);
      },
    );
  });

  it('fallback depth is configurable: one candidate → 502 again', async () => {
    const oneCandidate = makeConfig({ trackCandidates: 1 });
    await withEndpoint(
      oneCandidate,
      [candidate('dead')],
      async () => ({ url: `${upstreamBase}/dead/x` }),
      async (base) => {
        expect((await fetch(base)).status).toBe(502);
      },
    );
  });

  it('m3u8 playlist is detected before headers and switched away', async () => {
    await withEndpoint(config, [candidate('hls')], async () => ({ url: `${upstreamBase}/hls/x` }), async (base) => {
      const response = await fetch(base);
      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe('upstream_unavailable');
    });
    await withEndpoint(
      config,
      [candidate('hls'), candidate('good')],
      async (c) => ({ url: `${upstreamBase}/${c.provider}/x` }),
      async (base) => {
        const response = await fetch(base);
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(AUDIO);
      },
    );
  });

  it('redirect loops hit the hop limit instead of spinning', async () => {
    await withEndpoint(config, [candidate('loop')], async () => ({ url: `${upstreamBase}/loop/x` }), async (base) => {
      expect((await fetch(base)).status).toBe(502);
    });
  });
});

describe('Range passthrough', () => {
  let upstream: http.Server;
  let upstreamBase: string;
  const config = makeConfig();

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      if (req.url.startsWith('/supports/')) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Math.min(Number(range[2]), AUDIO.length - 1) : AUDIO.length - 1;
          const slice = AUDIO.slice(start, end + 1);
          res.writeHead(206, {
            'content-type': 'audio/mpeg',
            'content-length': String(slice.length),
            'content-range': `bytes ${start}-${end}/${AUDIO.length}`,
          });
          res.end(slice);
          return;
        }
      }
      // /ignores/ and no-range requests always get the full body with 200.
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': String(AUDIO.length) });
      res.end(AUDIO);
    });
    const port = await listen(upstream);
    upstreamBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await close(upstream);
  });

  it('forwards Range and passes 206 + Content-Range through', async () => {
    await withEndpoint(config, [candidate('good')], async () => ({ url: `${upstreamBase}/supports/x` }), async (base) => {
      const response = await fetch(base, { headers: { range: 'bytes=5-14' } });
      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe(`bytes 5-14/${AUDIO.length}`);
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(AUDIO.slice(5, 15));
    });
  });

  it('open-ended range gets the tail', async () => {
    await withEndpoint(config, [candidate('good')], async () => ({ url: `${upstreamBase}/supports/x` }), async (base) => {
      const response = await fetch(base, { headers: { range: 'bytes=10-' } });
      expect(response.status).toBe(206);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(AUDIO.slice(10));
    });
  });

  it('upstream ignoring Range still yields a playable 200 full body', async () => {
    await withEndpoint(config, [candidate('good')], async () => ({ url: `${upstreamBase}/ignores/x` }), async (base) => {
      const response = await fetch(base, { headers: { range: 'bytes=5-14' } });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(AUDIO);
    });
  });

  it('sanitizeRange only accepts well-formed single ranges', () => {
    expect(sanitizeRange('bytes=0-499')).toBe('bytes=0-499');
    expect(sanitizeRange('bytes=500-')).toBe('bytes=500-');
    expect(sanitizeRange('bytes=-500')).toBe('bytes=-500');
    expect(sanitizeRange('bytes=0-499,600-999')).toBeUndefined();
    expect(sanitizeRange('items=0-5')).toBeUndefined();
    expect(sanitizeRange(undefined)).toBeUndefined();
    expect(sanitizeRange('')).toBeUndefined();
  });
});

describe('SSRF discipline', () => {
  it('blocks private IP literals by default', async () => {
    const config = makeConfig({ allowPrivateUpstream: false });
    const res = new http.ServerResponse({ method: 'GET' } as any);
    await expect(streamUpstream({ url: 'http://127.0.0.1:9/x.mp3' }, res, config))
      .rejects.toMatchObject({ code: 'upstream_blocked' });
  });

  it('blocks hostnames resolving to private addresses (DNS rebinding guard)', async () => {
    const config = makeConfig({ allowPrivateUpstream: false });
    const res = new http.ServerResponse({ method: 'GET' } as any);
    await expect(streamUpstream({ url: 'http://localhost:9/x.mp3' }, res, config))
      .rejects.toMatchObject({ code: 'upstream_blocked' });
  });

  it('blocks http upstream unless explicitly allowed', async () => {
    const config = makeConfig({ allowHttpUpstream: false });
    const res = new http.ServerResponse({ method: 'GET' } as any);
    await expect(streamUpstream({ url: 'http://example.com/x.mp3' }, res, config))
      .rejects.toMatchObject({ code: 'upstream_blocked' });
  });

  it('blocks non-http schemes', async () => {
    const config = makeConfig();
    const res = new http.ServerResponse({ method: 'GET' } as any);
    await expect(streamUpstream({ url: 'file:///etc/passwd' }, res, config))
      .rejects.toMatchObject({ code: 'upstream_blocked' });
  });

  it('converts URL-embedded credentials into an Authorization header', async () => {
    let seenAuth = '';
    const server = http.createServer((req, res) => {
      seenAuth = String(req.headers.authorization || '');
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end(AUDIO);
    });
    const port = await listen(server);
    const config = makeConfig();
    const chunks: Buffer[] = [];
    const res = new http.ServerResponse({ method: 'GET' } as any);
    // Capture writes without a real socket.
    (res as any).write = (chunk: Buffer) => { chunks.push(chunk); return true; };
    (res as any).end = () => {};
    (res as any).writeHead = () => {};
    try {
      await streamUpstream({ url: `http://user:pass@127.0.0.1:${port}/x.mp3` }, res, config);
      expect(seenAuth).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
      expect(Buffer.concat(chunks)).toEqual(AUDIO);
    } finally {
      await close(server);
    }
  });
});