import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  ChevronLeft,
  Clock,
  Target,
  Sparkles,
  Trophy,
  TrendingUp,
  BookOpen,
  Loader2,
} from '@/icons';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { GrowthReport, Achievement } from '@/types';
import AIChat from './AIChat';
import { Card, EmptyState, IconButton, Tabs, TabsList, TabsTrigger } from './ui';
import { DOMAIN_CONFIG as PARENT_DOMAIN_CONFIG } from './parent/constants';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'daily', label: '日报' },
  { key: 'weekly', label: '周报' },
  { key: 'monthly', label: '月报' },
];

const DOMAIN_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  language: {
    label: PARENT_DOMAIN_CONFIG.language.label,
    color: PARENT_DOMAIN_CONFIG.language.color,
    textColor: PARENT_DOMAIN_CONFIG.language.textColor,
  },
  math: {
    label: PARENT_DOMAIN_CONFIG.math.label,
    color: PARENT_DOMAIN_CONFIG.math.color,
    textColor: PARENT_DOMAIN_CONFIG.math.textColor,
  },
  science: {
    label: PARENT_DOMAIN_CONFIG.science.label,
    color: PARENT_DOMAIN_CONFIG.science.color,
    textColor: PARENT_DOMAIN_CONFIG.science.textColor,
  },
  art: {
    label: PARENT_DOMAIN_CONFIG.art.label,
    color: PARENT_DOMAIN_CONFIG.art.color,
    textColor: PARENT_DOMAIN_CONFIG.art.textColor,
  },
  social: {
    label: PARENT_DOMAIN_CONFIG.social.label,
    color: PARENT_DOMAIN_CONFIG.social.color,
    textColor: PARENT_DOMAIN_CONFIG.social.textColor,
  },
};

interface ReportDetailProps {
  userId: number;
  onBack: () => void;
}

export default function ReportDetail({ userId, onBack }: ReportDetailProps) {
  const [period, setPeriod] = useState<Period>('weekly');
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [report, achs] = await Promise.all([
          api.getReport({ userId, period }).catch(() => null),
          api.getAchievements(userId).catch(() => []),
        ]);

        if (report) setReportData(report);
        if (achs.length > 0) setAchievements(achs);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData().catch(() => {
      setIsLoading(false);
    });
  }, [userId, period]);

  const dailyStats = reportData?.dailyStats ?? [];
  const barChartData = dailyStats.map((stat) => ({
    name: new Date(stat.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    minutes: Math.round(stat.totalTime / 60),
    lessons: stat.completedLessons,
  }));

  const skillProgress = reportData?.skillProgress ?? {
    language: 0,
    math: 0,
    science: 0,
    art: 0,
    social: 0,
  };

  const totalTime = reportData?.totalLearningTime ? Math.round(reportData.totalLearningTime / 60) : 0;
  const totalLessons = reportData?.totalLessonsCompleted ?? 0;
  const avgScore = reportData?.averageScore ?? 0;

  const displayAchievements = achievements.slice(0, 4);
  const aiSuggestions = reportData?.insights?.length ? reportData.insights : [];

  return (
    <div className="pb-[calc(10rem+var(--safe-area-bottom))]">
      <header className="sticky top-0 z-40 w-full rounded-b-[1.5rem] bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-6 py-5 pt-safe md:px-8">
          <IconButton onClick={onBack} className="rounded-xl hover:bg-surface-container-low" aria-label="返回">
            <ChevronLeft className="h-6 w-6 text-on-secondary-container" />
          </IconButton>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">学习报告详情</h1>
            <p className="text-sm font-medium text-on-surface-variant">全面了解孩子在不同能力维度的成长情况</p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="mx-auto mt-8 max-w-7xl px-6 md:px-8">
          <Card className="flex items-center justify-center gap-3 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium text-on-surface-variant">报告加载中...</span>
          </Card>
        </div>
      ) : (
        <main className="mx-auto mt-8 max-w-7xl space-y-8 px-6 md:px-8">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <TabsList>
              {PERIOD_TABS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Card className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary-container/35">
                <Clock className="h-6 w-6 text-on-secondary-container" />
              </div>
              <div>
                <p className="text-xs font-medium text-on-surface-variant">总学习时长</p>
                <p className="text-2xl font-black text-on-secondary-container">{totalTime}<span className="ml-1 text-sm font-bold">分钟</span></p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tertiary-container/35">
                <BookOpen className="h-6 w-6 text-on-tertiary-container" />
              </div>
              <div>
                <p className="text-xs font-medium text-on-surface-variant">完成课程</p>
                <p className="text-2xl font-black text-on-tertiary-container">{totalLessons}<span className="ml-1 text-sm font-bold">节</span></p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container/35">
                <Target className="h-6 w-6 text-on-primary-container" />
              </div>
              <div>
                <p className="text-xs font-medium text-on-surface-variant">平均得分</p>
                <p className="text-2xl font-black text-on-primary-container">{avgScore}<span className="ml-1 text-sm font-bold">分</span></p>
              </div>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <Card className="p-6 md:p-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-on-surface">每日学习统计</h3>
                  <p className="text-sm text-on-surface-variant">学习时长与课程完成趋势</p>
                </div>
              </div>

              <div className="h-72">
                {barChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#b9ae6e" strokeOpacity={0.2} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#81783d', fontSize: 11, fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#81783d', fontSize: 11 }} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                      <Bar dataKey="minutes" name="学习时长(分钟)" radius={[6, 6, 0, 0]} fill="#006384" />
                      <Bar dataKey="lessons" name="课程数" radius={[6, 6, 0, 0]} fill="#586000" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="暂无学习数据" description="完成学习任务后，这里会显示趋势图。" />
                )}
              </div>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="p-6 md:p-8">
              <h3 className="mb-6 text-xl font-black text-on-surface">技能进度</h3>
              <div className="space-y-5">
                {Object.entries(skillProgress).map(([domain, progress], i) => {
                  const config = DOMAIN_CONFIG[domain];
                  if (!config) return null;

                  return (
                    <div key={domain} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-white', config.color)}>
                            {config.label[0]}
                          </span>
                          <span className="text-sm font-bold text-on-surface">{config.label}</span>
                        </div>
                        <span className="text-sm font-black text-on-surface">{progress}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-surface-container">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.8, delay: i * 0.12, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', config.color)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card className="p-6 md:p-8">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-black text-on-surface">成就亮点</h3>
              </div>

              {displayAchievements.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {displayAchievements.map((ach, i) => (
                    <motion.div
                      key={ach.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: i * 0.08 }}
                      className={cn(
                        'flex items-start gap-4 rounded-xl border p-4',
                        ach.unlockedAt ? 'border-primary/20 bg-primary-container/20' : 'border-outline-variant/10 bg-surface-container-low',
                      )}
                    >
                      <span className="text-3xl" aria-hidden="true">🏅</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm font-bold text-on-surface">{ach.name}</h4>
                          {ach.unlockedAt && <span className="rounded-full bg-primary-container/40 px-2 py-0.5 text-[10px] font-bold text-primary">已解锁</span>}
                        </div>
                        <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{ach.description}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((ach.progress / ach.totalRequired) * 100, 100)}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] text-on-surface-variant">{ach.progress}/{ach.totalRequired}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyState title="暂无成就" description="继续学习即可解锁更多成长徽章。" icon={<Trophy className="h-10 w-10 text-primary/70" />} />
              )}
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="relative overflow-hidden rounded-2xl bg-on-secondary-container p-6 text-on-secondary md:p-8"
          >
            <div className="relative z-10">
              <div className="mb-6 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary-container" />
                <h3 className="text-xl font-black">AI 学习建议</h3>
              </div>
              {aiSuggestions.length > 0 ? (
                <div className="space-y-3">
                  {aiSuggestions.map((suggestion, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      className="flex items-start gap-2 rounded-xl bg-white/10 p-4"
                    >
                      <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary-container" />
                      <p className="text-sm leading-relaxed">{suggestion}</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-white/10 p-4">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary-container" />
                  <p className="text-sm leading-relaxed">继续学习后，AI 会根据最新表现给出更个性化的建议。</p>
                </div>
              )}
            </div>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-container/10 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-tertiary-container/10 blur-3xl" />
          </motion.section>
        </main>
      )}

      <AIChat />
    </div>
  );
}
