import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult, MemoryFlipPair } from '@/types';
import { normalizeMemoryFlipData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';

interface MemoryFlipGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

interface Card {
  key: string;
  pairId: string;
  pair: MemoryFlipPair;
}

interface Feedback {
  kind: 'ok' | 'retry' | 'hint';
  text: string;
}

function pairText(pair: MemoryFlipPair): string {
  return pair.icon ? `${pair.icon} ${pair.label}` : pair.label;
}

/** Deterministic seed so the same parameters always shuffle the same way. */
function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * memory_flip — memory flip-card activity type (plan B).
 *
 * Rendering logic is fixed and owned by the client; `data` only carries JSON
 * parameters produced by generateActivity. Cards are laid out on the
 * gridSize board; flipping two cards with the same pairId keeps them open.
 * Scoring is the matched-pair ratio (always 100 on completion), with moves
 * and mismatches reported in interactionData — identical semantics on Web
 * and Flutter.
 */
export default function MemoryFlipGame({ data, onComplete }: MemoryFlipGameProps) {
  const params = useMemo(() => normalizeMemoryFlipData(data), [data]);
  const { pairs, gridSize, prompt, passingScore, timeLimitSec } = params;

  const deck = useMemo<Card[]>(() => {
    const cards: Card[] = [];
    pairs.forEach((pair) => {
      cards.push({ key: `${pair.id}#a`, pairId: pair.id, pair });
      cards.push({ key: `${pair.id}#b`, pairId: pair.id, pair });
    });
    const random = mulberry32(seedFromString(cards.map((card) => card.key).join('|')));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }, [pairs]);

  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [flipped, setFlipped] = useState<Card[]>([]);
  const [moves, setMoves] = useState(0);
  const [mismatches, setMismatches] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  const boardValid =
    pairs.length >= 2 &&
    gridSize.rows >= 2 &&
    gridSize.cols >= 2 &&
    gridSize.rows * gridSize.cols === deck.length &&
    deck.length > 0;

  // Lock board while two mismatched cards are being shown before flipping back.
  const resolvingRef = useRef(false);
  const resolveTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (resolveTimer.current) window.clearTimeout(resolveTimer.current);
    };
  }, []);

  const finish = (nextMatched: Set<string>, nextMoves: number, nextMismatches: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFinished(true);
    onComplete(
      buildGameResult({
        correctAnswers: nextMatched.size,
        totalQuestions: pairs.length,
        startedAt: startedAt.current,
        interactionData: {
          activityType: 'memory_flip',
          engine: 'parameterized',
          passingScore,
          timeLimitSec,
          moves: nextMoves,
          mismatches: nextMismatches,
          pairs: pairs.map((pair) => ({
            pairId: pair.id,
            label: pair.label,
            matched: nextMatched.has(pair.id),
          })),
        },
      }),
    );
  };

  const flip = (card: Card) => {
    if (finished || completedRef.current || resolvingRef.current) return;
    if (matched.has(card.pairId)) return;
    if (flipped.some((entry) => entry.key === card.key)) return;
    if (flipped.length >= 2) return;

    const nextFlipped = [...flipped, card];
    setFlipped(nextFlipped);
    setFeedback(null);

    if (nextFlipped.length < 2) return;

    const nextMoves = moves + 1;
    setMoves(nextMoves);

    if (nextFlipped[0].pairId === nextFlipped[1].pairId) {
      const nextMatched = new Set(matched);
      nextMatched.add(nextFlipped[0].pairId);
      setMatched(nextMatched);
      setFlipped([]);
      setFeedback({ kind: 'ok', text: '配对成功！' });
      if (nextMatched.size === pairs.length) {
        finish(nextMatched, nextMoves, mismatches);
      }
      return;
    }

    resolvingRef.current = true;
    const nextMismatches = mismatches + 1;
    setMismatches(nextMismatches);
    setFeedback({ kind: 'retry', text: '不是一对，再试试看～' });
    resolveTimer.current = window.setTimeout(() => {
      setFlipped([]);
      resolvingRef.current = false;
    }, 800);
  };

  if (!boardValid) {
    return <div className="p-4 text-on-surface-variant">暂无记忆翻牌题目</div>;
  }

  if (finished) {
    return <GameCompletionScreen score={pairs.length} total={pairs.length} />;
  }

  const matchedCount = matched.size;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-on-surface text-lg">{data.title || '记忆翻牌'}</h3>
        <p className="text-sm text-on-surface-variant">
          {prompt || '翻两张卡片，找到一模一样的一对！'}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          已配对 {matchedCount} / {pairs.length} · 翻了 {moves} 次 · 建议在 {timeLimitSec} 秒内完成
        </p>
      </div>

      <div
        className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-3"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize.cols}, minmax(0, 1fr))`, gap: '0.5rem' }}
        aria-label="翻牌棋盘"
      >
        {deck.map((card) => {
          const isUp = matched.has(card.pairId) || flipped.some((entry) => entry.key === card.key);
          return (
            <button
              key={card.key}
              type="button"
              aria-label={isUp ? `卡片 ${card.pair.label}` : '背面卡片'}
              aria-pressed={isUp}
              onClick={() => flip(card)}
              className={cn(
                'min-h-[64px] rounded-2xl border-2 text-lg font-bold transition-tactile flex items-center justify-center',
                isUp
                  ? 'bg-primary-container text-on-primary-container border-primary/50'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/60 active:translate-y-0.5',
              )}
            >
              {isUp ? pairText(card.pair) : '❓'}
            </button>
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
