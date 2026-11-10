import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ActivityData,
  ActivityResult,
  DragSortBucket,
  DragSortItem,
} from '@/types';
import { normalizeDragSortData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

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

function itemText(item: DragSortItem): string {
  return item.icon ? `${item.icon} ${item.label}` : item.label;
}

function bucketText(bucket: DragSortBucket): string {
  return bucket.icon ? `${bucket.icon} ${bucket.label}` : bucket.label;
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
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '分类小游戏'}</h3>
        <p className="text-sm text-on-surface-variant">
          {prompt || '点一张卡片，再点它该去的篮子（也可以直接拖过去）'}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          已放好 {placedCount} / {items.length} · 建议在 {timeLimitSec} 秒内完成
        </p>
      </div>

      <div
        className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3"
        aria-label="待分类卡片"
      >
        <p className="text-xs font-bold text-on-surface-variant mb-2">待分类</p>
        <div className="flex flex-wrap gap-2">
          {pendingItems.length === 0 ? (
            <span className="text-sm text-on-surface-variant">全部放好啦！</span>
          ) : (
            pendingItems.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                aria-label={`选择卡片 ${item.label}`}
                aria-pressed={selectedId === item.id}
                onClick={() => {
                  setSelectedId((prev) => (prev === item.id ? null : item.id));
                  setFeedback(null);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setSelectedId(item.id);
                }}
                className={cn(
                  'min-h-[48px] px-4 py-2 rounded-2xl border-2 text-base font-bold transition-tactile',
                  'bg-surface-container text-on-surface border-outline-variant/30',
                  'hover:border-primary/60 active:translate-y-0.5',
                  selectedId === item.id && 'border-primary ring-2 ring-primary ring-offset-2',
                )}
              >
                {itemText(item)}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        {buckets.map((bucket) => {
          const inBucket = items.filter((item) => placements[item.id]?.bucketId === bucket.id);
          return (
            <div
              key={bucket.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const itemId = event.dataTransfer.getData('text/plain') || selectedId;
                if (itemId) place(itemId, bucket.id);
              }}
              className="rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low p-3 min-h-[120px]"
              aria-label={`篮子 ${bucket.label}`}
            >
              <p className="text-sm font-bold text-on-surface mb-2">{bucketText(bucket)}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {inBucket.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`取回${item.label}`}
                    onClick={() => undo(item.id)}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl bg-primary-container text-on-primary-container text-sm font-bold"
                  >
                    {itemText(item)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={`投放到${bucket.label}`}
                onClick={() => handleBucketClick(bucket.id)}
                className="w-full min-h-[44px] rounded-xl border border-primary/40 text-sm font-bold text-primary hover:bg-primary-container/40 transition-tactile"
              >
                放到这里
              </button>
            </div>
          );
        })}
      </div>

      {feedback ? (
        <p
          role="status"
          className={cn(
            'text-center text-sm font-bold',
            feedback.kind === 'ok' ? 'text-success' : 'text-on-surface-variant',
          )}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
