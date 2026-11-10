import { getJson } from './http';
import { MusicError } from '../music-error';
import { MusicConfig } from '../music.config';
import { MediaSource, MusicSource, SourceTrack } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PLAYABLE_FEE = new Set([0, 8]);

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Netease Cloud Music: public web search API + outer-url playback, no login
 * or signing. Only fee=0/8 (free) tracks resolve to audio; VIP tracks 404,
 * so they are filtered at search time. Unofficial API, personal use.
 */
const netease: MusicSource = {
  name: 'netease',
  display: '网易云音乐',
  region: 'cn',
  kind: 'unofficial',
  requiresAuth: false,
  full: true,
  note: '非官方网页接口，仅免费曲目可播',

  async search(query, limit, config: MusicConfig): Promise<SourceTrack[]> {
    const base = config.neteaseBase;
    const url = `${base}/api/search/get?s=${encodeURIComponent(query)}`
      + `&type=1&limit=${limit}&offset=0`;
    const payload = await getJson(url, {
      timeoutMs: config.sourceTimeoutMs,
      headers: { referer: `${base}/`, 'user-agent': UA },
    });
    const songs = Array.isArray(payload?.result?.songs) ? payload.result.songs : [];
    const rows: SourceTrack[] = [];
    for (const song of songs) {
      if (!song || typeof song !== 'object') continue;
      const id = Number(song.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (song.status !== undefined && song.status !== 0) continue;
      const fee = typeof song.fee === 'number' ? song.fee : 0;
      if (!PLAYABLE_FEE.has(fee)) continue;
      const title = cleanName(song.name);
      if (!title) continue;
      const artist = Array.isArray(song.artists)
        ? song.artists.map((item) => cleanName(item?.name)).filter(Boolean).join(' / ')
        : '';
      const seconds = typeof song.duration === 'number' ? Math.round(song.duration / 1000) : 0;
      rows.push({
        id,
        title,
        artist,
        duration: seconds > 0 && seconds < 86400 ? seconds : undefined,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },

  async getMedia(item: SourceTrack, config: MusicConfig): Promise<MediaSource> {
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new MusicError('no_media_source', 'netease');
    }
    const base = config.neteaseBase;
    return {
      url: `${base}/song/media/outer/url?id=${id}.mp3`,
      headers: { referer: `${base}/`, 'user-agent': UA },
    };
  },
};

export default netease;