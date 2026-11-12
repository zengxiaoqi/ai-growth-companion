import { useCallback, useMemo, useRef, useState } from 'react';
import api from '@/services/api';
import { getAudioVolume } from '@/lib/app-settings';

/**
 * Hook for TTS voice playback in game components.
 *
 * Exposes isPlaying state so callers can wait for audio to finish. `speak`
 * strips markdown/emoji before talking, plays the backend TTS stream and
 * falls back to the browser's SpeechSynthesis API when the stream cannot be
 * played. `enabled` / `toggle` are additive — the original
 * `{ speak, stop, isPlaying }` contract is unchanged.
 */

/** Backend also sanitizes; this is the client-side guard so nothing is read aloud. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    .replace(/[#*`_~>|]/g, '')
    .replace(/\r?\n+/g, '。')
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu,
      '',
    )
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * jsdom implements neither HTMLMediaElement.play nor the Web Speech API.
 * Trying to call them only produces "Not implemented" noise and can leave
 * isPlaying stuck at true, so tests silently no-op here.
 */
function isSilentEnvironment(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /jsdom/i.test(ua) || typeof Audio === 'undefined';
}

export function useGameVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [enabled, setEnabled] = useState(true);
  // Read synchronously inside speak so its callback identity stays stable.
  const enabledRef = useRef(true);
  enabledRef.current = enabled;

  const clearAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        /* ignore: a torn-down media element must never break a game */
      }
      audioRef.current = null;
    }
  }, []);

  const clearSpeech = useCallback(() => {
    utteranceRef.current = null;
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fallbackToBrowserSpeech = useCallback((plainText: string) => {
    try {
      if (
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        setIsPlaying(false);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      utterance.pitch = 1.15;
      utterance.onend = () => {
        setIsPlaying(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        utteranceRef.current = null;
      };
      utteranceRef.current = utterance;
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsPlaying(false);
      utteranceRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!text) return;
      // Fully stop and release any previous playback to prevent overlap.
      clearAudio();
      clearSpeech();

      if (!enabledRef.current || isSilentEnvironment()) {
        setIsPlaying(false);
        return;
      }

      const plainText = sanitizeForSpeech(text);
      if (!plainText) {
        setIsPlaying(false);
        return;
      }

      // Called both on media errors and on a rejected play() promise.
      const onFailure = () => {
        clearAudio();
        fallbackToBrowserSpeech(plainText);
      };

      try {
        const audio = new Audio();
        audio.volume = getAudioVolume();
        const src = api.getTTSUrl(plainText);
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
        };
        audio.onerror = onFailure;
        audio.src = src;
        audioRef.current = audio;
        setIsPlaying(true);
        const result = audio.play();
        // jsdom (and some embedded webviews) return undefined from play().
        if (result && typeof result.catch === 'function') {
          result.catch(onFailure);
        } else {
          onFailure();
        }
      } catch {
        onFailure();
      }
    },
    [clearAudio, clearSpeech, fallbackToBrowserSpeech],
  );

  const stop = useCallback(() => {
    clearAudio();
    clearSpeech();
    setIsPlaying(false);
  }, [clearAudio, clearSpeech]);

  const toggle = useCallback(() => {
    setEnabled((value) => !value);
  }, []);

  return useMemo(
    () => ({ speak, stop, isPlaying, enabled, toggle }),
    [speak, stop, isPlaying, enabled, toggle],
  );
}
