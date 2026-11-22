import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeWebSearchMode } from './web-search-intent';
import type {
  WebSearchMode,
  WebSearchOptions,
  WebSearchProviderName,
  WebSearchResult,
} from './web-search.types';

const DEFAULT_TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_BOCHA_ENDPOINT = 'https://api.bochaai.com/v1/web-search';
const CACHE_MAX_ENTRIES = 200;
const SNIPPET_MAX_LENGTH = 400;

interface CacheEntry {
  results: WebSearchResult[];
  fetchedAt: number;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  readonly provider: WebSearchProviderName;
  readonly courseMode: WebSearchMode;
  readonly isEnabled: boolean;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultMaxResults: number;
  private readonly defaultTimeoutMs: number;
  private readonly cacheTtlMs: number;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<WebSearchResult[]>>();

  constructor(private readonly configService: ConfigService) {
    const configured = String(this.configService.get<string>('WEB_SEARCH_PROVIDER', 'off') ?? '')
      .trim()
      .toLowerCase();
    this.provider = this.parseProvider(configured);
    this.apiKey = String(this.configService.get<string>('WEB_SEARCH_API_KEY', '') ?? '').trim();
    this.baseUrl = String(this.configService.get<string>('WEB_SEARCH_BASE_URL', '') ?? '').trim();
    this.defaultMaxResults = this.toInt(
      this.configService.get<string>('WEB_SEARCH_MAX_RESULTS', '5'),
      5,
      1,
      10,
    );
    this.defaultTimeoutMs = this.toInt(
      this.configService.get<string>('WEB_SEARCH_TIMEOUT_MS', '8000'),
      8000,
      1000,
      30000,
    );
    this.cacheTtlMs =
      this.toInt(this.configService.get<string>('WEB_SEARCH_CACHE_TTL_SECONDS', '600'), 600, 0, 86400) *
      1000;
    this.courseMode = normalizeWebSearchMode(
      this.configService.get<string>('WEB_SEARCH_COURSE_MODE', 'auto'),
      'auto',
    );

    const configuredCorrectly =
      this.provider === 'searxng'
        ? Boolean(this.baseUrl)
        : this.provider !== 'off' && Boolean(this.apiKey);
    this.isEnabled = configuredCorrectly;

    if (this.provider !== 'off' && !configuredCorrectly) {
      this.logger.warn(
        `Web search provider "${this.provider}" is missing ` +
          (this.provider === 'searxng' ? 'WEB_SEARCH_BASE_URL' : 'WEB_SEARCH_API_KEY') +
          '; web search stays disabled',
      );
    } else if (this.isEnabled) {
      this.logger.log(
        `Web search enabled: provider=${this.provider}, courseMode=${this.courseMode}`,
      );
    }
  }

  /** Search the public web. Throws when the provider is disabled or fails. */
  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    if (!this.isEnabled) {
      throw new Error('WEB_SEARCH_DISABLED: 未配置联网搜索服务');
    }

    const normalizedQuery = String(query ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!normalizedQuery) {
      throw new Error('WEB_SEARCH_EMPTY_QUERY');
    }

    const maxResults = this.clamp(options.maxResults ?? this.defaultMaxResults, 1, 10);
    const cacheKey = `${this.provider}:${maxResults}:${normalizedQuery}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.results;
    }

    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const task = this.runSearch(normalizedQuery, maxResults, options.timeoutMs)
      .then((results) => {
        this.remember(cacheKey, results);
        return results;
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, task);
    return task;
  }

  private async runSearch(
    query: string,
    maxResults: number,
    timeoutMs?: number,
  ): Promise<WebSearchResult[]> {
    const controller = new AbortController();
    const effectiveTimeout = this.clamp(timeoutMs ?? this.defaultTimeoutMs, 1000, 30000);
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      this.logger.debug(`web search [${this.provider}] q="${query}" max=${maxResults}`);
      if (this.provider === 'tavily') {
        return await this.searchTavily(query, maxResults, controller.signal);
      }
      if (this.provider === 'bocha') {
        return await this.searchBocha(query, maxResults, controller.signal);
      }
      if (this.provider === 'searxng') {
        return await this.searchSearxng(query, maxResults, controller.signal);
      }
      throw new Error('WEB_SEARCH_DISABLED');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`WEB_SEARCH_TIMEOUT: 联网搜索超时(${effectiveTimeout}ms)`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchTavily(
    query: string,
    maxResults: number,
    signal: AbortSignal,
  ): Promise<WebSearchResult[]> {
    const resp = await fetch(this.baseUrl || DEFAULT_TAVILY_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'lingxi-companion/1.0',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        topic: 'general',
      }),
    });
    const data = await this.readJson(resp, 'tavily');
    const rows = Array.isArray(data?.results) ? data.results : [];
    return this.finalize(
      rows.map((row: any) => ({
        title: this.cleanText(row?.title, 120),
        url: row?.url,
        snippet: this.cleanText(row?.content, SNIPPET_MAX_LENGTH),
        site: this.siteOf(row?.url),
        publishedAt: this.cleanText(row?.published_date, 32) || undefined,
      })),
      maxResults,
    );
  }

  private async searchBocha(
    query: string,
    maxResults: number,
    signal: AbortSignal,
  ): Promise<WebSearchResult[]> {
    const resp = await fetch(this.baseUrl || DEFAULT_BOCHA_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'lingxi-companion/1.0',
      },
      body: JSON.stringify({
        query,
        summary: true,
        count: maxResults,
        freshness: 'noLimit',
      }),
    });
    const data = await this.readJson(resp, 'bocha');
    const rows = Array.isArray(data?.data?.webPages?.value) ? data.data.webPages.value : [];
    return this.finalize(
      rows.map((row: any) => ({
        title: this.cleanText(row?.name, 120),
        url: row?.url,
        snippet: this.cleanText(row?.summary || row?.snippet, SNIPPET_MAX_LENGTH),
        site: this.cleanText(row?.siteName, 60) || this.siteOf(row?.url),
        publishedAt: this.cleanText(row?.datePublished, 32) || undefined,
      })),
      maxResults,
    );
  }

  private async searchSearxng(
    query: string,
    maxResults: number,
    signal: AbortSignal,
  ): Promise<WebSearchResult[]> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL('search', base);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'zh-CN');
    url.searchParams.set('safesearch', '2');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'lingxi-companion/1.0' },
    });
    const data = await this.readJson(resp, 'searxng');
    const rows = Array.isArray(data?.results) ? data.results : [];
    return this.finalize(
      rows.map((row: any) => ({
        title: this.cleanText(row?.title, 120),
        url: row?.url,
        snippet: this.cleanText(row?.content, SNIPPET_MAX_LENGTH),
        site: this.siteOf(row?.url),
        publishedAt: this.cleanText(row?.publishedDate, 32) || undefined,
      })),
      maxResults,
    );
  }

  private async readJson(resp: Response, provider: string): Promise<any> {
    if (!resp.ok) {
      throw new Error(`WEB_SEARCH_UPSTREAM: ${provider} returned HTTP ${resp.status}`);
    }
    try {
      return await resp.json();
    } catch {
      throw new Error(`WEB_SEARCH_UPSTREAM: ${provider} returned non-JSON body`);
    }
  }

  private finalize(rows: any[], maxResults: number): WebSearchResult[] {
    const seen = new Set<string>();
    const results: WebSearchResult[] = [];
    for (const row of rows) {
      const url = typeof row?.url === 'string' ? row.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) continue;
      if (!row.title || !row.snippet) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ ...row, url });
      if (results.length >= maxResults) break;
    }
    return results;
  }

  private remember(key: string, results: WebSearchResult[]): void {
    if (this.cacheTtlMs <= 0) return;
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { results, fetchedAt: Date.now() });
  }

  private cleanText(value: unknown, maxLength: number): string {
    return String(value ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(
        /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|blockquote)\b[^>]*>/gi,
        ' ',
      )
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  private siteOf(url: unknown): string | undefined {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  private parseProvider(value: string): WebSearchProviderName {
    if (value === 'tavily' || value === 'bocha' || value === 'searxng' || value === 'off') {
      return value;
    }
    if (value) {
      this.logger.warn(`Unknown WEB_SEARCH_PROVIDER "${value}", web search disabled`);
    }
    return 'off';
  }

  private toInt(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return this.clamp(Math.trunc(n), min, max);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
