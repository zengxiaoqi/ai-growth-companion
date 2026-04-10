import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  Clock3,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  Trophy,
} from '@/icons';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  Ability,
  AbilityReport,
  Achievement,
  Assignment,
  GrowthReport,
  DraftLessonSummary,
  ParentControl,
  User,
} from '@/types';
import AIChatPage from '../AIChatPage';
import ReportDetail from '../ReportDetail';
import { Card, EmptyState } from '../ui';
import AbilityRadar from './AbilityRadar';
import AbilityTrend from './AbilityTrend';
import AIInsightsPanel from './AIInsightsPanel';
import AssignmentManager from './AssignmentManager';
import CoursePackManager from './CoursePackManager';
import LessonGenerator from './LessonGenerator';
import ChildSelector from './ChildSelector';
import { DOMAIN_CONFIG, fallbackAbilities, fallbackTrendData } from './constants';
import GrowthReportSection from './GrowthReportSection';
import ParentalControls from './ParentalControls';

interface ParentDashboardProps {
  onBack: () => void;
}

const tabs = [
  { key: 'chat' as const, label: '对话', Icon: MessageCircle },
  { key: 'report' as const, label: '报告', Icon: BarChart3 },
  { key: 'settings' as const, label: '设置', Icon: Settings },
  { key: 'assignments' as const, label: '作业', Icon: ClipboardList },
];

type TabKey = (typeof tabs)[number]['key'];

const INITIAL_STUDY_SCHEDULE: Record<string, { enabled: boolean; start: string; end: string }> = {
  周一: { enabled: true, start: '09:00', end: '11:00' },
  周二: { enabled: true, start: '09:00', end: '11:00' },
  周三: { enabled: true, start: '09:00', end: '11:00' },
  周四: { enabled: true, start: '09:00', end: '11:00' },
  周五: { enabled: true, start: '09:00', end: '11:00' },
  周六: { enabled: false, start: '10:00', end: '12:00' },
  周日: { enabled: false, start: '10:00', end: '12:00' },
};

function NoChildSelected({ onBackToChat }: { onBackToChat?: () => void }) {
  return (
    <EmptyState
      title="请先选择一个孩子"
      description="你可以在顶部选择孩子账号，或先关联一个孩子账号后继续。"
      actionLabel={onBackToChat ? '切换到对话' : undefined}
      onAction={onBackToChat}
      icon={<AlertCircle className="h-6 w-6 text-primary" />}
    />
  );
}

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const controlsRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [isLoading, setIsLoading] = useState(true);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [children, setChildren] = useState<User[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [abilityReport, setAbilityReport] = useState<AbilityReport | null>(null);
  const [trendData, setTrendData] = useState<
    { week: string; language: number; math: number; science: number; art: number; social: number }[]
  >([]);
  const [recentSkills, setRecentSkills] = useState<{ domain: string; level: number; label: string }[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [draftLessons, setDraftLessons] = useState<DraftLessonSummary[]>([]);
  const [draftLessonToEdit, setDraftLessonToEdit] = useState<DraftLessonSummary | null>(null);

  useEffect(() => {
    const fetchChildren = async () => {
      if (!user?.id) return;

      try {
        const childrenData = await api.getChildren(user.id);
        setChildren(childrenData);
        if (childrenData.length > 0) {
          setSelectedChildId((prev) => prev ?? childrenData[0].id);
        } else {
          setSelectedChildId(null);
        }
      } catch {
        setChildren([]);
        setSelectedChildId(null);
      }
    };

    fetchChildren();
  }, [user?.id]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?.id) return;
      setIsLoading(true);

      let hasFailure = false;

      const baseResults = await Promise.allSettled([
        api.getControls(user.id),
        api.getParentAssignments(user.id),
        selectedChildId ? api.getDraftLessons(selectedChildId) : Promise.resolve([]),
      ]);

      if (baseResults[0].status === 'fulfilled') {
        setControls(baseResults[0].value);
      } else {
        hasFailure = true;
      }

      if (baseResults[1].status === 'fulfilled') {
        setAssignments(baseResults[1].value);
      } else {
        hasFailure = true;
      }

      if (baseResults[2].status === 'fulfilled') {
        setDraftLessons(baseResults[2].value);
      } else {
        hasFailure = true;
        setDraftLessons([]);
      }

      if (!selectedChildId) {
        setReportData(null);
        setAchievements([]);
        setAbilityReport(null);
        setTrendData([]);
        setRecentSkills([]);
        setDraftLessons([]);
        setIsLoading(false);
        setError(hasFailure ? '部分数据加载失败，请稍后重试。' : null);
        return;
      }

      const childResults = await Promise.allSettled([
        api.getReport({ userId: selectedChildId, period: 'weekly' }),
        api.getAchievements(selectedChildId),
        api.getAbilities(selectedChildId),
        api.getAbilityTrend(selectedChildId, 6),
        api.getRecentSkills(selectedChildId, 3),
      ]);

      if (childResults[0].status === 'fulfilled') {
        setReportData(childResults[0].value);
      } else {
        hasFailure = true;
      }

      if (childResults[1].status === 'fulfilled') {
        setAchievements(childResults[1].value);
      } else {
        hasFailure = true;
      }

      if (childResults[2].status === 'fulfilled') {
        setAbilityReport(childResults[2].value);
      } else {
        hasFailure = true;
      }

      if (childResults[3].status === 'fulfilled') {
        setTrendData(childResults[3].value?.length > 0 ? childResults[3].value : []);
      } else {
        hasFailure = true;
      }

      if (childResults[4].status === 'fulfilled') {
        setRecentSkills(childResults[4].value);
      } else {
        hasFailure = true;
      }

      setError(hasFailure ? '部分数据加载失败，请稍后重试。' : null);
      setIsLoading(false);
    };

    fetchDashboardData();
  }, [selectedChildId, user?.id]);

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId),
    [children, selectedChildId],
  );

  const chartData = useMemo(
    () =>
      reportData?.dailyStats?.map((stat) => ({
        name: new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' }),
        time: Math.round(stat.totalTime / 60),
      })) || [],
    [reportData],
  );

  const totalScore = useMemo(
    () => achievements.reduce((sum, item) => sum + (item.unlockedAt ? item.progress : 0), 0),
    [achievements],
  );

  const abilities: Ability[] = useMemo(
    () => (abilityReport?.abilities?.length ? abilityReport.abilities : fallbackAbilities),
    [abilityReport],
  );

  const radarData = useMemo(
    () =>
      abilities.map((ability) => ({
        domain: DOMAIN_CONFIG[ability.domain]?.label || ability.domain,
        progress: ability.progress,
        fullMark: 100,
      })),
    [abilities],
  );

  const recentMastered = useMemo(
    () =>
      recentSkills.length > 0
        ? recentSkills.map((skill) => ({ label: skill.label, color: DOMAIN_CONFIG[skill.domain]?.color || 'bg-primary' }))
        : [],
    [recentSkills],
  );

  const completedAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.status === 'completed' && assignment.score != null && assignment.completedAt)
        .sort((a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime()),
    [assignments],
  );

  const scoreStats = useMemo(() => {
    if (completedAssignments.length === 0) return null;
    return {
      avg: Math.round(completedAssignments.reduce((sum, item) => sum + (item.score || 0), 0) / completedAssignments.length),
      highest: Math.max(...completedAssignments.map((item) => item.score || 0)),
      completionRate: assignments.length > 0 ? Math.round((completedAssignments.length / assignments.length) * 100) : 0,
    };
  }, [assignments.length, completedAssignments]);

  const assignmentTrendData = useMemo(
    () =>
      completedAssignments.map((assignment) => ({
        date:
          assignment.completedAt
            ? new Date(assignment.completedAt).toLocaleDateString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
              })
            : '--',
        score: assignment.score || 0,
      })),
    [completedAssignments],
  );

  const quickOverview = useMemo(() => {
    const pendingCount = assignments.filter((assignment) => assignment.status === 'pending').length;
    return [
      {
        label: '本周学习时长',
        value: reportData ? `${Math.round(reportData.totalLearningTime / 60)} 分钟` : '--',
        Icon: Clock3,
        style: 'bg-secondary-container/35 text-on-secondary-container',
      },
      {
        label: '待完成作业',
        value: String(pendingCount),
        Icon: ClipboardList,
        style: 'bg-primary-container/45 text-on-primary-container',
      },
      {
        label: '累计成就分',
        value: String(totalScore),
        Icon: Trophy,
        style: 'bg-tertiary-container/35 text-on-tertiary-container',
      },
    ];
  }, [assignments, reportData, totalScore]);

  const reportInsights = useMemo(() => reportData?.insights || [], [reportData?.insights]);

  const handleLogout = useCallback(() => {
    logout();
    onBack();
  }, [logout, onBack]);

  const handleSaveControls = useCallback(
    async (data: {
      dailyLimitMinutes: number;
      allowedDomains: string[];
      studySchedule: Record<string, unknown>;
      eyeProtectionEnabled?: boolean;
    }) => {
      if (!user?.id) return;
      const updated = await api.updateControls(user.id, data);
      setControls(updated);
    },
    [user?.id],
  );

  const handleLinkChild = useCallback(
    async (phone: string): Promise<User> => {
      const newChild = await api.linkChild(phone);
      setChildren((prev) => [...prev, newChild]);
      setSelectedChildId((prev) => prev ?? newChild.id);
      return newChild;
    },
    [],
  );

  const handleCreateAssignment = useCallback(
    async (data: {
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
    },
    [selectedChildId, user?.id],
  );

  const handleUpdateAssignment = useCallback(
    async (
      assignmentId: number,
      data: {
        activityType: string;
        domain: string;
        difficulty: number;
        topic: string;
      },
    ) => {
      const updated = await api.updateAssignment(assignmentId, {
        activityType: data.activityType,
        domain: data.domain,
        difficulty: data.difficulty,
        topic: data.topic,
      });
      setAssignments((prev) => prev.map((assignment) => (assignment.id === assignmentId ? updated : assignment)));
    },
    [],
  );

  const handleDeleteAssignment = useCallback(async (assignmentId: number) => {
    await api.deleteAssignment(assignmentId);
    setAssignments((prev) => prev.filter((assignment) => assignment.id !== assignmentId));
  }, []);

  const handleViewDraftLesson = useCallback((draftLesson: DraftLessonSummary) => {
    navigate(`/parent/content/${draftLesson.id}`);
  }, [navigate]);

  const handleViewCoursePack = useCallback((_coursePackId: number) => {
    setActiveTab('assignments');
  }, []);

  const handleEditDraftLesson = useCallback((draftLesson: DraftLessonSummary) => {
    setDraftLessonToEdit(draftLesson);
    setActiveTab('assignments');
  }, []);

  const handleDraftLessonUpdated = useCallback(async () => {
    if (!selectedChildId) return;
    const nextDrafts = await api.getDraftLessons(selectedChildId);
    setDraftLessons(nextDrafts);
  }, [selectedChildId]);

  if (showReportDetail) {
    return <ReportDetail userId={user?.id ?? 0} onBack={() => setShowReportDetail(false)} />;
  }

  return (
    <div className="app-shell min-h-app bg-background pb-safe">
      <div className="pointer-events-none absolute -left-10 top-16 h-72 w-72 rounded-full bg-secondary-container/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-52 h-80 w-80 rounded-full bg-primary-container/25 blur-3xl" />

      <header className="sticky top-0 z-40 px-3 pt-safe md:px-6">
        <div className="panel-card-strong mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary-container">
                {user?.avatar ? (
                  <img alt="家长头像" className="h-full w-full object-cover" src={user.avatar} referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-lg font-bold text-on-secondary-container">{(user?.name || '?')[0]}</span>
                )}
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">灵犀伴学 · 家长端</h1>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChildSelector
              children={children}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
              onLinkChild={handleLinkChild}
              selectedChild={selectedChild}
            />

            {selectedChild ? (
              <div className="rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface-variant">
                当前孩子: {selectedChild.name}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto mt-3 w-full max-w-6xl px-4 md:px-6">
          <Card className="flex items-center gap-3 border-error/30 bg-error-container/15 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-error" />
            <p className="flex-1 text-sm font-medium text-error">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="touch-target text-xs font-bold text-error hover:opacity-75"
            >
              关闭
            </button>
          </Card>
        </div>
      ) : null}

      <main className="relative mx-auto mt-3 flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 pb-[calc(6.5rem+var(--safe-area-bottom))] md:px-6">
        {selectedChildId && activeTab !== 'chat' ? (
          <section className="content-visibility-auto mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {quickOverview.map((item) => (
              <Card key={item.label} className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.style}`}>
                  <item.Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface-variant">{item.label}</p>
                  <p className="text-base font-black text-on-surface">{item.value}</p>
                </div>
              </Card>
            ))}
          </section>
        ) : null}

        {activeTab === 'chat' ? (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-hidden p-1.5 md:p-2">
            <AIChatPage parentId={user?.id} childId={selectedChildId ?? undefined} />
          </div>
        ) : null}

        {activeTab === 'report' ? (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected onBackToChat={() => setActiveTab('chat')} />
            ) : isLoading ? (
              <div className="space-y-4 p-2">
                <div className="h-8 w-48 animate-shimmer rounded-xl" />
                <div className="h-6 w-72 animate-shimmer rounded-xl" />
                <div className="h-64 animate-shimmer rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-6">
                <AIInsightsPanel
                  childName={selectedChild?.name || '孩子'}
                  insights={reportInsights}
                  onAdjustPlan={() => setActiveTab('settings')}
                />

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

                {completedAssignments.length > 0 ? (
                  <section className="panel-card p-5 md:p-6" aria-label="作业成绩趋势">
                    <h3 className="mb-4 text-lg font-black text-on-surface">作业成绩趋势</h3>

                    {scoreStats ? (
                      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    ) : null}

                    <div className="h-64 w-full" role="img" aria-label={`作业成绩趋势图，共 ${assignmentTrendData.length} 次作业`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={assignmentTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#b9ae6e" strokeOpacity={0.2} />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#81783d', fontSize: 11, fontWeight: 700 }}
                          />
                          <YAxis
                            domain={[0, 100]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#81783d', fontSize: 11 }}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '0.9rem',
                              border: '1px solid rgba(129,120,61,0.15)',
                              boxShadow: '0 6px 18px rgba(70,54,0,0.12)',
                            }}
                            formatter={(value) => [`${Number(value || 0)} 分`, '作业得分']}
                          />
                          <Line
                            type="monotone"
                            dataKey="score"
                            stroke="#006384"
                            strokeWidth={2.5}
                            dot={{ r: 3.5, fill: '#006384' }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'settings' ? (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected onBackToChat={() => setActiveTab('chat')} />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-2xl border border-outline-variant/15 bg-surface p-4">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-secondary-container">
                    {user?.avatar ? (
                      <img alt="家长头像" className="h-full w-full object-cover" src={user.avatar} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-lg font-bold text-on-secondary-container">{(user?.name || '?')[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-black text-on-surface">{user?.name || '家长'}</h3>
                    <p className="text-sm text-on-surface-variant">家长端 · {user?.phone || ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="touch-target flex items-center gap-1.5 rounded-full bg-error-container/20 px-3 py-1.5 text-sm font-bold text-error transition-colors hover:bg-error-container/40"
                  >
                    <LogOut className="h-4 w-4" />
                    退出
                  </button>
                </div>
                <ParentalControls
                  controls={controls}
                  studySchedule={INITIAL_STUDY_SCHEDULE}
                  onSave={handleSaveControls}
                  userId={user?.id ?? 0}
                  controlsRef={controlsRef}
                />
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'assignments' ? (
          <div className="panel-card content-visibility-auto min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
            {!selectedChildId ? (
              <NoChildSelected onBackToChat={() => setActiveTab('chat')} />
            ) : (
              <div className="space-y-6">
                <LessonGenerator
                  selectedChildId={selectedChildId}
                  childAgeGroup={selectedChild?.age ? (selectedChild.age <= 4 ? '3-4' : '5-6') : undefined}
                  draftLessonId={draftLessonToEdit?.id ?? null}
                  onDraftLessonLoaded={() => setDraftLessonToEdit(null)}
                  onDraftLessonUpdated={handleDraftLessonUpdated}
                />
                <CoursePackManager selectedChildId={selectedChildId} onCoursePackGenerated={handleDraftLessonUpdated} />
                <AssignmentManager
                  assignments={assignments}
                  draftLessons={draftLessons}
                  parentId={user?.id ?? 0}
                  selectedChildId={selectedChildId}
                  onViewDraftLesson={handleViewDraftLesson}
                  onEditDraftLesson={handleEditDraftLesson}
                  onViewCoursePack={handleViewCoursePack}
                  onCreateAssignment={handleCreateAssignment}
                  onUpdateAssignment={handleUpdateAssignment}
                  onDeleteAssignment={handleDeleteAssignment}
                />
              </div>
            )}
          </div>
        ) : null}
      </main>

      <nav className="fixed bottom-safe left-0 right-0 z-50 px-4 pb-safe md:px-6">
        <div className="floating-nav mx-auto flex max-w-6xl items-center justify-around rounded-full px-2 py-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'touch-target flex min-w-[70px] flex-col items-center rounded-full px-4 py-2 transition-all tactile-press',
                activeTab === tab.key
                  ? 'bg-primary-container/35 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <tab.Icon className={cn('h-5 w-5', activeTab === tab.key && 'fill-current')} />
              <span className="mt-0.5 text-[10px] font-bold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {!selectedChildId && activeTab !== 'chat' ? (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="rounded-full bg-surface-container-low px-4 py-2 text-xs font-bold text-on-surface-variant shadow-card">
            先选择孩子后可使用更多功能
          </div>
        </div>
      ) : null}

      {selectedChildId && activeTab === 'chat' ? (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-surface-container-low/95 px-4 py-2 text-xs font-bold text-on-surface-variant shadow-card">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          AI 正在根据 {selectedChild?.name || '当前孩子'} 的学习情况给出建议
        </div>
      ) : null}
    </div>
  );
}
