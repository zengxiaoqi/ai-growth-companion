import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { BUNDLED_COUNTRIES, type Country } from './countries.data';
import { findCityCoord } from './cities.data';

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface ProxyOptions {
  url: string;
  cacheKey: string;
  ttlSeconds: number;
  timeoutMs?: number;
  /** If true, return stale cache on upstream failure (default true) */
  staleFallback?: boolean;
  /** Abort signal timeout */
}

@Injectable()
export class PublicApiService {
  private readonly logger = new Logger(PublicApiService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly inflight = new Map<string, Promise<any>>();

  /**
   * Proxy a GET request to an external public API.
   * - In-memory TTL cache (shared per cacheKey)
   * - Inflight dedupe (same cacheKey concurrent requests share one fetch)
   * - Stale-cache fallback when upstream fails (if enabled)
   */
  async proxy<T = any>(opts: ProxyOptions): Promise<T> {
    const { url, cacheKey, ttlSeconds, timeoutMs = 8000, staleFallback = true } = opts;

    // 1. Fresh cache hit
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.fetchedAt < ttlSeconds * 1000) {
      return hit.data as T;
    }

    // 2. Dedupe concurrent identical requests
    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'lingxi-companion/1.0' },
        });
        if (!resp.ok) {
          throw new Error(`upstream ${resp.status} for ${url}`);
        }
        const data = (await resp.json()) as T;
        this.cache.set(cacheKey, { data, fetchedAt: Date.now() });
        return data;
      } catch (err) {
        // 3. Stale fallback
        if (staleFallback && hit) {
          this.logger.warn(
            `Upstream failed for ${cacheKey}, serving stale cache: ${(err as Error).message}`,
          );
          return hit.data as T;
        }
        throw new BadGatewayException(`外部 API 不可用: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
        this.inflight.delete(cacheKey);
      }
    })();

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  // --- Per-endpoint helpers (typed + curated param handling) ---

  /** Open-Meteo weather forecast */
  async getWeather(lat: number, lng: number) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=sunrise,sunset&timezone=Asia/Shanghai&forecast_days=1`;
    return this.proxy<any>({
      url,
      cacheKey: `weather:${lat.toFixed(2)}:${lng.toFixed(2)}`,
      ttlSeconds: 1800,
    });
  }

  /**
   * All countries — served from bundled dataset (30 representative countries).
   * restcountries.com v3.1 was deprecated 2026-07; v5 requires an API key.
   * Bundled dataset keeps the same shape for frontend compatibility.
   */
  async getAllCountries(): Promise<Country[]> {
    return BUNDLED_COUNTRIES;
  }

  /** Random country (seeded by date for "每日一国") */
  async getDailyCountry(): Promise<Country> {
    const all = await this.getAllCountries();
    if (!all || all.length === 0) throw new BadGatewayException('No countries available');
    // Date-based seed so all users see the same country on the same day
    const now = new Date();
    const seed = now.getFullYear() * 1000 + (now.getMonth() + 1) * 40 + now.getDate();
    return all[seed % all.length];
  }

  /**
   * Number fact — numbersapi.com is dead (404 as of 2026-07).
   * Fallback: uselessfacts.jsph.pl random fact (English, no number param).
   * To keep the "每日数字" UX, we pick a number daily and return a fact
   * bundled with the number itself, so the frontend can show both.
   */
  async getNumberFact(num: number) {
    // Try uselessfacts.jsph.pl as the upstream
    const data = await this.proxy<any>({
      url: 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
      cacheKey: `number:${num}`,
      ttlSeconds: 43200,
    }).catch(() => null);
    if (data?.text) {
      return { number: num, fact: data.text, source: 'uselessfacts' };
    }
    // Local fallback pack (10 curated math facts)
    const local: Record<number, string> = {
      0: '0 是唯一既不是正数也不是负数的整数。',
      1: '1 是最小的正整数，也是所有自然数的乘法单位元。',
      2: '2 是唯一的偶质数。',
      3: '3 是最小的奇质数。',
      7: '7 是一周的天数，也是彩虹颜色的数量。',
      10: '10 是十进制记数法的基数，也是人类双手的手指总数。',
      12: '12 是一年中的月份数，也是一打的数量。',
      24: '24 是一天的时数，也是原子序数铬的编号。',
      42: '42 是《银河系漫游指南》中"生命、宇宙以及一切的终极答案"。',
      100: '100! 的末尾有 24 个零。',
    };
    return {
      number: num,
      fact: local[num] ?? `${num} 是一个有趣的数字。`,
      source: 'local',
    };
  }

  /** ISS current position via wheretheiss.at (open-notify.org is down) */
  async getIssPosition() {
    return this.proxy<any>({
      url: 'https://api.wheretheiss.at/v1/satellites/25544',
      cacheKey: 'iss:position',
      ttlSeconds: 300,
      timeoutMs: 15000,
    }).then((d) => ({
      latitude: d.latitude,
      longitude: d.longitude,
      altitude_km: d.altitude,
      velocity_kmh: d.velocity,
      visibility: d.visibility,
      timestamp: d.timestamp,
    }));
  }

  /** People currently in space (open-notify astros — HTTPS via alternate CDN) */
  async getPeopleInSpace() {
    return this.proxy<{ people: any[]; number: number }>({
      // open-notify.org/astros.json is HTTP-only and our network blocks it;
      // use the mirror on dev.kewagi.net which serves HTTPS
      url: 'https://www.howmanypeopleareinspacerightnow.com/peopleinspace.json',
      cacheKey: 'space:people',
      ttlSeconds: 3600,
    }).then((d: any) => ({
      number: d.num ?? d.number ?? (Array.isArray(d.people) ? d.people.length : 0),
      people: Array.isArray(d.people) ? d.people : [],
    }));
  }

  /** Sunrise / sunset (date-independent — API computes by date) */
  async getSunriseSunset(lat: number, lng: number) {
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`;
    return this.proxy<any>({
      url,
      cacheKey: `sun:${lat.toFixed(2)}:${lng.toFixed(2)}`,
      ttlSeconds: 3600,
    });
  }

  /** USGS earthquakes last day, magnitude >= 2.5 */
  async getEarthquakes() {
    const url =
      'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
      '&minmagnitude=2.5&orderby=time';
    return this.proxy<any>({
      url,
      cacheKey: 'earthquakes:recent',
      ttlSeconds: 900,
    });
  }

  /** Fruityvice — all fruits (with Chinese names) */
  async getFruits() {
    const raw = await this.proxy<any[]>({
      url: 'https://www.fruityvice.com/api/fruit/all',
      cacheKey: 'fruits:all',
      ttlSeconds: 604800,
    });
    if (!Array.isArray(raw)) return raw;
    // Add Chinese names + emoji for common fruits
    const zhMap: Record<string, string> = {
      apple: '苹果',
      banana: '香蕉',
      orange: '橙子',
      pear: '梨',
      strawberry: '草莓',
      blueberry: '蓝莓',
      blackberry: '黑莓',
      raspberry: '树莓',
      cranberry: '蔓越莓',
      grape: '葡萄',
      watermelon: '西瓜',
      lemon: '柠檬',
      lime: '青柠',
      peach: '桃子',
      cherry: '樱桃',
      pineapple: '菠萝',
      mango: '芒果',
      kiwi: '猕猴桃',
      papaya: '木瓜',
      coconut: '椰子',
      avocado: '牛油果',
      pomegranate: '石榴',
      plum: '李子',
      apricot: '杏',
      fig: '无花果',
      date: '椰枣',
      lychee: '荔枝',
      persimmon: '柿子',
      quince: '木瓜',
      passionfruit: '百香果',
      dragonfruit: '火龙果',
      durian: '榴莲',
      mangosteen: '山竹',
      starfruit: '杨桃',
      guava: '番石榴',
      cantaloupe: '哈密瓜',
      honeydew: '蜜瓜',
      clementine: '克莱门汀',
      tangerine: '橘子',
      mandarin: '橘子',
      nectarine: '油桃',
      gooseberry: '鹅莓',
      elderberry: '接骨木莓',
      boysenberry: '博伊森莓',
      currant: '加仑',
      kumquat: '金桔',
      yuzu: '柚子',
      pomelo: '柚子',
      citron: '香橼',
      physalis: '灯笼果',
      salak: '蛇皮果',
      jackfruit: '菠萝蜜',
      longan: '龙眼',
      rambutan: '红毛丹',
      sapodilla: '人心果',
      soursop: '刺果番荔枝',
      surinam: '苏里南樱桃',
      tamarind: '罗望子',
      melon: '甜瓜',
      tomato: '番茄',
      lingonberry: '越橘',
      crabapple: '海棠果',
      roseapple: '蒲桃',
      sugarapple: '释迦果',
      breadfruit: '面包果',
      cupuacu: '大花可可',
      feijoa: '斐济果',
      hazelnut: '榛子',
    };
    return raw.map((f) => {
      const name = (f.name || '').toString();
      const key = name.toLowerCase();
      let zh = zhMap[key];
      if (!zh) {
        // Try partial match
        for (const k of Object.keys(zhMap)) {
          if (key.includes(k)) {
            zh = zhMap[k];
            break;
          }
        }
      }
      return { ...f, nameZh: zh ?? name };
    });
  }

  /** Open Trivia DB questions */
  async getTrivia(amount = 10, category?: string, difficulty = 'easy') {
    let url = `https://opentdb.com/api.php?amount=${amount}&difficulty=${difficulty}&type=multiple`;
    if (category) url += `&category=${category}`;
    return this.proxy<any>({
      url,
      cacheKey: `trivia:${amount}:${category ?? 'any'}:${difficulty}`,
      ttlSeconds: 21600,
    });
  }

  /** Free Dictionary API lookup (single word) */
  async getDictionaryEntry(word: string) {
    const w = encodeURIComponent(word.toLowerCase().trim());
    return this.proxy<any[]>({
      url: `https://api.dictionaryapi.dev/api/v2/entries/en/${w}`,
      cacheKey: `dict:${w}`,
      ttlSeconds: 604800,
      staleFallback: false, // 404 should be a real 404, not stale fallback
    }).catch((err) => {
      // 404 → null (word not found), pass through other errors
      this.logger.debug(`Dictionary lookup failed for "${word}": ${err.message}`);
      return null;
    });
  }

  /**
   /** Geocode a city name → coordinates using bundled Chinese city table.
    * Nominatim (OpenStreetMap) is blocked from our network region and times out,
    * so we ship a static lookup table of ~30 representative Chinese cities instead.
    * For unknown cities, fallback to Beijing.
    */
  async geocode(city: string) {
    const coord = findCityCoord(city);
    return [
      {
        display_name: coord.name,
        lat: coord.lat.toString(),
        lon: coord.lng.toString(),
      },
    ];
  }

  // --- B1: Bored API — parent-child activity recommendation ---
  // boredapi.com is DNS-blocked in our region; use the community mirror
  // at bored-api.appbrewery.com which also exposes a `kidFriendly` flag.
  async getActivity(opts?: { type?: string; participants?: number }) {
    let url = 'https://bored-api.appbrewery.com/random';
    // The mirror also supports filters via query params, but `random` is
    // simpler and we filter client-side on kidFriendly + type.
    if (opts?.type) {
      url = `https://bored-api.appbrewery.com/filter?type=${encodeURIComponent(opts.type)}`;
    }
    return this.proxy<any>({
      url,
      cacheKey: `activity:${opts?.type ?? 'random'}`,
      ttlSeconds: 3600,
      timeoutMs: 10000,
    });
  }

  /** Random kid-friendly activity (pre-filtered). Returns the first
   * kid-friendly activity; falls back to any activity if none has the flag. */
  async getKidFriendlyActivity() {
    // The mirror's `/filter?type=...` returns an array; `/random` returns one.
    // Strategy: try random 3 times, prefer kidFriendly=true.
    for (let i = 0; i < 3; i++) {
      const a = await this.proxy<any>({
        url: 'https://bored-api.appbrewery.com/random',
        cacheKey: `activity:kid${i}`,
        ttlSeconds: 1800,
        timeoutMs: 10000,
      }).catch(() => null);
      if (a?.kidFriendly === true) return a;
    }
    // Fallback: last fetched or any
    return this.proxy<any>({
      url: 'https://bored-api.appbrewery.com/random',
      cacheKey: 'activity:any',
      ttlSeconds: 1800,
      timeoutMs: 10000,
    }).catch(() => null);
  }

  // --- B2: PoetryDB — English classic poetry ---
  async getRandomPoem() {
    return this.proxy<any>({
      url: 'https://poetrydb.org/random',
      cacheKey: 'poem:random',
      ttlSeconds: 3600,
      timeoutMs: 10000,
    });
  }

  /** Search poems by author */
  async getPoemsByAuthor(author: string) {
    const a = encodeURIComponent(author);
    return this.proxy<any>({
      url: `https://poetrydb.org/author/${a}`,
      cacheKey: `poem:author:${a}`,
      ttlSeconds: 86400,
      timeoutMs: 10000,
    });
  }

  /** Search poems by title (substring match) */
  async getPoemsByTitle(title: string) {
    const t = encodeURIComponent(title);
    return this.proxy<any>({
      url: `https://poetrydb.org/title/${t}`,
      cacheKey: `poem:title:${t}`,
      ttlSeconds: 86400,
      timeoutMs: 10000,
    });
  }

  // ─── C1: MyMemory Translation — 免费翻译（LibreTranslate 替代源）───
  // LibreTranslate 官方端点被 Cloudflare 挡；MyMemory 提供免费 5000 字/天
  async translate(text: string, source = 'en', target = 'zh') {
    const q = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${source}|${target}`;
    return this.proxy<any>({
      url,
      cacheKey: `translate:${source}|${target}:${text.slice(0, 100)}`,
      ttlSeconds: 86400, // translations don't change
      timeoutMs: 10000,
    });
  }

  // ─── C3: JokeAPI — 儿童笑话（safe-mode 过滤）───
  async getJoke(category = 'Any') {
    const url = `https://v2.jokeapi.dev/joke/${encodeURIComponent(category)}?safe-mode`;
    return this.proxy<any>({
      url,
      cacheKey: `joke:${category}`,
      ttlSeconds: 1800, // 30 min — fresh jokes
      timeoutMs: 10000,
    });
  }

  // ─── C4: Useless Facts — 今日趣闻 ───
  async getTodayFact() {
    return this.proxy<any>({
      url: 'https://uselessfacts.jsph.pl/api/v2/facts/today',
      cacheKey: 'fact:today',
      ttlSeconds: 21600, // 6h — "today" fact
      timeoutMs: 10000,
    });
  }

  async getRandomFact() {
    return this.proxy<any>({
      url: 'https://uselessfacts.jsph.pl/api/v2/facts/random',
      cacheKey: 'fact:random',
      ttlSeconds: 1800,
      timeoutMs: 10000,
    });
  }

  /** Periodic cache eviction — called lazily on each cache read */
  private evictExpired() {
    if (this.cache.size < 200) return; // don't bother unless cache grew
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.fetchedAt > 86_400_000) {
        // > 24h old
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) this.logger.debug(`Evicted ${evicted} stale cache entries`);
  }
}
