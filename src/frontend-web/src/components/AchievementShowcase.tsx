import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Trophy,
  Star,
  BookOpen,
  Calculator,
  Microscope,
  Palette,
  Users,
  Sparkles,
  Loader2,
  Lock,
  Award,
  Target,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { Achievement } from '@/types';

interface AchievementShowcaseProps {
  onBack: () => void;
  userId: number;
}

// Map icon string from API to lucide component
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  star: Star,
  book: BookOpen,
  'book-open': BookOpen,
  calculator: Calculator,
  microscope: Microscope,
  palette: Palette,
  users: Users,
  sparkles: Sparkles,
  award: Award,
  target: Target,
  trending: TrendingUp,
  'trending-up': TrendingUp,
};

const fallbackIcons = [Trophy, Star, BookOpen, Calculator, Microscope, Palette, Users, Sparkles, Award, Target];

function getIcon(iconName: string, index: number) {
  const key = iconName.toLowerCase().replace(/[\s_-]+/g, '-');
  return iconMap[key] || fallbackIcons[index % fallbackIcons.length];
}

// Icon color palette for badges
const badgeColors = [
  { bg: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { bg: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
  { bg: 'bg-primary-container', text: 'text-on-primary-container' },
  { bg: 'bg-[#ffefec]', text: 'text-error' },
  { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant' },
  { bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]' },
  { bg: 'bg-[#fff8e1]', text: 'text-[#e65100]' },
  { bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]' },
];

export default function AchievementShowcase({ onBack, userId }: AchievementShowcaseProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.getAchievements(userId);
        setAchievements(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch achievements:', err);
        setError('加载成就数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      fetchAchievements();
    }
  }, [userId]);

  // Derived stats
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;
  const totalCount = achievements.length;
  const totalStars = unlockedCount * 3; // 3 stars per unlocked achievement
  const totalPoints = achievements.reduce(
    (sum, a) => sum + (a.unlockedAt ? a.totalRequired * 10 : a.progress),
    0
  );
  const level = Math.floor(totalPoints / 100) + 1;

  // Growth tree levels (based on unlocked count)
  const treeLevels = [
    { label: '种子', min: 0, emoji: '🌱' },
    { label: '小芽', min: 1, emoji: '🌿' },
    { label: '小树', min: 3, emoji: '🌲' },
    { label: '大树', min: 6, emoji: '🌳' },
    { label: '参天大树', min: 10, emoji: '🏆' },
  ];

  const currentTreeLevel = [...treeLevels].reverse().find((l) => unlockedCount >= l.min) || treeLevels[0];
  const nextTreeLevel = treeLevels.find((l) => unlockedCount < l.min);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-background z-50 flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-on-surface-variant font-medium">加载成就中...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 bg-background z-50 overflow-y-auto"
    >
      {/* Header */}
      <header className="sticky top-0 bg-surface-container-low z-40 border-b border-outline-variant/15">
        <div className="flex items-center gap-4 px-6 py-4 max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="p-2 hover:bg-surface-container rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-on-surface" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-on-surface">我的成就</h1>
            <p className="text-sm text-on-surface-variant">
              已解锁 {unlockedCount} / {totalCount} 个成就
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary fill-current" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 pb-16 space-y-8">
        {/* Error State */}
        {error && (
          <div className="bg-error-container/20 text-error rounded-2xl p-6 text-center">
            <p className="font-bold">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-6 py-2 bg-error text-on-error rounded-full font-bold text-sm"
            >
              重试
            </button>
          </div>
        )}

        {/* Stats Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-4"
        >
          <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Star className="w-5 h-5 text-tertiary fill-current" />
            </div>
            <p className="text-2xl font-black text-on-surface">{totalStars}</p>
            <p className="text-xs font-bold text-on-surface-variant mt-1">星星总数</p>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-black text-on-surface">{totalPoints}</p>
            <p className="text-xs font-bold text-on-surface-variant mt-1">积分</p>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Award className="w-5 h-5 text-secondary" />
            </div>
            <p className="text-2xl font-black text-on-surface">Lv.{level}</p>
            <p className="text-xs font-bold text-on-surface-variant mt-1">等级</p>
          </div>
        </motion.div>

        {/* Growth Tree */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15"
        >
          <h3 className="text-lg font-black text-on-surface mb-4 flex items-center gap-2">
            🌱 成长之树
          </h3>
          <div className="flex items-end justify-between gap-2 px-2">
            {treeLevels.map((lvl, i) => {
              const isActive = unlockedCount >= lvl.min;
              const isCurrent = lvl.label === currentTreeLevel.label;
              return (
                <div key={i} className="flex flex-col items-center gap-2 flex-1">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.08, type: 'spring', damping: 12 }}
                    className={cn(
                      'w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 transition-all',
                      isCurrent
                        ? 'bg-primary-container border-primary shadow-lg scale-110'
                        : isActive
                        ? 'bg-primary-container/50 border-primary/30'
                        : 'bg-surface-container border-outline-variant/20 opacity-40'
                    )}
                  >
                    {lvl.emoji}
                  </motion.div>
                  <span
                    className={cn(
                      'text-[10px] font-bold text-center leading-tight',
                      isCurrent ? 'text-primary' : 'text-on-surface-variant'
                    )}
                  >
                    {lvl.label}
                  </span>
                  {i < treeLevels.length - 1 && (
                    <div
                      className={cn(
                        'h-1 w-full rounded-full',
                        isActive ? 'bg-primary/50' : 'bg-outline-variant/20'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {nextTreeLevel && (
            <p className="text-center text-sm text-on-surface-variant mt-4">
              再解锁 <span className="font-black text-primary">{nextTreeLevel.min - unlockedCount}</span> 个成就即可升级为「{nextTreeLevel.label}」
            </p>
          )}
        </motion.div>

        {/* Badge Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-lg font-black text-on-surface mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary fill-current" />
            成就徽章
          </h3>

          {achievements.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-12 border border-outline-variant/15 text-center">
              <Sparkles className="w-12 h-12 text-outline-variant mx-auto mb-4" />
              <p className="text-on-surface-variant font-bold">还没有成就</p>
              <p className="text-sm text-on-surface-variant mt-2">开始学习来解锁你的第一个成就吧！</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {achievements.map((achievement, idx) => {
                const isUnlocked = !!achievement.unlockedAt;
                const IconComponent = getIcon(achievement.icon, idx);
                const colorSet = badgeColors[idx % badgeColors.length];

                return (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: 0.25 + idx * 0.06,
                      type: 'spring',
                      damping: 15,
                      stiffness: 200,
                    }}
                    whileHover={{ scale: 1.03 }}
                    className={cn(
                      'bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 relative overflow-hidden',
                      !isUnlocked && 'opacity-60'
                    )}
                  >
                    {/* Badge Icon */}
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                          isUnlocked ? colorSet.bg : 'bg-surface-container'
                        )}
                      >
                        {isUnlocked ? (
                          <IconComponent
                            className={cn('w-6 h-6', colorSet.text)}
                          />
                        ) : (
                          <Lock className="w-6 h-6 text-on-surface-variant" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-on-surface text-sm leading-tight line-clamp-1">
                          {achievement.name}
                        </h4>
                        <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">
                          {achievement.description}
                        </p>
                      </div>
                    </div>

                    {/* Progress / Date */}
                    <div className="flex items-center justify-between">
                      {isUnlocked ? (
                        <span className="text-[10px] font-bold text-primary">
                          {new Date(achievement.unlockedAt!).toLocaleDateString('zh-CN')}
                        </span>
                      ) : (
                        <div className="flex-1">
                          <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/50 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  achievement.totalRequired > 0
                                    ? (achievement.progress / achievement.totalRequired) * 100
                                    : 0
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-bold mt-1 block">
                            {achievement.progress}/{achievement.totalRequired}
                          </span>
                        </div>
                      )}
                      {!isUnlocked && (
                        <span className="text-[10px] font-black text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-md ml-2">
                          未解锁
                        </span>
                      )}
                    </div>

                    {/* Shine effect for unlocked */}
                    {isUnlocked && (
                      <div className="absolute -top-4 -right-4 w-16 h-16 bg-primary/5 rounded-full blur-xl" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>
    </motion.div>
  );
}
