import { getJson, getText } from './http';
import { MusicError } from '../music-error';
import { MusicConfig } from '../music.config';
import { MediaSource, MusicSource, SourceTrack } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HASH_RE = /^[0-9A-Fa-f]{32}$/;

// Search hits wrap the query in <em> tags; strip them before display.
function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlayable(row: any): boolean {
  const pay = Number(row.PayType);
  const privilege = Number(row.Privilege);
  // Missing fields: do not assume "free" — fewer results beats unplayable ones.
  if (!Number.isFinite(pay) || !Number.isFinite(privilege)) return false;
  if (pay !== 0 || privilege !== 0) return false;
  const ext = typeof row.ExtName === 'string' ? row.ExtName.toLowerCase() : '';
  return !ext || ext === 'mp3';
}

/**
 * Kugou: song_search_v2 + getSongInfo(playInfo), public web/mobile APIs.
 * Only pay_type=0 & privilege=0 resolve to a URL. Media URLs are
 * timestamped and expire in hours, so getMedia resolves fresh every time —
 * never cache them into the token. Unofficial API, personal use.
 */
const kugou: MusicSource = {
  name: 'kugou',
  display: '酷狗音乐',
  region: 'cn',
  kind: 'unofficial',
  requiresAuth: false,
  full: true,
  note: '非官方接口，仅免费曲目可播',

  async search(query, limit, config: MusicConfig): Promise<SourceTrack[]> {
    // Paid entries are common; fetch extra to cover the filtering loss.
    const fetchCount = Math.min(limit * 2, 30);
    const url = `${config.kugouSearchBase}/song_search_v2?keyword=${encodeURIComponent(query)}`
      + `&page=1&pagesize=${fetchCount}&platform=WebFilter&userid=-1`
      + '&clientver=2000&iscorrection=1&privilege_filter=0&filter=10';
    const payload = await getJson(url, {
      timeoutMs: config.sourceTimeoutMs,
      headers: { referer: 'https://www.kugou.com/', 'user-agent': UA },
    });
    const lists = Array.isArray(payload?.data?.lists) ? payload.data.lists : [];
    const rows: SourceTrack[] = [];
    for (const row of lists) {
      if (!row || typeof row !== 'object') continue;
      const hash = typeof row.FileHash === 'string' ? row.FileHash.trim() : '';
      if (!HASH_RE.test(hash)) continue;
      if (!isPlayable(row)) continue;
      const title = cleanName(row.SongName);
      if (!title) continue;
      const seconds = Number(row.Duration);
      rows.push({
        id: hash,
        albumId: typeof row.AlbumID === 'string' || typeof row.AlbumID === 'number'
          ? String(row.AlbumID)
          : '',
        title,
        artist: cleanName(row.SingerName),
        duration: Number.isFinite(seconds) && seconds > 0 && seconds < 86400
          ? Math.floor(seconds)
          : undefined,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },

  async getMedia(item: SourceTrack, config: MusicConfig): Promise<MediaSource> {
    const hash = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!HASH_RE.test(hash)) {
      throw new MusicError('no_media_source', 'kugou');
    }
    const url = `${config.kugouMediaBase}/app/i/getSongInfo.php`
      + `?cmd=playInfo&hash=${encodeURIComponent(hash)}`;
    // This API serves JSON under a text/html content-type, so getJson would
    // reject it as an error page. Parse manually, still requiring an object.
    const { body } = await getText(url, {
      timeoutMs: config.sourceTimeoutMs,
      headers: { referer: 'https://www.kugou.com/', 'user-agent': UA },
      accept: 'application/json, text/plain, */*',
      maxBytes: 64 * 1024,
    });
    const text = body.toString('utf8').trim();
    let payload: any;
    try {
      payload = text.startsWith('{') ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!payload || payload.errcode !== 0) {
      throw new MusicError('no_media_source', 'kugou');
    }
    const primary = typeof payload.url === 'string' ? payload.url.trim() : '';
    const backup = Array.isArray(payload.backup_url)
      ? payload.backup_url.find((value) => typeof value === 'string' && value.trim())
      : '';
    const mediaUrl = primary || (backup ? backup.trim() : '');
    if (!/^https?:\/\//i.test(mediaUrl) || mediaUrl.length > 2048 || /[<>]/.test(mediaUrl)) {
      throw new MusicError('no_media_source', 'kugou');
    }
    return {
      url: mediaUrl,
      headers: { referer: 'https://www.kugou.com/', 'user-agent': UA },
    };
  },
};

export default kugou;