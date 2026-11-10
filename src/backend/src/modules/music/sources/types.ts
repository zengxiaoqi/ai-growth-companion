import { MusicConfig } from '../music.config';

export interface SourceTrack {
  id: string | number;
  title: string;
  artist: string;
  duration?: number;
  preview?: string;
  albumId?: string;
}

export interface MediaSource {
  url: string;
  headers?: Record<string, string>;
  userAgent?: string;
}

export interface MusicSource {
  name: string;
  display: string;
  region: 'cn' | 'intl';
  kind: 'official' | 'unofficial';
  requiresAuth: boolean;
  /** false = preview-only (iTunes 30s clips); full versions rank first. */
  full: boolean;
  note: string;
  search(query: string, limit: number, config: MusicConfig): Promise<SourceTrack[]>;
  getMedia(item: SourceTrack, config: MusicConfig): Promise<MediaSource>;
}