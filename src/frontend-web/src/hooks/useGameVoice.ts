import { useRef, useCallback } from 'react';
import api from '@/services/api';

/**
 * Hook for TTS voice playback in game components.
 * Handles stripping markdown, stopping previous audio, and error handling.
 */
export function useGameVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    audioRef.current = audio;
    audio.onerror = () => { audioRef.current = null; };
    audio.play().catch(() => { audioRef.current = null; });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return { speak, stop };
}
