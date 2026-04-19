import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Volume2 } from '@/icons';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import { useGameVoice } from '@/hooks/useGameVoice';
import GameCompletionScreen from './GameCompletionScreen';
import type { ReviewItem } from './GameCompletionScreen';

interface FillBlankGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function FillBlankGame({ data, onComplete }: FillBlankGameProps) {
  const sentences = useMemo(() => data.sentences || [], [data.sentences]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const { speak } = useGameVoice();

  const current = sentences[currentIndex];
  const total = sentences.length;

  // Read sentence aloud when it appears
  useEffect(() => {
    if (current?.text && !isFinished) {
      const blankText = current.text.replace('___', '什么');
      const opts = (current.options || []).join('、');
      speak(`${blankText}。选项有：${opts}`);
    }
  }, [currentIndex, isFinished]);

  const handleSelect = useCallback((option: string) => {
    if (isRevealed) return;
    setSelected(option);
    speak(option);
  }, [isRevealed, speak]);

  const handleSubmit = useCallback(() => {
    if (selected === null || !current) return;
    setIsRevealed(true);
    setUserAnswers((prev) => [...prev, selected]);
    if (selected === current.answer) {
      setCorrectCount((c) => c + 1);
      speak('太棒了，答对了！');
    } else {
      speak(`加油哦！正确答案是${current.answer}`);
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
    const reviewData: ReviewItem[] = sentences.map((s: any, i: number) => ({
      question: s.text.replace('___', '______'),
      userAnswer: userAnswers[i] ?? '未作答',
      correctAnswer: s.answer,
      isCorrect: userAnswers[i] === s.answer,
      explanation: s.hint,
    }));

    onComplete({
      score: correctCount,
      totalQuestions: total,
      correctAnswers: correctCount,
      interactionData: { sentences, userAnswers, reviewData },
    });
  }, [correctCount, total, onComplete, sentences, userAnswers]);

  if (sentences.length === 0) return <div className="p-4 text-on-surface-variant" role="status">暂无题目</div>;
  if (isFinished) {
    const reviewData: ReviewItem[] = sentences.map((s: any, i: number) => ({
      question: s.text.replace('___', '______'),
      userAnswer: userAnswers[i] ?? '未作答',
      correctAnswer: s.answer,
      isCorrect: userAnswers[i] === s.answer,
      explanation: s.hint,
    }));
    return <GameCompletionScreen score={correctCount} total={total} reviewData={reviewData} onDismiss={handleDismiss} />;
  }

  const isCorrect = selected === current?.answer;

  // Render text with blank indicator
  const renderText = (text: string) => {
    const parts = text.split('___');
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 ? (
          <span className={cn(
            'inline-block min-w-[3em] border-b-[3px] px-2 py-0.5 mx-1 rounded-t-md text-center font-bold relative top-[-2px] transition-colors',
            isRevealed && isCorrect ? 'border-success bg-success-container/30 text-success' :
            isRevealed ? 'border-danger bg-danger-container/30 text-danger' :
            'border-primary bg-primary-container/20 text-primary',
          )}>
            {selected || '???'}
          </span>
        ) : null}
      </span>
    ));
  };

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
          className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/15 space-y-4 sm:space-y-5">
          <div className="flex items-start gap-2">
            <div className="text-lg sm:text-xl font-black text-on-surface leading-relaxed flex-1">{renderText(current.text)}</div>
            <button onClick={() => {
              const blankText = current.text.replace('___', '什么');
              const opts = (current.options || []).join('、');
              speak(`${blankText}。选项有：${opts}`);
            }}
              className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-on-primary-container hover:bg-primary-container/80 transition-colors"
              aria-label="朗读题目">
              <Volume2 className="w-4 h-4" />
            </button>
          </div>

          {current.hint && !isRevealed ? (
            <p className="text-sm text-on-surface-variant bg-tertiary-container/30 rounded-lg px-3 py-2">
              {current.hint}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
            {(current.options || []).map((opt: string, idx: number) => (
              <motion.button key={idx} onClick={() => handleSelect(opt)} disabled={isRevealed}
                whileHover={!isRevealed ? { scale: 1.05, y: -2 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
                aria-label={`选项: ${opt}`}
                className={cn(
                  'px-4 py-3 sm:px-5 sm:py-4 rounded-xl border-2 font-bold text-base sm:text-lg transition-all min-h-[48px]',
                  !isRevealed && opt === selected && 'bg-primary-container/30 border-primary text-on-surface',
                  isRevealed && opt === current.answer ? 'bg-success-container border-success text-on-success-container' :
                  isRevealed && opt === selected ? 'bg-danger-container border-danger text-on-danger-container' :
                  !isRevealed && opt !== selected ? 'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50' :
                  'bg-surface-container border-outline-variant/30 text-on-surface',
                  isRevealed && opt !== current.answer && opt !== selected && 'opacity-50',
                )}>
                {opt}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {!isRevealed && selected !== null ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <button onClick={handleSubmit}
              aria-label="确认答案"
              className="w-full bg-primary text-on-primary py-3 sm:py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]">
              确认答案
            </button>
          </motion.div>
        ) : null}
        {isRevealed ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={handleNext}
              aria-label={currentIndex >= total - 1 ? '查看结果' : '下一题'}
              className="w-full bg-primary text-on-primary py-3 sm:py-4 rounded-full font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-2 min-h-[48px]">
              {currentIndex >= total - 1 ? '查看结果' : <>下一题 <ArrowRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
