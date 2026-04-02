import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';
import type { ReviewItem } from './GameCompletionScreen';

interface FillBlankGameProps {
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

export default function FillBlankGame({ data, onComplete }: FillBlankGameProps) {
  const sentences = data.sentences || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);

  const current = sentences[currentIndex];
  const total = sentences.length;

  const handleSelect = useCallback((option: string) => {
    if (isRevealed) return;
    setSelected(option);
  }, [isRevealed]);

  const handleSubmit = useCallback(() => {
    if (selected === null || !current) return;
    setIsRevealed(true);
    setUserAnswers((prev) => [...prev, selected]);
    if (selected === current.answer) setCorrectCount((c) => c + 1);
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
    onComplete({ score: correctCount, totalQuestions: total, correctAnswers: correctCount, interactionData: { sentences } });
  }, [correctCount, total, onComplete, sentences]);

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
        {i < parts.length - 1 && (
          <span className={cn(
            'inline-block min-w-[3em] border-b-2 px-1 text-center font-bold',
            isRevealed && isCorrect ? 'border-[#4caf50] text-[#2e7d32]' :
            isRevealed ? 'border-[#f44336] text-[#c62828]' :
            'border-primary text-primary',
          )}>
            {selected || '???'}
          </span>
        )}
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
          className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 space-y-5">
          <div className="text-xl font-black text-on-surface leading-relaxed">{renderText(current.text)}</div>

          {current.hint && !isRevealed && (
            <p className="text-sm text-on-surface-variant bg-tertiary-container/30 rounded-lg px-3 py-2">
              {current.hint}
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            {(current.options || []).map((opt: string, idx: number) => (
              <motion.button key={idx} onClick={() => handleSelect(opt)} disabled={isRevealed}
                whileHover={!isRevealed ? { scale: 1.05 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
                aria-label={`选项: ${opt}`}
                className={cn(
                  'px-5 py-4 rounded-xl border-2 font-bold text-lg transition-all min-h-[48px]',
                  !isRevealed && opt === selected && 'bg-primary-container/30 border-primary text-on-surface',
                  isRevealed && opt === current.answer ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                  isRevealed && opt === selected ? 'bg-[#ffebee] border-[#f44336] text-[#c62828]' :
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
