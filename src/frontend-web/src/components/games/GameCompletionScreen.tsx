import { motion } from 'motion/react';
import { Trophy, Star, Sparkles, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameCompletionScreenProps {
  score: number;
  total: number;
  onDismiss?: () => void;
}

export default function GameCompletionScreen({ score, total, onDismiss }: GameCompletionScreenProps) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const stars = pct >= 100 ? 3 : pct > 50 ? 2 : 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 text-center space-y-6"
      role="status"
      aria-label={`完成！得分${pct}%`}
    >
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
          太棒了！
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-on-surface-variant"
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
                'w-12 h-12 transition-colors',
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
        className="inline-flex items-center gap-2 bg-tertiary-container text-on-tertiary-container px-6 py-3 rounded-full font-black text-lg"
      >
        <Sparkles className="w-5 h-5" />
        得分 {pct}%
      </motion.div>

      {onDismiss && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <button
            onClick={onDismiss}
            className="mt-4 bg-primary text-on-primary px-8 py-3 rounded-full font-bold shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press"
          >
            继续聊天
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
