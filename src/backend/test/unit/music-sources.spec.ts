/**
 * Ported from suinian music-bridge test/sources.js: offline tests against a
 * local fake of the five source APIs. Covers real response shapes → track
 * parsing/filtering, loose-json, HTML error pages, and the full
 * search → token → audio chain without leaking upstream addresses.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import { loadMusicConfig } from '../../src/modules/music/music.config';
import { MusicService } from '../../src/modules/music/music.service';
import { parseLooseObject } from '../../src/modules/music/sources/loose-json';
import itunes from '../../src/modules/music/sources/itunes';
import audius from '../../src/modules/music/sources/audius';
import netease from '../../src/modules/music/sources/netease';
import kuwo from '../../src/modules/music/sources/kuwo';
import kugou from '../../src/modules/music/sources/kugou';

const AUDIO = Buffer.from('NATIVE-SOURCE-AUDIO-BYTES-0123456789');

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

function json(res: http.ServerResponse, body: unknown) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
  });
  res.end(payload);
}

function makeFakeSources() {
  let base = '';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake.invalid');
    const p = url.pathname;

    if (p === '/itunes/search') {
      json(res, {
        resultCount: 3,
        results: [
          {
            wrapperType: 'track', kind: 'song', trackId: 11, trackName: '小星星',
            artistName: '儿歌测试', previewUrl: `${base}/media/itunes.m4a`,
          },
          { kind: 'song', trackName: '没有试听的条目', artistName: 'x' },
          { kind: 'podcast', trackName: '播客不是歌', previewUrl: `${base}/media/podcast.mp3` },
        ],
      });
      return;
    }
    if (p === '/audius/v1/tracks/search') {
      json(res, {
        data: [
          { id: 'aaa111', title: 'Twinkle', duration: 95, is_streamable: true, user: { name: 'Audius Artist' } },
          { id: 'bbb222', title: 'Gated', duration: 60, is_streamable: true, is_stream_gated: true, user: { name: 'x' } },
          { id: 'ccc333', title: 'NotStreamable', duration: 60, is_streamable: false, user: { name: 'y' } },
        ],
      });
      return;
    }
    if (p === '/audius/v1/tracks/aaa111/stream') {
      res.writeHead(302, { location: `${base}/media/audius.mp3` });
      res.end();
      return;
    }
    if (p === '/netease/api/search/get') {
      json(res, {
        code: 200,
        result: {
          songs: [
            { id: 1001, name: '小星星', fee: 8, status: 0, duration: 74225, artists: [{ name: '儿歌多多' }] },
            { id: 1002, name: 'VIP 曲目', fee: 1, status: 0, duration: 196885, artists: [{ name: '汪苏泷' }] },
            { id: 1003, name: '下架曲目', fee: 0, status: 1, duration: 100000, artists: [{ name: 'x' }] },
          ],
        },
      });
      return;
    }
    if (p === '/netease/song/media/outer/url') {
      res.writeHead(302, { location: `${base}/media/netease.mp3` });
      res.end();
      return;
    }
    if (p === '/kuwo/r.s') {
      const body = "{'ARTISTPIC':'','HIT':'3594','abslist':["
        + "{'NAME':'小星星&nbsp;Twinkle&nbsp;Little&nbsp;Star','ARTIST':'儿歌多多',"
        + "'DURATION':'112','MUSICRID':'MUSIC_363343188','FORMATS':'MP3128|MP3H'},"
        + "{'NAME':'只有无损','ARTIST':'x','DURATION':'90',"
        + "'MUSICRID':'MUSIC_444','FORMATS':'ALFLAC'}"
        + "],'TOTAL':'3594'}";
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body);
      return;
    }
    if (p === '/kuwo/anti.s') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`${base}/media/kuwo.mp3`);
      return;
    }
    if (p === '/kugou/song_search_v2') {
      json(res, {
        status: 1,
        errcode: 0,
        data: {
          total: 3,
          lists: [
            {
              FileHash: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', AlbumID: '37376237',
              SongName: '<em>小星星</em>', SingerName: '酷狗儿歌', Duration: 88,
              PayType: 0, Privilege: 0, ExtName: 'mp3',
            },
            {
              FileHash: 'B1B2C3D4E5F60718293A4B5C6D7E8F91', SongName: '付费曲目',
              SingerName: 'x', Duration: 200, PayType: 3, Privilege: 10, ExtName: 'mp3',
            },
            {
              FileHash: 'C1B2C3D4E5F60718293A4B5C6D7E8F92', SongName: '只有无损',
              SingerName: 'y', Duration: 120, PayType: 0, Privilege: 0, ExtName: 'flac',
            },
          ],
        },
      });
      return;
    }
    if (p === '/kugou/app/i/getSongInfo.php') {
      // The real API serves JSON under text/html.
      const body = JSON.stringify({
        errcode: 0,
        songName: '小星星',
        url: `${base}/media/kugou.mp3`,
        backup_url: [`${base}/media/kugou-backup.mp3`],
      });
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(Buffer.byteLength(body)),
      });
      res.end(body);
      return;
    }
    if (p === '/kugou-dead/app/i/getSongInfo.php') {
      json(res, { errcode: 30001, status: 0, error: 'data not found' });
      return;
    }
    if (p === '/broken/api/search/get' || p === '/broken/r.s') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body>404</body></html>');
      return;
    }
    if (p.startsWith('/media/')) {
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': String(AUDIO.length) });
      res.end(AUDIO);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return { server, setBase(value: string) { base = value; } };
}

describe('music sources (offline fake)', () => {
  let fake: ReturnType<typeof makeFakeSources>;
  let base: string;
  let env: Record<string, string>;
  let config: ReturnType<typeof loadMusicConfig>;

  beforeAll(async () => {
    fake = makeFakeSources();
    const port = await listen(fake.server);
    base = `http://127.0.0.1:${port}`;
    fake.setBase(base);
    env = {
      MUSIC_SOURCES: 'itunes,audius,netease,kuwo,kugou',
      MUSIC_ALLOW_HTTP_UPSTREAM: 'true',
      MUSIC_ALLOW_PRIVATE_UPSTREAM: 'true',
      MUSIC_REQUIRE_TITLE_MATCH: 'false',
      MUSIC_ITUNES_BASE: `${base}/itunes`,
      MUSIC_AUDIUS_HOST: `${base}/audius`,
      MUSIC_NETEASE_BASE: `${base}/netease`,
      MUSIC_KUWO_SEARCH_BASE: `${base}/kuwo`,
      MUSIC_KUWO_MEDIA_BASE: `${base}/kuwo`,
      MUSIC_KUGOU_SEARCH_BASE: `${base}/kugou`,
      MUSIC_KUGOU_MEDIA_BASE: `${base}/kugou`,
    };
    config = loadMusicConfig({ get: (key: string) => env[key] } as unknown as ConfigService);
  });

  afterAll(async () => {
    await close(fake.server);
  });

  it('loose-json handles apostrophes, nesting, and no-result replies', () => {
    expect(parseLooseObject('RN=1\nHit=0\n')).toBeNull();
    const loose = parseLooseObject("{'A':'Don\\'t','B':[1,2.5],'C':{'D':'x'},'E':true}");
    expect(loose.A).toBe("Don't");
    expect(loose.B).toEqual([1, 2.5]);
    expect(loose.C.D).toBe('x');
    expect(loose.E).toBe(true);
  });

  it('itunes keeps only kind=song with a previewUrl', async () => {
    const rows = await itunes.search('小星星', 5, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('小星星');
    expect(rows[0].artist).toBe('儿歌测试');
    expect((await itunes.getMedia(rows[0], config)).url).toBe(`${base}/media/itunes.m4a`);
  });

  it('audius drops gated and non-streamable tracks', async () => {
    const rows = await audius.search('twinkle', 5, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('aaa111');
    expect(rows[0].artist).toBe('Audius Artist');
    expect(rows[0].duration).toBe(95);
    expect((await audius.getMedia(rows[0], config)).url).toContain('/stream');
  });

  it('netease filters VIP and removed tracks', async () => {
    const rows = await netease.search('小星星', 5, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1001);
    expect(rows[0].duration).toBe(74);
    expect((await netease.getMedia(rows[0], config)).url).toContain('outer/url?id=1001.mp3');
  });

  it('kuwo parses loose object, cleans entities, skips flac-only', async () => {
    const rows = await kuwo.search('小星星', 5, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('小星星 Twinkle Little Star');
    expect(rows[0].duration).toBe(112);
    expect(rows[0].id).toBe('MUSIC_363343188');
    expect((await kuwo.getMedia(rows[0], config)).url).toBe(`${base}/media/kuwo.mp3`);
  });

  it('kugou skips paid and flac-only, strips highlight tags, parses html-wrapped JSON', async () => {
    const rows = await kugou.search('小星星', 5, config);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('小星星');
    expect(rows[0].artist).toBe('酷狗儿歌');
    expect(rows[0].duration).toBe(88);
    expect(rows[0].id).toBe('A1B2C3D4E5F60718293A4B5C6D7E8F90');
    expect((await kugou.getMedia(rows[0], config)).url).toBe(`${base}/media/kugou.mp3`);
  });

  it('kugou errcode!=0 is a failure, not an empty URL', async () => {
    const rows = await kugou.search('小星星', 5, config);
    const deadConfig = { ...config, kugouMediaBase: `${base}/kugou-dead` };
    await expect(kugou.getMedia(rows[0], deadConfig)).rejects.toMatchObject({ code: 'no_media_source' });
  });

  it('200 HTML error pages are source_bad_payload, not empty results', async () => {
    await expect(netease.search('x', 5, { ...config, neteaseBase: `${base}/broken` }))
      .rejects.toMatchObject({ code: 'source_bad_payload' });
    await expect(kuwo.search('x', 5, { ...config, kuwoSearchBase: `${base}/broken` }))
      .rejects.toMatchObject({ code: 'source_bad_payload' });
  });

  it('full chain: five sources → tokens → audio bytes, no upstream leak', async () => {
    const service = new MusicService({ get: (key: string) => env[key] } as unknown as ConfigService);
    const wrapper = http.createServer((req, res) => {
      const token = (req.url || '').slice('/music/audio/'.length);
      service.streamAudio(token, req.headers.range, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    const wrapperPort = await listen(wrapper);
    const wrapperBase = `http://127.0.0.1:${wrapperPort}`;
    try {
      const result = await service.search('小星星', 5);
      expect(result.enabled).toBe(true);
      expect(result.tracks).toHaveLength(5);
      expect(JSON.stringify(result)).not.toContain(`:${(fake.server.address() as AddressInfo).port}`);
      const titles = new Set(result.tracks.map((t) => t.title));
      expect(titles.has('小星星')).toBe(true);
      expect(titles.has('Twinkle')).toBe(true);
      expect(titles.has('小星星 Twinkle Little Star')).toBe(true);
      for (const track of result.tracks) {
        expect(track.url).toMatch(/^\/music\/audio\//);
        const audioResponse = await fetch(`${wrapperBase}${track.url}`);
        expect(audioResponse.status).toBe(200);
        expect(audioResponse.headers.get('content-type')).toBe('audio/mpeg');
        expect(Buffer.from(await audioResponse.arrayBuffer())).toEqual(AUDIO);
      }
    } finally {
      await close(wrapper);
      service.onModuleDestroy();
    }
  });

  it('empty whitelist disables the feature', async () => {
    const service = new MusicService({ get: () => undefined } as unknown as ConfigService);
    try {
      expect(service.enabled).toBe(false);
      const result = await service.search('小星星', 5);
      expect(result).toEqual({ enabled: false, tracks: [] });
    } finally {
      service.onModuleDestroy();
    }
  });

  it('unknown source names are dropped, valid ones still load', () => {
    const service = new MusicService({
      get: (key: string) => (key === 'MUSIC_SOURCES' ? 'itunes,spotify' : undefined),
    } as unknown as ConfigService);
    try {
      expect(service.enabled).toBe(true);
    } finally {
      service.onModuleDestroy();
    }
  });
});