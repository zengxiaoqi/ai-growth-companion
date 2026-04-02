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
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import api from '../services/api';
import type { GrowthReport, Achievement } from '@/types';
import AIChat from './AIChat';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'daily', label: '日报' },
  { key: 'weekly', label: '周报' },
  { key: 'monthly', label: '月报' },
];

const DOMAIN_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  language: { label: '语言', color: 'bg-secondary', textColor: 'text-on-secondary-container' },
  math: { label: '数学', color: 'bg-tertiary', textColor: 'text-on-tertiary-container' },
  science: { label: '科学', color: 'bg-primary', textColor: 'text-on-primary-container' },
  art: { label: '艺术', color: 'bg-surface-container-high', textColor: 'text-on-surface' },
  social: { label: '社会', color: 'bg-error', textColor: 'text-error' },
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
      } catch {
        console.log('Report detail data unavailable, using fallbacks');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [userId, period]);

  // Daily stats for chart
  const dailyStats = reportData?.dailyStats ?? [];

  const barChartData = dailyStats.map(stat => ({
    name: new Date(stat.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    minutes: Math.round(stat.totalTime / 60),
    lessons: stat.completedLessons,
    score: stat.averageScore,
  }));

  // Skill progress
  const skillProgress = reportData?.skillProgress ?? { language: 0, math: 0, science: 0, art: 0, social: 0 };

  // Summary stats
  const totalTime = reportData?.totalLearningTime
    ? Math.round(reportData.totalLearningTime / 60)
    : 0;
  const totalLessons = reportData?.totalLessonsCompleted ?? 0;
  const avgScore = reportData?.averageScore ?? 0;

  const displayAchievements = achievements.length > 0 ? achievements.slice(0, 4) : [];

  // AI suggestions from report insights
  const aiSuggestions = (reportData?.insights?.length ?? 0) > 0
    ? reportData!.insights!
    : [];

  return (
    <div className="pb-32">
      {/* Header */}
      <header className="bg-background w-full rounded-b-[1.5rem] sticky top-0 z-40">
        <div className="flex items-center gap-4 w-full px-8 py-6 max-w-7xl mx-auto">
          <button
            onClick={onBack}
            className="p-2.5 hover:bg-surface-container-low rounded-xl transition-colors"
            aria-label="返回"
          >
            <ChevronLeft className="w-7 h-7 text-on-secondary-container" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">学习报告详情</h1>
            <p className="text-sm font-medium text-on-surface-variant">全面了解孩子的学习情况</p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="ml-3 text-on-surface-variant font-medium">加载中...</span>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
          {/* Period Selector */}
          <div className="flex gap-2 bg-surface-container-low rounded-2xl p-2 w-fit">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPeriod(tab.key)}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-bold text-sm transition-all",
                  period === tab.key
                    ? "bg-on-secondary-container text-white shadow-md"
                    : "text-on-surface-variant hover:bg-surface-container"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Summary Stats */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6"
          >
            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
                <Clock className="w-7 h-7 text-on-secondary-container" />
              </div>
              <div>
                <p className="text-sm text-on-surface-variant font-medium">总学习时长</p>
                <p className="text-3xl font-black text-on-secondary-container">{totalTime}<span className="text-base font-bold ml-1">分钟</span></p>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-tertiary-container/30 flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-on-tertiary-container" />
              </div>
              <div>
                <p className="text-sm text-on-surface-variant font-medium">完成课程</p>
                <p className="text-3xl font-black text-on-tertiary-container">{totalLessons}<span className="text-base font-bold ml-1">节</span></p>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-container/30 flex items-center justify-center">
                <Target className="w-7 h-7 text-on-primary-container" />
              </div>
              <div>
                <p className="text-sm text-on-surface-variant font-medium">平均得分</p>
                <p className="text-3xl font-black text-on-primary-container">{avgScore}<span className="text-base font-bold ml-1">分</span></p>
              </div>
            </div>
          </motion.section>

          {/* Daily Stats Bar Chart */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-bold text-on-secondary-container">每日学习统计</h3>
                <p className="text-on-surface-variant text-sm">学习时长与课程完成情况</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-secondary inline-block"></span>学习时长(分钟)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-tertiary inline-block"></span>课程数
                </span>
              </div>
            </div>
            <div className="h-72">
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#b9ae6e" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#81783d', fontSize: 11, fontWeight: 600 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#81783d', fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                    <Bar dataKey="minutes" name="学习时长" radius={[6, 6, 0, 0]} fill="#006384" />
                    <Bar dataKey="lessons" name="课程数" radius={[6, 6, 0, 0]} fill="#586000" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-on-surface-variant">
                  <p>暂无学习数据</p>
                </div>
              )}
            </div>
          </motion.section>

          {/* Skill Progress Bars */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15"
          >
            <h3 className="text-2xl font-bold text-on-secondary-container mb-6">技能进度</h3>
            <div className="space-y-5">
              {Object.entries(skillProgress).map(([domain, progress], i) => {
                const config = DOMAIN_CONFIG[domain];
                if (!config) return null;
                return (
                  <div key={domain} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className={cn("w-8 h-8 rounded-lg text-white text-xs font-black flex items-center justify-center", config.color)}>
                          {config.label[0]}
                        </span>
                        <span className="font-bold">{config.label}</span>
                      </div>
                      <span className="text-lg font-black text-on-secondary-container">{progress}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-container overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: i * 0.15, ease: "easeOut" }}
                        className={cn("h-full rounded-full", config.color)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* Achievement Highlights */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15"
          >
            <div className="flex items-center gap-3 mb-6">
              <Trophy className="w-7 h-7 text-primary" />
              <h3 className="text-2xl font-bold text-on-secondary-container">成就亮点</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {displayAchievements.length > 0 ? displayAchievements.map((ach, i) => (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.1 }}
                  className={cn(
                    "rounded-xl p-5 border flex items-start gap-4",
                    ach.unlockedAt
                      ? "bg-primary-container/20 border-primary/20"
                      : "bg-surface-container-low border-outline-variant/10"
                  )}
                >
                  <span className="text-3xl">{ach.icon || '🏆'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm">{ach.name}</h4>
                      {ach.unlockedAt && (
                        <span className="text-[10px] font-bold text-primary bg-primary-container/40 px-2 py-0.5 rounded-full">已解锁</span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">{ach.description}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min((ach.progress / ach.totalRequired) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1">{ach.progress} / {ach.totalRequired}</p>
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full text-center py-8 text-on-surface-variant">
                  <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">暂无成就，继续学习解锁更多成就！</p>
                </div>
              )}
            </div>
          </motion.section>

          {/* AI Suggestions */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-on-secondary-container text-on-secondary rounded-2xl p-8 relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="w-7 h-7 text-primary-container" />
                <h3 className="text-2xl font-bold">AI 学习建议</h3>
              </div>
              {aiSuggestions.length > 0 ? (
                <div className="space-y-4">
                  {aiSuggestions.map((suggestion, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                      className="flex items-start gap-3 bg-white/10 rounded-xl p-4"
                    >
                      <TrendingUp className="w-5 h-5 text-primary-container shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed">{suggestion}</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
                  <TrendingUp className="w-5 h-5 text-primary-container shrink-0" />
                  <p className="text-sm leading-relaxed">继续学习，AI 会根据孩子的表现生成个性化建议。</p>
                </div>
              )}
            </div>
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary-container/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-tertiary-container/10 rounded-full blur-3xl"></div>
          </motion.section>
        </main>
      )}

      {/* AI Chat */}
      <AIChat />
    </div>
  );
}
