import { ConfigService } from '@nestjs/config';

export interface MusicConfig {
  sources: string[];
  sourceFetchCount: number;
  sourceTimeoutMs: number;
  searchTimeoutMs: number;
  trackCandidates: number;
  preferFull: boolean;
  maxTrackSeconds: number;
  requireTitleMatch: boolean;
  itunesCountries: string[];
  itunesBase: string;
  audiusHost: string;
  audiusAppName: string;
  neteaseBase: string;
  kuwoSearchBase: string;
  kuwoMediaBase: string;
  kugouSearchBase: string;
  kugouMediaBase: string;
  upstreamTimeoutMs: number;
  maxBytes: number;
  tokenTtlMs: number;
  tokenMaxUses: number;
  allowHttpUpstream: boolean;
  allowPrivateUpstream: boolean;
}

function str(config: ConfigService, name: string, fallback: string): string {
  const raw = config.get<string>(name);
  return raw === undefined || raw === '' ? fallback : String(raw).trim();
}

function int(
  config: ConfigService,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function bool(config: ConfigService, name: string, fallback: boolean): boolean {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function trimUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function loadMusicConfig(config: ConfigService): MusicConfig {
  const searchTimeoutMs = int(config, 'MUSIC_SEARCH_TIMEOUT_MS', 5000, 500, 10000);
  const countries = str(config, 'MUSIC_ITUNES_COUNTRIES', 'hk,us')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((code) => /^[a-z]{2}$/.test(code));

  return {
    // Empty whitelist = feature off. No external source is enabled implicitly.
    sources: [
      ...new Set(
        str(config, 'MUSIC_SOURCES', '')
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    sourceFetchCount: int(config, 'MUSIC_SOURCE_FETCH_COUNT', 10, 1, 30),
    sourceTimeoutMs: int(
      config,
      'MUSIC_SOURCE_TIMEOUT_MS',
      Math.max(searchTimeoutMs, 4000),
      500,
      10000,
    ),
    searchTimeoutMs,
    trackCandidates: int(config, 'MUSIC_TRACK_CANDIDATES', 3, 1, 5),
    preferFull: bool(config, 'MUSIC_PREFER_FULL', true),
    // "10 hour loop" videos exceed any sane download cap; drop them at search time.
    maxTrackSeconds: int(config, 'MUSIC_MAX_TRACK_SECONDS', 1800, 60, 86400),
    requireTitleMatch: bool(config, 'MUSIC_REQUIRE_TITLE_MATCH', true),
    itunesCountries: [...new Set(countries)].slice(0, 4),
    itunesBase: trimUrl(str(config, 'MUSIC_ITUNES_BASE', 'https://itunes.apple.com')),
    audiusHost: trimUrl(str(config, 'MUSIC_AUDIUS_HOST', 'https://api.audius.co')),
    audiusAppName: str(config, 'MUSIC_AUDIUS_APP_NAME', 'lingxi-music'),
    neteaseBase: trimUrl(str(config, 'MUSIC_NETEASE_BASE', 'https://music.163.com')),
    // Kuwo's search API is http-only; that is the API itself, not the audio upstream.
    kuwoSearchBase: trimUrl(str(config, 'MUSIC_KUWO_SEARCH_BASE', 'http://search.kuwo.cn')),
    kuwoMediaBase: trimUrl(str(config, 'MUSIC_KUWO_MEDIA_BASE', 'http://antiserver.kuwo.cn')),
    kugouSearchBase: trimUrl(str(config, 'MUSIC_KUGOU_SEARCH_BASE', 'https://songsearch.kugou.com')),
    kugouMediaBase: trimUrl(str(config, 'MUSIC_KUGOU_MEDIA_BASE', 'https://m.kugou.com')),
    upstreamTimeoutMs: int(config, 'MUSIC_UPSTREAM_TIMEOUT_MS', 20000, 1000, 60000),
    maxBytes: int(config, 'MUSIC_MAX_BYTES', 20 * 1024 * 1024, 65536, 100 * 1024 * 1024),
    // Players re-request the same token on every seek, so the bridge's
    // 5min/3-use defaults are too tight here.
    tokenTtlMs: int(config, 'MUSIC_TOKEN_TTL_MS', 30 * 60 * 1000, 10000, 3600000),
    tokenMaxUses: int(config, 'MUSIC_TOKEN_MAX_USES', 20, 1, 100),
    allowHttpUpstream: bool(config, 'MUSIC_ALLOW_HTTP_UPSTREAM', false),
    allowPrivateUpstream: bool(config, 'MUSIC_ALLOW_PRIVATE_UPSTREAM', false),
  };
}