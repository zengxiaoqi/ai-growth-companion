/**
 * TTS synchronization hook.
 * Preloads Edge-TTS audio, tracks duration, provides play/pause control.
 * Follows the useGameVoice pattern but adds preload and duration tracking.
 */
import { useRef, useState, useCallback } from 'react';
import api from '@/services/api';

export interface TTSSyncState {
  isLoaded: boolean;
  isPlaying: boolean;
  duration: number; // seconds
  error: string | null;
}

export interface TTSSyncControls {
  preload: (text: string, voice?: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export function useTTSSync(): TTSSyncState & TTSSyncControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const preload = useCallback((text: string, voice = 'zh-CN-XiaoxiaoNeural') => {
    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    setIsLoaded(false);
    setIsPlaying(false);
    setDuration(0);
    setError(null);

    if (!text.trim()) {
      setIsLoaded(true);
      return;
    }

    const plainText = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      .replace(/[#*`_~>|]/g, '')
      .replace(/\n+/g, '。')
      .trim()
      .slice(0, 500);

    if (!plainText) {
      setIsLoaded(true);
      return;
    }

    const audio = new Audio(api.getTTSUrl(plainText, voice));
    audio.preload = 'auto';

    audio.oncanplaythrough = () => setIsLoaded(true);
    audio.ondurationchange = () => setDuration(audio.duration || 0);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      setError('语音加载失败');
      setIsLoaded(true); // Allow playback to proceed without audio
    };

    audioRef.current = audio;
  }, []);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {
        // Autoplay blocked — audio will play on next user interaction
      });
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  return { isLoaded, isPlaying, duration, error, preload, play, pause, stop };
}
