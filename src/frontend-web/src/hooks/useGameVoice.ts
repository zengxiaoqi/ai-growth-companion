import { useRef, useCallback, useState } from 'react';
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
    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
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

    const audio = new Audio(api.getTTSUrl(plainText));
    audio.volume = getAudioVolume();
    audioRef.current = audio;
    setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
    audio.play().catch(() => {
      setIsPlaying(false);
      audioRef.current = null;
    });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { speak, stop, isPlaying };
}
