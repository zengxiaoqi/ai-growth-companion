/**
 * Ported from suinian music-bridge test/ranking.js: grouping, dedupe,
 * full-version-first ordering, relevance filtering — the "findable and
 * playable to the end" product baseline. Plus token registry lifecycle.
 */
import { groupTracks, makeTracks, TokenRegistry, TrackItem } from '../../src/modules/music/tracks';

function row(plugin: string, title: string, artist: string, extra: Partial<TrackItem> = {}) {
  return { plugin, item: { id: `${plugin}-${title}`, title, artist, ...extra } as TrackItem };
}

const base = { limit: 5, maxCandidates: 3, preferFull: true };

describe('groupTracks (ranking)', () => {
  it('merges same song across sources, full version first, duration from full', () => {
    const groups = groupTracks([
      row('itunes', '小星星', '儿歌多多', { duration: 30, __full: false }),
      row('kuwo', '小星星', '儿歌多多', { duration: 112 }),
    ], base);
    expect(groups).toHaveLength(1);
    expect(groups[0].candidates).toHaveLength(2);
    expect(groups[0].candidates[0].provider).toBe('kuwo');
    expect(groups[0].duration_s).toBe(112);
  });

  it('preview-only songs rank after full songs even when seen first', () => {
    const groups = groupTracks([
      row('itunes', 'Only Preview', 'x', { duration: 30, __full: false }),
      row('kuwo', 'Full Song', 'y', { duration: 200 }),
    ], base);
    expect(groups.map((g) => g.title)).toEqual(['Full Song', 'Only Preview']);
  });

  it('truncates after sorting: limit=1 keeps the full version', () => {
    const groups = groupTracks([
      row('itunes', 'Preview First', 'x', { duration: 30, __full: false }),
      row('kuwo', 'Full Later', 'y', { duration: 200 }),
    ], { ...base, limit: 1 });
    expect(groups.map((g) => g.title)).toEqual(['Full Later']);
  });

  it('preferFull=false keeps original interleaved order', () => {
    const groups = groupTracks([
      row('itunes', 'A', 'x', { duration: 30, __full: false }),
      row('kuwo', 'A', 'x', { duration: 200 }),
      row('netease', 'B', 'y', { duration: 90 }),
    ], { ...base, preferFull: false });
    expect(groups.map((g) => g.title)).toEqual(['A', 'B']);
    expect(groups[0].candidates[0].provider).toBe('itunes');
    expect(groups[0].duration_s).toBe(30);
  });

  it('same-provider duplicates do not take candidate slots', () => {
    const groups = groupTracks([
      row('kuwo', 'A', 'x', { duration: 100 }),
      row('kuwo', 'A', 'x', { duration: 101 }),
    ], base);
    expect(groups[0].candidates).toHaveLength(1);
  });

  it('candidate cap keeps full versions first', () => {
    const groups = groupTracks([
      row('itunes', 'A', 'x', { duration: 30, __full: false }),
      row('kuwo', 'A', 'x', { duration: 100 }),
      row('netease', 'A', 'x', { duration: 101 }),
    ], { ...base, maxCandidates: 2 });
    expect(groups[0].candidates).toHaveLength(2);
    expect(groups[0].candidates.map((c) => c.provider)).toEqual(['kuwo', 'netease']);
  });

  it('different artist or different title does not merge', () => {
    const groups = groupTracks([
      row('kuwo', '小星星', '儿歌多多', { duration: 100 }),
      row('kuwo', '小星星', '汪苏泷', { duration: 100 }),
      row('kuwo', '小星星 (Live)', '儿歌多多', { duration: 100 }),
    ], base);
    expect(groups).toHaveLength(3);
  });

  it('merges punctuation variants and contained artist names', () => {
    const groups = groupTracks([
      row('itunes', 'Twinkle, Twinkle, Little Star', 'Wee Sing', { duration: 30, __full: false }),
      row('kuwo', 'Twinkle Twinkle Little Star', 'Wee Sing', { duration: 122 }),
      row('kugou', 'Baby Shark', 'Pinkfong', { duration: 96 }),
      row('netease', 'Baby Shark', '碰碰狐PINKFONG', { duration: 98 }),
    ], base);
    const twinkle = groups.filter((g) => /twinkle/i.test(g.title));
    expect(twinkle).toHaveLength(1);
    expect(twinkle[0].candidates[0].provider).toBe('kuwo');
    const shark = groups.filter((g) => /baby shark/i.test(g.title));
    expect(shark).toHaveLength(1);
    expect(shark[0].candidates).toHaveLength(2);
    expect(shark[0].candidates[0].full).toBe(true);
  });

  it('same title with both artists empty merges strictly', () => {
    const groups = groupTracks([
      row('kuwo', '小星星', '', { duration: 100 }),
      row('kugou', '小星星', '', { duration: 100 }),
    ], base);
    expect(groups).toHaveLength(1);
    expect(groups[0].candidates).toHaveLength(2);
  });

  it('drops overlong entries at search time, keeps unknown durations', () => {
    const groups = groupTracks([
      row('bilibili', 'Twinkle Twinkle Little Star', 'x', { duration: 8489 }),
      row('kuwo', 'Twinkle Twinkle Little Star', 'y', { duration: 112 }),
      row('kugou', 'No Duration', 'z'),
    ], { ...base, maxSeconds: 1800 });
    expect(groups.map((g) => g.artist)).toEqual(['y', 'z']);
  });

  it('relevance filter drops unrelated rows', () => {
    const groups = groupTracks([
      row('netease', '两只老虎', '贝乐虎儿歌', { duration: 67 }),
      row('bilibili', '宝贝宝贝', '李昕融', { duration: 200 }),
      row('audius', '34.小星仔-v', 'Annie Lo', { duration: 231 }),
      row('kuwo', '小星星', '儿歌多多', { duration: 74 }),
    ], { ...base, query: '小星星', requireMatch: true });
    expect(groups.map((g) => g.title)).toEqual(['小星星']);
  });

  it('multi-word query matches whole string or any token', () => {
    const groups = groupTracks([
      row('kuwo', 'Twinkle Twinkle Little Star', '儿歌多多', { duration: 112 }),
      row('kuwo', 'Baby Shark', 'Pinkfong', { duration: 96 }),
      row('kuwo', 'Let It Go (English Version)', 'Idina Menzel', { duration: 224 }),
    ], { ...base, query: 'twinkle twinkle little star', requireMatch: true });
    expect(groups.map((g) => g.title)).toEqual(['Twinkle Twinkle Little Star']);
  });

  it('matches query against artist field too', () => {
    const groups = groupTracks([
      row('netease', 'Baby Shark', 'Pinkfong', { duration: 96 }),
      row('kuwo', '小星星', '儿歌多多', { duration: 74 }),
    ], { ...base, query: 'pinkfong', requireMatch: true });
    expect(groups.map((g) => g.artist)).toEqual(['Pinkfong']);
  });

  it('requireMatch=false trusts source ordering completely', () => {
    const groups = groupTracks([
      row('bilibili', '宝贝宝贝', '李昕融', { duration: 200 }),
    ], { ...base, query: '小星星', requireMatch: false });
    expect(groups).toHaveLength(1);
  });
});

describe('TokenRegistry', () => {
  it('issues consumable tokens and enforces maxUses', () => {
    const registry = new TokenRegistry(60000, 2);
    try {
      const groups = groupTracks([row('kuwo', 'A', 'x', { duration: 100 })], base);
      const [track] = makeTracks(groups, registry, '/music/audio/');
      expect(track.url).toMatch(/^\/music\/audio\/[\w-]+$/);
      const token = track.url.slice('/music/audio/'.length);
      expect(registry.consume(token)).not.toBeNull();
      expect(registry.consume(token)).not.toBeNull();
      expect(registry.consume(token)).toBeNull();
    } finally {
      registry.close();
    }
  });

  it('expires tokens after the TTL', async () => {
    const registry = new TokenRegistry(10, 5);
    try {
      const groups = groupTracks([row('kuwo', 'A', 'x')], base);
      const [track] = makeTracks(groups, registry, '/music/audio/');
      const token = track.url.slice('/music/audio/'.length);
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(registry.consume(token)).toBeNull();
    } finally {
      registry.close();
    }
  });

  it('unknown tokens are rejected', () => {
    const registry = new TokenRegistry(60000, 5);
    try {
      expect(registry.consume('no-such-token')).toBeNull();
    } finally {
      registry.close();
    }
  });

  it('caps entries at 500, evicting the oldest', () => {
    const registry = new TokenRegistry(60000, 5);
    try {
      const groups = groupTracks([row('kuwo', 'A', 'x')], base);
      const first = makeTracks(groups, registry, '/music/audio/')[0].url;
      for (let i = 0; i < 500; i += 1) {
        makeTracks(groupTracks([row('kuwo', `S${i}`, 'x')], base), registry, '/music/audio/');
      }
      expect(registry.consume(first.slice('/music/audio/'.length))).toBeNull();
    } finally {
      registry.close();
    }
  });
});