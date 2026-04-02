import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';
import type { ReviewItem } from './GameCompletionScreen';

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
  const [userAnswers, setUserAnswers] = useState<(boolean | null)[]>([]);

  const current = statements[currentIndex];
  const total = statements.length;

  const handleSelect = useCallback((value: boolean) => {
    if (isRevealed) return;
    setSelected(value);
  }, [isRevealed]);

  const handleSubmit = useCallback(() => {
    if (selected === null || !current) return;
    setIsRevealed(true);
    setUserAnswers((prev) => [...prev, selected]);
    if (selected === current.isCorrect) setCorrectCount((c) => c + 1);
  }, [selected, current]);

  const handleNext = useCallback(() => {
    if (currentIndex >= total - 1) {
      setIsFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setIsRevealed(false);
    }
  }, [currentIndex, total]);

  const handleDismiss = useCallback(() => {
    onComplete({ score: correctCount, totalQuestions: total, correctAnswers: correctCount, interactionData: { statements } });
  }, [correctCount, total, onComplete, statements]);

  if (statements.length === 0) return <div className="p-4 text-on-surface-variant" role="status">暂无题目</div>;
  if (isFinished) {
    const reviewData: ReviewItem[] = statements.map((s: any, i: number) => ({
      question: s.statement,
      userAnswer: userAnswers[i] === true ? '对' : userAnswers[i] === false ? '错' : '未作答',
      correctAnswer: s.isCorrect ? '对' : '错',
      isCorrect: userAnswers[i] === s.isCorrect,
      explanation: s.explanation,
    }));
    return <GameCompletionScreen score={correctCount} total={total} reviewData={reviewData} onDismiss={handleDismiss} />;
  }

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
              aria-label="正确"
              className={cn(
                'w-28 h-28 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 font-black text-lg transition-all',
                !isRevealed && selected === true && 'border-primary bg-primary-container/30 ring-2 ring-primary ring-offset-2',
                isRevealed && selected && isCorrect && 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                isRevealed && selected && !isCorrect && 'bg-[#ffebee] border-[#f44336] text-[#c62828]',
                isRevealed && !selected && current.isCorrect && 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                !isRevealed && selected !== true && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
              )}>
              <Check className="w-10 h-10" />
              对
            </motion.button>
            <motion.button onClick={() => handleSelect(false)} disabled={isRevealed}
              whileHover={!isRevealed ? { scale: 1.05 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
              aria-label="错误"
              className={cn(
                'w-28 h-28 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 font-black text-lg transition-all',
                !isRevealed && selected === false && 'border-primary bg-primary-container/30 ring-2 ring-primary ring-offset-2',
                isRevealed && !selected && !isCorrect && 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                isRevealed && !selected && isCorrect && 'bg-[#ffebee] border-[#f44336] text-[#c62828]',
                isRevealed && !current.isCorrect && selected === false && 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                !isRevealed && selected !== false && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
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
        {!isRevealed && selected !== null && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <button onClick={handleSubmit}
              aria-label="确认答案"
              className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]">
              确认答案
            </button>
          </motion.div>
        )}
        {isRevealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={handleNext}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              {currentIndex >= total - 1 ? '查看结果' : <>下一题 <ArrowRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
