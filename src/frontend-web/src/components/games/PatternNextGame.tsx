import { useMemo, useRef, useState } from 'react';
import type { ActivityData, ActivityResult, PatternNextItem } from '@/types';
import { normalizePatternNextData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';
import {
  ChildGameShell,
  VisualTile,
  inferTone,
  useChildGameVoice,
  visualFor,
} from './ChildGameUI';

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

  // Child-first presentation layer. Hooks must stay above the early returns.
  const guideText = prompt || '找一找规律，下一个应该是什么呢？';
  const voice = useChildGameVoice(guideText, feedback);
  const bannerFeedback = feedback
    ? { tone: inferTone(feedback), text: feedback }
    : null;
  const stepLabel = `建议在 ${timeLimitSec} 秒内完成${attempts > 0 ? ` · 已尝试 ${attempts} 次` : ''}`;

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
    <ChildGameShell
      title={data.title || '规律接龙'}
      mascot="🐦"
      prompt={guideText}
      current={solved ? 1 : 0}
      total={1}
      stepLabel={stepLabel}
      feedback={bannerFeedback}
      onReplay={voice.onReplay}
      speaking={voice.speaking}
      muted={voice.muted}
      onToggleMute={voice.onToggleMute}
    >
      <div className="space-y-4">
        <div
          className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-outline-variant/20 bg-white/70 p-3"
          aria-label="规律序列"
        >
          {sequence.map((item) => (
            <VisualTile
              key={item.id}
              as="div"
              visual={visualFor({ icon: item.icon, label: item.label })}
              label={item.label}
              state="normal"
              className="w-auto min-w-[76px]"
            />
          ))}
          <div
            className="flex min-h-[88px] min-w-[76px] flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed border-primary/60 bg-white/70 px-3 py-2"
            aria-label="问号占位"
          >
            <span className="text-4xl leading-none" aria-hidden="true">
              ❓
            </span>
            <span className="text-xs font-bold text-primary">下一个？</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-4">
          {options.map((option, index) => (
            <VisualTile
              key={option.id}
              visual={visualFor({ icon: option.icon, label: option.label })}
              label={option.label}
              ariaLabel={`选项 ${entryText(option)}`}
              state={wrongPick === option.id ? 'wrong' : 'normal'}
              className="w-full min-w-0"
              onClick={() => pick(index)}
            />
          ))}
        </div>
      </div>
    </ChildGameShell>
  );
}
