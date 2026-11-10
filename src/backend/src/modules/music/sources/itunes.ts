import { getJson } from './http';
import { MusicError } from '../music-error';
import { MusicConfig } from '../music.config';
import { MediaSource, MusicSource, SourceTrack } from './types';

/**
 * Apple iTunes Search: official public API, no key. Returns 30s preview
 * clips (m4a), not full tracks — marked full=false so they rank last.
 * The cn storefront has no music store; default storefronts are hk,us.
 *
 * Duration is deliberately not reported: trackTimeMillis is the full-track
 * length while only 30s is playable, and a wrong duration draws a wrong
 * progress bar.
 */
const itunes: MusicSource = {
  name: 'itunes',
  display: 'Apple iTunes',
  region: 'intl',
  kind: 'official',
  requiresAuth: false,
  full: false,
  note: '官方公开接口，仅 30 秒试听',

  async search(query, limit, config: MusicConfig): Promise<SourceTrack[]> {
    const storefronts = config.itunesCountries.length
      ? config.itunesCountries.slice(0, 4)
      : ['hk', 'us'];
    const results = await Promise.allSettled(
      storefronts.map((country) => {
        const url = `${config.itunesBase}/search`
          + `?term=${encodeURIComponent(query)}&media=music&entity=song`
          + `&limit=${limit}&country=${encodeURIComponent(country)}`;
        return getJson(url, { timeoutMs: config.sourceTimeoutMs });
      }),
    );

    const seen = new Set<string>();
    const rows: SourceTrack[] = [];
    for (const settled of results) {
      if (settled.status !== 'fulfilled') continue;
      const list = Array.isArray(settled.value?.results) ? settled.value.results : [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        if (item.kind && item.kind !== 'song') continue;
        const preview = typeof item.previewUrl === 'string' ? item.previewUrl : '';
        // Scheme check only; the real SSRF guard runs in upstream.ts.
        if (!/^https?:\/\//i.test(preview)) continue;
        const title = typeof item.trackName === 'string' ? item.trackName.trim() : '';
        if (!title) continue;
        const artist = typeof item.artistName === 'string' ? item.artistName.trim() : '';
        const key = `${title}|${artist}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ id: String(item.trackId || preview), title, artist, preview });
        if (rows.length >= limit) return rows;
      }
    }
    return rows;
  },

  async getMedia(item: SourceTrack): Promise<MediaSource> {
    const url = typeof item?.preview === 'string' ? item.preview : '';
    if (!/^https?:\/\//i.test(url)) {
      throw new MusicError('no_media_source', 'itunes');
    }
    return { url };
  },
};

export default itunes;