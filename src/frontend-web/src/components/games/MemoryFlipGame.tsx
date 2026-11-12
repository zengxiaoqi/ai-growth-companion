import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityData, ActivityResult, MemoryFlipPair } from '@/types';
import { normalizeMemoryFlipData } from '@/components/ai-chat/activity-normalizer';
import GameCompletionScreen from './GameCompletionScreen';
import { buildGameResult } from './gameResult';
import {
  ChildGameShell,
  VisualTile,
  inferTone,
  useChildGameVoice,
  visualFor,
} from './ChildGameUI';

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

  // Child-first presentation layer. Hooks must stay above the early returns.
  const guideText = prompt || '翻两张卡片，找到一模一样的一对！';
  const feedbackText = feedback?.text ?? null;
  const voice = useChildGameVoice(guideText, feedbackText);
  const bannerFeedback = feedback
    ? { tone: inferTone(feedback.text), text: feedback.text }
    : null;
  const stepLabel = `已配对 ${matched.size} / ${pairs.length} · 翻了 ${moves} 次 · 建议在 ${timeLimitSec} 秒内完成`;

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

  return (
    <ChildGameShell
      title={data.title || '记忆翻牌'}
      mascot="🐻"
      prompt={guideText}
      current={matched.size}
      total={pairs.length}
      stepLabel={stepLabel}
      feedback={bannerFeedback}
      onReplay={voice.onReplay}
      speaking={voice.speaking}
      muted={voice.muted}
      onToggleMute={voice.onToggleMute}
    >
      <div
        className="rounded-2xl border-2 border-outline-variant/20 bg-white/70 p-3"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize.cols}, minmax(0, 1fr))`,
          gap: '0.5rem',
        }}
        aria-label="翻牌棋盘"
      >
        {deck.map((card) => {
          const isUp =
            matched.has(card.pairId) ||
            flipped.some((entry) => entry.key === card.key);
          const isMatched = matched.has(card.pairId);
          return (
            <VisualTile
              key={card.key}
              visual={
                isUp
                  ? visualFor({ icon: card.pair.icon, label: card.pair.label })
                  : '❓'
              }
              label={isUp ? card.pair.label : ''}
              state={isUp ? (isMatched ? 'correct' : 'revealed') : 'normal'}
              ariaLabel={isUp ? `卡片 ${card.pair.label}` : '背面卡片'}
              pressed={isUp}
              className="w-full min-w-0"
              onClick={() => flip(card)}
            />
          );
        })}
      </div>
    </ChildGameShell>
  );
}
