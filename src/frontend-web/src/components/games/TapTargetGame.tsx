import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult, TapTargetRound } from '@/types';
import { normalizeTapTargetData } from '@/components/ai-chat/activity-normalizer';
import { useGameVoice } from '@/hooks/useGameVoice';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

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

  const { speak, stop, isPlaying } = useGameVoice();
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
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '听指令点一点'}</h3>
        <p className="text-sm text-on-surface-variant">
          {current.prompt}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          第 {index + 1} / {rounds.length} 轮 ·
          建议在 {timeLimitSec} 秒内完成
        </p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          aria-label="再听一遍指令"
          onClick={() => !locked && speak(current.prompt)}
          className="h-12 w-12 rounded-full border-2 border-primary/50 text-primary text-xl transition-tactile active:translate-y-0.5"
        >
          🔊
        </button>
      </div>

      <div
        className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3 grid grid-cols-2 min-[420px]:grid-cols-4 gap-3"
        aria-label="可点选目标"
      >
        {current.targets.map((target) => {
          const picked = pickedIds.includes(target.id);
          const isWrong = wrongId === target.id;
          const isRevealed = revealing && current.correctIds.includes(target.id);
          return (
            <button
              key={target.id}
              type="button"
              aria-label={`目标 ${entryText(target.icon, target.label)}`}
              onClick={() => tap(target.id)}
              className={cn(
                'min-h-[72px] px-3 py-2 rounded-2xl border-2 text-base font-bold transition-tactile',
                'bg-surface-container text-on-surface border-outline-variant/30',
                !locked && 'hover:border-primary/60 active:translate-y-0.5',
                picked && 'border-success/70 bg-success-container/40',
                isWrong && 'border-error/60 bg-error-container/40',
                isRevealed && 'border-primary/70 ring-2 ring-primary/40',
                locked && !isRevealed && 'opacity-70',
              )}
            >
              {entryText(target.icon, target.label)}
            </button>
          );
        })}
      </div>

      {locked ? (
        <p className="text-center text-xs text-on-surface-variant">听完指令再点哦…</p>
      ) : null}

      {feedback ? (
        <p role="status" className="text-center text-sm font-bold text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
