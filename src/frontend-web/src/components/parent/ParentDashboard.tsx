import { useState, useEffect, useCallback, useRef } from 'react';
import { LogOut, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import type { GrowthReport, Achievement, ParentControl, AbilityReport, User, Assignment, Ability } from '@/types';
import AIChat from '../AIChat';
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
  { key: 'chat' as const, label: '对话', icon: '💬' },
  { key: 'report' as const, label: '报告', icon: '📊' },
  { key: 'controls' as const, label: '控制', icon: '⚙️' },
  { key: 'assignments' as const, label: '作业', icon: '📝' },
];

type TabKey = typeof tabs[number]['key'];

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const controlsRef = useRef<HTMLDivElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('chat');

  // Data state
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [abilityReport, setAbilityReport] = useState<AbilityReport | null>(null);
  const [trendData, setTrendData] = useState<{ week: string; language: number; math: number; science: number; art: number; social: number }[]>([]);
  const [recentSkills, setRecentSkills] = useState<{ domain: string; level: number; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Child management
  const [children, setChildren] = useState<User[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  // Study schedule initial state (passed to ParentalControls which manages it locally)
  const initialStudySchedule: Record<string, { enabled: boolean; start: string; end: string }> = {
    '周一': { enabled: true, start: '09:00', end: '11:00' },
    '周二': { enabled: true, start: '09:00', end: '11:00' },
    '周三': { enabled: true, start: '09:00', end: '11:00' },
    '周四': { enabled: true, start: '09:00', end: '11:00' },
    '周五': { enabled: true, start: '09:00', end: '11:00' },
    '周六': { enabled: false, start: '10:00', end: '12:00' },
    '周日': { enabled: false, start: '10:00', end: '12:00' },
  };

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Effect 1: Fetch children on mount (runs once per user)
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
        // Children API unavailable - not critical
      }
    };
    fetchChildren();
  }, [user?.id]);

  // Effect 2: Fetch child-specific data when selectedChildId changes
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

        if (reportResult.status === 'fulfilled') {
          setReportData(reportResult.value);
        }
        if (achievementsResult.status === 'fulfilled') {
          setAchievements(achievementsResult.value);
        }
        if (controlsResult.status === 'fulfilled') {
          setControls(controlsResult.value);
        }
        if (abilitiesResult.status === 'fulfilled') {
          setAbilityReport(abilitiesResult.value);
        }
        if (trendResult.status === 'fulfilled' && trendResult.value?.length > 0) {
          setTrendData(trendResult.value);
        }
        if (skillsResult.status === 'fulfilled') {
          setRecentSkills(skillsResult.value);
        }
        if (assignmentsResult.status === 'fulfilled') {
          setAssignments(assignmentsResult.value);
        }
      } catch (err) {
        console.error('Failed to fetch parent dashboard data:', err);
        setError('加载部分数据失败，请稍后重试');
      } finally {
        setIsLoading(false);
      }
    };

    fetchChildData();
  }, [user?.id, selectedChildId]);

  // Transform report data for chart
  const chartData = reportData?.dailyStats?.map(stat => ({
    name: new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' }),
    time: Math.round(stat.totalTime / 60),
  })) || [];

  // Calculate total achievement score
  const totalScore = achievements.reduce((sum, a) => sum + (a.unlockedAt ? a.progress : 0), 0);

  // Handle logout
  const handleLogout = () => {
    logout();
    onBack();
  };

  // Abilities data for radar chart
  const abilities: Ability[] = abilityReport?.abilities?.length ? abilityReport.abilities : fallbackAbilities;

  const radarData = abilities.map(a => {
    const config = DOMAIN_CONFIG[a.domain];
    return {
      domain: config?.label || a.domain,
      progress: a.progress,
      fullMark: 100,
    };
  });

  // Save controls handler
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

  // Link child handler
  const handleLinkChild = async (phone: string): Promise<User> => {
    const newChild = await api.linkChild(phone);
    setChildren(prev => [...prev, newChild]);
    if (!selectedChildId) setSelectedChildId(newChild.id);
    return newChild;
  };

  // Get selected child info
  const selectedChild = children.find(c => c.id === selectedChildId);

  // Create assignment handler
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
    setAssignments(prev => [assignment, ...prev]);
  }, [user?.id, selectedChildId]);

  // Recent mastered skills (from API)
  const recentMastered = recentSkills.length > 0
    ? recentSkills.map(s => ({ label: s.label, color: DOMAIN_CONFIG[s.domain]?.color || 'bg-primary' }))
    : [];

  // Completed assignments for score trend
  const completedAssignments = assignments
    .filter(a => a.status === 'completed' && a.score != null && a.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  const scoreStats = completedAssignments.length > 0 ? {
    avg: Math.round(completedAssignments.reduce((s, a) => s + (a.score || 0), 0) / completedAssignments.length),
    highest: Math.max(...completedAssignments.map(a => a.score || 0)),
    completionRate: assignments.length > 0 ? Math.round((completedAssignments.length / assignments.length) * 100) : 0,
  } : null;

  if (showReportDetail) {
    return (
      <ReportDetail
        userId={user?.id ?? 0}
        onBack={() => setShowReportDetail(false)}
      />
    );
  }

  // Empty state for non-chat tabs when no child selected
  const NoChildSelected = () => (
    <div className="flex items-center justify-center h-full text-gray-400">
      <p>请先选择一个孩子</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-blue-50 to-indigo-50">
      {/* Header - sticky top */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm shadow-sm px-4 py-2">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary-container flex items-center justify-center">
              {user?.avatar ? (
                <img
                  alt="家长头像"
                  className="w-full h-full object-cover"
                  src={user.avatar}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-on-secondary-container text-lg font-bold">
                  {(user?.name || '?')[0]}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">灵犀伴学</h1>
              <p className="text-xs text-on-secondary-container opacity-70">家长管理模式</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChildSelector
              children={children}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
              onLinkChild={handleLinkChild}
              selectedChild={selectedChild}
            />
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-error-container/10 rounded-xl transition-colors text-error"
              aria-label="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-2 w-full">
          <div className="bg-error-container/20 border border-error/20 rounded-xl px-4 py-2 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-error shrink-0" />
            <p className="text-sm text-error flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs font-bold text-error hover:opacity-70"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 overflow-hidden relative">
        {/* Chat tab */}
        {activeTab === 'chat' && (
          <AIChat
            fullPage
            parentId={user?.id}
            childId={selectedChildId ?? undefined}
          />
        )}

        {/* Report tab */}
        {activeTab === 'report' && (
          <div className="h-full overflow-y-auto">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : isLoading ? (
              <div className="p-4 space-y-4">
                <div className="h-8 w-48 bg-surface-container rounded animate-pulse" />
                <div className="h-6 w-72 bg-surface-container rounded animate-pulse" />
                <div className="h-64 bg-surface-container-lowest rounded-2xl animate-pulse" />
              </div>
            ) : (
              <div className="p-4 space-y-6">
                <GrowthReportSection
                  chartData={chartData}
                  totalScore={totalScore}
                  recentMastered={recentMastered}
                  onViewFullReport={() => setShowReportDetail(true)}
                />
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="能力评估">
                  <AbilityRadar abilities={abilities} radarData={radarData} />
                  <AbilityTrend trendData={trendData.length > 0 ? trendData : fallbackTrendData} />
                </section>

                {/* Assignment Score Trend */}
                {completedAssignments.length > 0 && (
                  <section className="bg-white rounded-2xl p-6 border border-outline-variant/15 shadow-sm" aria-label="作业成绩趋势">
                    <h3 className="text-lg font-bold mb-4 text-on-surface">作业成绩趋势</h3>
                    {/* Stats row */}
                    {scoreStats && (
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-3 bg-blue-50 rounded-xl">
                          <p className="text-2xl font-black text-blue-600">{scoreStats.avg}</p>
                          <p className="text-xs text-blue-600/70 mt-1">平均分</p>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-xl">
                          <p className="text-2xl font-black text-green-600">{scoreStats.highest}</p>
                          <p className="text-xs text-green-600/70 mt-1">最高分</p>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-xl">
                          <p className="text-2xl font-black text-purple-600">{scoreStats.completionRate}%</p>
                          <p className="text-xs text-purple-600/70 mt-1">完成率</p>
                        </div>
                      </div>
                    )}
                    {/* SVG Line Chart */}
                    <div className="w-full overflow-x-auto">
                      <svg viewBox="0 0 400 180" className="w-full min-w-[320px]" preserveAspectRatio="xMidYMid meet">
                        {(() => {
                          const scores = completedAssignments.map(a => a.score || 0);
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
                              {/* Grid lines */}
                              {[0, 25, 50, 75, 100].filter(v => v >= minS - 5 && v <= maxS + 5).map(v => (
                                <g key={v}>
                                  <line x1={pad.l} y1={getY(v)} x2={400 - pad.r} y2={getY(v)} stroke="#e5e7eb" strokeWidth="1" />
                                  <text x={pad.l - 8} y={getY(v)} textAnchor="end" dominantBaseline="middle" className="text-[10px]" fill="#9ca3af">{v}</text>
                                </g>
                              ))}
                              {/* Area fill */}
                              <polygon points={areaPoints} fill="url(#scoreGradient)" opacity="0.3" />
                              {/* Line */}
                              <polyline points={linePoints} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              {/* Data points */}
                              {scores.map((s, i) => (
                                <g key={i}>
                                  <circle cx={getX(i)} cy={getY(s)} r="4" fill="#6366f1" stroke="white" strokeWidth="2" />
                                  {/* Date label */}
                                  <text x={getX(i)} y={pad.t + ch + 18} textAnchor="middle" className="text-[9px]" fill="#9ca3af">
                                    {completedAssignments[i].completedAt
                                      ? new Date(completedAssignments[i].completedAt!).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                                      : ''}
                                  </text>
                                </g>
                              ))}
                              {/* Gradient definition */}
                              <defs>
                                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
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

        {/* Controls tab */}
        {activeTab === 'controls' && (
          <div className="h-full overflow-y-auto">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : (
              <div className="p-4">
                <ParentalControls
                  controls={controls}
                  studySchedule={initialStudySchedule}
                  onSave={handleSaveControls}
                  userId={user?.id ?? 0}
                  controlsRef={controlsRef}
                />
              </div>
            )}
          </div>
        )}

        {/* Assignments tab */}
        {activeTab === 'assignments' && (
          <div className="h-full overflow-y-auto">
            {!selectedChildId ? (
              <NoChildSelected />
            ) : (
              <div className="p-4">
                <AssignmentManager
                  assignments={assignments}
                  parentId={user?.id ?? 0}
                  selectedChildId={selectedChildId}
                  onCreateAssignment={handleCreateAssignment}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="bg-white border-t border-gray-200 flex justify-around items-center px-2 py-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs mt-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
