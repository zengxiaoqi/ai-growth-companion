import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, ArrowRight, Sparkles, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

interface QuizGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function QuizGame({ data, onComplete }: QuizGameProps) {
  const questions = data.questions || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const current = questions[currentIndex];
  const total = questions.length;

  const handleSelect = useCallback((idx: number) => {
    if (isRevealed || !current) return;
    setSelectedOption(idx);
    setIsRevealed(true);
    if (idx === current.correctIndex) setCorrectCount((c) => c + 1);
  }, [isRevealed, current]);

  const handleNext = useCallback(() => {
    if (currentIndex >= total - 1) {
      const final = correctCount + (selectedOption === current?.correctIndex ? 0 : 0);
      setIsFinished(true);
      onComplete({ score: final, totalQuestions: total, correctAnswers: final, interactionData: { questions } });
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsRevealed(false);
    }
  }, [currentIndex, total, correctCount, selectedOption, current, onComplete, questions]);

  if (questions.length === 0) {
    return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  }

  if (isFinished) {
    return <GameCompletionScreen score={correctCount} total={total} />;
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold text-on-surface-variant">{data.title}</span>
        <span className="text-sm font-bold text-primary">{currentIndex + 1} / {total}</span>
      </div>
      <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
        <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={currentIndex} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
          className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 space-y-4">
          <h4 className="text-lg font-black text-on-surface">{current.question}</h4>
          <div className="space-y-2">
            {current.options.map((opt: string, idx: number) => {
              const isCorrect = idx === current.correctIndex;
              const isSelected = idx === selectedOption;
              return (
                <motion.button key={idx} type="button" onClick={() => handleSelect(idx)} disabled={isRevealed}
                  whileHover={!isRevealed ? { scale: 1.02 } : undefined} whileTap={!isRevealed ? { scale: 0.98 } : undefined}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-xl border-2 font-bold flex items-center gap-3 transition-all',
                    isRevealed && isCorrect && 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                    isRevealed && isSelected && !isCorrect && 'bg-[#ffebee] border-[#f44336] text-[#c62828]',
                    !isRevealed && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
                    isRevealed && !isCorrect && !isSelected && 'opacity-50',
                  )}>
                  <span className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0',
                    isRevealed && isCorrect && 'bg-[#4caf50] text-white',
                    isRevealed && isSelected && !isCorrect && 'bg-[#f44336] text-white',
                    !isRevealed && 'bg-primary-container text-on-primary-container',
                  )}>
                    {isRevealed && isCorrect ? <CheckCircle className="w-4 h-4" /> :
                     isRevealed && isSelected ? <XCircle className="w-4 h-4" /> :
                     String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{opt}</span>
                </motion.button>
              );
            })}
          </div>
          {isRevealed && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={cn('rounded-xl p-3 text-center font-bold flex items-center justify-center gap-2',
                selectedOption === current.correctIndex ? 'bg-[#e8f5e9] text-[#2e7d32]' : 'bg-[#fff8e1] text-[#e65100]')}>
              {selectedOption === current.correctIndex ? <><Sparkles className="w-4 h-4" />太棒了！</> : <><Flame className="w-4 h-4" />加油哦！</>}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Next */}
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
