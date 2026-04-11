import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle,
  Flame,
  PartyPopper,
  Sparkles,
  Star,
  Trophy,
  XCircle,
} from '@/icons';
import { cn } from '../../lib/utils';
import { Button, Card } from '../ui';

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

interface FlattenedQuestion extends QuizQuestion {
  sectionTitle: string;
}

function getAnswerIndex(question: QuizQuestion): number {
  const raw = Number((question as unknown as { answer: unknown }).answer);
  const optionLength = Array.isArray(question.options) ? question.options.length : 0;

  if (!Number.isFinite(raw) || optionLength === 0) return 0;

  const normalized = Math.trunc(raw);
  if (normalized >= 0 && normalized < optionLength) return normalized;

  const oneBased = normalized - 1;
  if (oneBased >= 0 && oneBased < optionLength) return oneBased;

  return 0;
}

function getStars(correctCount: number, total: number): number {
  if (total <= 0) return 1;
  const ratio = correctCount / total;
  if (ratio >= 1) return 3;
  if (ratio >= 0.6) return 2;
  return 1;
}

export default function QuizEngine({ sections, onComplete }: QuizEngineProps) {
  const allQuestions = useMemo<FlattenedQuestion[]>(
    () =>
      sections
        .filter((section) => Array.isArray(section.questions) && section.questions.length > 0)
        .flatMap((section) =>
          (section.questions || []).map((question) => ({
            ...question,
            sectionTitle: section.title || '互动练习',
          })),
        ),
    [sections],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const totalQuestions = allQuestions.length;
  const currentQuestion = allQuestions[currentIndex];

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (!currentQuestion || isRevealed) return;

      setSelectedOption(optionIndex);
      setIsRevealed(true);

      const answerIndex = getAnswerIndex(currentQuestion);
      if (optionIndex === answerIndex) {
        setCorrectCount((value) => value + 1);
      }
    },
    [currentQuestion, isRevealed],
  );

  const handleNext = useCallback(() => {
    const isLast = currentIndex === totalQuestions - 1;

    if (isLast) {
      setIsFinished(true);
      return;
    }

    setCurrentIndex((value) => value + 1);
    setSelectedOption(null);
    setIsRevealed(false);
  }, [currentIndex, totalQuestions]);

  const finalScore = useMemo(() => {
    if (totalQuestions <= 0) return 0;
    return Math.round((correctCount / totalQuestions) * 100);
  }, [correctCount, totalQuestions]);

  const stars = useMemo(() => getStars(correctCount, totalQuestions), [correctCount, totalQuestions]);

  const finishQuiz = useCallback(() => {
    onComplete(correctCount, totalQuestions);
  }, [correctCount, onComplete, totalQuestions]);

  if (totalQuestions === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-base font-black text-on-surface">当前内容暂无可作答题目</p>
        <p className="mt-1 text-sm text-on-surface-variant">返回上一页后可继续其他学习内容。</p>
        <Button className="mt-4" variant="secondary" onClick={() => onComplete(0, 0)}>
          继续
        </Button>
      </Card>
    );
  }

  if (isFinished) {
    return (
      <Card className="space-y-5 p-6 text-center md:p-7" role="status" aria-live="polite">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-container"
        >
          <Trophy className="h-10 w-10 text-primary" />
        </motion.div>

        <div>
          <h3 className="flex items-center justify-center gap-2 text-2xl font-black text-on-surface">
            <PartyPopper className="h-6 w-6 text-tertiary" />
            挑战完成
          </h3>
          <p className="mt-1 text-sm text-on-surface-variant">你答对了 {correctCount} / {totalQuestions} 题</p>
        </div>

        <div className="flex items-center justify-center gap-3" aria-label={`获得 ${stars} 颗星`}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Star
              key={index}
              className={cn('h-10 w-10', index < stars ? 'fill-current text-tertiary' : 'text-outline-variant/35')}
            />
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-tertiary-container px-4 py-1.5 text-sm font-black text-on-tertiary-container">
          <Sparkles className="h-4 w-4" />
          得分 {finalScore}%
        </div>

        <Button size="lg" className="w-full" onClick={finishQuiz}>
          查看学习结果
        </Button>
      </Card>
    );
  }

  const answerIndex = currentQuestion ? getAnswerIndex(currentQuestion) : 0;
  const isLast = currentIndex === totalQuestions - 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-on-surface-variant">{currentQuestion.sectionTitle}</span>
          <span className="font-black text-primary">{currentIndex + 1} / {totalQuestions}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-container" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={totalQuestions}>
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
            transition={{ type: 'spring', damping: 20, stiffness: 140 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22 }}
        >
          <Card className="space-y-4 p-5 md:p-6">
            <h4 className="text-xl font-black leading-relaxed text-on-surface">{currentQuestion.q}</h4>

            <fieldset className="space-y-2.5">
              <legend className="sr-only">选择答案</legend>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedOption === index;
                const isCorrectOption = index === answerIndex;
                const showCorrect = isRevealed && isCorrectOption;
                const showWrong = isRevealed && isSelected && !isCorrectOption;

                return (
                  <button
                    key={index}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelect(index)}
                    disabled={isRevealed}
                    className={cn(
                      'touch-target w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-bold transition-all',
                      showCorrect && 'border-success bg-success-container text-on-success-container',
                      showWrong && 'border-error bg-error-container/20 text-error',
                      !showCorrect && !showWrong && !isRevealed && 'border-outline-variant/30 bg-surface hover:border-primary/45',
                      !showCorrect && !showWrong && isRevealed && 'border-outline-variant/20 bg-surface-container text-on-surface-variant opacity-70',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
                          showCorrect && 'bg-success text-white',
                          showWrong && 'bg-error text-white',
                          !showCorrect && !showWrong && 'bg-primary-container text-on-primary-container',
                        )}
                      >
                        {showCorrect ? <CheckCircle className="h-4 w-4" /> : showWrong ? <XCircle className="h-4 w-4" /> : String.fromCharCode(65 + index)}
                      </span>
                      <span className="flex-1">{option}</span>
                    </span>
                  </button>
                );
              })}
            </fieldset>

            {isRevealed ? (
              <div
                className={cn(
                  'rounded-xl px-4 py-3 text-sm font-black',
                  selectedOption === answerIndex ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container',
                )}
              >
                {selectedOption === answerIndex ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    回答正确，继续下一题！
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="h-4 w-4" />
                    再接再厉，正确答案已高亮。
                  </span>
                )}
              </div>
            ) : null}
          </Card>
        </motion.div>
      </AnimatePresence>

      {isRevealed ? (
        <Button size="lg" className="w-full rounded-full" onClick={handleNext}>
          {isLast ? (
            <>
              <Trophy className="h-5 w-5" />
              完成挑战
            </>
          ) : (
            <>
              下一题
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
