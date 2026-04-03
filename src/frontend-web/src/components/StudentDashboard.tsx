import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  Flag,
  Play,
  BookOpen,
  Gamepad2,
  ClipboardList,
  Star,
  AlertCircle,
  LogOut,
  Sparkles,
  ChevronDown,
  MessageCircle,
  Calculator,
  Microscope,
  Palette,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Trophy,
  UserCircle,
  ClipboardCheck,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { Content, Recommendation, Assignment, AchievementDisplay, GrowthReport } from '@/types';
import EmergencyCallDialog from './EmergencyCallDialog';

interface StudentDashboardProps {
  onBack: () => void;
  onOpenContent: (contentId: number) => void;
  onOpenAchievements: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenCompanion: () => void;
  onOpenAssignment?: (assignment: Assignment) => void;
}

export default function StudentDashboard({ onBack, onOpenContent, onOpenAchievements, onOpenProfile, onOpenSettings, onOpenCompanion, onOpenAssignment }: StudentDashboardProps) {
  const { user, logout } = useAuth();
  const [ageGroup, setAgeGroup] = useState<'3-4' | '5-6'>('3-4');
  const [contents, setContents] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Achievement display
  const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [achievementRefresh, setAchievementRefresh] = useState(0);

  // Ability radar data
  const [radarData, setRadarData] = useState<Record<string, number>>({});
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Determine age range from user
        const ageRange: '3-4' | '5-6' = user?.age && user.age >= 5 ? '5-6' : '3-4';

        // Fetch contents - use fallback if API fails
        try {
          const contentsRes = await api.getContents({ ageRange });
          setContents(contentsRes);
        } catch {
          console.log('Contents API unavailable, using fallback');
        }

        // Fetch recommendations
        if (user?.id) {
          try {
            setIsLoadingRecs(true);
            const recsData = await api.getRecommendations({ userId: user.id, ageRange });
            setRecommendations(recsData);
          } catch {
            console.log('Recommendations API unavailable');
          } finally {
            setIsLoadingRecs(false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id, user?.age]);

  // Fetch pending assignments
  useEffect(() => {
    if (!user?.id || user.type !== 'child') return;
    api.getChildAssignments(user.id).then((assignments) => {
      setPendingAssignments(assignments.filter((a) => a.status === 'pending'));
    }).catch(() => {});
  }, [user?.id, user?.type]);

  // Fetch achievements
  const refreshAchievements = useCallback(() => {
    if (!user?.id) return;
    api.getAchievementDisplays(user.id).then((data) => {
      setAchievements(data);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements, achievementRefresh]);

  // Listen for achievement updates from AIChat
  useEffect(() => {
    const handler = () => setAchievementRefresh((n) => n + 1);
    window.addEventListener('achievements-updated', handler);
    return () => window.removeEventListener('achievements-updated', handler);
  }, []);

  // Fetch ability radar data
  useEffect(() => {
    if (!user?.id) return;
    api.getReport({ userId: user.id, period: 'weekly' }).then((report: GrowthReport) => {
      if (report.skillProgress) setRadarData(report.skillProgress);
    }).catch(() => {});
  }, [user?.id]);

  // Domain icons mapping
  const domainIcons: Record<string, { icon: typeof MessageCircle | typeof Calculator | typeof Microscope | typeof Palette | typeof Users, color: string, iconColor: string }> = {
    language: { icon: MessageCircle, color: 'bg-secondary-container', iconColor: 'text-on-secondary-container' },
    math: { icon: Calculator, color: 'bg-tertiary-container', iconColor: 'text-on-tertiary-container' },
    science: { icon: Microscope, color: 'bg-primary-container', iconColor: 'text-on-primary-container' },
    art: { icon: Palette, color: 'bg-surface-container-highest', iconColor: 'text-outline' },
    social: { icon: Users, color: 'bg-[#ffefec]', iconColor: 'text-error' },
  };

  // Get icon component by domain
  const getIconComponent = (domain: string) => {
    switch (domain) {
      case 'language': return MessageCircle;
      case 'math': return Calculator;
      case 'science': return Microscope;
      case 'art': return Palette;
      case 'social': return Users;
      default: return Users;
    }
  };

  // Handle play button click on a content item
  const [learningError, setLearningError] = useState<string | null>(null);

  const handlePlayContent = async (contentId: number) => {
    if (!user?.id) {
      setLearningError('请先登录');
      return;
    }
    try {
      setLearningError(null);
      await api.startLearning({ childId: user.id, contentId });
      onOpenContent(contentId);
    } catch (err: any) {
      console.error('Failed to start learning:', err);
      // Still navigate so user can view content
      onOpenContent(contentId);
    }
  };

  // Transform contents into curriculum data format (safety: ensure contents is always array)
  const safeContents: Content[] = Array.isArray(contents) ? contents : [];
  const curriculumData = {
    '3-4': safeContents
      .filter(c => c.ageRange === '3-4')
      .map(content => ({
        category: content.domain === 'language' ? '语言' : 
                       content.domain === 'math' ? '数学' : 
                       content.domain === 'science' ? '科学' : 
                       content.domain === 'art' ? '艺术' : '社会',
        color: domainIcons[content.domain]?.color || 'bg-surface-container',
        iconColor: domainIcons[content.domain]?.iconColor || 'text-outline',
        icon: getIconComponent(content.domain),
        topics: content.topic ? [content.topic] : [],
        skills: ['看', '听', '说'],
      })),
    '5-6': safeContents
      .filter(c => c.ageRange === '5-6')
      .map(content => ({
        category: content.domain === 'language' ? '语言' : 
                       content.domain === 'math' ? '数学' : 
                       content.domain === 'science' ? '科学' : 
                       content.domain === 'art' ? '艺术' : '社会',
        color: domainIcons[content.domain]?.color || 'bg-surface-container',
        iconColor: domainIcons[content.domain]?.iconColor || 'text-outline',
        icon: getIconComponent(content.domain),
        topics: content.topic ? [content.topic] : [],
        skills: ['看', '听', '说'],
      })),
  };

  // Get user display name
  const userName = user?.name || '明明';

  // Daily mission with fallback
  const dailyMission = safeContents.length > 0 ? {
    title: safeContents[0].title,
    progress: 60,
    thumbnail: safeContents[0].thumbnail || safeContents[0].mediaUrls?.[0],
  } : {
    title: '太空单词工厂',
    progress: 60,
    thumbnail: undefined,
  };

  const achievementIcons: Record<string, string> = {
    first_lesson: '\u{1F4DA}', daily_goal: '\u{1F3AF}', week_streak: '\u{1F525}',
    language_master: '\u{1F4D6}', math_wizard: '\u{1F522}', science_explorer: '\u{1F52C}',
    first_homework: '\u{1F4DD}', homework_streak_3: '\u{270F}\u{FE0F}', homework_streak_7: '\u{1F3C6}',
    perfect_homework: '\u{1F4AF}', homework_master_10: '\u{1F451}',
    first_activity: '\u{1F3AE}', activity_streak_5: '\u{2B50}', activity_master_20: '\u{1F31F}',
    perfect_activity: '\u{1F3AF}', art_talent: '\u{1F3A8}', social_star: '\u{1F91D}',
    daily_learner: '\u{1F4C5}', explorer_5: '\u{1F5FA}\u{FE0F}',
  };

  const domainConfig = [
    { key: 'language', label: '\u8BED\u8A00', color: '#FF6B6B' },
    { key: 'math', label: '\u6570\u5B66', color: '#4ECDC4' },
    { key: 'science', label: '\u79D1\u5B66', color: '#45B7D1' },
    { key: 'art', label: '\u827A\u672F', color: '#FFA07A' },
    { key: 'social', label: '\u793E\u4F1A', color: '#98D8C8' },
  ];

  return (
    <div className="pb-32">
      {/* Header */}
      <header className="w-full rounded-b-[1.5rem] bg-surface-container-low sticky top-0 z-40">
        <div className="flex justify-between items-center w-full px-8 py-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden border-4 border-primary-container">
              <img 
                className="w-full h-full object-cover" 
                src={user?.avatar || "https://lh3.googleusercontent.com/aida-public/AB6AXuCH84Uq0GW6Qmul4GmAsWrEgJqdNE5jjMcIbBe7kwfQ2hYAHKPmiFWbl3aNTwuFyiGlShFEi5MFOD1p0-oX98nOamNY7ksdaX71sx7TFqaAdXNQ38NvDGjE3Fkb-0oVPa-H513VLwzALu0Q1nm7nvM7epfqKThrc0fEvaiADvzEG7MpR2CqK8fUkFBEWXLoU1gIe68QgYeIqK_W2C2HmCcVRvtl7lBc_oRFXgONUbLf0QhmZreiC5aQ8Ow2zjaOwudcC6RVVyls1Kg"}
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">灵犀伴学</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenProfile}
              aria-label="个人中心"
              className="p-3 hover:bg-surface-container rounded-xl transition-colors"
            >
              <UserCircle className="w-6 h-6 text-on-secondary-container" />
            </button>
            <button
              onClick={onOpenSettings}
              aria-label="设置"
              className="p-3 hover:bg-surface-container rounded-xl transition-colors"
            >
              <Settings className="w-6 h-6 text-on-secondary-container" />
            </button>
            <button
              onClick={() => {
                logout();
                onBack();
              }}
              aria-label="退出登录"
              className="p-3 hover:bg-error-container/10 rounded-xl transition-colors text-error"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow px-6 pt-8 max-w-2xl mx-auto w-full">
        {/* AI Mascot Greeting */}
        <section className="relative mb-12">
          <div className="bg-surface-container-lowest rounded-xl p-8 flex items-end gap-6 shadow-xl border-b-8 border-surface-container-high relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-container/20 rounded-full blur-3xl"></div>
            <div className="flex-grow space-y-2 relative z-10">
              <p className="text-on-surface-variant font-bold text-lg">早上好，{userName}！</p>
              <h2 className="text-3xl font-black text-primary leading-tight">准备好开始今天的<br/>神奇探险了吗？</h2>
              <div className="pt-4">
                <span className="bg-tertiary-container text-on-tertiary-container px-4 py-1.5 rounded-full text-sm font-black flex items-center w-fit gap-2">
                  <Star className="w-4 h-4 fill-current" />
                  等级 12 · 见习探险家
                </span>
              </div>
            </div>
            <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0 relative z-10">
              <img 
                className="w-full h-full object-contain drop-shadow-xl" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwWyydTcT7BF2vXPbEV0yJVwV7NdcC-aScmO98Occql9t8_rbjAjNXdwf4dWCF41qoCP9t-1UxrWSPDPt67za4KTQezBkkQYzxOqfc9rk-lSm6zmXNlwYzLWPqf-TS5yYOlHn_C8WmEOZjFx-Q8G19mhzVOTSMjEj1AQyTFvSBE5Fy52ZV1kCV_EtXzM8MZmte7SgQsjk6KJ4WgwKsMIP-D3gGd1Rl-AhCo4eWG3PlP81SVv19LMvzHuQ5eGE5DXDXSiRZQp5wtbI"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </section>

        {/* Pending Assignments */}
        {pendingAssignments.length > 0 && (
          <section className="mb-8">
            <h3 className="text-xl font-black mb-4 px-2 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary fill-current" />
              待完成任务
              <span className="bg-error text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingAssignments.length}</span>
            </h3>
            <div className="space-y-3">
              {pendingAssignments.map((assignment) => (
                <button
                  key={assignment.id}
                  onClick={() => onOpenAssignment?.(assignment)}
                  className="w-full bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/15 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 text-left tactile-press"
                >
                  <div className="w-12 h-12 rounded-xl bg-tertiary-container flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-6 h-6 text-on-tertiary-container" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-on-surface text-sm truncate">{assignment.activityType}练习</h4>
                    <p className="text-xs text-on-surface-variant">
                      难度 {assignment.difficulty} · {assignment.domain || '综合'}
                    </p>
                  </div>
                  <Play className="w-5 h-5 text-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Daily Mission */}
        <section className="mb-12">
          <h3 className="text-xl font-black mb-6 px-2 flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary fill-current" />
            今日挑战
          </h3>
          <div className="bg-primary p-1 rounded-xl shadow-xl">
            <div className="bg-surface-container-lowest rounded-[2.5rem] overflow-hidden">
              <div className="h-48 relative">
                <img 
                  className="w-full h-full object-cover" 
                  src={dailyMission?.thumbnail || "https://lh3.googleusercontent.com/aida-public/AB6AXuCIdmL6u7oUYyGelx43ITfb4-YfM0Sdvwf_h7l3Rq9N230FUNbfD3lJ9pk4RekEIHhFhMpsFlLxuoNSbYm2sXAT4OcGyvaKw8XtlAXrBRkbu2ekvYiNZIBb9Waoa2xSpR4jv3Rr6Z7bMgio4wExvRDLzTeaHKj2p7s4MtsfoIw4emdVsgRAFCY5Za1mtiLU12vnJZZrJH2mH8-QVx2AbR8x1zgudJNoFuu678YkirEW4mTQHKfhipQXH8sU3aUugDCKD4MnvOcboG4"}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                <div className="absolute bottom-4 left-6">
                  <span className="text-white font-black text-2xl uppercase tracking-widest">Level 04</span>
                  <h4 className="text-white font-bold text-lg">{dailyMission?.title}</h4>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-on-surface-variant font-bold">任务进度</span>
                  <span className="text-primary font-black">{dailyMission?.progress}%</span>
                </div>
                <div className="w-full h-6 bg-surface-container rounded-full overflow-hidden p-1 border border-outline-variant/20">
                  <div className="h-full bg-primary rounded-full w-[60%] relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent"></div>
                  </div>
                </div>
                <button className="w-full bg-primary text-on-primary font-black py-5 rounded-full text-xl shadow-tactile active:shadow-tactile-active active:translate-y-1 transition-all tactile-press flex items-center justify-center gap-3">
                  <Play className="w-6 h-6 fill-current" />
                  继续探险
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Action Buttons Grid */}
        <section className="grid grid-cols-3 gap-4">
          {[
            { label: '故事屋', icon: BookOpen, color: 'bg-secondary-container', shadow: 'shadow-[#005673]', iconColor: 'text-on-secondary-container' },
            { label: '游戏馆', icon: Gamepad2, color: 'bg-tertiary-container', shadow: 'shadow-[#586000]', iconColor: 'text-on-tertiary-container' },
            { label: '任务单', icon: ClipboardList, color: 'bg-surface-container-highest', shadow: 'shadow-[#81783d]', iconColor: 'text-on-primary-container' },
          ].map((item, i) => (
            <button key={i} className="flex flex-col items-center gap-3 group tactile-press">
              <div className={cn(
                "w-full aspect-square rounded-[2.5rem] flex items-center justify-center transition-all border-b-8",
                item.color,
                item.shadow.replace('shadow-', 'border-')
              )}>
                <item.icon className={cn("w-10 h-10 fill-current", item.iconColor)} />
              </div>
              <span className="font-black text-on-surface">{item.label}</span>
            </button>
          ))}
        </section>

        {/* Achievement Display - 我的成就 */}
        <section className="mb-8 mt-8">
          <h3 className="text-xl font-black mb-6 px-2 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary fill-current" />
            我的成就
          </h3>
          {achievements.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-outline-variant/15">
              <p className="text-on-surface-variant text-sm">还没有获得成就，继续努力吧！</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {(showAllAchievements ? achievements : achievements.slice(0, 3)).map((ach, idx) => (
                  <motion.div
                    key={ach.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.95 }}
                    transition={{ delay: idx * 0.06, duration: 0.35, type: 'spring', stiffness: 200, damping: 22 }}
                    className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/15 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0 text-2xl">
                      {achievementIcons[ach.achievementType] || ach.icon || '\u{1F3C6}'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-on-surface text-sm truncate">{ach.achievementName}</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {new Date(ach.earnedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <Star className="w-5 h-5 text-primary fill-primary flex-shrink-0" />
                  </motion.div>
                ))}
              </AnimatePresence>
              {achievements.length > 3 && (
                <button
                  onClick={() => setShowAllAchievements(!showAllAchievements)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-primary flex items-center justify-center gap-1 hover:bg-primary-container/20 transition-colors tactile-press"
                >
                  {showAllAchievements ? (
                    <>收起 <ChevronUp className="w-4 h-4" /></>
                  ) : (
                    <>查看全部 ({achievements.length}) <ChevronDown className="w-4 h-4" /></>
                  )}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Ability Radar Chart - 能力概览 */}
        <section className="mb-8">
          <h3 className="text-xl font-black mb-6 px-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary fill-current" />
            能力概览
          </h3>
          <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 shadow-sm">
            <svg viewBox="0 0 300 280" className="w-full max-w-[320px] mx-auto">
              {(() => {
                const cx = 150, cy = 130, maxR = 100;
                const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
                const angles = domainConfig.map((_, i) => (Math.PI * 2 * i) / domainConfig.length - Math.PI / 2);

                const getPoint = (idx: number, ratio: number) => ({
                  x: cx + maxR * ratio * Math.cos(angles[idx]),
                  y: cy + maxR * ratio * Math.sin(angles[idx]),
                });

                const points = (ratio: number) =>
                  domainConfig.map((_, i) => { const p = getPoint(i, ratio); return `${p.x},${p.y}`; }).join(' ');

                const values = domainConfig.map(d => Math.min((radarData[d.key] || 0) / 100, 1));
                const dataPoints = domainConfig.map((_, i) => getPoint(i, values[i]));

                return (
                  <>
                    {/* Grid lines */}
                    {levels.map((level, li) => (
                      <polygon key={li} points={points(level)} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                    ))}
                    {/* Axis lines */}
                    {domainConfig.map((_, i) => {
                      const p = getPoint(i, 1);
                      return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />;
                    })}
                    {/* Data polygon */}
                    <polygon
                      points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="rgba(79, 140, 255, 0.2)"
                      stroke="rgba(79, 140, 255, 0.8)"
                      strokeWidth="2"
                    />
                    {/* Data points + labels */}
                    {domainConfig.map((d, i) => {
                      const p = dataPoints[i];
                      const lp = getPoint(i, 1.25);
                      const isSelected = selectedDomain === d.key;
                      return (
                        <g key={d.key}>
                          <circle cx={p.x} cy={p.y} r="4" fill={d.color} stroke="white" strokeWidth="2" />
                          <text
                            x={lp.x} y={lp.y}
                            textAnchor="middle" dominantBaseline="middle"
                            className="text-[11px] font-bold cursor-pointer"
                            fill={isSelected ? d.color : '#555'}
                            onClick={() => setSelectedDomain(selectedDomain === d.key ? null : d.key)}
                          >
                            {d.label}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
            {/* Domain detail row */}
            <div className="flex justify-center gap-3 mt-4 flex-wrap">
              {domainConfig.map(d => (
                <button
                  key={d.key}
                  onClick={() => setSelectedDomain(selectedDomain === d.key ? null : d.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold transition-colors tactile-press',
                    selectedDomain === d.key
                      ? 'text-white shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  )}
                  style={selectedDomain === d.key ? { backgroundColor: d.color } : undefined}
                >
                  {d.label} {radarData[d.key] ? Math.round(radarData[d.key]) : 0}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Recommended for You */}
        <section className="mb-12 mt-8">
          <h3 className="text-xl font-black mb-6 px-2 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary fill-current" />
            为你推荐
          </h3>

          {learningError && (
            <div className="mb-4 mx-2 p-3 bg-error-container/50 rounded-xl flex items-center gap-2 text-error text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {learningError}
            </div>
          )}

          {isLoadingRecs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : recommendations.length === 0 ? null : (
            <div className="relative group">
              {/* Scroll Left Arrow */}
              <button
                onClick={() => scrollContainerRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-10 h-10 bg-surface-container-lowest rounded-full shadow-lg flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity border border-outline-variant/20 tactile-press"
                aria-label="向左滚动"
              >
                <ChevronLeft className="w-5 h-5 text-on-surface" />
              </button>

              {/* Scrollable Cards */}
              <div 
                ref={scrollContainerRef}
                className="flex gap-4 overflow-x-auto pb-2 px-1 snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {recommendations.map((rec, idx) => {
                  const domainStyle = domainIcons[rec.content.domain] || { color: 'bg-surface-container', iconColor: 'text-outline' };
                  const DomainIcon = getIconComponent(rec.content.domain);
                  
                  return (
                    <motion.div
                      key={rec.contentId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08, duration: 0.4 }}
                      className="flex-shrink-0 w-60 snap-start"
                    >
                      <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/15 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                        {/* Domain Icon + Title */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", domainStyle.color)}>
                            <DomainIcon className={cn("w-5 h-5", domainStyle.iconColor)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-on-surface text-sm leading-tight line-clamp-2">{rec.content.title}</h4>
                          </div>
                        </div>

                        {/* Recommendation Reason */}
                        <p className="text-xs text-on-surface-variant mb-4 line-clamp-2 flex-1 leading-relaxed">
                          {rec.reason}
                        </p>

                        {/* Play Button */}
                        <button 
                          onClick={() => handlePlayContent(rec.contentId)}
                          className="w-full bg-primary text-on-primary py-2.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 tactile-press shadow-tactile active:shadow-tactile-active active:translate-y-0.5 transition-all"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          开始学习
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Scroll Right Arrow */}
              <button
                onClick={() => scrollContainerRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-10 h-10 bg-surface-container-lowest rounded-full shadow-lg flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity border border-outline-variant/20 tactile-press"
                aria-label="向右滚动"
              >
                <ChevronRight className="w-5 h-5 text-on-surface" />
              </button>
            </div>
          )}
        </section>

        {/* Curriculum Section */}
        <section className="mb-12 mt-12">
          <div className="flex justify-between items-center mb-6 px-2">
            <h3 className="text-xl font-black flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary fill-current" />
              全能学习营
            </h3>
            <button 
              onClick={() => setAgeGroup(prev => prev === '3-4' ? '5-6' : '3-4')}
              className="bg-surface-container-high text-on-surface-variant px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1 tactile-press shadow-sm"
            >
              {ageGroup} 岁内容 <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-on-surface-variant">加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {curriculumData[ageGroup].map((item, idx) => {
                const contentId = safeContents.find(c => 
                  (c.domain === 'language' && item.category === '语言') ||
                  (c.domain === 'math' && item.category === '数学') ||
                  (c.domain === 'science' && item.category === '科学') ||
                  (c.domain === 'art' && item.category === '艺术') ||
                  (c.domain === 'social' && item.category === '社会')
                )?.id;
                return (
                <div key={idx} className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm border border-outline-variant/15 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner", item.color)}>
                        <item.icon className={cn("w-7 h-7", item.iconColor)} />
                      </div>
                      <div>
                        <h4 className="font-black text-xl text-on-surface">{item.category}</h4>
                        <div className="flex gap-1.5 mt-1.5">
                          {item.skills.map(skill => (
                            <span key={skill} className="text-[10px] font-black bg-surface-container px-2 py-0.5 rounded-md text-on-surface-variant uppercase tracking-widest">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => contentId && handlePlayContent(contentId)}
                      className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary tactile-press"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.topics.map(topic => (
                      <span key={topic} className="bg-surface text-on-surface-variant text-sm font-bold px-4 py-2 rounded-xl border border-outline-variant/20 shadow-sm">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </section>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full flex justify-around items-center p-6 mb-safe z-50">
        <div className="bg-background/70 backdrop-blur-2xl fixed bottom-6 left-6 right-6 rounded-full px-4 py-2 flex justify-around items-center shadow-xl border border-outline-variant/10">
          <a className="flex flex-col items-center justify-center text-primary opacity-60 p-2 hover:scale-105 hover:opacity-100 transition-all tactile-press" href="#">
            <BookOpen className="w-6 h-6" />
            <span className="font-bold tracking-tight text-xs mt-1">Learn</span>
          </a>
          <a className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full p-4 shadow-inner scale-110 transition-transform tactile-press" href="#">
            <Gamepad2 className="w-8 h-8 fill-current" />
            <span className="font-black tracking-tight text-[10px] mt-0.5">Play</span>
          </a>
          <button
            onClick={onOpenAchievements}
            className="flex flex-col items-center justify-center text-primary opacity-60 p-2 hover:scale-105 hover:opacity-100 transition-all tactile-press"
          >
            <Trophy className="w-6 h-6" />
            <span className="font-bold tracking-tight text-xs mt-1">成就</span>
          </button>
          <button
            onClick={onOpenCompanion}
            className="flex flex-col items-center justify-center text-tertiary opacity-60 p-2 hover:scale-105 hover:opacity-100 transition-all tactile-press"
          >
            <Sparkles className="w-6 h-6" />
            <span className="font-bold tracking-tight text-xs mt-1">伙伴</span>
          </button>
        </div>
      </nav>

      {/* Emergency FAB */}
      <button
        aria-label="紧急呼叫"
        onClick={() => setShowEmergencyDialog(true)}
        className="fixed right-6 bottom-32 w-16 h-16 bg-error rounded-full flex items-center justify-center shadow-2xl text-white tactile-press z-40 border-b-4 border-error-dim"
      >
        <AlertCircle className="w-8 h-8 fill-current" />
      </button>

      <EmergencyCallDialog
        isOpen={showEmergencyDialog}
        onClose={() => setShowEmergencyDialog(false)}
        childId={user?.id ?? 0}
      />
    </div>
  );
}
