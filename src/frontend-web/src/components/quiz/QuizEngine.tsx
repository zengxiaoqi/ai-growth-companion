import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle,
  XCircle,
  Trophy,
  Star,
  ArrowRight,
  Sparkles,
  PartyPopper,
  Flame,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

export interface QuizSection {
  type: string;
  title: string;
  text?: string;
  questions?: QuizQuestion[];
}

interface QuizEngineProps {
  sections: QuizSection[];
  onComplete: (score: number, totalQuestions: number) => void;
}

export default function QuizEngine({ sections, onComplete }: QuizEngineProps) {
  // Flatten all questions from all sections that have them
  const allQuestions = sections
    .filter((s) => s.questions && s.questions.length > 0)
    .flatMap((s) =>
      s.questions!.map((q) => ({ ...q, sectionTitle: s.title }))
    );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<
    { question: QuizQuestion; selected: number; correct: boolean }[]
  >([]);

  const currentQuestion = allQuestions[currentIndex];
  const totalQuestions = allQuestions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const getAnswerIndex = useCallback((question: QuizQuestion) => {
    const raw = Number((question as any).answer);
    const optionsLen = Array.isArray(question.options) ? question.options.length : 0;
    if (Number.isFinite(raw) && raw >= 0 && raw < optionsLen) return Math.trunc(raw);
    const oneBased = Math.trunc(raw) - 1;
    if (Number.isFinite(oneBased) && oneBased >= 0 && oneBased < optionsLen) return oneBased;
    return 0;
  }, []);
  const currentAnswerIndex = currentQuestion ? getAnswerIndex(currentQuestion as QuizQuestion) : 0;

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (isRevealed) return;

      setSelectedOption(optionIndex);
      setIsRevealed(true);

      const isCorrect = optionIndex === currentAnswerIndex;
      if (isCorrect) {
        setCorrectCount((prev) => prev + 1);
      }

      setAnsweredQuestions((prev) => [
        ...prev,
        {
          question: currentQuestion,
          selected: optionIndex,
          correct: isCorrect,
        },
      ]);
    },
    [currentQuestion, isRevealed, currentAnswerIndex]
  );

  const handleNext = useCallback(() => {
    if (isLastQuestion) {
      const finalCorrect = answeredQuestions.length > 0
        ? answeredQuestions[answeredQuestions.length - 1].correct
          ? correctCount
          : correctCount
        : correctCount;
      setIsFinished(true);
      onComplete(finalCorrect, totalQuestions);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsRevealed(false);
    }
  }, [isLastQuestion, correctCount, totalQuestions, answeredQuestions, onComplete]);

  const getStars = (score: number, total: number) => {
    const pct = total > 0 ? score / total : 0;
    if (pct >= 1) return 3;
    if (pct > 0.5) return 2;
    return 1;
  };

  // --- Completion Screen ---
  if (isFinished) {
    const stars = getStars(correctCount, totalQuestions);
    const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 text-center space-y-6"
        role="status"
        aria-label={`学习完成，得分${pct}%，答对${correctCount}题`}
      >
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 12 }}
          className="inline-flex items-center justify-center w-24 h-24 bg-primary-container rounded-full"
        >
          <Trophy className="w-12 h-12 text-primary fill-current" />
        </motion.div>

        <div>
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-black text-on-surface mb-2 flex items-center justify-center gap-2"
          >
            <PartyPopper className="w-7 h-7 text-tertiary" />
            学习完成！
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-on-surface-variant"
          >
            你答对了 {correctCount} / {totalQuestions} 题
          </motion.p>
        </div>

        {/* Stars */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-3"
          aria-label={`${stars}颗星`}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -180 }}
              animate={{
                scale: i < stars ? 1 : 0.7,
                rotate: 0,
              }}
              transition={{ delay: 0.6 + i * 0.15, type: 'spring', damping: 10 }}
            >
              <Star
                className={cn(
                  'w-12 h-12 transition-colors',
                  i < stars
                    ? 'text-tertiary fill-current drop-shadow-lg'
                    : 'text-outline-variant/30'
                )}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Score */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="inline-flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-6 py-3 rounded-full font-black text-lg"
        >
          <Sparkles className="w-5 h-5" />
          得分 {pct}%
        </motion.div>
      </motion.div>
    );
  }

  // --- Question Screen ---
  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-on-surface-variant">
            {currentQuestion.sectionTitle}
          </span>
          <span className="text-sm font-bold text-primary" aria-live="polite">
            {currentIndex + 1} / {totalQuestions}
          </span>
        </div>
        <div
          className="w-full h-2.5 bg-surface-container rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalQuestions}
          aria-label="答题进度"
        >
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{
              width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 120 }}
          />
        </div>
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 space-y-5"
        >
          {/* Question Text */}
          <h4 className="text-xl font-black text-on-surface leading-relaxed">
            {currentQuestion.q}
          </h4>

          {/* Options — semantic radio group */}
          <fieldset className="space-y-3 border-0 p-0 m-0">
            <legend className="sr-only">选择答案</legend>
            {currentQuestion.options.map((option, idx) => {
              const isCorrectOption = idx === currentAnswerIndex;
              const isSelected = idx === selectedOption;
              const showCorrect = isRevealed && isCorrectOption;
              const showWrong = isRevealed && isSelected && !isCorrectOption;

              return (
                <motion.button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={selectedOption === idx}
                  aria-label={`选项${String.fromCharCode(65 + idx)}: ${option}`}
                  onClick={() => handleSelect(idx)}
                  disabled={isRevealed}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  whileHover={!isRevealed ? { scale: 1.02 } : undefined}
                  whileTap={!isRevealed ? { scale: 0.98 } : undefined}
                  className={cn(
                    'w-full text-left px-5 py-4 rounded-xl border-2 font-bold transition-all flex items-center gap-4',
                    showCorrect &&
                      'bg-[#e8f5e9] border-[#4caf50] text-[#2e7d32]',
                    showWrong &&
                      'bg-[#ffebee] border-[#f44336] text-[#c62828]',
                    !isRevealed &&
                      !showCorrect &&
                      !showWrong &&
                      'bg-surface-container border-outline-variant/30 text-on-surface hover:border-primary/50 hover:bg-primary-container/20',
                    isRevealed &&
                      !showCorrect &&
                      !showWrong &&
                      'bg-surface-container border-outline-variant/15 text-on-surface-variant opacity-50'
                  )}
                >
                  {/* Option Label */}
                  <span
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0',
                      showCorrect && 'bg-[#4caf50] text-white',
                      showWrong && 'bg-[#f44336] text-white',
                      !isRevealed && 'bg-primary-container text-on-primary-container'
                    )}
                  >
                    {showCorrect ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : showWrong ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      String.fromCharCode(65 + idx)
                    )}
                  </span>
                  <span className="flex-1">{option}</span>
                </motion.button>
              );
            })}
          </fieldset>

          {/* Feedback Message */}
          <AnimatePresence>
            {isRevealed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                aria-live="polite"
                className={cn(
                  'rounded-xl p-4 text-center font-bold text-lg flex items-center justify-center gap-2',
                  selectedOption === currentAnswerIndex
                    ? 'bg-[#e8f5e9] text-[#2e7d32]'
                    : 'bg-[#fff8e1] text-[#e65100]'
                )}
              >
                {selectedOption === currentAnswerIndex ? (
                  <>
                    <Sparkles className="w-5 h-5" />
                    太棒了！
                  </>
                ) : (
                  <>
                    <Flame className="w-5 h-5" />
                    加油哦！再试试~
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {/* Next Button */}
      <AnimatePresence>
        {isRevealed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <button
              onClick={handleNext}
              className="w-full bg-primary text-on-primary py-4 rounded-full text-lg font-black shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all flex items-center justify-center gap-3 tactile-press"
            >
              {isLastQuestion ? (
                <>
                  <Trophy className="w-5 h-5" />
                  查看结果
                </>
              ) : (
                <>
                  下一题
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
