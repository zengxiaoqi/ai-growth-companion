import { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Star, Sparkles, PartyPopper, ChevronDown, ChevronRight, CheckCircle, XCircle } from '@/icons';
import { cn } from '@/lib/utils';

export interface ReviewItem {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

interface GameCompletionScreenProps {
  score: number;
  total: number;
  reviewData?: ReviewItem[];
  onDismiss?: () => void;
}

export default function GameCompletionScreen({ score, total, reviewData, onDismiss }: GameCompletionScreenProps) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const stars = pct >= 100 ? 3 : pct > 50 ? 2 : 1;
  const [showReview, setShowReview] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 border border-outline-variant/15 text-center space-y-4 sm:space-y-5"
      role="status"
      aria-label={`完成！得分${pct}%`}
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: 'spring', damping: 12 }}
        className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-primary-container rounded-full"
      >
        <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-primary fill-current" />
      </motion.div>

      <div>
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg sm:text-xl font-black text-on-surface mb-1 flex items-center justify-center gap-2"
        >
          <PartyPopper className="w-5 h-5 sm:w-6 sm:h-6 text-tertiary" />
          太棒了！
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-on-surface-variant text-sm"
        >
          你答对了 {score} / {total} 题
        </motion.p>
      </div>

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
            animate={{ scale: i < stars ? 1 : 0.7, rotate: 0 }}
            transition={{ delay: 0.6 + i * 0.15, type: 'spring', damping: 10 }}
          >
            <Star
              className={cn(
                'w-8 h-8 sm:w-10 sm:h-10 transition-colors',
                i < stars ? 'text-tertiary fill-current drop-shadow-lg' : 'text-outline-variant/30'
              )}
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="inline-flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-5 py-2.5 rounded-full font-black text-base"
      >
        <Sparkles className="w-5 h-5" />
        得分 {pct}%
      </motion.div>

      {/* Answer review section */}
      {reviewData && reviewData.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="text-left"
        >
          <button
            onClick={() => setShowReview(!showReview)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            <span className="font-bold text-on-surface text-sm flex items-center gap-2">
              查看答案解析
            </span>
            {showReview ? <ChevronDown className="w-4 h-4 text-on-surface-variant" /> : <ChevronRight className="w-4 h-4 text-on-surface-variant" />}
          </button>

          {showReview ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1"
            >
              {reviewData.map((item, i) => (
                <div key={i} className={cn(
                  'rounded-xl p-3 border-2',
                  item.isCorrect ? 'bg-success-container/50 border-success/30' : 'bg-danger-container/50 border-danger/30',
                )}>
                  <div className="flex items-start gap-2">
                    {item.isCorrect ? (
                      <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface leading-tight">{i + 1}. {item.question}</p>
                      {!item.isCorrect ? (
                        <p className="text-xs text-on-danger-container mt-1">你的答案：{item.userAnswer}</p>
                      ) : null}
                      <p className={cn('text-xs mt-0.5', item.isCorrect ? 'text-on-success-container' : 'text-on-success-container' )}>
                        正确答案：{item.correctAnswer}
                      </p>
                      {item.explanation ? (
                        <p className="text-xs text-on-surface-variant mt-1.5 bg-surface-container/50 rounded px-2 py-1.5">
                          {item.explanation}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}

      {onDismiss ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <button
            onClick={onDismiss}
            className="mt-2 w-full sm:w-auto bg-primary text-on-primary px-6 sm:px-8 py-3 sm:py-3.5 rounded-full font-bold shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press min-h-[48px]"
          >
            继续聊天
          </button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
