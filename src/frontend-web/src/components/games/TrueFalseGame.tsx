import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface TrueFalseGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function TrueFalseGame({ data, onComplete }: TrueFalseGameProps) {
  const statements = data.statements || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<boolean | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const current = statements[currentIndex];
  const total = statements.length;

  const handleSelect = useCallback((value: boolean) => {
    if (isRevealed || !current) return;
    setSelected(value);
    setIsRevealed(true);
    if (value === current.isCorrect) setCorrectCount((c) => c + 1);
  }, [isRevealed, current]);

  const handleNext = useCallback(() => {
    if (currentIndex >= total - 1) {
      setIsFinished(true);
      onComplete({ score: correctCount, totalQuestions: total, correctAnswers: correctCount, interactionData: { statements } });
    } else {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setIsRevealed(false);
    }
  }, [currentIndex, total, correctCount, onComplete, statements]);

  if (statements.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) return <GameCompletionScreen score={correctCount} total={total} />;

  const isCorrect = selected === current?.isCorrect;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold text-on-surface-variant">{data.title}</span>
        <span className="text-sm font-bold text-primary">{currentIndex + 1} / {total}</span>
      </div>
      <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
        <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={currentIndex} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
          className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 space-y-6 text-center">
          <h4 className="text-xl font-black text-on-surface">{current.statement}</h4>

          <div className="flex gap-4 justify-center">
            <motion.button onClick={() => handleSelect(true)} disabled={isRevealed}
              whileHover={!isRevealed ? { scale: 1.05 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
              className={cn(
                'w-28 h-28 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 font-black text-lg transition-all',
                isRevealed && selected && isCorrect ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                isRevealed && selected && !isCorrect ? 'bg-[#ffebee] border-[#f44336] text-[#c62828]' :
                isRevealed && current.isCorrect ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
              )}>
              <Check className="w-10 h-10" />
              对
            </motion.button>
            <motion.button onClick={() => handleSelect(false)} disabled={isRevealed}
              whileHover={!isRevealed ? { scale: 1.05 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
              className={cn(
                'w-28 h-28 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 font-black text-lg transition-all',
                isRevealed && !selected && !isCorrect ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                isRevealed && !selected && isCorrect ? 'bg-[#ffebee] border-[#f44336] text-[#c62828]' :
                isRevealed && !current.isCorrect ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
              )}>
              <X className="w-10 h-10" />
              错
            </motion.button>
          </div>

          {isRevealed && current.explanation && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm text-on-surface-variant bg-surface-container/50 rounded-lg p-3">
              {current.explanation}
            </motion.p>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {isRevealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={handleNext}
              className="w-full bg-primary text-on-primary py-3 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2">
              {currentIndex >= total - 1 ? '查看结果' : <>下一题 <ArrowRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
