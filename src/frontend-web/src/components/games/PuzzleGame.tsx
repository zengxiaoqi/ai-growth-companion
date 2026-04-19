import { useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface PuzzleGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function PuzzleGame({ data, onComplete }: PuzzleGameProps) {
  const pieces = useMemo(() => data.pieces || [], [data.pieces]);
  const grid = data.gridSize || { rows: 2, cols: 2 };
  const totalSlots = grid.rows * grid.cols;

  // Track which piece is in which slot
  const [slots, setSlots] = useState<(string | null)[]>(
    () => Array(totalSlots).fill(null).map((_, i) => i < pieces.length ? pieces[i].id : null)
  );
  // Shuffle pieces into random slots
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    const shuffledIds = [...pieces.map((p: any) => p.id)].sort(() => Math.random() - 0.5);
    const newSlots: (string | null)[] = Array(totalSlots).fill(null);
    shuffledIds.forEach((id, i) => { newSlots[i] = id; });
    setSlots(newSlots);
    setInitialized(true);
  }

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const handleSlotClick = useCallback((slotIndex: number) => {
    if (selectedSlot === null) {
      if (slots[slotIndex] !== null) setSelectedSlot(slotIndex);
      return;
    }

    // Swap pieces
    setSlots((prev) => {
      const next = [...prev];
      const temp = next[selectedSlot];
      next[selectedSlot] = next[slotIndex];
      next[slotIndex] = temp;
      return next;
    });
    setSelectedSlot(null);
  }, [selectedSlot, slots]);

  const handleCheck = useCallback(() => {
    let correct = 0;
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces.find((p: any) => p.id === slots[i]);
      if (piece && piece.position === i) correct++;
    }
    setIsFinished(true);
    onComplete({
      score: correct,
      totalQuestions: pieces.length,
      correctAnswers: correct,
      interactionData: { slots },
    });
  }, [pieces, slots, onComplete]);

  const getPiece = (id: string | null) => id ? pieces.find((p: any) => p.id === id) : null;

  if (pieces.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) {
    const correct = pieces.filter((p: any) => {
      const slotIdx = slots.indexOf(p.id);
      return p.position === slotIdx;
    }).length;
    return <GameCompletionScreen score={correct} total={pieces.length} />;
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="text-center">
        <h3 className="font-black text-on-surface text-lg">{data.title}</h3>
        <p className="text-sm text-on-surface-variant">
          {selectedSlot !== null ? '点击另一个位置来交换' : '点击选中一个拼图块，再点击另一个位置交换'}
        </p>
      </div>

      <div
        className="grid gap-2 sm:gap-3 mx-auto w-full px-2"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          maxWidth: `${Math.min(grid.cols * 100, 400)}px`,
        }}
      >
        {slots.map((pieceId, idx) => {
          const piece = getPiece(pieceId);
          const isSelected = selectedSlot === idx;

          return (
            <motion.button
              key={idx}
              onClick={() => handleSlotClick(idx)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.95 }}
              aria-label={piece ? `${piece.label}${isSelected ? '（已选中）' : ''}` : '空位置'}
              className={cn(
                'aspect-square rounded-2xl border-2 flex flex-col items-center justify-center font-bold transition-all min-h-[60px]',
                isSelected && 'border-primary bg-primary-container/30 ring-2 ring-primary ring-offset-2',
                piece && !isSelected && 'border-outline-variant/30 bg-surface-container-lowest hover:border-primary/50',
                !piece && 'border-outline-variant/15 bg-surface-container/30',
              )}
            >
              {piece ? (
                <>
                  <span className="text-2xl sm:text-3xl">{piece.emoji}</span>
                  <span className="text-[10px] sm:text-xs text-on-surface-variant mt-1">{piece.label}</span>
                </>
              ) : null}
            </motion.button>
          );
        })}
      </div>

      <button onClick={handleCheck}
        className="w-full bg-primary text-on-primary py-3 sm:py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]">
        检查拼图
      </button>
    </div>
  );
}
