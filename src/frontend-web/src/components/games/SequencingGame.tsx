import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { ArrowUpDown } from 'lucide-react';
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Tap-to-swap: primary interaction for young children
  const handleItemTap = useCallback((index: number) => {
    if (selectedIndex === null) {
      setSelectedIndex(index);
      return;
    }
    if (selectedIndex === index) {
      setSelectedIndex(null);
      return;
    }
    // Swap the two items
    setShuffled((prev) => {
      const next = [...prev];
      const temp = next[selectedIndex];
      next[selectedIndex] = next[index];
      next[index] = temp;
      return next.map((item, i) => ({ ...item, currentIndex: i }));
    });
    setSelectedIndex(null);
  }, [selectedIndex]);

  // Drag support as fallback (for older children / desktop)
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
    return <GameCompletionScreen score={correct} total={items.length} onDismiss={() => { setIsFinished(false); }} />;
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="text-center">
        <h3 className="font-black text-on-surface text-lg">{data.title}</h3>
        <p className="text-sm text-on-surface-variant">
          {selectedIndex !== null ? '再点击另一个来交换位置' : '点击两个来交换顺序'}
        </p>
      </div>

      <div className="space-y-2">
        {shuffled.map((item: any, index: number) => (
          <motion.button
            key={item.id}
            layout
            onClick={() => handleItemTap(index)}
            whileTap={{ scale: 0.97 }}
            aria-label={`第${index + 1}位: ${item.label}${selectedIndex === index ? '（已选中）' : ''}`}
            className={cn(
              'w-full flex items-center gap-3 bg-surface-container-lowest p-4 rounded-2xl border-2 font-bold text-on-surface min-h-[52px] transition-all',
              selectedIndex === index && 'border-primary bg-primary-container/20 ring-2 ring-primary ring-offset-2',
              selectedIndex !== null && selectedIndex !== index && 'border-primary/30 hover:border-primary/50',
              dragIndex === index && 'opacity-70',
            )}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <ArrowUpDown className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
            <span className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-base font-black flex-shrink-0">
              {index + 1}
            </span>
            <span className="flex-1 text-base text-left">{item.label}</span>
          </motion.button>
        ))}
      </div>

      <button onClick={handleCheck}
        className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]">
        检查顺序
      </button>
    </div>
  );
}
