import { useCallback, useMemo, useRef, useState } from 'react';
import api from '@/services/api';
import { getAudioVolume } from '@/lib/app-settings';

/**
 * Hook for TTS voice playback in game components.
 * Handles stripping markdown, stopping previous audio, and error handling.
 * Exposes isPlaying state so callers can wait for audio to finish.
 */
export function useGameVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const speak = useCallback((text: string) => {
    if (!text) return;
    // Fully stop and release current audio to prevent overlap/noise
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }

    const plainText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*`_~>|]/g, '')
      .replace(/\n+/g, '。')
      .trim()
      .slice(0, 500);

    if (!plainText) return;

    const audio = new Audio();
    audio.volume = getAudioVolume();
    // Attach listeners before setting src to avoid race with cached audio
    const src = api.getTTSUrl(plainText);
    const onEnded = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    const onError = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.onended = onEnded;
    audio.onerror = onError;
    audio.src = src;
    audioRef.current = audio;
    setIsPlaying(true);
    audio.play().catch(() => {
      setIsPlaying(false);
      audioRef.current = null;
    });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return useMemo(() => ({ speak, stop, isPlaying }), [speak, stop, isPlaying]);
}
