import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult, TapTargetRound } from '@/types';
import { normalizeTapTargetData } from '@/components/ai-chat/activity-normalizer';
import { useGameVoice } from '@/hooks/useGameVoice';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';
import {
  ChildGameShell,
  VisualTile,
  inferTone,
  visualFor,
} from './ChildGameUI';

interface TapTargetGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

function entryText(icon: string | undefined, label: string): string {
  return icon ? `${icon} ${label}` : label;
}

/**
 * tap_target — listen-and-tap activity type (plan B, Appendix H.1).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity. The prompt is spoken via TTS and
 * taps are LOCKED until the spoken prompt finishes (useGameVoice.isPlaying);
 * when TTS fails or is unavailable the text is shown immediately and taps
 * unlock (graceful degradation). A replay button re-speaks and re-locks.
 *
 * Semantics (identical on Web and Flutter): one judgement per round — the
 * child taps every correct target; touching a decoy fails the round, the
 * correct targets light up for 800ms and the board advances. Rounds without
 * a decoy tap score towards the result. NO per-round countdown (H.1).
 */
export default function TapTargetGame({ data, onComplete }: TapTargetGameProps) {
  const params = useMemo(() => normalizeTapTargetData(data), [data]);
  const { rounds, passingScore, timeLimitSec } = params;

  // NOTE: speak timing is asserted by tests — do NOT add extra narration here.
  // `enabled` / `toggle` are optional at runtime (tests mock only three keys).
  const voice = useGameVoice();
  const { speak, stop, isPlaying } = voice;
  const enabledOpt = voice.enabled;
  const toggleOpt = voice.toggle;

  const [index, setIndex] = useState(0);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Taps and clean-round verdicts live in refs so the final result is exact.
  const tapsRef = useRef(0);
  const roundResultsRef = useRef<Array<{ roundId: string; firstTry: boolean; taps: number }>>([]);

  const current: TapTargetRound | undefined = rounds[index];

  // Child-first presentation layer (no extra speech — see note above).
  const bannerFeedback = feedback
    ? { tone: inferTone(feedback), text: feedback }
    : null;
  const stepLabel = `第 ${index + 1} / ${rounds.length} 轮 · 建议在 ${timeLimitSec} 秒内完成`;

  // Speak the round prompt whenever the active round changes.
  useEffect(() => {
    if (finished || !current) return;
    speak(current.prompt);
    return () => {
      stop();
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [current?.id, finished, speak, stop, current]);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    const cleanRounds = roundResultsRef.current.filter((r) => r.firstTry).length;
    setFinalCorrect(cleanRounds);
    setFinished(true);
    onComplete(
      buildGameResult({
        correctAnswers: cleanRounds,
        totalQuestions: rounds.length,
        startedAt: startedAt.current,
        interactionData: {
          activityType: 'tap_target',
          engine: 'parameterized',
          passingScore,
          timeLimitSec,
          roundResults: roundResultsRef.current,
        },
      }),
    );
  };

  const advance = (record: { roundId: string; firstTry: boolean; taps: number }) => {
    roundResultsRef.current = [...roundResultsRef.current, record];
    if (index + 1 >= rounds.length) {
      finish();
      return;
    }
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      setIndex((prev) => Math.min(prev + 1, rounds.length - 1));
      setPickedIds([]);
      setWrongId(null);
      setRevealing(false);
      setFeedback(null);
      tapsRef.current = 0;
    }, 800);
  };

  const tap = (targetId: string) => {
    if (!current || finished || completedRef.current) return;
    // Taps are locked until the spoken prompt finishes (H.1); taps during the
    // reveal window are ignored as well.
    if (isPlaying || revealing) return;
    if (pickedIds.includes(targetId)) return;

    const nextTaps = tapsRef.current + 1;
    tapsRef.current = nextTaps;

    if (!current.correctIds.includes(targetId)) {
      // One judgement per round: a decoy tap fails the round; the correct
      // targets light up for 800ms and the board advances.
      setWrongId(targetId);
      setRevealing(true);
      setFeedback('再听一次指令哦，正确的是它们！');
      advance({ roundId: current.id, firstTry: false, taps: nextTaps });
      return;
    }

    const nextPicked = [...pickedIds, targetId];
    setPickedIds(nextPicked);
    if (nextPicked.length >= current.correctIds.length) {
      setFeedback('答对啦！');
      advance({ roundId: current.id, firstTry: true, taps: nextTaps });
    }
  };

  if (rounds.length < 1 || !current) {
    return <div className="p-4 text-on-surface-variant">暂无听指令题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={finalCorrect} total={rounds.length} />;
  }

  const locked = isPlaying || revealing;

  return (
    <ChildGameShell
      title={data.title || '听指令点一点'}
      mascot="👂"
      prompt={current.prompt}
      current={index}
      total={rounds.length}
      stepLabel={stepLabel}
      feedback={bannerFeedback}
      onReplay={() => !locked && speak(current.prompt)}
      speaking={Boolean(isPlaying)}
      muted={enabledOpt === false}
      onToggleMute={typeof toggleOpt === 'function' ? toggleOpt : undefined}
      showVoiceButton={false}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="再听一遍指令"
            onClick={() => !locked && speak(current.prompt)}
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/50',
              'bg-primary-container text-3xl text-on-primary-container shadow-tactile',
              'transition-tactile tactile-press active:scale-95',
              locked && 'animate-voice-pulse',
            )}
          >
            🔊
          </button>
        </div>

        <div
          className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-outline-variant/20 bg-white/70 p-3 min-[420px]:grid-cols-4"
          aria-label="可点选目标"
        >
          {current.targets.map((target) => {
            const picked = pickedIds.includes(target.id);
            const isWrong = wrongId === target.id;
            const isRevealed = revealing && current.correctIds.includes(target.id);
            const state = picked
              ? 'correct'
              : isWrong
                ? 'wrong'
                : isRevealed
                  ? 'revealed'
                  : locked && !isRevealed
                    ? 'dim'
                    : 'normal';
            return (
              <VisualTile
                key={target.id}
                visual={visualFor({ icon: target.icon, label: target.label })}
                label={target.label}
                ariaLabel={`目标 ${entryText(target.icon, target.label)}`}
                state={state}
                className={cn(
                  'w-full min-w-0',
                  isRevealed && 'border-primary ring-2 ring-primary/40',
                )}
                onClick={() => tap(target.id)}
              />
            );
          })}
        </div>

        {locked ? (
          <p className="text-center text-sm font-bold text-on-surface-variant">
            听完指令再点哦…
          </p>
        ) : null}
      </div>
    </ChildGameShell>
  );
}
