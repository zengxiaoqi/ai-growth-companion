import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, ArrowRight, Sparkles, Flame, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import { useGameVoice } from '@/hooks/useGameVoice';
import GameCompletionScreen from './GameCompletionScreen';
import type { ReviewItem } from './GameCompletionScreen';

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
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const { speak } = useGameVoice();

  const current = questions[currentIndex];
  const total = questions.length;
  const getCorrectIndex = useCallback((question: any) => {
    const optionsLen = Array.isArray(question?.options) ? question.options.length : 0;
    const rawIndex = Number(question?.correctIndex);
    if (Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < optionsLen) return Math.trunc(rawIndex);
    const oneBasedIndex = Math.trunc(rawIndex) - 1;
    if (Number.isFinite(oneBasedIndex) && oneBasedIndex >= 0 && oneBasedIndex < optionsLen) return oneBasedIndex;
    return 0;
  }, []);
  const currentCorrectIndex = current ? getCorrectIndex(current) : 0;

  // Read question aloud when it appears
  useEffect(() => {
    if (current?.question && !isFinished) {
      const opts = (current.options || []).map((o: string, i: number) => `${String.fromCharCode(65 + i)}、${o}`).join('。');
      speak(`${current.question}。选项有：${opts}`);
    }
  }, [currentIndex, isFinished]);

  const handleSelect = useCallback((idx: number) => {
    if (isRevealed) return;
    setSelectedOption(idx);
    // Read the selected option
    if (current?.options?.[idx]) {
      speak(current.options[idx]);
    }
  }, [isRevealed, current, speak]);

  const handleSubmit = useCallback(() => {
    if (selectedOption === null || !current) return;
    setIsRevealed(true);
    setUserAnswers((prev) => [...prev, selectedOption]);
    if (selectedOption === currentCorrectIndex) {
      setCorrectCount((c) => c + 1);
      speak('太棒了，答对了！');
    } else {
      speak(`加油哦！正确答案是${current.options[currentCorrectIndex]}`);
    }
  }, [selectedOption, current, speak, currentCorrectIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex >= total - 1) {
      setIsFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsRevealed(false);
    }
  }, [currentIndex, total]);

  const handleDismiss = useCallback(() => {
    const reviewData: ReviewItem[] = questions.map((q: any, i: number) => {
      const correctIndex = getCorrectIndex(q);
      return {
        question: q.question,
        userAnswer: q.options[userAnswers[i]] ?? '未作答',
        correctAnswer: q.options[correctIndex],
        isCorrect: userAnswers[i] === correctIndex,
        explanation: q.explanation,
      };
    });

    onComplete({
      score: correctCount,
      totalQuestions: total,
      correctAnswers: correctCount,
      interactionData: { questions, userAnswers, reviewData },
    });
  }, [correctCount, total, onComplete, questions, userAnswers, getCorrectIndex]);

  if (questions.length === 0) {
    return <div className="p-4 text-on-surface-variant" role="status">暂无题目</div>;
  }

  if (isFinished) {
    const reviewData: ReviewItem[] = questions.map((q: any, i: number) => {
      const correctIndex = getCorrectIndex(q);
      return {
        question: q.question,
        userAnswer: q.options[userAnswers[i]] ?? '未作答',
        correctAnswer: q.options[correctIndex],
        isCorrect: userAnswers[i] === correctIndex,
        explanation: q.explanation,
      };
    });
    return <GameCompletionScreen score={correctCount} total={total} reviewData={reviewData} onDismiss={handleDismiss} />;
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
          <div className="flex items-start gap-2">
            <h4 className="text-lg font-black text-on-surface flex-1">{current.question}</h4>
            <button onClick={() => current.question && speak(`${current.question}。${(current.options || []).map((o: string, i: number) => `${String.fromCharCode(65 + i)}、${o}`).join('。')}`)}
              className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-on-primary-container hover:bg-primary-container/80 transition-colors"
              aria-label="朗读题目">
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {current.options.map((opt: string, idx: number) => {
              const isCorrect = idx === currentCorrectIndex;
              const isSelected = idx === selectedOption;
              return (
                <motion.button key={idx} type="button" onClick={() => handleSelect(idx)} disabled={isRevealed}
                  whileHover={!isRevealed ? { scale: 1.02 } : undefined} whileTap={!isRevealed ? { scale: 0.98 } : undefined}
                  aria-label={`选项 ${String.fromCharCode(65 + idx)}: ${opt}`}
                  className={cn(
                    'w-full text-left px-4 py-4 rounded-xl border-2 font-bold flex items-center gap-3 transition-all min-h-[48px]',
                    isRevealed && isCorrect && 'bg-success-container border-success text-on-success-container',
                    isRevealed && isSelected && !isCorrect && 'bg-danger-container border-danger text-on-danger-container',
                    !isRevealed && isSelected && 'bg-primary-container/30 border-primary text-on-surface',
                    !isRevealed && !isSelected && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
                    isRevealed && !isCorrect && !isSelected && 'opacity-50',
                  )}>
                  <span className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0',
                    isRevealed && isCorrect && 'bg-success text-on-success',
                    isRevealed && isSelected && 'bg-danger text-on-danger',
                    !isRevealed && isSelected && 'bg-primary text-on-primary',
                    !isRevealed && !isSelected && 'bg-primary-container text-on-primary-container',
                  )}>
                    {isRevealed && isCorrect ? <CheckCircle className="w-5 h-5" /> :
                     isRevealed && isSelected ? <XCircle className="w-5 h-5" /> :
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
                selectedOption === currentCorrectIndex ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container')}>
              {selectedOption === currentCorrectIndex ? <><Sparkles className="w-4 h-4" />太棒了！</> : <><Flame className="w-4 h-4" />加油哦！</>}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Submit or Next */}
      <AnimatePresence>
        {!isRevealed && selectedOption !== null && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <button onClick={handleSubmit}
              aria-label="确认答案"
              className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              确认答案
            </button>
          </motion.div>
        )}
        {isRevealed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={handleNext}
              aria-label={currentIndex >= total - 1 ? '查看结果' : '下一题'}
              className="w-full bg-primary text-on-primary py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              {currentIndex >= total - 1 ? '查看结果' : <>下一题 <ArrowRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
