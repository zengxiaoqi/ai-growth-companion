import { getJson } from './http';
import { MusicError } from '../music-error';
import { MusicConfig } from '../music.config';
import { MediaSource, MusicSource, SourceTrack } from './types';

const TRACK_ID_RE = /^[A-Za-z0-9]{1,32}$/;

/**
 * Audius: licensed streaming platform for independent artists, public API
 * without registration. Full tracks (not previews). Only streamable and
 * non-gated tracks are returned — a gated track would fail at play time.
 * Catalog is mostly Western independent music; CN children's song coverage
 * is thin, and responses often take 1-2s.
 */
const audius: MusicSource = {
  name: 'audius',
  display: 'Audius',
  region: 'intl',
  kind: 'official',
  requiresAuth: false,
  full: true,
  note: '独立音乐平台公开 API，完整曲目',

  async search(query, limit, config: MusicConfig): Promise<SourceTrack[]> {
    const url = `${config.audiusHost}/v1/tracks/search`
      + `?query=${encodeURIComponent(query)}&limit=${limit}`
      + `&app_name=${encodeURIComponent(config.audiusAppName)}`;
    const payload = await getJson(url, { timeoutMs: config.sourceTimeoutMs });
    const list = Array.isArray(payload?.data) ? payload.data : [];
    const rows: SourceTrack[] = [];
    for (const track of list) {
      if (!track || typeof track !== 'object') continue;
      if (track.is_delete === true) continue;
      if (track.is_streamable === false) continue;
      if (track.is_stream_gated === true) continue;
      const id = typeof track.id === 'string' ? track.id : '';
      if (!TRACK_ID_RE.test(id)) continue;
      const title = typeof track.title === 'string' ? track.title.trim() : '';
      if (!title) continue;
      const artist = typeof track.user?.name === 'string' ? track.user.name.trim() : '';
      const seconds = Number(track.duration);
      rows.push({
        id,
        title,
        artist,
        duration: Number.isFinite(seconds) && seconds > 0 && seconds < 86400
          ? Math.floor(seconds)
          : undefined,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },

  async getMedia(item: SourceTrack, config: MusicConfig): Promise<MediaSource> {
    const id = typeof item?.id === 'string' ? item.id : '';
    if (!TRACK_ID_RE.test(id)) {
      throw new MusicError('no_media_source', 'audius');
    }
    return {
      url: `${config.audiusHost}/v1/tracks/${encodeURIComponent(id)}/stream`
        + `?app_name=${encodeURIComponent(config.audiusAppName)}`,
    };
  },
};

export default audius;