export type WebSearchProviderName = 'tavily' | 'bocha' | 'searxng' | 'off';

export type WebSearchMode = 'auto' | 'on' | 'off';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Human-readable source, usually the result's site name or hostname. */
  site?: string;
  publishedAt?: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  timeoutMs?: number;
}

export interface CourseResearch {
  query: string;
  provider: WebSearchProviderName;
  results: WebSearchResult[];
}
