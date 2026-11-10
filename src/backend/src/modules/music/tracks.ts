import * as crypto from 'crypto';
import { SourceTrack } from './sources/types';

export type TrackItem = SourceTrack & { __full?: boolean };

export interface TrackCandidate {
  provider: string;
  item: TrackItem;
  full: boolean;
  duration: number | null;
}

export interface TrackGroup {
  title: string;
  artist: string;
  duration_s: number | null;
  candidates: TrackCandidate[];
}

export interface PublicTrack {
  title: string;
  artist: string;
  url: string;
  duration_s: number | null;
}

const MAX_ENTRIES = 500;

/**
 * In-memory capability tokens. The real upstream URL and its anti-leech
 * headers never leave the process — clients only get /music/audio/<token>.
 * One token carries candidates from multiple sources for the same song;
 * the audio endpoint tries them in order.
 */
export class TokenRegistry {
  private readonly map = new Map<
    string,
    { candidates: TrackCandidate[]; uses: number; expires: number }
  >();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly maxUses: number,
  ) {
    this.timer = setInterval(() => this.sweep(), 30000);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  issue(candidates: TrackCandidate[]): string {
    const token = crypto.randomBytes(24).toString('base64url');
    this.map.set(token, { candidates, uses: 0, expires: Date.now() + this.ttlMs });
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    return token;
  }

  consume(token: string): { candidates: TrackCandidate[] } | null {
    const entry = this.map.get(token);
    if (!entry) return null;
    if (entry.expires <= Date.now()) {
      this.map.delete(token);
      return null;
    }
    entry.uses += 1;
    if (entry.uses >= this.maxUses) this.map.delete(token);
    return entry;
  }

  sweep(): void {
    const now = Date.now();
    for (const [token, entry] of this.map) {
      if (entry.expires <= now) this.map.delete(token);
    }
  }

  close(): void {
    clearInterval(this.timer);
  }
}

function cleanText(value: unknown, max: number): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, max);
  }
  if (typeof value !== 'string') return '';
  return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function toDuration(item: TrackItem): number | null {
  const value = item.duration;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 86400) {
    return Math.floor(value);
  }
  return null;
}

/** Letters+digits only; for deciding whether two rows are the same song. */
function normText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Containment either way counts as the same artist (Pinkfong ⊂ 碰碰狐PINKFONG). */
function artistCompatible(a: string, b: string): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 3 && long.includes(short);
}

/**
 * Second-pass merge: same normalized title + compatible artists. Sources
 * write the same song differently ("Twinkle, Twinkle, Little Star" vs
 * "Twinkle Twinkle Little Star"); strict title|artist matching would show
 * the child two entries and they might tap the 30s preview one.
 */
function mergeSimilar(groups: TrackGroup[]): TrackGroup[] {
  const byTitle = new Map<string, TrackGroup[]>();
  const merged: TrackGroup[] = [];
  for (const group of groups) {
    const key = normText(group.title);
    const bucket = key ? byTitle.get(key) : null;
    const target = bucket?.find((item) => artistCompatible(item.artist, group.artist));
    if (!target) {
      if (bucket) bucket.push(group);
      else if (key) byTitle.set(key, [group]);
      merged.push(group);
      continue;
    }
    for (const candidate of group.candidates) {
      if (!target.candidates.some((item) => item.provider === candidate.provider)) {
        target.candidates.push(candidate);
      }
    }
  }
  return merged;
}

/**
 * Conservative relevance filter: some platforms return loosely related
 * songs (search 两只老虎 → 宝贝宝贝). Tapping into a different song is worse
 * than no result, so drop rows whose title/artist shares no token with the
 * query. Prefer false positives over false negatives.
 */
function matchesQuery(title: string, artist: string, query: string): boolean {
  const q = normText(query);
  if (!q) return true;
  const haystack = `${normText(title)}|${normText(artist)}`;
  if (haystack.includes(q)) return true;
  const tokens = String(query).toLowerCase()
    .split(/[\s,，、/|&+]+/)
    .map(normText)
    .filter((token) => token.length >= 2);
  return tokens.some((token) => haystack.includes(token));
}

export interface GroupOptions {
  limit?: number;
  maxCandidates?: number;
  preferFull?: boolean;
  maxSeconds?: number;
  query?: string;
  requireMatch?: boolean;
}

/**
 * Group rows by title|artist, keeping up to maxCandidates distinct sources
 * per song (same-provider retries are pointless). preferFull sorts full
 * versions before 30s previews both within a song and across songs, and
 * truncation happens AFTER sorting so a late full version is not squeezed
 * out by an early preview.
 */
export function groupTracks(
  rows: Array<{ plugin: string; item: TrackItem }>,
  options: GroupOptions = {},
): TrackGroup[] {
  const {
    limit = 5,
    maxCandidates = 3,
    preferFull = false,
    maxSeconds = Infinity,
    query = '',
    requireMatch = false,
  } = options;
  const groups: TrackGroup[] = [];
  const byKey = new Map<string, TrackGroup>();
  for (const { plugin, item } of rows) {
    if (!item || typeof item !== 'object') continue;
    const title = cleanText(item.title, 200);
    if (!title) continue;
    const duration = toDuration(item);
    if (duration && duration > maxSeconds) continue;
    const artist = cleanText(item.artist, 200);
    if (requireMatch && !matchesQuery(title, artist, query)) continue;
    const key = `${title}|${artist}`.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { title, artist, duration_s: null, candidates: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    if (group.candidates.some((candidate) => candidate.provider === plugin)) continue;
    group.candidates.push({
      provider: plugin,
      item,
      // Only an explicit __full=false marks a preview (iTunes 30s clips).
      full: item.__full !== false,
      duration,
    });
  }

  const ordered = mergeSimilar(groups.filter((group) => group.candidates.length));
  for (const group of ordered) {
    if (preferFull) {
      // Stable sort: equal-fullness candidates keep their interleaved order.
      group.candidates.sort((a, b) => (b.full ? 1 : 0) - (a.full ? 1 : 0));
    }
    if (group.candidates.length > maxCandidates) {
      group.candidates = group.candidates.slice(0, maxCandidates);
    }
    const best = group.candidates.find((candidate) => candidate.duration);
    group.duration_s = best ? best.duration : null;
  }
  if (preferFull) {
    ordered.sort((a, b) => (hasFull(b) ? 1 : 0) - (hasFull(a) ? 1 : 0));
  }
  return ordered.slice(0, limit);
}

function hasFull(group: TrackGroup): boolean {
  return group.candidates.some((candidate) => candidate.full);
}

/** urlPrefix is relative to the API root, e.g. "/music/audio/". */
export function makeTracks(
  groups: TrackGroup[],
  registry: TokenRegistry,
  urlPrefix: string,
): PublicTrack[] {
  return groups.map((group) => {
    const token = registry.issue(group.candidates);
    return {
      title: group.title,
      artist: group.artist,
      url: `${urlPrefix}${token}`,
      duration_s: group.duration_s,
    };
  });
}