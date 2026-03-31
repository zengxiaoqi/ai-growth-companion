import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Settings,
  Baby,
  Trophy,
  Timer,
  ShieldCheck,
  Eye,
  ArrowRight,
  UserCircle,
  LogOut,
  BookOpen,
  Gamepad2,
  Loader2,
  CheckCircle2,
  Save,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { GrowthReport, Achievement, ParentControl, AbilityReport, Ability, User } from '@/types';
import AIChat from './AIChat';
import ReportDetail from './ReportDetail';
import NotificationPanel from './NotificationPanel';

const defaultChartData = [
  { name: '周一', time: 45 },
  { name: '周二', time: 72 },
  { name: '周三', time: 95 },
  { name: '周四', time: 60 },
  { name: '周五', time: 78 },
  { name: '周六', time: 102 },
  { name: '周日', time: 35 },
];

const DOMAIN_CONFIG: Record<string, { label: string; color: string; containerColor: string; textColor: string }> = {
  language: { label: '语言', color: 'bg-secondary', containerColor: 'bg-secondary-container/30', textColor: 'text-on-secondary-container' },
  math: { label: '数学', color: 'bg-tertiary', containerColor: 'bg-tertiary-container/30', textColor: 'text-on-tertiary-container' },
  science: { label: '科学', color: 'bg-primary', containerColor: 'bg-primary-container/30', textColor: 'text-on-primary-container' },
  art: { label: '艺术', color: 'bg-surface-container-high', containerColor: 'bg-surface-container/50', textColor: 'text-on-surface' },
  social: { label: '社会', color: 'bg-error', containerColor: 'bg-error-container/30', textColor: 'text-error' },
};

const RADAR_COLORS = ['#006384', '#586000', '#705900', '#b9ae6e', '#b02500'];

// Fallback ability data when API is unavailable
const fallbackAbilities: Ability[] = [
  { id: 1, userId: 0, domain: 'language', level: 3, progress: 72, updatedAt: new Date().toISOString() },
  { id: 2, userId: 0, domain: 'math', level: 2, progress: 58, updatedAt: new Date().toISOString() },
  { id: 3, userId: 0, domain: 'science', level: 4, progress: 85, updatedAt: new Date().toISOString() },
  { id: 4, userId: 0, domain: 'art', level: 3, progress: 67, updatedAt: new Date().toISOString() },
  { id: 5, userId: 0, domain: 'social', level: 2, progress: 45, updatedAt: new Date().toISOString() },
];

const fallbackTrendData = [
  { week: '第1周', language: 40, math: 35, science: 50, art: 30, social: 25 },
  { week: '第2周', language: 45, math: 40, science: 55, art: 38, social: 30 },
  { week: '第3周', language: 52, math: 42, science: 60, art: 45, social: 35 },
  { week: '第4周', language: 58, math: 48, science: 68, art: 50, social: 38 },
  { week: '第5周', language: 65, math: 52, science: 75, art: 55, social: 40 },
  { week: '第6周', language: 72, math: 58, science: 85, art: 67, social: 45 },
];

const ALL_DOMAINS = ['language', 'math', 'science', 'art', 'social'];

interface ParentDashboardProps {
  onBack: () => void;
}

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [abilityReport, setAbilityReport] = useState<AbilityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReportDetail, setShowReportDetail] = useState(false);

  // Child management
  const [children, setChildren] = useState<User[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [showLinkChild, setShowLinkChild] = useState(false);
  const [linkPhone, setLinkPhone] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Study schedule
  const [studySchedule, setStudySchedule] = useState<Record<string, { enabled: boolean; start: string; end: string }>>({
    '周一': { enabled: true, start: '09:00', end: '11:00' },
    '周二': { enabled: true, start: '09:00', end: '11:00' },
    '周三': { enabled: true, start: '09:00', end: '11:00' },
    '周四': { enabled: true, start: '09:00', end: '11:00' },
    '周五': { enabled: true, start: '09:00', end: '11:00' },
    '周六': { enabled: false, start: '10:00', end: '12:00' },
    '周日': { enabled: false, start: '10:00', end: '12:00' },
  });

  // Parent controls editing state
  const [editDailyLimit, setEditDailyLimit] = useState(30);
  const [editAllowedDomains, setEditAllowedDomains] = useState<string[]>(ALL_DOMAINS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      try {
        setIsLoading(true);

        // Fetch children list
        try {
          const childrenData = await api.getChildren(user.id);
          setChildren(childrenData);
          if (childrenData.length > 0 && !selectedChildId) {
            setSelectedChildId(childrenData[0].id);
          }
        } catch {
          console.log('Children API unavailable');
        }

        const targetUserId = selectedChildId || user.id;

        // Fetch report data
        try {
          const report = await api.getReport({
            userId: targetUserId,
            period: 'weekly',
          });
          setReportData(report);
        } catch {
          console.log('Report API unavailable, using fallback data');
        }

        // Fetch achievements
        try {
          const achievementsData = await api.getAchievements(targetUserId);
          setAchievements(achievementsData);
        } catch {
          console.log('Achievements API unavailable');
        }

        // Fetch parent controls
        try {
          const controlsData = await api.getControls(user.id);
          setControls(controlsData);
          setEditDailyLimit(controlsData.dailyLimitMinutes || 30);
          setEditAllowedDomains(controlsData.allowedDomains?.length > 0 ? controlsData.allowedDomains : ALL_DOMAINS);
        } catch {
          console.log('Controls API unavailable');
        }

        // Fetch abilities
        try {
          const abilitiesData = await api.getAbilities(targetUserId);
          setAbilityReport(abilitiesData);
        } catch {
          console.log('Abilities API unavailable, using fallback data');
        }
      } catch (err) {
        console.error('Failed to fetch parent dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id, selectedChildId]);

  // Transform report data for chart
  const chartData = reportData?.dailyStats?.map(stat => ({
    name: new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' }),
    time: Math.round(stat.totalTime / 60), // Convert to minutes
  })) || defaultChartData;

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
  const abilities = abilityReport?.abilities?.length ? abilityReport.abilities : fallbackAbilities;

  const radarData = abilities.map(a => {
    const config = DOMAIN_CONFIG[a.domain];
    return {
      domain: config?.label || a.domain,
      progress: a.progress,
      fullMark: 100,
    };
  });

  // Trend data (use fallback for now; in production this would come from historical API)
  const trendData = fallbackTrendData;

  // Handle save controls
  const handleSaveControls = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await api.updateControls(user.id, {
        dailyLimitMinutes: editDailyLimit,
        allowedDomains: editAllowedDomains,
        studySchedule,
      });
      setControls(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      console.error('Failed to save controls');
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, editDailyLimit, editAllowedDomains]);

  const toggleDomain = (domain: string) => {
    setEditAllowedDomains(prev =>
      prev.includes(domain)
        ? prev.filter(d => d !== domain)
        : [...prev, domain]
    );
  };

  // Link child handler
  const handleLinkChild = async () => {
    if (!linkPhone) return;
    setLinkError(null);
    setLinkSuccess(false);
    try {
      const newChild = await api.linkChild(linkPhone);
      setChildren(prev => [...prev, newChild]);
      if (!selectedChildId) setSelectedChildId(newChild.id);
      setLinkPhone('');
      setLinkSuccess(true);
      setTimeout(() => { setLinkSuccess(false); setShowLinkChild(false); }, 1500);
    } catch (err: any) {
      setLinkError(err?.message || '关联失败，请检查手机号');
    }
  };

  // Get selected child info
  const selectedChild = children.find(c => c.id === selectedChildId);

  // Recent mastered skills
  const recentMastered = [
    { label: '100以内加减法', color: 'bg-secondary' },
    { label: '初级英语发音', color: 'bg-tertiary' },
    { label: '二十四节气认知', color: 'bg-error' },
  ];

  if (showReportDetail) {
    return (
      <ReportDetail
        userId={user?.id ?? 0}
        onBack={() => setShowReportDetail(false)}
      />
    );
  }

  return (
    <div className="pb-32">
      {/* Header */}
      <header className="bg-background w-full rounded-b-[1.5rem] sticky top-0 z-40">
        <div className="flex justify-between items-center w-full px-8 py-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary-container flex items-center justify-center">
              <img 
                alt="Parent Profile" 
                className="w-full h-full object-cover" 
                src={user?.avatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuBlLGatppX-CokggP0QNRHNCvSodc8gLJdgY6KggETyhD4kyAmypkOusYGdCNC9PwJgIbtUlPKrQxYKDasv1Dxl8DSoGeEkyxnSFjtw3DGuErf23Z5TJropXVHxS-3xZ9rsrHdq_a1WIZ9hF7S5FOlxqcSFqzVthNkXLKrVQT_JFULZRoqF6xIGcmN685jFkLiFHD4erKX5EdEySNhZZYCmQcQJclymeyH-W2QAlVKN3O-DHUEP92bMSByk84PsGIvpXdofjrXuoJk"}
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">灵犀伴学</h1>
              <p className="text-sm font-medium text-on-secondary-container opacity-70">家长管理模式</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationPanel userId={user?.id ?? 0} />
            <button className="p-3 hover:bg-surface-container-low rounded-xl transition-colors" aria-label="设置">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="ml-3 text-on-surface-variant font-medium">加载中...</span>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 mt-8 space-y-10">
          {/* Welcome Section */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-4xl font-extrabold tracking-tight">下午好，{userName}</h2>
              <p className="text-lg text-on-surface-variant max-w-lg">这是您孩子的最新学习动态。所有系统运行正常，内容过滤已开启。</p>
            </div>
            <div className="relative bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                <Baby className="w-5 h-5 text-on-tertiary-container" />
              </div>
              <div>
                <p className="text-xs font-bold text-outline uppercase tracking-wider">当前学生</p>
                {selectedChild ? (
                  <button
                    onClick={() => setShowLinkChild(!showLinkChild)}
                    className="text-sm font-bold flex items-center gap-1 hover:opacity-70 transition-opacity"
                  >
                    {selectedChild.name} ({selectedChild.age ? `${selectedChild.age}岁` : '未设置'})
                  </button>
                ) : (
                  <button
                    onClick={() => setShowLinkChild(true)}
                    className="text-sm font-bold text-primary hover:opacity-70 transition-opacity"
                  >
                    + 关联孩子账号
                  </button>
                )}
              </div>
              {showLinkChild && (
                <div className="absolute top-full mt-2 right-0 bg-surface-container-lowest rounded-2xl p-4 shadow-xl border border-outline-variant/15 z-50 w-80">
                  {children.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {children.map(child => (
                        <button
                          key={child.id}
                          onClick={() => { setSelectedChildId(child.id); setShowLinkChild(false); }}
                          className={cn(
                            "w-full text-left px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                            child.id === selectedChildId ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container-high"
                          )}
                        >
                          {child.name} ({child.age ? `${child.age}岁` : '未设置'})
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-outline-variant/15 pt-3">
                    <p className="text-xs font-bold text-on-surface-variant mb-2">关联新的孩子账号</p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        placeholder="孩子账号手机号"
                        value={linkPhone}
                        onChange={(e) => { setLinkPhone(e.target.value); setLinkError(null); }}
                        className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 text-sm focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={handleLinkChild}
                        className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold"
                      >
                        关联
                      </button>
                    </div>
                    {linkError && <p className="text-xs text-error mt-1">{linkError}</p>}
                    {linkSuccess && <p className="text-xs text-green-600 mt-1">关联成功！</p>}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Growth Report Bento Grid */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Main Growth Chart */}
            <div className="md:col-span-8 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-on-secondary-container">成长报告</h3>
                  <p className="text-on-surface-variant">本周学习时长统计</p>
                </div>
                <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-xs font-bold rounded-full">近7天</span>
              </div>
              
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#81783d', fontSize: 12, fontWeight: 700 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="time" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.time === Math.max(...chartData.map(d => d.time)) ? '#006384' : '#f8e999'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* View Full Report Button */}
              <button 
                onClick={() => setShowReportDetail(true)}
                className="mt-6 w-full bg-on-secondary-container text-white px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
              >
                查看完整学习报告
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Achievement Summary */}
            <div className="md:col-span-4 flex flex-col gap-6">
              <div className="flex-1 bg-on-secondary-container text-on-secondary rounded-2xl p-6 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-lg font-bold opacity-80">总学习成就</h3>
                  <p className="text-5xl font-black mt-2">{totalScore.toLocaleString()} <span className="text-lg font-medium opacity-60">积分</span></p>
                  <div className="mt-8 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary-container" />
                    <span className="text-sm font-bold">超越了 85% 的同龄学生</span>
                  </div>
                </div>
                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-primary-container/20 rounded-full blur-2xl"></div>
              </div>

              <div className="flex-1 bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
                <h3 className="text-lg font-bold">最近掌握</h3>
                <div className="mt-4 space-y-3">
                  {recentMastered.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full", item.color)}></div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Five-Dimensional Ability Radar + Trend */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Radar Chart */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="md:col-span-5 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm"
            >
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-on-secondary-container">五维能力评估</h3>
                <p className="text-on-surface-variant text-sm mt-1">综合能力发展雷达图</p>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="#b9ae6e" strokeOpacity={0.3} />
                    <PolarAngleAxis 
                      dataKey="domain" 
                      tick={{ fill: '#655c25', fontSize: 13, fontWeight: 700 }}
                    />
                    <PolarRadiusAxis 
                      angle={90} 
                      domain={[0, 100]} 
                      tick={{ fill: '#81783d', fontSize: 10 }}
                      axisLine={false}
                    />
                    <Radar
                      name="能力值"
                      dataKey="progress"
                      stroke="#006384"
                      fill="#97daff"
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: unknown) => [`${value}%`, '能力值']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Ability Bars */}
              <div className="mt-6 space-y-3">
                {abilities.map((ability, i) => {
                  const config = DOMAIN_CONFIG[ability.domain];
                  if (!config) return null;
                  return (
                    <div key={ability.domain} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className={cn("text-sm font-bold", config.textColor)}>{config.label}</span>
                        <span className="text-xs font-bold text-on-surface-variant">Lv.{ability.level} · {ability.progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${ability.progress}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                          className={cn("h-full rounded-full", config.color)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Trend Line Chart */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="md:col-span-7 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm"
            >
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-on-secondary-container">能力趋势</h3>
                <p className="text-on-surface-variant text-sm mt-1">近六周各领域能力变化</p>
              </div>

              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#b9ae6e" strokeOpacity={0.2} />
                    <XAxis 
                      dataKey="week" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#81783d', fontSize: 12, fontWeight: 600 }}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#81783d', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                    />
                    {ALL_DOMAINS.map((domain, i) => {
                      const config = DOMAIN_CONFIG[domain];
                      const strokeColors = ['#006384', '#586000', '#705900', '#b9ae6e', '#b02500'];
                      return (
                        <Line
                          key={domain}
                          type="monotone"
                          dataKey={domain}
                          name={config.label}
                          stroke={strokeColors[i]}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: strokeColors[i] }}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </section>

          {/* Parental Controls & Insights */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">家长控制</h3>
              </div>

              {/* Time Limit Slider */}
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary-container/30 flex items-center justify-center">
                    <Timer className="w-8 h-8 text-on-secondary-container" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">时间限制</h4>
                    <p className="text-sm text-on-surface-variant">设置每日学习时间上限</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm font-bold text-on-surface-variant mb-2">
                    <span>15 分钟</span>
                    <span className="text-secondary text-lg">{editDailyLimit} 分钟</span>
                    <span>120 分钟</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={120}
                    step={5}
                    value={editDailyLimit}
                    onChange={(e) => setEditDailyLimit(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #006384 ${(editDailyLimit - 15) / 105 * 100}%, #b9ae6e ${(editDailyLimit - 15) / 105 * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-outline-variant">15min</span>
                    <span className="text-[10px] text-outline-variant">60min</span>
                    <span className="text-[10px] text-outline-variant">120min</span>
                  </div>
                </div>
              </div>

              {/* Content Domain Toggles */}
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-tertiary-container/30 flex items-center justify-center">
                    <ShieldCheck className="w-8 h-8 text-on-tertiary-container" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">内容领域</h4>
                    <p className="text-sm text-on-surface-variant">选择允许的学习领域</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {ALL_DOMAINS.map((domain) => {
                    const config = DOMAIN_CONFIG[domain];
                    const isActive = editAllowedDomains.includes(domain);
                    return (
                      <button
                        key={domain}
                        onClick={() => toggleDomain(domain)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                          isActive
                            ? "border-current scale-105"
                            : "border-outline-variant/20 opacity-40"
                        )}
                        style={{ color: isActive ? RADAR_COLORS[ALL_DOMAINS.indexOf(domain)] : undefined }}
                      >
                        <span className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black",
                          isActive ? config.color : "bg-outline-variant/30"
                        )}>
                          {config.label[0]}
                        </span>
                        <span className="text-xs font-bold">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Eye Protection */}
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center">
                    <Eye className="w-8 h-8 text-outline" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">护眼模式</h4>
                    <p className="text-sm text-on-surface-variant">
                      {controls?.restReminderMinutes ? `${controls.restReminderMinutes}分钟休息提醒` : '20分钟休息提醒'}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "w-12 h-6 rounded-full relative transition-colors cursor-pointer",
                  controls?.eyeProtectionEnabled ? "bg-secondary" : "bg-outline-variant/30"
                )}
                  onClick={() => {
                    if (controls) {
                      setControls({ ...controls, eyeProtectionEnabled: !controls.eyeProtectionEnabled });
                    }
                  }}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    controls?.eyeProtectionEnabled ? "right-1" : "left-1"
                  )}></div>
                </div>
              </div>

              {/* Save Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveControls}
                disabled={isSaving}
                className={cn(
                  "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors",
                  saveSuccess
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-on-secondary-container text-white hover:opacity-90"
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    保存成功
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    保存设置
                  </>
                )}
              </motion.button>

              {/* Study Schedule */}
              <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary-container/30 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-on-primary-container" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">学习日程</h4>
                    <p className="text-sm text-on-surface-variant">设置每日学习时间段</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {Object.entries(studySchedule).map(([day, schedule]) => (
                    <div key={day} className="flex items-center gap-3">
                      <button
                        onClick={() => setStudySchedule(prev => ({
                          ...prev,
                          [day]: { ...prev[day], enabled: !prev[day].enabled }
                        }))}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-colors shrink-0",
                          schedule.enabled ? "bg-primary" : "bg-outline-variant/30"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          schedule.enabled ? "right-1" : "left-1"
                        )} />
                      </button>
                      <span className={cn("text-sm font-medium w-10", schedule.enabled ? "text-on-surface" : "text-on-surface-variant opacity-50")}>{day}</span>
                      {schedule.enabled ? (
                        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                          <input
                            type="time"
                            value={schedule.start}
                            onChange={(e) => setStudySchedule(prev => ({
                              ...prev,
                              [day]: { ...prev[day], start: e.target.value }
                            }))}
                            className="px-2 py-1 rounded-lg border border-outline-variant/30 text-xs bg-transparent"
                          />
                          <span>-</span>
                          <input
                            type="time"
                            value={schedule.end}
                            onChange={(e) => setStudySchedule(prev => ({
                              ...prev,
                              [day]: { ...prev[day], end: e.target.value }
                            }))}
                            className="px-2 py-1 rounded-lg border border-outline-variant/30 text-xs bg-transparent"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-on-surface-variant opacity-50">休息日</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-8 flex flex-col justify-between overflow-hidden relative">
              <div className="relative z-10">
                <span className="bg-on-tertiary-container text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">AI 智能洞察</span>
                <h3 className="text-3xl font-bold mt-6 text-on-secondary-container leading-tight">
                  {selectedChild
                    ? `${selectedChild.name}在"逻辑思维"领域的兴趣正在显著提升。`
                    : '孩子在"逻辑思维"领域的兴趣正在显著提升。'}
                </h3>
                <p className="mt-4 text-on-surface-variant leading-relaxed">
                  基于过去48小时的行为分析，我们建议增加一些初级编程或数学解谜类的内容，这非常符合目前的认知发展阶段。
                </p>
                <button className="mt-8 bg-on-secondary-container text-white px-8 py-4 rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2">
                  调整学习计划
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute bottom-0 right-0 w-1/2 opacity-20 transform translate-y-12 translate-x-4">
                <img 
                  alt="Insights Graphic" 
                  className="w-full h-full object-contain" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAMUSDig4EKTSOzdGphhZMWO8zDdOihphK8Jwf7fbu-ueT3aQc96iBdSYCIhAEpVxiatKu8uJf_VX72qIjJWS7NapJN2qmht9zvB09i5FZKIyD946nvVTtoayFQ9_j7Pg36VGLxTUn9g6ZzmGoppahADdt45T4JN-mcU9vVhXzNtGxit_NoIHLskLMYxaTGUS1CUi3q8t70KG9Zo9cImUfimhRsUmFSdEskHXe1k3ddttz9FEjzLekGf_eioJgGzmEpXAlwxOUPqxw"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 w-full flex justify-around items-center p-6 mb-safe lg:hidden z-50">
        <div className="bg-background/70 backdrop-blur-2xl fixed bottom-6 left-6 right-6 rounded-full px-4 py-2 flex justify-between items-center shadow-xl border border-outline-variant/10">
          {[
            { label: 'Learn', icon: BookOpen },
            { label: 'Play', icon: Gamepad2 },
            { label: 'Buddy', icon: UserCircle, active: true },
          ].map((item, i) => (
            <div key={i} className={cn(
              "flex flex-col items-center justify-center p-2 transition-all cursor-pointer",
              item.active ? "bg-primary-container text-on-primary-container rounded-full p-4 scale-110 shadow-inner" : "text-primary opacity-60 hover:opacity-100"
            )}>
              <item.icon className={cn("w-6 h-6", item.active && "w-7 h-7")} />
              <span className="font-bold text-[10px] mt-1">{item.label}</span>
            </div>
          ))}
        </div>
      </nav>

      {/* AI Chat */}
      <AIChat />
    </div>
  );
}
