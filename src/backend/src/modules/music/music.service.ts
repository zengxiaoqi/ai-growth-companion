import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerResponse } from 'http';
import { loadMusicConfig, MusicConfig } from './music.config';
import { MusicError } from './music-error';
import { MusicSource } from './sources/types';
import { SOURCE_REGISTRY } from './sources';
import {
  groupTracks,
  makeTracks,
  PublicTrack,
  TokenRegistry,
  TrackItem,
} from './tracks';
import { streamWithFallback } from './upstream';

export interface MusicSearchResult {
  enabled: boolean;
  tracks: PublicTrack[];
}

@Injectable()
export class MusicService implements OnModuleDestroy {
  private readonly logger = new Logger('MusicService');
  private readonly config: MusicConfig;
  private readonly sources = new Map<string, MusicSource>();
  private readonly registry: TokenRegistry;

  constructor(configService: ConfigService) {
    this.config = loadMusicConfig(configService);
    // Unknown names are dropped loudly and the feature stays off when none
    // remain — a music config typo must not take down the whole backend.
    for (const name of this.config.sources) {
      const source = SOURCE_REGISTRY.get(name);
      if (source) this.sources.set(name, source);
      else this.logger.warn(`unknown music source dropped: ${name}`);
    }
    this.registry = new TokenRegistry(this.config.tokenTtlMs, this.config.tokenMaxUses);
    this.logger.log(
      this.sources.size
        ? `music sources: ${[...this.sources.keys()].join(', ')}`
        : 'music disabled (MUSIC_SOURCES empty or invalid)',
    );
  }

  get enabled(): boolean {
    return this.sources.size > 0;
  }

  async search(query: string, limit: number): Promise<MusicSearchResult> {
    if (!this.enabled || !query) return { enabled: this.enabled, tracks: [] };
    const rows = await this.searchAll(query, limit);
    const groups = groupTracks(rows, {
      limit,
      maxCandidates: this.config.trackCandidates,
      preferFull: this.config.preferFull,
      maxSeconds: this.config.maxTrackSeconds,
      query,
      requireMatch: this.config.requireTitleMatch,
    });
    return {
      enabled: true,
      tracks: makeTracks(groups, this.registry, '/music/audio/'),
    };
  }

  /**
   * Run all sources concurrently; a failing source is absent, not fatal.
   * Interleave rows round-robin so no single source fills the whole page
   * while each source keeps its own relevance order.
   */
  private async searchAll(
    query: string,
    limit: number,
  ): Promise<Array<{ plugin: string; item: TrackItem }>> {
    const jobs = [...this.sources.values()].map(async (source) => {
      try {
        const rows = await this.withTimeout(
          source.search(query, this.config.sourceFetchCount, this.config),
          this.config.searchTimeoutMs,
        );
        return rows.slice(0, limit).map((item) => ({
          plugin: source.name,
          item: { ...item, __full: source.full },
        }));
      } catch (error) {
        const code = error instanceof MusicError ? error.code : 'source_error';
        // Fixed code only — never log the query, titles, or upstream URLs.
        this.logger.warn(`search failed: source=${source.name} code=${code}`);
        return [];
      }
    });
    const groups = await Promise.all(jobs);
    const rows: Array<{ plugin: string; item: TrackItem }> = [];
    for (let index = 0; ; index += 1) {
      let taken = 0;
      for (const group of groups) {
        if (index < group.length) {
          rows.push(group[index]);
          taken += 1;
        }
      }
      if (taken === 0) return rows;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new MusicError('source_timeout')), ms);
      if (typeof timer.unref === 'function') timer.unref();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /** Token is the capability; an invalid/expired token is a plain 404. */
  async streamAudio(token: string, rangeHeader: string | undefined, res: ServerResponse): Promise<void> {
    const entry = this.registry.consume(token);
    if (!entry) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    await streamWithFallback(
      entry.candidates,
      (candidate) => {
        const source = this.sources.get(candidate.provider);
        if (!source) return Promise.reject(new MusicError('no_media_source', candidate.provider));
        return source.getMedia(candidate.item, this.config);
      },
      res,
      this.config,
      rangeHeader,
      (code, provider) => this.logger.warn(`audio failed: code=${code} source=${provider}`),
    );
  }

  onModuleDestroy(): void {
    this.registry.close();
  }
}