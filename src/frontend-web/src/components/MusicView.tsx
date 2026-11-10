import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Music, Pause, Play, Search, X } from '@/icons';
import { Button, EmptyState, IconButton, TopBar } from './ui';
import api from '../services/api';
import type { MusicTrack } from '@/types';
import { cn } from '../lib/utils';

interface MusicViewProps {
  onBack: () => void;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicView({ onBack }: MusicViewProps) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playError, setPlayError] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const search = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const result = await api.searchMusic(q);
      setTracks(result.tracks);
      if (!result.enabled) {
        setError('音乐功能暂未开启');
      } else if (result.tracks.length === 0) {
        setError('没有找到相关歌曲，换个关键词试试');
      }
    } catch {
      setError('搜索失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  const playTrack = (track: MusicTrack) => {
    audioRef.current?.pause();
    const audio = new Audio(api.getMusicAudioUrl(track.url));
    audioRef.current = audio;
    setCurrent(track);
    setPlayError(false);
    setPosition(0);
    setDuration(track.duration_s ?? 0);

    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => setPosition(audio.currentTime);
    audio.ondurationchange = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.onended = () => {
      setPlaying(false);
      setPosition(0);
    };
    audio.onerror = () => {
      setPlaying(false);
      setPlayError(true);
    };
    audio.play().catch(() => {
      setPlaying(false);
      setPlayError(true);
    });
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) {
      audio.pause();
    } else if (audio.ended || audio.currentTime === 0) {
      playTrack(current);
    } else {
      audio.play().catch(() => setPlayError(true));
    }
  };

  const stopAndClear = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setCurrent(null);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setPlayError(false);
  };

  const seek = (v: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = v;
    setPosition(v);
  };

  return (
    <div className="min-h-app pb-safe">
      <TopBar
        title="音乐乐园"
        subtitle="搜索儿歌，在线听歌"
        leftSlot={
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
      />

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 md:px-6">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索儿歌，比如：小星星"
              className="min-h-[48px] w-full rounded-full border border-outline-variant/25 bg-surface py-3 pl-11 pr-4 text-base text-on-surface outline-none focus:border-primary"
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()} aria-label="搜索">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          </Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<Music className="h-10 w-10" />}
            title={error}
            actionLabel={searched ? '重新搜索' : undefined}
            onAction={searched ? search : undefined}
          />
        ) : !searched ? (
          <EmptyState
            icon={<Music className="h-10 w-10" />}
            title="想听什么歌？"
            description="输入歌名，搜索喜欢的儿歌"
          />
        ) : (
          <ul className="space-y-2">
            {tracks.map((track, i) => {
              const isCurrent = current?.url === track.url;
              return (
                <li key={`${track.url}-${i}`}>
                  <button
                    onClick={() => (isCurrent ? togglePlay() : playTrack(track))}
                    className={cn(
                      'panel-card flex min-h-[56px] w-full items-center gap-3 p-3 text-left tactile-press',
                      isCurrent && 'bg-primary-container/40',
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
                      <Music className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-on-surface">
                        {track.title}
                      </span>
                      <span className="block truncate text-xs text-on-surface-variant">
                        {track.artist}
                      </span>
                    </span>
                    {track.duration_s ? (
                      <span className="shrink-0 text-xs text-on-surface-variant">
                        {fmt(track.duration_s)}
                      </span>
                    ) : null}
                    {isCurrent && playing ? (
                      <Pause className="h-8 w-8 shrink-0 text-primary" />
                    ) : (
                      <Play className="h-8 w-8 shrink-0 text-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {current && (
        <div className="sticky bottom-0 border-t border-outline-variant/25 bg-surface pb-safe shadow-tactile">
          <div className="mx-auto w-full max-w-3xl px-4 py-2 md:px-6">
            {playError && (
              <p className="pb-1 text-center text-xs font-semibold text-error">
                播放失败，换一首试试
              </p>
            )}
            <div className="flex items-center gap-2">
              <Music className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">
                {current.title} · {current.artist}
              </span>
              <IconButton aria-label={playing ? '暂停' : '播放'} onClick={togglePlay}>
                {playing ? (
                  <Pause className="h-7 w-7 text-primary" />
                ) : (
                  <Play className="h-7 w-7 text-primary" />
                )}
              </IconButton>
              <IconButton aria-label="停止播放" onClick={stopAndClear}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-9 text-right text-[11px] tabular-nums text-on-surface-variant">
                {fmt(position)}
              </span>
              <input
                type="range"
                aria-label="播放进度"
                min={0}
                max={duration > 0 ? duration : 1}
                step={0.5}
                value={Math.min(position, duration > 0 ? duration : 1)}
                onChange={(e) => seek(Number(e.target.value))}
                disabled={duration <= 0}
                className="h-2 flex-1 cursor-pointer accent-primary"
              />
              <span className="w-9 text-[11px] tabular-nums text-on-surface-variant">
                {fmt(duration)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}