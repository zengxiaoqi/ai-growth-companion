import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  Flag,
  Play,
  BookOpen,
  ClipboardList,
  Star,
  AlertCircle,
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
  ClipboardCheck,
  ChevronUp,
  type LucideIcon,
} from '@/icons';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { Content, Recommendation, Assignment, AchievementDisplay, GrowthReport } from '@/types';
import EmergencyCallDialog from './EmergencyCallDialog';
import { normalizeActivityData, normalizeActivityType } from './ai-chat/activity-normalizer';

interface StudentDashboardProps {
  onBack: () => void;
  onOpenContent: (contentId: number) => void;
  onOpenAchievements: () => void;
  onOpenSettings: () => void;
  onOpenCompanion: () => void;
  onOpenAssignment?: (assignment: Assignment) => void;
}

type DomainKey = Content['domain'];

interface DomainMeta {
  icon: LucideIcon;
  color: string;
  iconColor: string;
  label: string;
  radarColor: string;
}

const DOMAIN_META: Record<DomainKey, DomainMeta> = {
  language: {
    icon: MessageCircle,
    color: 'bg-secondary-container',
    iconColor: 'text-on-secondary-container',
    label: '语言',
    radarColor: 'var(--color-domain-language)',
  },
  math: {
    icon: Calculator,
    color: 'bg-tertiary-container',
    iconColor: 'text-on-tertiary-container',
    label: '数学',
    radarColor: 'var(--color-domain-math)',
  },
  science: {
    icon: Microscope,
    color: 'bg-primary-container',
    iconColor: 'text-on-primary-container',
    label: '科学',
    radarColor: 'var(--color-domain-science)',
  },
  art: {
    icon: Palette,
    color: 'bg-surface-container-highest',
    iconColor: 'text-on-surface',
    label: '艺术',
    radarColor: 'var(--color-domain-art)',
  },
  social: {
    icon: Users,
    color: 'bg-[#ffefec]',
    iconColor: 'text-error',
    label: '社会',
    radarColor: 'var(--color-domain-social)',
  },
};

const DOMAIN_ORDER: DomainKey[] = ['language', 'math', 'science', 'art', 'social'];
const BASE_SKILLS = ['看', '听', '说'];
const ACTIVITY_LABELS: Record<string, string> = {
  quiz: '测评',
  true_false: '判断',
  fill_blank: '填空',
  matching: '配对',
  connection: '连线',
  sequencing: '排序',
  puzzle: '拼图',
};

const ACHIEVEMENT_ICONS: Record<string, string> = {
  first_lesson: '\u{1F4DA}',
  daily_goal: '\u{1F3AF}',
  week_streak: '\u{1F525}',
  language_master: '\u{1F4D6}',
  math_wizard: '\u{1F522}',
  science_explorer: '\u{1F52C}',
  first_homework: '\u{1F4DD}',
  homework_streak_3: '\u{270F}\u{FE0F}',
  homework_streak_7: '\u{1F3C6}',
  perfect_homework: '\u{1F4AF}',
  homework_master_10: '\u{1F451}',
  first_activity: '\u{1F3AE}',
  activity_streak_5: '\u{2B50}',
  activity_master_20: '\u{1F31F}',
  perfect_activity: '\u{1F3AF}',
  art_talent: '\u{1F3A8}',
  social_star: '\u{1F91D}',
  daily_learner: '\u{1F4C5}',
  explorer_5: '\u{1F5FA}\u{FE0F}',
};

interface CurriculumItem {
  domain: DomainKey;
  category: string;
  color: string;
  iconColor: string;
  icon: LucideIcon;
  topics: string[];
  skills: string[];
}

const toCurriculumItem = (content: Content): CurriculumItem => {
  const meta = DOMAIN_META[content.domain];
  return {
    domain: content.domain,
    category: meta.label,
    color: meta.color,
    iconColor: meta.iconColor,
    icon: meta.icon,
    topics: content.topic ? [content.topic] : [],
    skills: BASE_SKILLS,
  };
};

export default function StudentDashboard({
  onBack: _onBack,
  onOpenContent,
  onOpenAchievements,
  onOpenSettings,
  onOpenCompanion,
  onOpenAssignment,
}: StudentDashboardProps) {
  const { user } = useAuth();
  const [ageGroup, setAgeGroup] = useState<'3-4' | '5-6'>('3-4');
  const ageRange: '3-4' | '5-6' = user?.age && user.age >= 5 ? '5-6' : '3-4';

  const { data: contentsData, isLoading } = useSWR(
    ['contents', ageRange],
    ([, ar]) => api.getContents({ ageRange: ar }),
    { fallbackData: [] as Content[] }
  );
  const contents = contentsData || [];

  const { data: recommendationsData, isLoading: isLoadingRecs } = useSWR(
    user?.id ? ['recommendations', user.id, ageRange] : null,
    ([, userId, ar]) => api.getRecommendations({ userId, ageRange: ar }),
    { fallbackData: [] as Recommendation[] }
  );
  const recommendations = recommendationsData || [];

  const [pendingAssignments, setPendingAssignments] = useState<Assignment[]>([]);
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const recommendationsRef = useRef<HTMLElement>(null);
  const curriculumRef = useRef<HTMLElement>(null);

  const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [achievementRefresh, setAchievementRefresh] = useState(0);
  const [radarData, setRadarData] = useState<Record<string, number>>({});
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [learningError, setLearningError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || user.type !== 'child') return;
    api.getChildAssignments(user.id).then((assignments) => {
      setPendingAssignments(assignments.filter((a) => a.status === 'pending'));
    }).catch(() => {});
  }, [user?.id, user?.type]);

  const refreshAchievements = useCallback(() => {
    if (!user?.id) return;
    api.getAchievementDisplays(user.id).then((data) => {
      setAchievements(data);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements, achievementRefresh]);

  useEffect(() => {
    const handler = () => setAchievementRefresh((n) => n + 1);
    window.addEventListener('achievements-updated', handler);
    return () => window.removeEventListener('achievements-updated', handler);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    api.getReport({ userId: user.id, period: 'weekly' }).then((report: GrowthReport) => {
      if (report.skillProgress) setRadarData(report.skillProgress);
    }).catch(() => {});
  }, [user?.id]);

  const safeContents = useMemo(() => (Array.isArray(contents) ? contents : []), [contents]);

  const curriculumData = useMemo(() => ({
    '3-4': safeContents.filter((c) => c.ageRange === '3-4').map(toCurriculumItem),
    '5-6': safeContents.filter((c) => c.ageRange === '5-6').map(toCurriculumItem),
  }), [safeContents]);

  const contentById = useMemo(() => {
    const map = new Map<number, Content>();
    safeContents.forEach((item) => map.set(item.id, item));
    return map;
  }, [safeContents]);

  const isStructuredLessonAssignment = useCallback((assignment: Assignment) => {
    if (!assignment.contentId) return false;
    const linkedContent = contentById.get(assignment.contentId);
    return !linkedContent || linkedContent.contentType === 'structured_lesson';
  }, [contentById]);

  const lessonTodoEntries = useMemo(() => {
    const seen = new Set<number>();
    const list: Array<{ contentId: number; title: string; topic?: string }> = [];

    for (const assignment of pendingAssignments) {
      if (!isStructuredLessonAssignment(assignment) || !assignment.contentId) continue;
      if (seen.has(assignment.contentId)) continue;

      const linkedContent = contentById.get(assignment.contentId);
      const topic =
        (typeof assignment.activityData?.topic === 'string' && assignment.activityData.topic.trim()) ||
        (typeof linkedContent?.topic === 'string' && linkedContent.topic.trim()) ||
        undefined;
      const title =
        linkedContent?.title ||
        (topic ? `${topic} 六步课程` : '六步学习课程');

      seen.add(assignment.contentId);
      list.push({
        contentId: assignment.contentId,
        title,
        topic,
      });
    }

    return list;
  }, [contentById, isStructuredLessonAssignment, pendingAssignments]);

  const standaloneAssignments = useMemo(
    () => pendingAssignments.filter((assignment) => !isStructuredLessonAssignment(assignment)),
    [isStructuredLessonAssignment, pendingAssignments],
  );

  const domainContentId = useMemo(() => {
    const next: Partial<Record<DomainKey, number>> = {};
    for (const content of safeContents) {
      if (!(content.domain in next)) {
        next[content.domain] = content.id;
      }
    }
    return next;
  }, [safeContents]);

  const dailyMission = useMemo(() => {
    if (lessonTodoEntries.length > 0) {
      const firstLesson = contentById.get(lessonTodoEntries[0].contentId);
      return {
        title: firstLesson?.title || lessonTodoEntries[0].title,
        progress: 48,
        thumbnail: firstLesson?.thumbnail || firstLesson?.mediaUrls?.[0],
      };
    }

    if (safeContents.length > 0) {
      return {
        title: safeContents[0].title,
        progress: pendingAssignments.length > 0 ? 48 : 60,
        thumbnail: safeContents[0].thumbnail || safeContents[0].mediaUrls?.[0],
      };
    }

    return {
      title: '今日探索任务',
      progress: 60,
      thumbnail: undefined,
    };
  }, [contentById, lessonTodoEntries, pendingAssignments.length, safeContents]);

  const quickStats = useMemo(() => ([
    { label: '待完成', value: pendingAssignments.length, icon: ClipboardCheck, tone: 'bg-error-container/20 text-error' },
    { label: '推荐内容', value: recommendations.length, icon: Wand2, tone: 'bg-secondary-container/40 text-on-secondary-container' },
    { label: '已解锁成就', value: achievements.length, icon: Trophy, tone: 'bg-tertiary-container/35 text-on-tertiary-container' },
  ]), [pendingAssignments.length, recommendations.length, achievements.length]);

  const handlePlayContent = useCallback(async (contentId: number) => {
    if (!user?.id) {
      setLearningError('请先登录');
      return;
    }
    try {
      setLearningError(null);
      await api.startLearning({ childId: user.id, contentId });
      onOpenContent(contentId);
    } catch (err) {
      console.error('Failed to start learning:', err);
      onOpenContent(contentId);
    }
  }, [user?.id, onOpenContent]);

  const scrollRecommendations = useCallback((left: number) => {
    scrollContainerRef.current?.scrollBy({ left, behavior: 'smooth' });
  }, []);

  const scrollToSection = useCallback((target: 'recommendations' | 'curriculum') => {
    if (target === 'recommendations') {
      recommendationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    curriculumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const userName = user?.name || '小朋友';

  return (
    <div className="app-shell min-h-app pb-safe">
      <div className="pointer-events-none absolute -left-16 top-20 h-64 w-64 rounded-full bg-primary-container/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-[35%] h-72 w-72 rounded-full bg-secondary-container/25 blur-3xl" />

      <header className="px-3 pt-safe md:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-2xl border border-primary-container/60 bg-surface-container-lowest">
              <img
                className="h-full w-full object-cover"
                src={user?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCH84Uq0GW6Qmul4GmAsWrEgJqdNE5jjMcIbBe7kwfQ2hYAHKPmiFWbl3aNTwuFyiGlShFEi5MFOD1p0-oX98nOamNY7ksdaX71sx7TFqaAdXNQ38NvDGjE3Fkb-0oVPa-H513VLwzALu0Q1nm7nvM7epfqKThrc0fEvaiADvzEG7MpR2CqK8fUkFBEWXLoU1gIe68QgYeIqK_W2C2HmCcVRvtl7lBc_oRFXgONUbLf0QhmZreiC5aQ8Ow2zjaOwudcC6RVVyls1Kg'}
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-lg font-black tracking-tight md:text-xl">灵犀伴学</h1>
          </div>

          <button onClick={onOpenSettings} aria-label="打开设置" className="touch-target rounded-xl p-2 transition-colors hover:bg-surface-container">
            <Settings className="h-5 w-5 text-on-secondary-container" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-6 md:pt-8">
        <section className="panel-card-strong content-visibility-auto relative mb-6 overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary-container/25 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="text-lg font-bold text-on-surface-variant">早上好，{userName}</p>
              <h2 className="text-3xl font-black leading-tight text-primary md:text-4xl">今天也来一次有趣的学习冒险吧</h2>
              <div className="inline-flex items-center gap-2 rounded-full bg-tertiary-container px-4 py-2 text-sm font-black text-on-tertiary-container">
                <Star className="h-4 w-4 fill-current" />
                当前状态: 准备就绪
              </div>
            </div>
            <div className="mx-auto h-28 w-28 flex-shrink-0 md:mx-0 md:h-36 md:w-36">
              <img
                className="h-full w-full object-contain drop-shadow-xl"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwWyydTcT7BF2vXPbEV0yJVwV7NdcC-aScmO98Occql9t8_rbjAjNXdwf4dWCF41qoCP9t-1UxrWSPDPt67za4KTQezBkkQYzxOqfc9rk-lSm6zmXNlwYzLWPqf-TS5yYOlHn_C8WmEOZjFx-Q8G19mhzVOTSMjEj1AQyTFvSBE5Fy52ZV1kCV_EtXzM8MZmte7SgQsjk6KJ4WgwKsMIP-D3gGd1Rl-AhCo4eWG3PlP81SVv19LMvzHuQ5eGE5DXDXSiRZQp5wtbI"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </section>

        <section className="content-visibility-auto mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {quickStats.map((item) => (
            <div key={item.label} className="panel-card flex items-center gap-3 px-4 py-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.tone)}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-on-surface-variant">{item.label}</p>
                <p className="text-xl font-black text-on-surface">{item.value}</p>
              </div>
            </div>
          ))}
        </section>

        {pendingAssignments.length > 0 ? (
          <section className="content-visibility-auto mb-8">
            <h3 className="section-title mb-4 flex items-center gap-2 px-1">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              今日待完成
            </h3>
            <div className="space-y-3">
              {lessonTodoEntries.map((lessonEntry) => (
                <button
                  key={`lesson-${lessonEntry.contentId}`}
                  onClick={() => handlePlayContent(lessonEntry.contentId)}
                  className="panel-card flex w-full items-center gap-4 p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-container">
                    <BookOpen className="h-6 w-6 text-on-primary-container" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-bold text-on-surface">{lessonEntry.title}</h4>
                    <p className="text-xs text-on-surface-variant">
                      看 · 听 · 读 · 写 · 练 · 评
                      {lessonEntry.topic ? ` · ${lessonEntry.topic}` : ''}
                    </p>
                  </div>
                  <Play className="h-5 w-5 flex-shrink-0 text-primary" />
                </button>
              ))}

              {standaloneAssignments.map((assignment) => {
                const normalizedType = normalizeActivityType(assignment.activityType, assignment.activityData);
                const normalizedData = normalizeActivityData(
                  normalizedType,
                  assignment.activityData ?? { type: normalizedType, title: '练习' },
                );
                const linkedContent = assignment.contentId ? contentById.get(assignment.contentId) : undefined;
                const title =
                  (typeof normalizedData.title === 'string' && normalizedData.title.trim()) ||
                  (typeof normalizedData.topic === 'string' && normalizedData.topic.trim()) ||
                  linkedContent?.title ||
                  `${ACTIVITY_LABELS[normalizedType] || normalizedType} 练习`;
                const topic =
                  (typeof normalizedData.topic === 'string' && normalizedData.topic.trim()) ||
                  linkedContent?.topic ||
                  '';

                return (
                  <button
                    key={assignment.id}
                    onClick={() => onOpenAssignment?.({
                      ...assignment,
                      activityType: normalizedType,
                      activityData: normalizedData,
                    })}
                    className="panel-card flex w-full items-center gap-4 p-4 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-tertiary-container">
                      <ClipboardList className="h-6 w-6 text-on-tertiary-container" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-on-surface">{title}</h4>
                      <p className="text-xs text-on-surface-variant">
                        {topic ? `${topic} · ` : ''}
                        {ACTIVITY_LABELS[normalizedType] || normalizedType} · 难度 {assignment.difficulty} · {assignment.domain || linkedContent?.domain || '综合'}
                      </p>
                    </div>
                    <Play className="h-5 w-5 flex-shrink-0 text-primary" />
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="content-visibility-auto mb-10">
          <h3 className="section-title mb-5 flex items-center gap-2 px-1">
            <Flag className="h-5 w-5 text-primary" />
            今日挑战
          </h3>
          <div className="panel-card-strong overflow-hidden">
            <div className="relative h-48">
              <img
                className="h-full w-full object-cover"
                src={dailyMission.thumbnail || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCIdmL6u7oUYyGelx43ITfb4-YfM0Sdvwf_h7l3Rq9N230FUNbfD3lJ9pk4RekEIHhFhMpsFlLxuoNSbYm2sXAT4OcGyvaKw8XtlAXrBRkbu2ekvYiNZIBb9Waoa2xSpR4jv3Rr6Z7bMgio4wExvRDLzTeaHKj2p7s4MtsfoIw4emdVsgRAFCY5Za1mtiLU12vnJZZrJH2mH8-QVx2AbR8x1zgudJNoFuu678YkirEW4mTQHKfhipQXH8sU3aUugDCKD4MnvOcboG4'}
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <h4 className="text-lg font-black text-white md:text-xl">{dailyMission.title}</h4>
                <p className="text-xs font-semibold text-white/80">完成后可获得额外成长积分</p>
              </div>
            </div>

            <div className="space-y-4 p-5 md:p-6">
              <div className="flex items-center justify-between text-sm font-bold text-on-surface-variant">
                <span>任务进度</span>
                <span className="text-base text-primary">{dailyMission.progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-surface-container p-0.5">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dailyMission.progress}%` }} />
              </div>
              <button
                onClick={() => {
                  if (safeContents[0]?.id) {
                    handlePlayContent(safeContents[0].id);
                  }
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-base font-black text-on-primary shadow-tactile transition-all active:translate-y-0.5 active:shadow-tactile-active"
              >
                <Play className="h-5 w-5 fill-current" />
                继续探索
              </button>
            </div>
          </div>
        </section>

        <section className="content-visibility-auto mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '课程地图', icon: BookOpen, onClick: () => scrollToSection('curriculum'), style: 'bg-secondary-container text-on-secondary-container' },
            { label: '推荐内容', icon: Wand2, onClick: () => scrollToSection('recommendations'), style: 'bg-primary-container text-on-primary-container' },
            { label: '我的成就', icon: Trophy, onClick: onOpenAchievements, style: 'bg-tertiary-container text-on-tertiary-container' },
            { label: '学习伙伴', icon: Sparkles, onClick: onOpenCompanion, style: 'bg-surface-container-highest text-on-surface' },
          ].map((item) => (
            <button key={item.label} onClick={item.onClick} className="panel-card flex flex-col items-center gap-2 p-4 tactile-press">
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', item.style)}>
                <item.icon className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold text-on-surface">{item.label}</span>
            </button>
          ))}
        </section>

        <section className="content-visibility-auto mb-10">
          <h3 className="section-title mb-4 flex items-center gap-2 px-1">
            <Trophy className="h-5 w-5 text-primary" />
            我的成就
          </h3>
          {achievements.length === 0 ? (
            <div className="panel-card p-8 text-center">
              <p className="text-sm text-on-surface-variant">完成一次学习内容即可解锁首个成就</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {(showAllAchievements ? achievements : achievements.slice(0, 3)).map((ach, idx) => (
                  <motion.div
                    key={ach.id}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                    transition={{ delay: idx * 0.04, duration: 0.28 }}
                    className="panel-card flex items-center gap-4 p-4"
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-container text-2xl">
                      {ACHIEVEMENT_ICONS[ach.achievementType] || ach.icon || '\u{1F3C6}'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-on-surface">{ach.achievementName}</h4>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {new Date(ach.earnedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <Star className="h-5 w-5 flex-shrink-0 fill-primary text-primary" />
                  </motion.div>
                ))}
              </AnimatePresence>
              {achievements.length > 3 ? (
                <button
                  onClick={() => setShowAllAchievements((prev) => !prev)}
                  className="flex w-full items-center justify-center gap-1 rounded-xl py-3 text-sm font-bold text-primary transition-colors hover:bg-primary-container/20"
                >
                  {showAllAchievements ? (
                    <>收起 <ChevronUp className="h-4 w-4" /></>
                  ) : (
                    <>查看全部 ({achievements.length}) <ChevronDown className="h-4 w-4" /></>
                  )}
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="content-visibility-auto mb-10">
          <h3 className="section-title mb-4 flex items-center gap-2 px-1">
            <Sparkles className="h-5 w-5 text-primary" />
            能力概览
          </h3>
          <div className="panel-card p-5 md:p-6">
            <svg viewBox="0 0 300 280" className="mx-auto w-full max-w-[320px]">
              {(() => {
                const cx = 150;
                const cy = 130;
                const maxR = 100;
                const levels = [0.2, 0.4, 0.6, 0.8, 1];
                const angles = DOMAIN_ORDER.map((_, i) => (Math.PI * 2 * i) / DOMAIN_ORDER.length - Math.PI / 2);

                const getPoint = (idx: number, ratio: number) => ({
                  x: cx + maxR * ratio * Math.cos(angles[idx]),
                  y: cy + maxR * ratio * Math.sin(angles[idx]),
                });

                const ringPoints = (ratio: number) =>
                  DOMAIN_ORDER.map((_, i) => {
                    const p = getPoint(i, ratio);
                    return `${p.x},${p.y}`;
                  }).join(' ');

                const values = DOMAIN_ORDER.map((key) => Math.min((radarData[key] || 0) / 100, 1));
                const dataPoints = DOMAIN_ORDER.map((_, i) => getPoint(i, values[i]));

                return (
                  <>
                    {levels.map((level, index) => (
                      <polygon key={index} points={ringPoints(level)} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                    ))}

                    {DOMAIN_ORDER.map((_, i) => {
                      const p = getPoint(i, 1);
                      return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />;
                    })}

                    <polygon
                      points={dataPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="var(--color-chart-fill)"
                      stroke="var(--color-chart-line)"
                      strokeWidth="2"
                    />

                    {DOMAIN_ORDER.map((key, i) => {
                      const point = dataPoints[i];
                      const labelPoint = getPoint(i, 1.25);
                      const isSelected = selectedDomain === key;

                      return (
                        <g key={key}>
                          <circle cx={point.x} cy={point.y} r="4" fill={DOMAIN_META[key].radarColor} stroke="white" strokeWidth="2" />
                          <text
                            x={labelPoint.x}
                            y={labelPoint.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="cursor-pointer text-[11px] font-bold"
                            fill={isSelected ? DOMAIN_META[key].radarColor : '#555'}
                            onClick={() => setSelectedDomain((prev) => (prev === key ? null : key))}
                          >
                            {DOMAIN_META[key].label}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>

            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              {DOMAIN_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedDomain((prev) => (prev === key ? null : key))}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                    selectedDomain === key
                      ? 'text-white shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                  )}
                  style={selectedDomain === key ? { backgroundColor: DOMAIN_META[key].radarColor } : undefined}
                >
                  {DOMAIN_META[key].label} {radarData[key] ? Math.round(radarData[key]) : 0}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section ref={recommendationsRef} className="content-visibility-auto mb-10">
          <h3 className="section-title mb-4 flex items-center gap-2 px-1">
            <Wand2 className="h-5 w-5 text-primary" />
            为你推荐
          </h3>

          {learningError ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-error-container/30 p-3 text-sm font-medium text-error">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {learningError}
            </div>
          ) : null}

          {isLoadingRecs ? (
            <div className="panel-card flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : recommendations.length === 0 ? (
            <div className="panel-card p-8 text-center">
              <Sparkles className="mx-auto mb-2 h-10 w-10 text-outline-variant" />
              <p className="text-sm font-bold text-on-surface-variant">暂无推荐内容</p>
              <p className="mt-1 text-xs text-on-surface-variant">完成更多学习后这里会自动更新</p>
            </div>
          ) : (
            <div className="group relative">
              <button
                onClick={() => scrollRecommendations(-260)}
                className="panel-card absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-x-2 -translate-y-1/2 items-center justify-center rounded-full p-0 md:flex"
                aria-label="向左滚动推荐"
              >
                <ChevronLeft className="h-5 w-5 text-on-surface" />
              </button>

              <div
                ref={scrollContainerRef}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {recommendations.map((rec, idx) => {
                  const meta = DOMAIN_META[rec.content.domain];
                  return (
                    <motion.div
                      key={rec.contentId}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.25 }}
                      className="w-64 flex-shrink-0 snap-start"
                    >
                      <div className="panel-card flex h-full flex-col p-5">
                        <div className="mb-3 flex items-start gap-3">
                          <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', meta.color)}>
                            <meta.icon className={cn('h-5 w-5', meta.iconColor)} />
                          </div>
                          <h4 className="line-clamp-2 text-sm font-bold leading-tight text-on-surface">{rec.content.title}</h4>
                        </div>

                        <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-on-surface-variant">{rec.reason}</p>

                        <button
                          onClick={() => handlePlayContent(rec.contentId)}
                          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-bold text-on-primary transition-colors hover:brightness-95"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          开始学习
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <button
                onClick={() => scrollRecommendations(260)}
                className="panel-card absolute right-0 top-1/2 z-10 hidden h-10 w-10 translate-x-2 -translate-y-1/2 items-center justify-center rounded-full p-0 md:flex"
                aria-label="向右滚动推荐"
              >
                <ChevronRight className="h-5 w-5 text-on-surface" />
              </button>
            </div>
          )}
        </section>

        <section ref={curriculumRef} className="content-visibility-auto mb-12">
          <div className="mb-5 flex items-center justify-between gap-3 px-1">
            <h3 className="section-title flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              课程地图
            </h3>
            <button
              onClick={() => setAgeGroup((prev) => (prev === '3-4' ? '5-6' : '3-4'))}
              className="flex items-center gap-1 rounded-full bg-surface-container-high px-4 py-2 text-sm font-bold text-on-surface-variant"
            >
              {ageGroup} 岁内容 <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-4 py-2">
              <div className="h-16 w-52 animate-shimmer rounded-2xl" />
              <div className="h-40 animate-shimmer rounded-[2rem]" />
              <div className="h-40 animate-shimmer rounded-[2rem]" />
            </div>
          ) : (
            <div className="space-y-4">
              {curriculumData[ageGroup].map((item, idx) => (
                <div key={`${item.domain}-${idx}`} className="panel-card p-5 md:p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', item.color)}>
                        <item.icon className={cn('h-6 w-6', item.iconColor)} />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-on-surface">{item.category}</h4>
                        <div className="mt-1 flex gap-1.5">
                          {item.skills.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const contentId = domainContentId[item.domain];
                        if (contentId) {
                          handlePlayContent(contentId);
                        }
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary tactile-press"
                      aria-label={`开始${item.category}学习`}
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.topics.length > 0 ? (
                      item.topics.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-xl border border-outline-variant/20 bg-surface px-3 py-1.5 text-sm font-semibold text-on-surface-variant"
                        >
                          {topic}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-on-surface-variant">该领域内容正在持续更新</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <nav className="px-3 pb-safe md:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-around rounded-2xl border border-outline-variant/15 bg-surface-container-low px-4 py-2.5">
          <button onClick={() => scrollToSection('curriculum')} className="touch-target flex flex-col items-center justify-center p-2 text-primary/70 transition-colors hover:text-primary">
            <BookOpen className="h-6 w-6" />
            <span className="mt-1 text-xs font-bold">课程</span>
          </button>
          <button onClick={onOpenCompanion} className="touch-target flex flex-col items-center justify-center rounded-full bg-tertiary-container p-3 text-on-tertiary-container shadow-inner">
            <Sparkles className="h-7 w-7" />
            <span className="mt-0.5 text-[10px] font-black">AI伙伴</span>
          </button>
          <button onClick={onOpenSettings} className="touch-target flex flex-col items-center justify-center p-2 text-primary/70 transition-colors hover:text-primary">
            <Settings className="h-6 w-6" />
            <span className="mt-1 text-xs font-bold">设置</span>
          </button>
        </div>
      </nav>

      <button
        aria-label="紧急呼叫"
        onClick={() => setShowEmergencyDialog(true)}
        className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-error text-white shadow-2xl transition-transform hover:scale-105 active:scale-95 md:right-7"
      >
        <AlertCircle className="h-8 w-8 fill-current" />
      </button>

      <EmergencyCallDialog
        isOpen={showEmergencyDialog}
        onClose={() => setShowEmergencyDialog(false)}
        childId={user?.id ?? 0}
      />
    </div>
  );
}
