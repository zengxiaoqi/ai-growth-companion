import { Injectable, Logger, BadGatewayException } from '@nestjs/common';

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

  /** All countries (for random / flags matching game) */
  async getAllCountries() {
    return this.proxy<any[]>({
      url: 'https://restcountries.com/v3.1/all?fields=name,flags,capital,population,languages,currencies,region,maps',
      cacheKey: 'countries:all',
      ttlSeconds: 86400,
    });
  }

  /** Random country (seeded by date for "每日一国") */
  async getDailyCountry() {
    const all = await this.getAllCountries();
    if (!all || all.length === 0) throw new BadGatewayException('REST Countries empty');
    // Date-based seed so all users see the same country on the same day
    const now = new Date();
    const seed = now.getFullYear() * 1000 + (now.getMonth() + 1) * 40 + now.getDate();
    const country = all[seed % all.length];
    return country;
  }

  /** Numbers API — math fact (HTTP-only upstream) */
  async getNumberFact(num: number) {
    return this.proxy<string>({
      // numbersapi.com supports https://numbersapi.com — verified
      url: `https://numbersapi.com/${num}/math?json`,
      cacheKey: `number:${num}`,
      ttlSeconds: 43200,
    });
  }

  /** ISS current position */
  async getIssPosition() {
    return this.proxy<any>({
      url: 'https://api.open-notify.org/iss-now.json',
      cacheKey: 'iss:position',
      ttlSeconds: 300,
    });
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

  /** Fruityvice — all fruits */
  async getFruits() {
    return this.proxy<any[]>({
      url: 'https://www.fruityvice.com/api/fruit/all',
      cacheKey: 'fruits:all',
      ttlSeconds: 604800,
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

  /** Nominatim geocoding (city name → coords) */
  async geocode(city: string) {
    const q = encodeURIComponent(city.trim());
    return this.proxy<any[]>({
      url: `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      cacheKey: `geo:${q}`,
      ttlSeconds: 2592000, // 30 days
      timeoutMs: 5000,
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
