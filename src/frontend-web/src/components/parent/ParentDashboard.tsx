import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LogOut, AlertCircle, MessageCircle, BarChart3, Settings, ClipboardList, Sparkles, Clock3, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import type { GrowthReport, Achievement, ParentControl, AbilityReport, User, Assignment, Ability } from '@/types';
import AIChatPage from '../AIChatPage';
import ReportDetail from '../ReportDetail';
import ChildSelector from './ChildSelector';
import GrowthReportSection from './GrowthReportSection';
import AbilityRadar from './AbilityRadar';
import AbilityTrend from './AbilityTrend';
import ParentalControls from './ParentalControls';
import AssignmentManager from './AssignmentManager';
import { DOMAIN_CONFIG, fallbackAbilities, fallbackTrendData } from './constants';

interface ParentDashboardProps {
  onBack: () => void;
}

const tabs = [
  { key: 'chat' as const, label: '对话', Icon: MessageCircle },
  { key: 'report' as const, label: '报告', Icon: BarChart3 },
  { key: 'controls' as const, label: '控制', Icon: Settings },
  { key: 'assignments' as const, label: '作业', Icon: ClipboardList },
];

type TabKey = typeof tabs[number]['key'];

const INITIAL_STUDY_SCHEDULE: Record<string, { enabled: boolean; start: string; end: string }> = {
  周一: { enabled: true, start: '09:00', end: '11:00' },
  周二: { enabled: true, start: '09:00', end: '11:00' },
  周三: { enabled: true, start: '09:00', end: '11:00' },
  周四: { enabled: true, start: '09:00', end: '11:00' },
  周五: { enabled: true, start: '09:00', end: '11:00' },
  周六: { enabled: false, start: '10:00', end: '12:00' },
  周日: { enabled: false, start: '10:00', end: '12:00' },
};

function NoChildSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-20 text-on-surface-variant">
      <AlertCircle className="mb-4 h-16 w-16 opacity-30" />
      <p className="text-lg font-bold">请先选择一个孩子</p>
      <p className="mt-1 text-sm">可在顶部选择或关联孩子账号</p>
    </div>
  );
}

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const controlsRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [abilityReport, setAbilityReport] = useState<AbilityReport | null>(null);
  const [trendData, setTrendData] = useState<{ week: string; language: number; math: number; science: number; art: number; social: number }[]>([]);
  const [recentSkills, setRecentSkills] = useState<{ domain: string; level: number; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [children, setChildren] = useState<User[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    const fetchChildren = async () => {
      if (!user?.id) return;
      try {
        const childrenData = await api.getChildren(user.id);
        setChildren(childrenData);
        if (childrenData.length > 0) {
          setSelectedChildId(childrenData[0].id);
        }
      } catch {
        // Not critical
      }
    };

    fetchChildren();
  }, [user?.id]);

  useEffect(() => {
    const fetchChildData = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      setError(null);

      const targetUserId = selectedChildId || user.id;

      try {
        const [
          reportResult,
          achievementsResult,
          controlsResult,
          abilitiesResult,
          trendResult,
          skillsResult,
          assignmentsResult,
        ] = await Promise.allSettled([
          api.getReport({ userId: targetUserId, period: 'weekly' }),
          api.getAchievements(targetUserId),
          api.getControls(user.id),
          api.getAbilities(targetUserId),
          api.getAbilityTrend(targetUserId, 6),
          api.getRecentSkills(targetUserId, 3),
          api.getParentAssignments(user.id),
        ]);

        if (reportResult.status === 'fulfilled') setReportData(reportResult.value);
        if (achievementsResult.status === 'fulfilled') setAchievements(achievementsResult.value);
        if (controlsResult.status === 'fulfilled') setControls(controlsResult.value);
        if (abilitiesResult.status === 'fulfilled') setAbilityReport(abilitiesResult.value);
        if (trendResult.status === 'fulfilled' && trendResult.value?.length > 0) setTrendData(trendResult.value);
        if (skillsResult.status === 'fulfilled') setRecentSkills(skillsResult.value);
        if (assignmentsResult.status === 'fulfilled') setAssignments(assignmentsResult.value);
      } catch (err) {
        console.error('Failed to fetch parent dashboard data:', err);
        setError('部分数据加载失败，请稍后重试');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChildData();
  }, [user?.id, selectedChildId]);

  const chartData = useMemo(() => reportData?.dailyStats?.map((stat) => ({
    name: new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' }),
    time: Math.round(stat.totalTime / 60),
  })) || [], [reportData]);

  const totalScore = useMemo(() => achievements.reduce((sum, a) => sum + (a.unlockedAt ? a.progress : 0), 0), [achievements]);

  const abilities: Ability[] = useMemo(
    () => (abilityReport?.abilities?.length ? abilityReport.abilities : fallbackAbilities),
    [abilityReport],
  );

  const radarData = useMemo(() => abilities.map((a) => ({
    domain: DOMAIN_CONFIG[a.domain]?.label || a.domain,
    progress: a.progress,
    fullMark: 100,
  })), [abilities]);

  const recentMastered = useMemo(
    () => (recentSkills.length > 0
      ? recentSkills.map((s) => ({ label: s.label, color: DOMAIN_CONFIG[s.domain]?.color || 'bg-primary' }))
      : []),
    [recentSkills],
  );

  const selectedChild = useMemo(() => children.find((c) => c.id === selectedChildId), [children, selectedChildId]);

  const completedAssignments = useMemo(
    () => assignments
      .filter((a) => a.status === 'completed' && a.score != null && a.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime()),
    [assignments],
  );

  const scoreStats = useMemo(() => {
    if (completedAssignments.length === 0) return null;
    return {
      avg: Math.round(completedAssignments.reduce((s, a) => s + (a.score || 0), 0) / completedAssignments.length),
      highest: Math.max(...completedAssignments.map((a) => a.score || 0)),
      completionRate: assignments.length > 0 ? Math.round((completedAssignments.length / assignments.length) * 100) : 0,
    };
  }, [completedAssignments, assignments.length]);

  const quickOverview = useMemo(() => {
    const pendingCount = assignments.filter((a) => a.status === 'pending').length;
    return [
      {
        label: '本周学习时长',
        value: reportData ? `${Math.round(reportData.totalLearningTime / 60)} 分钟` : '--',
        Icon: Clock3,
        style: 'bg-secondary-container/35 text-on-secondary-container',
      },
      {
        label: '待完成作业',
        value: `${pendingCount}`,
        Icon: ClipboardList,
        style: 'bg-primary-container/45 text-on-primary-container',
      },
      {
        label: '累计成就分',
        value: `${totalScore}`,
        Icon: Trophy,
        style: 'bg-tertiary-container/35 text-on-tertiary-container',
      },
    ];
  }, [assignments, reportData, totalScore]);

  const handleLogout = useCallback(() => {
    logout();
    onBack();
  }, [logout, onBack]);

  const handleSaveControls = useCallback(async (data: {
    dailyLimitMinutes: number;
    allowedDomains: string[];
    studySchedule: Record<string, unknown>;
    eyeProtectionEnabled?: boolean;
  }) => {
    if (!user?.id) return;
    const updated = await api.updateControls(user.id, data);
    setControls(updated);
  }, [user?.id]);

  const handleLinkChild = useCallback(async (phone: string): Promise<User> => {
    const newChild = await api.linkChild(phone);
    setChildren((prev) => [...prev, newChild]);
    if (!selectedChildId) setSelectedChildId(newChild.id);
    return newChild;
  }, [selectedChildId]);

  const handleCreateAssignment = useCallback(async (data: {
    activityType: string;
    domain: string;
    difficulty: number;
    topic: string;
  }) => {
    if (!user?.id || !selectedChildId) return;
    const assignment = await api.createAssignment({
      parentId: user.id,
      childId: selectedChildId,
      activityType: data.activityType,
      domain: data.domain,
      difficulty: data.difficulty,
      activityData: { topic: data.topic },
    });
    setAssignments((prev) => [assignment, ...prev]);
  }, [user?.id, selectedChildId]);

  if (showReportDetail) {
    return (
      <ReportDetail
        userId={user?.id ?? 0}
        onBack={() => setShowReportDetail(false)}
      />
    );
  }

  return (
    <div className="app-shell h-screen min-h-screen bg-background pb-4">
      <div className="pointer-events-none absolute -left-10 top-16 h-72 w-72 rounded-full bg-secondary-container/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-52 h-80 w-80 rounded-full bg-primary-container/25 blur-3xl" />

      <header className="sticky top-0 z-40 px-3 pt-3 md:px-6">
        <div className="panel-card-strong mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary-container">
                {user?.avatar ? (
                  <img
                    alt="家长头像"
                    className="h-full w-full object-cover"
                    src={user.avatar}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-lg font-bold text-on-secondary-container">{(user?.name || '?')[0]}</span>
                )}
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">灵犀伴学 · 家长端</h1>
                <p className="text-xs font-semibold text-on-surface-variant">成长看板与学习控制中心</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl p-2.5 text-error transition-colors hover:bg-error-container/10"
              aria-label="退出登录"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChildSelector
              children={children}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
              onLinkChild={handleLinkChild}
              selectedChild={selectedChild}
            />

            {selectedChild && (
              <div className="rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface-variant">
                当前孩子: {selectedChild.name}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-3 w-full max-w-6xl px-4 md:px-6">
          <div className="panel-card flex items-center gap-3 border-error/30 bg-error-container/15 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-error" />
            <p className="flex-1 text-sm font-medium text-error">{error}</p>
            <button onClick={() => setError(null)} className="text-xs font-bold text-error hover:opacity-70">关闭</button>
          </div>
        </div>
      )}

      <main className="relative mx-auto mt-3 flex h-[calc(100vh-9.5rem)] w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 md:px-6">
        {selectedChildId && activeTab !== 'chat' && (
          <section className="content-visibility-auto mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {quickOverview.map((item) => (
              <div key={item.label} className="panel-card flex items-center gap-3 px-4 py-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.style}`}>
                  <item.Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface-variant">{item.label}</p>
                  <p className="text-base font-black text-on-surface">{item.value}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'chat' && (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-hidden p-1.5 md:p-2">
            <AIChatPage parentId={user?.id} childId={selectedChildId ?? undefined} />
          </div>
        )}

        {activeTab === 'report' && (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : isLoading ? (
              <div className="space-y-4 p-2">
                <div className="h-8 w-48 animate-shimmer rounded-xl" />
                <div className="h-6 w-72 animate-shimmer rounded-xl" />
                <div className="h-64 animate-shimmer rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-6">
                <GrowthReportSection
                  chartData={chartData}
                  totalScore={totalScore}
                  recentMastered={recentMastered}
                  onViewFullReport={() => setShowReportDetail(true)}
                />

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="能力评估">
                  <AbilityRadar abilities={abilities} radarData={radarData} />
                  <AbilityTrend trendData={trendData.length > 0 ? trendData : fallbackTrendData} />
                </section>

                {completedAssignments.length > 0 && (
                  <section className="panel-card p-5 md:p-6" aria-label="作业成绩趋势">
                    <h3 className="mb-4 text-lg font-black text-on-surface">作业成绩趋势</h3>

                    {scoreStats && (
                      <div className="mb-6 grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-secondary-container/30 p-3 text-center">
                          <p className="text-2xl font-black text-on-secondary-container">{scoreStats.avg}</p>
                          <p className="mt-1 text-xs text-on-secondary-container/70">平均分</p>
                        </div>
                        <div className="rounded-xl bg-tertiary-container/30 p-3 text-center">
                          <p className="text-2xl font-black text-on-tertiary-container">{scoreStats.highest}</p>
                          <p className="mt-1 text-xs text-on-tertiary-container/70">最高分</p>
                        </div>
                        <div className="rounded-xl bg-primary-container/30 p-3 text-center">
                          <p className="text-2xl font-black text-on-primary-container">{scoreStats.completionRate}%</p>
                          <p className="mt-1 text-xs text-on-primary-container/70">完成率</p>
                        </div>
                      </div>
                    )}

                    <div className="w-full overflow-x-auto">
                      <svg viewBox="0 0 400 180" className="w-full min-w-[320px]" preserveAspectRatio="xMidYMid meet">
                        {(() => {
                          const scores = completedAssignments.map((a) => a.score || 0);
                          const minS = Math.min(...scores);
                          const maxS = Math.max(...scores);
                          const range = maxS - minS || 10;
                          const pad = { t: 20, r: 20, b: 40, l: 40 };
                          const cw = 400 - pad.l - pad.r;
                          const ch = 180 - pad.t - pad.b;

                          const getX = (i: number) => pad.l + (i / Math.max(scores.length - 1, 1)) * cw;
                          const getY = (v: number) => pad.t + ch - ((v - (minS - 5)) / (range + 10)) * ch;

                          const linePoints = scores.map((s, i) => `${getX(i)},${getY(s)}`).join(' ');
                          const areaPoints = `${getX(0)},${pad.t + ch} ${linePoints} ${getX(scores.length - 1)},${pad.t + ch}`;

                          return (
                            <>
                              {[0, 25, 50, 75, 100].filter((v) => v >= minS - 5 && v <= maxS + 5).map((v) => (
                                <g key={v}>
                                  <line x1={pad.l} y1={getY(v)} x2={400 - pad.r} y2={getY(v)} stroke="#b9ae6e" strokeWidth="1" />
                                  <text x={pad.l - 8} y={getY(v)} textAnchor="end" dominantBaseline="middle" className="text-[10px]" fill="#655c25">{v}</text>
                                </g>
                              ))}

                              <polygon points={areaPoints} fill="url(#scoreGradient)" opacity="0.32" />
                              <polyline points={linePoints} fill="none" stroke="#006384" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                              {scores.map((s, i) => (
                                <g key={i}>
                                  <circle cx={getX(i)} cy={getY(s)} r="4" fill="#006384" stroke="white" strokeWidth="2" />
                                  <text x={getX(i)} y={pad.t + ch + 18} textAnchor="middle" className="text-[9px]" fill="#655c25">
                                    {completedAssignments[i].completedAt
                                      ? new Date(completedAssignments[i].completedAt!).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                                      : ''}
                                  </text>
                                </g>
                              ))}

                              <defs>
                                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#006384" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#006384" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'controls' && (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : (
              <ParentalControls
                controls={controls}
                studySchedule={INITIAL_STUDY_SCHEDULE}
                onSave={handleSaveControls}
                userId={user?.id ?? 0}
                controlsRef={controlsRef}
              />
            )}
          </div>
        )}

        {activeTab === 'assignments' && (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : (
              <AssignmentManager
                assignments={assignments}
                parentId={user?.id ?? 0}
                selectedChildId={selectedChildId}
                onCreateAssignment={handleCreateAssignment}
              />
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 md:px-6">
        <div className="floating-nav mx-auto flex max-w-6xl items-center justify-around rounded-full px-2 py-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-w-[70px] flex-col items-center rounded-full px-4 py-2 transition-all tactile-press ${
                activeTab === tab.key
                  ? 'bg-primary-container/35 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <tab.Icon className={`h-5 w-5 ${activeTab === tab.key ? 'fill-current' : ''}`} />
              <span className="mt-0.5 text-[10px] font-bold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {!selectedChildId && activeTab !== 'chat' && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="rounded-full bg-surface-container-low px-4 py-2 text-xs font-bold text-on-surface-variant shadow-card">
            先选择孩子后可使用更多功能
          </div>
        </div>
      )}

      {selectedChildId && activeTab === 'chat' && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-surface-container-low/95 px-4 py-2 text-xs font-bold text-on-surface-variant shadow-card">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          AI 正在根据 {selectedChild?.name || '当前孩子'} 的学习情况给出建议
        </div>
      )}
    </div>
  );
}
