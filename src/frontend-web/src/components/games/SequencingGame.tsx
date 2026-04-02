import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface SequencingGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function SequencingGame({ data, onComplete }: SequencingGameProps) {
  const items = data.items || [];

  // Shuffle items on mount
  const [shuffled, setShuffled] = useState(() =>
    [...items].sort(() => Math.random() - 0.5).map((item: any, i: number) => ({ ...item, currentIndex: i }))
  );
  const [isFinished, setIsFinished] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setShuffled((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((item, i) => ({ ...item, currentIndex: i }));
    });
    setDragIndex(null);
  }, [dragIndex]);

  const handleCheck = useCallback(() => {
    let correct = 0;
    for (let i = 0; i < shuffled.length; i++) {
      if (shuffled[i].order === i + 1) correct++;
    }
    setIsFinished(true);
    onComplete({
      score: correct,
      totalQuestions: items.length,
      correctAnswers: correct,
      interactionData: { userOrder: shuffled.map((s: any) => s.id) },
    });
  }, [shuffled, items.length, onComplete]);

  if (items.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) {
    const correct = shuffled.filter((item: any, i: number) => item.order === i + 1).length;
    return <GameCompletionScreen score={correct} total={items.length} />;
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-black text-on-surface text-lg">{data.title}</h3>
        <p className="text-sm text-on-surface-variant">拖拽调整顺序（先拖再放到目标位置）</p>
      </div>

      <div className="space-y-2">
        {shuffled.map((item: any, index: number) => (
          <motion.div
            key={item.id}
            layout
            className={cn(
              'flex items-center gap-3 bg-surface-container-lowest p-4 rounded-2xl border-2 font-bold text-on-surface touch-none',
              dragIndex === index && 'border-primary bg-primary-container/20 opacity-70',
              dragIndex !== null && dragIndex !== index && 'hover:border-primary/50',
            )}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <GripVertical className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
            <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-sm font-black flex-shrink-0">
              {index + 1}
            </span>
            <span className="flex-1">{item.label}</span>
          </motion.div>
        ))}
      </div>

      <button onClick={handleCheck}
        className="w-full bg-primary text-on-primary py-3 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press">
        检查顺序
      </button>
    </div>
  );
}
