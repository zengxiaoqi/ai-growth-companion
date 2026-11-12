import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import { normalizeDragSortData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';
import {
  ChildGameShell,
  VisualTile,
  inferTone,
  useChildGameVoice,
  visualFor,
} from './ChildGameUI';

interface DragSortGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

interface Placement {
  bucketId: string;
  correctOnFirstTry: boolean;
  attempts: number;
}

interface Feedback {
  kind: 'ok' | 'retry' | 'hint';
  text: string;
}

/**
 * drag_sort — first parameterized activity type (plan B).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity. Both "tap card then tap bucket" and
 * native drag & drop are supported, so it works on touch and desktop.
 * A misplaced card stays in the tray (with one attempt recorded) and can be
 * undone, but an item is only counted as correct when its FIRST placement was
 * correct. That makes scoring identical on Web and Flutter.
 */
export default function DragSortGame({ data, onComplete }: DragSortGameProps) {
  const params = useMemo(() => normalizeDragSortData(data), [data]);
  const { buckets, items, prompt, passingScore, timeLimitSec } = params;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const placedCount = Object.keys(placements).length;
  const pendingItems = items.filter((item) => !placements[item.id]);

  // Child-first presentation layer. Hooks must stay above the early returns.
  const guideText =
    prompt || '点一张卡片，再点它该去的篮子（也可以直接拖过去）';
  const feedbackText = feedback?.text ?? null;
  const voice = useChildGameVoice(guideText, feedbackText);
  const bannerFeedback = feedback
    ? { tone: inferTone(feedback.text), text: feedback.text }
    : null;
  const stepLabel = `已放好 ${placedCount} / ${items.length} · 建议在 ${timeLimitSec} 秒内完成`;

  const finish = (next: Record<string, Placement>, nextAttempts: Record<string, number>) => {
    if (completedRef.current) return;
    completedRef.current = true;

    const correct = Object.values(next).filter((entry) => entry.correctOnFirstTry).length;
    const totalErrors = Object.values(nextAttempts).reduce(
      (sum, n) => sum + Math.max(0, n - 1),
      0,
    );

    setFinalCorrect(correct);
    setFinished(true);
    onComplete(
      buildGameResult({
        correctAnswers: correct,
        totalQuestions: items.length,
        startedAt: startedAt.current,
        interactionData: {
          activityType: 'drag_sort',
          engine: 'parameterized',
          passingScore,
          timeLimitSec,
          totalErrors,
          placements: items.map((item) => ({
            itemId: item.id,
            bucketId: next[item.id]?.bucketId ?? item.bucketId,
            correctOnFirstTry: Boolean(next[item.id]?.correctOnFirstTry),
            attempts: nextAttempts[item.id] ?? 0,
          })),
        },
      }),
    );
  };

  const place = (itemId: string, bucketId: string) => {
    if (finished || completedRef.current) return;
    const item = items.find((entry) => entry.id === itemId);
    if (!item || placements[itemId]) return;

    const nextAttemptCount = (attempts[itemId] ?? 0) + 1;
    const nextAttempts = { ...attempts, [itemId]: nextAttemptCount };
    setAttempts(nextAttempts);
    setSelectedId(null);

    if (item.bucketId === bucketId) {
      const nextPlacements: Record<string, Placement> = {
        ...placements,
        [itemId]: {
          bucketId,
          correctOnFirstTry: nextAttemptCount === 1,
          attempts: nextAttemptCount,
        },
      };
      setPlacements(nextPlacements);
      setFeedback({ kind: 'ok', text: '放对啦！' });
      if (Object.keys(nextPlacements).length === items.length) {
        finish(nextPlacements, nextAttempts);
      }
    } else {
      setFeedback({ kind: 'retry', text: '再想一想，它应该住在哪个篮子里呢？' });
    }
  };

  const undo = (itemId: string) => {
    if (finished || completedRef.current) return;
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setFeedback(null);
  };

  const handleBucketClick = (bucketId: string) => {
    if (!selectedId) {
      setFeedback({ kind: 'hint', text: '先点一张卡片，再选篮子哦～' });
      return;
    }
    place(selectedId, bucketId);
  };

  if (buckets.length < 2 || items.length === 0) {
    return <div className="p-4 text-on-surface-variant">暂无分类题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={finalCorrect} total={items.length} />;
  }

  return (
    <ChildGameShell
      title={data.title || '分类小游戏'}
      mascot="🏠"
      prompt={guideText}
      current={placedCount}
      total={items.length}
      stepLabel={stepLabel}
      feedback={bannerFeedback}
      onReplay={voice.onReplay}
      speaking={voice.speaking}
      muted={voice.muted}
      onToggleMute={voice.onToggleMute}
    >
      <div className="space-y-4">
        <div
          className="rounded-2xl border-2 border-outline-variant/20 bg-white/70 p-3"
          aria-label="待分类卡片"
        >
          <p className="mb-2 text-xs font-bold text-on-surface-variant">待分类</p>
          <div className="flex flex-wrap gap-2">
            {pendingItems.length === 0 ? (
              <span className="text-sm font-bold text-on-surface-variant">
                全部放好啦！
              </span>
            ) : (
              pendingItems.map((item) => (
                <VisualTile
                  key={item.id}
                  visual={visualFor({ icon: item.icon, label: item.label })}
                  label={item.label}
                  state={selectedId === item.id ? 'selected' : 'normal'}
                  ariaLabel={`选择卡片 ${item.label}`}
                  pressed={selectedId === item.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', item.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setSelectedId(item.id);
                  }}
                  onClick={() => {
                    setSelectedId((prev) => (prev === item.id ? null : item.id));
                    setFeedback(null);
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          {buckets.map((bucket) => {
            const inBucket = items.filter(
              (item) => placements[item.id]?.bucketId === bucket.id,
            );
            return (
              <div
                key={bucket.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const itemId =
                    event.dataTransfer.getData('text/plain') || selectedId;
                  if (itemId) place(itemId, bucket.id);
                }}
                className="min-h-[140px] rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/70 p-3"
                aria-label={`篮子 ${bucket.label}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-3xl leading-none" aria-hidden="true">
                    {visualFor({ icon: bucket.icon, label: bucket.label })}
                  </span>
                  <span className="text-base font-black text-on-surface">
                    {bucket.label}
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {inBucket.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`取回${item.label}`}
                      onClick={() => undo(item.id)}
                      className="flex min-h-[44px] items-center gap-1 rounded-xl bg-primary-container px-2.5 py-1 text-sm font-bold text-on-primary-container transition-tactile active:scale-95"
                    >
                      <span className="text-xl leading-none" aria-hidden="true">
                        {visualFor({ icon: item.icon, label: item.label })}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={`投放到${bucket.label}`}
                  onClick={() => handleBucketClick(bucket.id)}
                  className={cn(
                    'min-h-[56px] w-full rounded-2xl border-2 border-primary/50 bg-white/80',
                    'text-base font-black text-primary transition-tactile tactile-press',
                    'hover:bg-primary-container/40 active:scale-95',
                  )}
                >
                  <span aria-hidden="true">👇 </span>放到这里
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ChildGameShell>
  );
}
