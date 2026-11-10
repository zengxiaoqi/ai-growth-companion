import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult, PatternNextItem } from '@/types';
import { normalizePatternNextData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

interface PatternNextGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

function entryText(entry: PatternNextItem): string {
  return entry.icon ? `${entry.icon} ${entry.label}` : entry.label;
}

/**
 * pattern_next — pattern-recognition activity type (plan B).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity. The sequence is shown with a "?"
 * placeholder; the child taps one of the answer options. The child may retry
 * after a wrong pick, but only a FIRST-TRY correct answer scores (identical
 * semantics on Web and Flutter).
 */
export default function PatternNextGame({ data, onComplete }: PatternNextGameProps) {
  const params = useMemo(() => normalizePatternNextData(data), [data]);
  const { sequence, options, answerIndex, prompt, passingScore, timeLimitSec } = params;

  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [wrongPick, setWrongPick] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const answer = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : null;

  const pick = (index: number) => {
    if (finished || completedRef.current || solved) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (index === answerIndex) {
      const firstTry = nextAttempts === 1;
      setSolved(true);
      setFeedback(firstTry ? '答对啦！' : '答对啦！（第一次就答对才能得分哦）');
      if (completedRef.current) return;
      completedRef.current = true;
      setFinalCorrect(firstTry ? 1 : 0);
      setFinished(true);
      onComplete(
        buildGameResult({
          correctAnswers: firstTry ? 1 : 0,
          totalQuestions: 1,
          startedAt: startedAt.current,
          interactionData: {
            activityType: 'pattern_next',
            engine: 'parameterized',
            passingScore,
            timeLimitSec,
            attempts: nextAttempts,
            firstTryCorrect: firstTry,
            pickedOptionId: options[index]?.id,
            sequenceLabels: sequence.map((item) => item.label),
          },
        }),
      );
      return;
    }

    setWrongPick(options[index]?.id ?? null);
    setFeedback('再想一想，规律是什么呢？');
  };

  if (sequence.length < 2 || options.length < 2 || !answer) {
    return <div className="p-4 text-on-surface-variant">暂无规律接龙题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={finalCorrect} total={1} />;
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '规律接龙'}</h3>
        <p className="text-sm text-on-surface-variant">
          {prompt || '找一找规律，下一个应该是什么呢？'}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          建议在 {timeLimitSec} 秒内完成{attempts > 0 ? ` · 已尝试 ${attempts} 次` : ''}
        </p>
      </div>

      <div
        className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3 flex flex-wrap items-center justify-center gap-2"
        aria-label="规律序列"
      >
        {sequence.map((item) => (
          <span
            key={item.id}
            className="min-h-[48px] px-4 py-2 rounded-2xl border-2 border-outline-variant/30 bg-surface-container text-on-surface text-base font-bold"
          >
            {entryText(item)}
          </span>
        ))}
        <span
          className="min-h-[48px] min-w-[64px] px-4 py-2 rounded-2xl border-2 border-dashed border-primary/60 text-primary text-lg font-bold flex items-center justify-center"
          aria-label="问号占位"
        >
          ？
        </span>
      </div>

      <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-3">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            aria-label={`选项 ${entryText(option)}`}
            onClick={() => pick(index)}
            className={cn(
              'min-h-[64px] px-3 py-2 rounded-2xl border-2 text-base font-bold transition-tactile',
              'bg-surface-container text-on-surface border-outline-variant/30',
              'hover:border-primary/60 active:translate-y-0.5',
              wrongPick === option.id && 'border-error/60 bg-error-container/40',
            )}
          >
            {entryText(option)}
          </button>
        ))}
      </div>

      {feedback ? (
        <p role="status" className="text-center text-sm font-bold text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
