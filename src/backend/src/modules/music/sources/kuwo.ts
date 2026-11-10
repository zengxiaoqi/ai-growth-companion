import { getText } from './http';
import { parseLooseObject } from './loose-json';
import { MusicError } from '../music-error';
import { MusicConfig } from '../music.config';
import { MediaSource, MusicSource, SourceTrack } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ENTITIES = new Map([
  ['&nbsp;', ' '], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'],
  ['&quot;', '"'], ['&#39;', "'"], ['&apos;', "'"],
]);

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value;
  for (const [entity, replacement] of ENTITIES) {
    text = text.split(entity).join(replacement);
  }
  return text.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
}

function hasMp3(row: any): boolean {
  const formats = typeof row.FORMATS === 'string' ? row.FORMATS : '';
  if (!formats) return true; // no format info: leave the decision to download time
  return /MP3/i.test(formats);
}

/**
 * Kuwo: search via r.s (JS object literal, parsed by loose-json), media via
 * antiserver convert_url — full MP3 with Range support. Unofficial API,
 * personal use. FLAC/APE-only entries are skipped: no playable mp3 there.
 */
const kuwo: MusicSource = {
  name: 'kuwo',
  display: '酷我音乐',
  region: 'cn',
  kind: 'unofficial',
  requiresAuth: false,
  full: true,
  note: '非官方接口，完整 MP3',

  async search(query, limit, config: MusicConfig): Promise<SourceTrack[]> {
    const url = `${config.kuwoSearchBase}/r.s?all=${encodeURIComponent(query)}`
      + `&ft=music&itemset=web_2013&client=kt&pn=0&rn=${limit}`
      + '&rformat=json&encoding=utf8';
    const { body, contentType } = await getText(url, {
      timeoutMs: config.sourceTimeoutMs,
      headers: { referer: 'https://www.kuwo.cn/', 'user-agent': UA },
      accept: 'application/json, text/plain, */*',
    });
    // The real API replies text/plain; HTML means rate-limited or an error
    // page. It must not fall into the "unparseable → no results" branch.
    if (contentType.includes('text/html')) {
      throw new MusicError('source_bad_payload', 'kuwo html');
    }
    const payload = parseLooseObject(body.toString('utf8'));
    if (!payload) return []; // no-result replies are key=value lines
    const list = Array.isArray(payload.abslist) ? payload.abslist : [];
    const rows: SourceTrack[] = [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const rid = typeof row.MUSICRID === 'string' ? row.MUSICRID.trim() : '';
      if (!/^MUSIC_\d+$/.test(rid)) continue;
      if (!hasMp3(row)) continue;
      const title = cleanName(row.NAME) || cleanName(row.SONGNAME);
      if (!title) continue;
      const seconds = Number(row.DURATION);
      rows.push({
        id: rid,
        title,
        artist: cleanName(row.ARTIST),
        duration: Number.isFinite(seconds) && seconds > 0 && seconds < 86400
          ? Math.floor(seconds)
          : undefined,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },

  async getMedia(item: SourceTrack, config: MusicConfig): Promise<MediaSource> {
    const rid = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!/^MUSIC_\d+$/.test(rid)) {
      throw new MusicError('no_media_source', 'kuwo');
    }
    const url = `${config.kuwoMediaBase}/anti.s?type=convert_url`
      + `&format=mp3&response=url&rid=${encodeURIComponent(rid)}`;
    const { body } = await getText(url, {
      timeoutMs: config.sourceTimeoutMs,
      headers: { referer: 'https://www.kuwo.cn/', 'user-agent': UA },
      accept: 'text/plain, */*',
      maxBytes: 8 * 1024,
    });
    const mediaUrl = body.toString('utf8').trim();
    // When no URL is available the API replies with a CN prose hint instead.
    if (!/^https?:\/\//i.test(mediaUrl) || mediaUrl.length > 2048 || /[<>]/.test(mediaUrl)) {
      throw new MusicError('no_media_source', 'kuwo');
    }
    return {
      url: mediaUrl,
      headers: { referer: 'https://www.kuwo.cn/', 'user-agent': UA },
    };
  },
};

export default kuwo;