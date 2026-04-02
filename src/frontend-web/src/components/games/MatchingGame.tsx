import { useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface MatchingGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function MatchingGame({ data, onComplete }: MatchingGameProps) {
  const pairs = data.pairs || [];
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [attempts, setAttempts] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Shuffle cards (left items + right items mixed)
  const cards = useMemo(() => {
    const leftCards = pairs.map((p: any) => ({ id: `L-${p.id}`, pairId: p.id, side: 'left' as const, label: p.left, matched: false }));
    const rightCards = pairs.map((p: any) => ({ id: `R-${p.id}`, pairId: p.id, side: 'right' as const, label: p.right, matched: false }));
    return [...leftCards, ...rightCards].sort(() => Math.random() - 0.5);
  }, [pairs]);

  const handleCardClick = useCallback((cardId: string) => {
    if (matched.has(cardId)) return;

    // Reveal card if not yet revealed
    if (!revealed.has(cardId)) {
      setRevealed((prev) => new Set([...prev, cardId]));
      return;
    }

    if (!selected) {
      setSelected(cardId);
      return;
    }

    // Second selection — check match
    const first = cards.find((c) => c.id === selected)!;
    const second = cards.find((c) => c.id === cardId)!;

    setAttempts((a) => a + 1);

    if (first.pairId === second.pairId && first.side !== second.side) {
      // Match!
      setMatched((prev) => new Set([...prev, selected!, cardId]));
      setSelected(null);

      // Check if all matched
      const newMatched = new Set([...matched, selected!, cardId]);
      if (newMatched.size === cards.length) {
        setIsFinished(true);
        const correct = pairs.length;
        onComplete({ score: correct, totalQuestions: pairs.length, correctAnswers: correct, interactionData: { attempts: attempts + 1 } });
      }
    } else {
      // No match — hide both after a moment
      setSelected(null);
      setTimeout(() => {
        setRevealed((prev) => {
          const next = new Set(prev);
          next.delete(selected!);
          next.delete(cardId);
          return next;
        });
      }, 800);
    }
  }, [selected, matched, revealed, cards, pairs, attempts, onComplete]);

  if (pairs.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) return <GameCompletionScreen score={pairs.length} total={pairs.length} />;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-black text-on-surface text-lg">{data.title}</h3>
        <p className="text-sm text-on-surface-variant">翻开卡片找到配对！{matched.size / 2} / {pairs.length}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => {
          const isRevealed = revealed.has(card.id);
          const isMatched = matched.has(card.id);
          const isSelected = selected === card.id;

          return (
            <motion.button key={card.id}
              onClick={() => handleCardClick(card.id)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                'aspect-square rounded-2xl border-2 flex items-center justify-center text-lg font-bold transition-all',
                isMatched && 'bg-primary-container border-primary text-on-primary-container opacity-60',
                isRevealed && !isMatched && 'bg-surface-container-lowest border-primary text-on-surface',
                !isRevealed && !isMatched && 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/50',
                isSelected && 'ring-2 ring-primary ring-offset-2',
              )}
              style={{ perspective: '1000px' }}
            >
              <motion.div
                initial={{ rotateY: isRevealed ? 0 : 180 }}
                animate={{ rotateY: isRevealed || isMatched ? 0 : 180 }}
                transition={{ duration: 0.3 }}
              >
                {isRevealed || isMatched ? (
                  <span className="text-xl">{card.label}</span>
                ) : (
                  <span className="text-2xl">?</span>
                )}
              </motion.div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
