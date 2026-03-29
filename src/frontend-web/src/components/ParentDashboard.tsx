import { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Bell, 
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
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { GrowthReport, Achievement, ParentControl } from '@/types';
import AIChat from './AIChat';

const defaultChartData = [
  { name: '周一', time: 45 },
  { name: '周二', time: 72 },
  { name: '周三', time: 95 },
  { name: '周四', time: 60 },
  { name: '周五', time: 78 },
  { name: '周六', time: 102 },
  { name: '周日', time: 35 },
];

interface ParentDashboardProps {
  onBack: () => void;
}

export default function ParentDashboard({ onBack }: ParentDashboardProps) {
  const { user, logout } = useAuth();
  const [reportData, setReportData] = useState<GrowthReport | null>(null);
  const [controls, setControls] = useState<ParentControl | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      
      try {
        setIsLoading(true);

        // Fetch report data
        try {
          const report = await api.getReport({
            userId: user.id,
            period: 'weekly',
          });
          setReportData(report);
        } catch {
          console.log('Report API unavailable, using fallback data');
        }

        // Fetch achievements
        try {
          const achievementsData = await api.getAchievements(user.id);
          setAchievements(achievementsData);
        } catch {
          console.log('Achievements API unavailable');
        }

        // Fetch parent controls
        try {
          const controlsData = await api.getControls(user.id);
          setControls(controlsData);
        } catch {
          console.log('Controls API unavailable');
        }
      } catch (err) {
        console.error('Failed to fetch parent dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

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

  // Parent control settings
  const parentControls = [
    { 
      title: '时间限制', 
      desc: controls?.dailyLimit ? `每日可用 ${controls.dailyLimit} 分钟` : '每日可用 2 小时', 
      icon: Timer, 
      color: 'bg-secondary-container/30', 
      iconColor: 'text-on-secondary-container', 
      active: controls?.dailyLimit ? controls.dailyLimit > 0 : true 
    },
    { 
      title: '内容过滤', 
      desc: controls?.contentFilterEnabled ? '严格模式已开启' : '标准模式', 
      icon: ShieldCheck, 
      color: 'bg-tertiary-container/30', 
      iconColor: 'text-on-tertiary-container', 
      active: controls?.contentFilterEnabled ?? true 
    },
    { 
      title: '护眼模式', 
      desc: controls?.restReminderMinutes ? `${controls.restReminderMinutes}分钟休息提醒` : '20分钟休息提醒', 
      icon: Eye, 
      color: 'bg-surface-container', 
      iconColor: 'text-outline', 
      active: controls?.eyeProtectionEnabled ?? false 
    },
  ];

  // Recent mastered skills
  const recentMastered = [
    { label: '100以内加减法', color: 'bg-secondary' },
    { label: '初级英语发音', color: 'bg-tertiary' },
    { label: '二十四节气认知', color: 'bg-error' },
  ];

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
            <button className="p-3 hover:bg-surface-container-low rounded-xl transition-colors">
              <Bell className="w-6 h-6 text-on-secondary-container" />
            </button>
            <button className="p-3 hover:bg-surface-container-low rounded-xl transition-colors">
              <Settings className="w-6 h-6 text-on-secondary-container" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-3 hover:bg-error-container/10 rounded-xl transition-colors text-error"
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
            <div className="bg-surface-container-lowest rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                <Baby className="w-5 h-5 text-on-tertiary-container" />
              </div>
              <div>
                <p className="text-xs font-bold text-outline uppercase tracking-wider">当前学生</p>
                <p className="text-sm font-bold">小明 (2年级)</p>
              </div>
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

          {/* Parental Controls & Insights */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">家长控制</h3>
                <button className="text-sm font-bold text-on-secondary-container hover:underline">查看全部</button>
              </div>
              <div className="space-y-4">
                {parentControls.map((item, i) => (
                  <div key={i} className={cn(
                    "bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/15 flex items-center justify-between group hover:shadow-md transition-shadow",
                    !item.active && "opacity-60"
                  )}>
                    <div className="flex items-center gap-5">
                      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", item.color)}>
                        <item.icon className={cn("w-8 h-8", item.iconColor)} />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{item.title}</h4>
                        <p className="text-sm text-on-surface-variant">{item.desc}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "w-12 h-6 rounded-full relative transition-colors",
                      item.active ? "bg-secondary" : "bg-outline-variant/30"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        item.active ? "right-1" : "left-1"
                      )}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-8 flex flex-col justify-between overflow-hidden relative">
              <div className="relative z-10">
                <span className="bg-on-tertiary-container text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">AI 智能洞察</span>
                <h3 className="text-3xl font-bold mt-6 text-on-secondary-container leading-tight">孩子在"逻辑思维"领域的兴趣正在显著提升。</h3>
                <p className="mt-4 text-on-surface-variant leading-relaxed">
                  基于过去48小时的行为分析，我们建议为小明增加一些初级编程或数学解谜类的内容，这非常符合他目前的认知发展阶段。
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
