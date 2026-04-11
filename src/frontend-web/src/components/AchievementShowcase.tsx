import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Calculator,
  Lock,
  Microscope,
  Palette,
  Sparkles,
  Sprout,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from '@/icons';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { Achievement, AchievementDisplay } from '@/types';
import { Button, Card, EmptyState, IconButton, Skeleton, TopBar } from './ui';

interface AchievementShowcaseProps {
  onBack: () => void;
  userId: number;
}

type AchievementItem = Achievement & Partial<AchievementDisplay>;

interface NormalizedAchievement {
  id: number;
  name: string;
  description: string;
  icon?: string;
  unlockedAt?: string;
  progress: number;
  totalRequired: number;
}

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
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

const badgeColors = [
  'bg-primary-container text-on-primary-container',
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-container text-on-tertiary-container',
  'bg-surface-container-high text-on-surface',
  'bg-success-container text-on-success-container',
  'bg-warning-container text-on-warning-container',
];

const levelMilestones = [
  { label: '启蒙种子', min: 0 },
  { label: '探索芽芽', min: 1 },
  { label: '成长小树', min: 3 },
  { label: '闪耀大树', min: 6 },
  { label: '冠军树王', min: 10 },
];

function resolveIcon(iconName: string | undefined, index: number) {
  if (!iconName) return fallbackIcons[index % fallbackIcons.length];
  const key = iconName.toLowerCase().replace(/[\s_]+/g, '-');
  return iconMap[key] || fallbackIcons[index % fallbackIcons.length];
}

function getProgressRatio(progress: number, totalRequired: number) {
  if (!totalRequired || totalRequired <= 0) return 0;
  return Math.min(1, Math.max(0, progress / totalRequired));
}

function LoadingView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-app pb-safe">
      <TopBar
        title="我的成就"
        subtitle="正在加载成长数据..."
        leftSlot={(
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
      />
      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6">
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-44 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

export default function AchievementShowcase({ onBack, userId }: AchievementShowcaseProps) {
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);

  const normalizeAchievement = useCallback((item: AchievementItem): NormalizedAchievement => {
    const unlockedAt = item.unlockedAt ?? item.earnedAt;
    const totalRequired = item.totalRequired && item.totalRequired > 0 ? item.totalRequired : 1;
    const progress = typeof item.progress === 'number' ? item.progress : unlockedAt ? totalRequired : 0;

    return {
      id: item.id,
      name: item.name ?? item.achievementName ?? '未命名成就',
      description: item.description ?? '完成学习任务即可逐步解锁。',
      icon: item.icon,
      unlockedAt,
      progress,
      totalRequired,
    };
  }, []);

  const fetchAchievements = useCallback(async () => {
    if (!userId) {
      setAchievements([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = (await api.getAchievements(userId)) as AchievementItem[];
      setAchievements(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch achievements:', err);
      setError('成就数据加载失败，请稍后再试。');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements, refreshSeed]);

  useEffect(() => {
    const handler = () => setRefreshSeed((value) => value + 1);
    window.addEventListener('achievements-updated', handler);
    return () => window.removeEventListener('achievements-updated', handler);
  }, []);

  const normalizedAchievements = useMemo(
    () => achievements.map(normalizeAchievement),
    [achievements, normalizeAchievement],
  );

  const unlockedCount = normalizedAchievements.filter((item) => Boolean(item.unlockedAt)).length;
  const totalCount = normalizedAchievements.length;
  const totalPoints = normalizedAchievements.reduce((sum, item) => {
    if (item.unlockedAt) return sum + item.totalRequired * 10;
    return sum + item.progress;
  }, 0);
  const totalStars = unlockedCount * 3;
  const level = Math.floor(totalPoints / 100) + 1;

  const currentMilestone = [...levelMilestones].reverse().find((item) => unlockedCount >= item.min) || levelMilestones[0];
  const nextMilestone = levelMilestones.find((item) => unlockedCount < item.min);

  if (isLoading) {
    return <LoadingView onBack={onBack} />;
  }

  return (
    <div className="min-h-app pb-safe">
      <TopBar
        title="我的成就"
        subtitle={`已解锁 ${unlockedCount}/${totalCount} 项`}
        leftSlot={(
          <IconButton aria-label="返回" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
      />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
        {error && (
          <Card className="border-error-container/40 bg-error-container/15 p-4">
            <p className="text-sm font-semibold text-error">{error}</p>
            <Button className="mt-3" variant="danger" onClick={fetchAchievements}>
              重新加载
            </Button>
          </Card>
        )}

        <section className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary-container text-on-tertiary-container">
              <Star className="h-5 w-5" />
            </div>
            <p className="text-2xl font-black text-on-surface">{totalStars}</p>
            <p className="text-xs font-semibold text-on-surface-variant">星星总数</p>
          </Card>

          <Card className="p-4 text-center">
            <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="text-2xl font-black text-on-surface">{totalPoints}</p>
            <p className="text-xs font-semibold text-on-surface-variant">成长积分</p>
          </Card>

          <Card className="p-4 text-center">
            <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
              <Award className="h-5 w-5" />
            </div>
            <p className="text-2xl font-black text-on-surface">Lv.{level}</p>
            <p className="text-xs font-semibold text-on-surface-variant">当前等级</p>
          </Card>
        </section>

        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-on-surface">
            <Sprout className="h-5 w-5 text-success" />
            成长里程碑
          </h2>

          <div className="flex flex-wrap gap-2">
            {levelMilestones.map((item) => {
              const active = unlockedCount >= item.min;
              const current = item.label === currentMilestone.label;
              return (
                <div
                  key={item.label}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                    current
                      ? 'border-primary bg-primary-container text-on-primary-container'
                      : active
                      ? 'border-secondary-container bg-secondary-container/25 text-on-surface'
                      : 'border-outline-variant/25 bg-surface text-on-surface-variant',
                  )}
                >
                  {item.label}
                </div>
              );
            })}
          </div>

          {nextMilestone ? (
            <p className="mt-3 text-sm text-on-surface-variant">
              再解锁 <span className="font-black text-primary">{nextMilestone.min - unlockedCount}</span> 项成就，即可升级为
              <span className="font-black text-primary"> {nextMilestone.label}</span>。
            </p>
          ) : (
            <p className="mt-3 text-sm font-semibold text-success">你已经达到最高里程碑，继续保持！</p>
          )}
        </Card>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-on-surface">
            <Trophy className="h-5 w-5 text-primary" />
            成就徽章
          </h2>

          {normalizedAchievements.length === 0 ? (
            <EmptyState
              title="还没有解锁成就"
              description="完成一节学习内容，就能点亮你的第一个徽章。"
              actionLabel="去学习"
              onAction={onBack}
              icon={<Sparkles className="h-6 w-6 text-primary" />}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {normalizedAchievements.map((achievement, index) => {
                const unlocked = Boolean(achievement.unlockedAt);
                const Icon = resolveIcon(achievement.icon, index);
                const ratio = getProgressRatio(achievement.progress, achievement.totalRequired);

                return (
                  <Card
                    key={achievement.id}
                    className={cn('relative overflow-hidden p-4', !unlocked && 'opacity-80')}
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                          unlocked ? badgeColors[index % badgeColors.length] : 'bg-surface-container text-on-surface-variant',
                        )}
                      >
                        {unlocked ? <Icon className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-1 text-sm font-black text-on-surface">{achievement.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">{achievement.description}</p>
                      </div>
                    </div>

                    {unlocked ? (
                      <p className="text-xs font-semibold text-primary">
                        解锁时间：{new Date(achievement.unlockedAt || '').toLocaleDateString('zh-CN')}
                      </p>
                    ) : (
                      <div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs font-semibold text-on-surface-variant">
                          进度 {achievement.progress}/{achievement.totalRequired}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
