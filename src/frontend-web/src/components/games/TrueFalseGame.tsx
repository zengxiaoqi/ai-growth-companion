import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, ArrowRight, Volume2 } from '@/icons';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import { useGameVoice } from '@/hooks/useGameVoice';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import GameCompletionScreen from './GameCompletionScreen';
import type { ReviewItem } from './GameCompletionScreen';

interface TrueFalseGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function TrueFalseGame({ data, onComplete }: TrueFalseGameProps) {
  const statements = useMemo(() => data.statements || [], [data.statements]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<boolean | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [userAnswers, setUserAnswers] = useState<(boolean | null)[]>([]);
  const { speak } = useGameVoice();
  const reducedMotion = useReducedMotion();

  const current = statements[currentIndex];
  const total = statements.length;

  // Read statement aloud when it appears
  useEffect(() => {
    if (current?.statement && !isFinished) {
      speak(`${current.statement}。请判断是对还是错。`);
    }
  }, [currentIndex, isFinished]);

  const handleSelect = useCallback((value: boolean) => {
    if (isRevealed) return;
    setSelected(value);
    speak(value ? '对' : '错');
  }, [isRevealed, speak]);

  const handleSubmit = useCallback(() => {
    if (selected === null || !current) return;
    setIsRevealed(true);
    setUserAnswers((prev) => [...prev, selected]);
    if (selected === current.isCorrect) {
      setCorrectCount((c) => c + 1);
      speak('太棒了，答对了！');
    } else {
      speak(current.isCorrect ? '加油哦！这句是对的。' : '加油哦！这句是错的。');
    }
  }, [selected, current, speak]);

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
    const reviewData: ReviewItem[] = statements.map((s: any, i: number) => ({
      question: s.statement,
      userAnswer: userAnswers[i] === true ? '对' : userAnswers[i] === false ? '错' : '未作答',
      correctAnswer: s.isCorrect ? '对' : '错',
      isCorrect: userAnswers[i] === s.isCorrect,
      explanation: s.explanation,
    }));

    onComplete({
      score: correctCount,
      totalQuestions: total,
      correctAnswers: correctCount,
      interactionData: { statements, userAnswers, reviewData },
    });
  }, [correctCount, total, onComplete, statements, userAnswers]);

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
        <motion.div 
          className="h-full bg-primary rounded-full" 
          animate={{ width: `${((currentIndex + 1) / total) * 100}%` }} 
          transition={reducedMotion ? { duration: 0 } : undefined}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={currentIndex} 
          {...(reducedMotion ? {} : { initial: { opacity: 0, x: 30 }, exit: { opacity: 0, x: -30 } })}
          animate={{ opacity: 1, x: 0 }} 
          transition={reducedMotion ? { duration: 0 } : undefined}
          className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/15 space-y-4 sm:space-y-6 text-center">
          <div className="flex items-start gap-2 justify-center">
            <h4 className="text-xl font-black text-on-surface">{current.statement}</h4>
            <button onClick={() => current.statement && speak(`${current.statement}。请判断是对还是错。`)}
              className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-on-primary-container hover:bg-primary-container/80 transition-colors"
              aria-label="朗读题目">
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 sm:gap-4 justify-center px-2">
            <motion.button onClick={() => handleSelect(true)} disabled={isRevealed}
              whileHover={reducedMotion || isRevealed ? undefined : { scale: 1.05, y: -2 }} 
              whileTap={reducedMotion || isRevealed ? undefined : { scale: 0.95 }}
              aria-label="正确"
              className={cn(
                'w-full max-w-[120px] min-w-[80px] aspect-square flex-1 rounded-2xl border-[3px] sm:border-4 flex flex-col items-center justify-center gap-1 sm:gap-2 font-black text-base sm:text-lg transition-all',
                !isRevealed && selected === true && 'border-primary bg-primary-container/30 ring-2 ring-primary ring-offset-2',
                isRevealed && selected && isCorrect && 'bg-success-container border-success text-on-success-container',
                isRevealed && selected && !isCorrect && 'bg-danger-container border-danger text-on-danger-container',
                isRevealed && !selected && current.isCorrect && 'bg-success-container border-success text-on-success-container',
                !isRevealed && selected !== true && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
              )}>
              <Check className="w-8 h-8 sm:w-10 sm:h-10" />
              对
            </motion.button>
            <motion.button onClick={() => handleSelect(false)} disabled={isRevealed}
              whileHover={reducedMotion || isRevealed ? undefined : { scale: 1.05, y: -2 }} 
              whileTap={reducedMotion || isRevealed ? undefined : { scale: 0.95 }}
              aria-label="错误"
              className={cn(
                'w-full max-w-[120px] min-w-[80px] aspect-square flex-1 rounded-2xl border-[3px] sm:border-4 flex flex-col items-center justify-center gap-1 sm:gap-2 font-black text-base sm:text-lg transition-all',
                !isRevealed && selected === false && 'border-primary bg-primary-container/30 ring-2 ring-primary ring-offset-2',
                isRevealed && !selected && !isCorrect && 'bg-success-container border-success text-on-success-container',
                isRevealed && !selected && isCorrect && 'bg-danger-container border-danger text-on-danger-container',
                isRevealed && !current.isCorrect && selected === false && 'bg-success-container border-success text-on-success-container',
                !isRevealed && selected !== false && 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
              )}>
              <X className="w-8 h-8 sm:w-10 sm:h-10" />
              错
            </motion.button>
          </div>

          {isRevealed && current.explanation ? (
            <motion.p 
              {...(reducedMotion ? {} : { initial: { opacity: 0 } })}
              animate={{ opacity: 1 }}
              transition={reducedMotion ? { duration: 0 } : undefined}
              className="text-sm text-on-surface-variant bg-surface-container/50 rounded-lg p-3">
              {current.explanation}
            </motion.p>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {!isRevealed && selected !== null ? (
          <motion.div {...(reducedMotion ? {} : { initial: { opacity: 0, y: 10 }, exit: { opacity: 0 } })} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : undefined}>
            <button onClick={handleSubmit}
              aria-label="确认答案"
              className="w-full bg-primary text-on-primary py-3 sm:py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]">
              确认答案
            </button>
          </motion.div>
        ) : null}
        {isRevealed ? (
          <motion.div {...(reducedMotion ? {} : { initial: { opacity: 0, y: 10 } })} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : undefined}>
            <button onClick={handleNext}
              className="w-full bg-primary text-on-primary py-3 sm:py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              {currentIndex >= total - 1 ? '查看结果' : <>下一题 <ArrowRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
