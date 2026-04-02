import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, LogOut, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import type { GrowthReport, Achievement, ParentControl, AbilityReport, User, Assignment, Ability } from '@/types';
import AIChat from '../AIChat';
import ReportDetail from '../ReportDetail';
import NotificationPanel from '../NotificationPanel';
import ChildSelector from './ChildSelector';
import GrowthReportSection, { GrowthReportSkeleton } from './GrowthReportSection';
import AbilityRadar from './AbilityRadar';
import AbilityTrend from './AbilityTrend';
import ParentalControls from './ParentalControls';
import AIInsightsPanel from './AIInsightsPanel';
import AssignmentManager from './AssignmentManager';
import { DOMAIN_CONFIG, fallbackAbilities, fallbackTrendData, getGreeting } from './constants';

interface ParentDashboardProps {
  onBack: () => void;
}

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const controlsRef = useRef<HTMLDivElement>(null);

  // Data state
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [abilityReport, setAbilityReport] = useState<AbilityReport | null>(null);
  const [trendData, setTrendData] = useState<{ week: string; language: number; math: number; science: number; art: number; social: number }[]>([]);
  const [recentSkills, setRecentSkills] = useState<{ domain: string; level: number; label: string }[]>([]);
  const [reportInsights, setReportInsights] = useState<string[]>([]);
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

  // Bug 1 Fix: Split useEffect into two effects
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
        // Fetch all data in parallel where possible
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
          if (reportResult.value.insights) {
            setReportInsights(reportResult.value.insights);
          }
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

  // Get user display name
  const userName = user?.name || 'Lingxi Curator';

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

  // Bug 3 Fix: Scroll to parental controls
  const handleAdjustPlan = useCallback(() => {
    controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (showReportDetail) {
    return (
      <ReportDetail
        userId={user?.id ?? 0}
        onBack={() => setShowReportDetail(false)}
      />
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="bg-background w-full rounded-b-[1.5rem] sticky top-0 z-40">
        <div className="flex justify-between items-center w-full px-8 py-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary-container flex items-center justify-center">
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
              <h1 className="text-2xl font-bold tracking-tight">灵犀伴学</h1>
              <p className="text-sm font-medium text-on-secondary-container opacity-70">家长管理模式</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationPanel userId={user?.id ?? 0} />
            {/* Bug 2 Fix: Settings button now returns to mode selection */}
            <button
              className="p-3 hover:bg-surface-container-low rounded-xl transition-colors"
              aria-label="设置"
              onClick={onBack}
            >
              <Settings className="w-6 h-6 text-on-secondary-container" />
            </button>
            <button
              onClick={handleLogout}
              className="p-3 hover:bg-error-container/10 rounded-xl transition-colors text-error"
              aria-label="退出登录"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="bg-error-container/20 border border-error/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-error shrink-0" />
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

      {isLoading ? (
        <main className="max-w-7xl mx-auto px-6 mt-8 space-y-10">
          {/* Skeleton loading per section */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="h-10 w-72 bg-surface-container rounded-lg animate-pulse" />
              <div className="h-6 w-96 bg-surface-container rounded animate-pulse" />
            </div>
            <div className="bg-surface-container-lowest rounded-2xl p-4 w-72 animate-pulse">
              <div className="h-10 bg-surface-container rounded" />
            </div>
          </section>
          <GrowthReportSkeleton />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-5 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 animate-pulse h-96" />
            <div className="md:col-span-7 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 animate-pulse h-96" />
          </div>
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-6 mt-8 space-y-10">
          {/* Welcome Section */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              {/* Bug 5 Fix: Dynamic greeting */}
              <h2 className="text-4xl font-extrabold tracking-tight">{getGreeting()}，{userName}</h2>
              <p className="text-lg text-on-surface-variant max-w-lg">这是您孩子的最新学习动态。所有系统运行正常，内容过滤已开启。</p>
            </div>
            <ChildSelector
              children={children}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
              onLinkChild={handleLinkChild}
              selectedChild={selectedChild}
            />
          </section>

          {/* Growth Report Bento Grid */}
          <GrowthReportSection
            chartData={chartData}
            totalScore={totalScore}
            recentMastered={recentMastered}
            onViewFullReport={() => setShowReportDetail(true)}
          />

          {/* Five-Dimensional Ability Radar + Trend */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6" aria-label="能力评估">
            <AbilityRadar abilities={abilities} radarData={radarData} />
            <AbilityTrend trendData={trendData.length > 0 ? trendData : fallbackTrendData} />
          </section>

          {/* Parental Controls & AI Insights */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ParentalControls
              controls={controls}
              studySchedule={initialStudySchedule}
              onSave={handleSaveControls}
              userId={user?.id ?? 0}
              controlsRef={controlsRef}
            />
            <AIInsightsPanel
              insights={reportInsights}
              childName={selectedChild?.name || '孩子'}
              onAdjustPlan={handleAdjustPlan}
            />
          </section>

          {/* Assignment Management */}
          <AssignmentManager
            assignments={assignments}
            parentId={user?.id ?? 0}
            selectedChildId={selectedChildId}
            onCreateAssignment={handleCreateAssignment}
          />
        </main>
      )}

      {/* AI Chat */}
      <AIChat />
    </div>
  );
}
