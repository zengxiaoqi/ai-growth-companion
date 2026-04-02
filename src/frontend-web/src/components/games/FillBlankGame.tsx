import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityData, ActivityResult } from '@/types';
import GameCompletionScreen from './GameCompletionScreen';

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

  const current = sentences[currentIndex];
  const total = sentences.length;

  const handleSelect = useCallback((option: string) => {
    if (isRevealed || !current) return;
    setSelected(option);
    setIsRevealed(true);
    if (option === current.answer) setCorrectCount((c) => c + 1);
  }, [isRevealed, current]);

  const handleNext = useCallback(() => {
    if (currentIndex >= total - 1) {
      setIsFinished(true);
      onComplete({ score: correctCount, totalQuestions: total, correctAnswers: correctCount, interactionData: { sentences } });
    } else {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setIsRevealed(false);
    }
  }, [currentIndex, total, correctCount, onComplete, sentences]);

  if (sentences.length === 0) return <div className="p-4 text-on-surface-variant">暂无题目</div>;
  if (isFinished) return <GameCompletionScreen score={correctCount} total={total} />;

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
              💡 {current.hint}
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            {(current.options || []).map((opt: string, idx: number) => (
              <motion.button key={idx} onClick={() => handleSelect(opt)} disabled={isRevealed}
                whileHover={!isRevealed ? { scale: 1.05 } : undefined} whileTap={!isRevealed ? { scale: 0.95 } : undefined}
                className={cn(
                  'px-5 py-3 rounded-xl border-2 font-bold text-lg transition-all',
                  isRevealed && opt === current.answer ? 'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]' :
                  isRevealed && opt === selected ? 'bg-[#ffebee] border-[#f44336] text-[#c62828]' :
                  'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50',
                  isRevealed && opt !== current.answer && opt !== selected && 'opacity-50',
                )}>
                {opt}
              </motion.button>
            ))}
          </div>
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
