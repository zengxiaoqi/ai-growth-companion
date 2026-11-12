import { useState } from 'react';
import {
  Star,
  Check,
  Play,
  MessageCircle,
  ChevronRight,
  X,
  BookOpen,
  Calculator,
  Microscope,
  Palette,
  Users,
  Music,
  type LucideIcon,
} from '@/icons';
import { cn } from '../lib/utils';
import {
  CHILD_DENSITY,
  type ChildDensity,
  type ChildDensityLevel,
} from '../lib/child-theme';

/**
 * 孩子端首页体验组件。
 *
 * 设计来源：docs/child-ui-redesign-v1-20261112.html 与
 * docs/child-ui-themes-v2-20261112.html 的首页信息架构 + 第 04 节年龄密度。
 *
 * 原则：
 *   1. 首屏只给一个主任务；接口无数据时一律回退到内置内容，
 *      孩子端不出现「暂无 / 暂时不可用」这类空状态文案。
 *   2. 三档年龄密度不是三套组件：所有组件读同一份 `density` 开关，
 *      未传时默认中档，保证组件可独立使用且家长端行为稳定。
 */

export interface PrimaryTask {
  kicker: string;
  title: string;
  meta: string;
  buttonLabel: string;
  onStart: () => void;
}

export interface SecondaryAction {
  label: string;
  emoji: string;
  onSelect: () => void;
}

export type SubjectKey = 'language' | 'math' | 'science' | 'art' | 'social' | 'music';

interface ChildHomeHeroProps {
  userName: string;
  task: PrimaryTask;
  stars: number;
  onOpenCompanion: () => void;
  density?: ChildDensity;
  /** 供中/高龄档扩展主动作，按 density.primaryActions - 1 取用 */
  secondaryActions?: readonly SecondaryAction[];
}

/** 进度三态：纯图形星星 → 进度环 + 数字 → 任务勾选清单 */
function ProgressPanel({ density, stars }: { density: ChildDensity; stars: number }) {
  if (density.progressMode === 'stars') {
    return (
      <div className="child-progress mb-4 flex items-center gap-1.5 px-1">
        <span className="mr-1 text-sm font-bold text-on-surface-variant">今天的星星</span>
        {[0, 1, 2].map((index) => (
          <Star
            key={index}
            className={cn(
              'h-7 w-7',
              index < stars ? 'fill-primary text-primary' : 'text-outline-variant',
            )}
          />
        ))}
        <span className="ml-auto text-xs font-bold text-on-surface-variant">
          已收集 {stars} / 3
        </span>
      </div>
    );
  }

  if (density.progressMode === 'ring') {
    const circumference = 2 * Math.PI * 18;
    return (
      <div className="child-progress mb-4 flex items-center gap-3 rounded-2xl bg-surface-container-high/60 px-4 py-3">
        <div className="relative h-12 w-12 flex-shrink-0">
          <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90" aria-hidden="true">
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              strokeWidth="6"
              className="text-outline-variant/40"
              stroke="currentColor"
            />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className="text-primary"
              stroke="currentColor"
              strokeDasharray={`${(stars / 3) * circumference} ${circumference}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-on-surface">
            {stars}/3
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface">今日进度</p>
          <p className="text-xs text-on-surface-variant">
            {stars >= 3 ? '今天全部完成啦！' : `再拿 ${3 - stars} 颗星星就集满啦`}
          </p>
        </div>
      </div>
    );
  }

  const rows = ['完成今天的主任务', '发现一个小知识', '和小犀聊聊天'];
  return (
    <div className="child-progress mb-4 rounded-2xl bg-surface-container-high/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-on-surface">今日小任务</span>
        <span className="text-xs font-bold text-on-surface-variant">{stars} / 3 完成</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row, index) => (
          <li
            key={row}
            className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant"
          >
            <span
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border',
                index < stars
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/50',
              )}
            >
              {index < stars ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            <span className={index < stars ? 'line-through opacity-70' : ''}>{row}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 气泡问候 + 进度 + 唯一主任务 Hero + 常驻 AI 入口 */
export function ChildHomeHero({
  userName,
  task,
  stars,
  onOpenCompanion,
  density = CHILD_DENSITY[1],
  secondaryActions = [],
}: ChildHomeHeroProps) {
  const extraActions = secondaryActions.slice(0, Math.max(0, density.primaryActions - 1));

  return (
    <section className="child-hero-wrap mb-8">
      <div className="child-greeting relative mb-4 flex items-center gap-3">
        <img
          className="child-hero-mascot h-16 w-16 flex-shrink-0 rounded-full object-contain"
          src="/mascot.png"
          alt="小犀"
          referrerPolicy="no-referrer"
        />
        <div className="panel-card flex-1 px-4 py-3">
          <p className="text-base font-bold text-on-surface">嗨，{userName}！</p>
          <p className="text-sm text-on-surface-variant">
            {density.level === 0 ? '今天玩点什么呀？' : '今天想先玩什么呀？'}
          </p>
        </div>
      </div>

      <ProgressPanel density={density} stars={stars} />

      <div className="child-hero panel-card-strong relative overflow-hidden p-5 md:p-6">
        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant">
              {task.kicker}
            </span>
            <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">
              {density.level === 2 ? '今日主线 · Lv.3' : '今日主线'}
            </span>
          </div>
          <h2 className="text-2xl font-bold leading-tight text-on-surface md:text-3xl">
            {task.title}
          </h2>
          {density.showMeta ? (
            <p className="mt-2 text-sm text-on-surface-variant">{task.meta}</p>
          ) : null}
          <button
            onClick={task.onStart}
            style={{ minHeight: density.ctaHeight }}
            className={cn(
              'mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-bold text-on-primary shadow-tactile transition-tactile active:translate-y-0.5 active:shadow-tactile-active',
              density.level === 0 ? 'text-xl' : density.level === 2 ? 'text-base' : 'text-lg',
            )}
          >
            <Play className="h-5 w-5 fill-current" />
            {task.buttonLabel}
          </button>
        </div>
      </div>

      {extraActions.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {extraActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onSelect}
              className="panel-card flex min-h-[48px] items-center justify-center gap-1.5 px-3 text-sm font-bold text-on-surface"
            >
              <span aria-hidden="true">{action.emoji}</span>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <button
        onClick={onOpenCompanion}
        className="child-ai-entry panel-card mt-4 flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-on-surface">和小犀说说话</p>
          <p className="text-xs text-on-surface-variant">点一下就能聊天啦</p>
        </div>
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
          <ChevronRight className="h-5 w-5" />
        </span>
      </button>
    </section>
  );
}

interface Discovery {
  em: string;
  title: string;
  tone: string;
  fact: string;
}

/** 内置兜底知识：即使后端全部为空，孩子端也始终有可探索的内容 */
const DISCOVERIES: Discovery[] = [
  {
    em: '☀️',
    title: '影子变短啦',
    tone: 'bg-secondary-container text-on-secondary-container',
    fact: '中午太阳升得最高，影子就变得最短；傍晚太阳低低的，影子又被拉得好长好长。去量量自己的影子吧！',
  },
  {
    em: '🌍',
    title: '认识日本',
    tone: 'bg-tertiary-container text-on-tertiary-container',
    fact: '日本由很多小岛组成，有高高的富士山，春天开满粉色樱花，人们见面会弯腰问好。',
  },
  {
    em: '🔢',
    title: '数字 7',
    tone: 'bg-primary-container text-on-primary-container',
    fact: '7 藏在小瓢虫背上、彩虹的颜色里，还藏在一周的天数里。家里有哪些东西正好是 7 个？',
  },
  {
    em: '💡',
    title: '蜗牛爱睡觉',
    tone: 'bg-surface-container-highest text-on-surface',
    fact: '天气太热太干时，蜗牛缩进壳里睡一个长长的觉，最长能睡好几年，等下过雨再出来散步。',
  },
  {
    em: '😄',
    title: '笑一笑',
    tone: 'bg-danger-container text-on-danger-container',
    fact: '为什么气球不喜欢读书呀？因为它一读书就「涨」得太大啦～ 笑一笑，今天又是棒棒的一天！',
  },
];

const DISCOVERY_TITLES: Record<ChildDensityLevel, string> = {
  0: '哇！小发现',
  1: '今天的小发现',
  2: '今日情报站',
};

const DISCOVERY_WIDTHS: Record<ChildDensityLevel, number> = { 0: 176, 1: 158, 2: 148 };

interface DiscoveryCardsProps {
  onOpenCompanion: () => void;
  density?: ChildDensity;
}

/** 「今天的小发现」横滑知识卡 + 详情弹层；张数与信息量随密度档变化 */
export function DiscoveryCards({
  onOpenCompanion,
  density = CHILD_DENSITY[1],
}: DiscoveryCardsProps) {
  const [offset, setOffset] = useState(0);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const visible = Array.from(
    { length: Math.min(density.discoveryCards, DISCOVERIES.length) },
    (_, index) => DISCOVERIES[(index + offset) % DISCOVERIES.length],
  );
  const active = activeTitle
    ? DISCOVERIES.find((item) => item.title === activeTitle) ?? null
    : null;

  return (
    <section className="child-discovery mb-8">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h3 className="section-title">{DISCOVERY_TITLES[density.level]}</h3>
        <button
          onClick={() => setOffset((prev) => (prev + 1) % DISCOVERIES.length)}
          className="min-h-[44px] rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface-variant"
        >
          换一批 ›
        </button>
      </div>

      <div className="flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {visible.map((item) => (
          <button
            key={item.title}
            onClick={() => setActiveTitle(item.title)}
            style={{ width: DISCOVERY_WIDTHS[density.level] }}
            className="child-discover-card panel-card flex flex-shrink-0 snap-start flex-col items-start gap-2 p-4 text-left"
          >
            <span
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl',
                item.tone,
              )}
            >
              {item.em}
            </span>
            <b className="text-sm font-bold text-on-surface">{item.title}</b>
            <span className="mt-auto text-xs font-bold text-on-surface-variant">
              {density.showMeta ? `${item.fact.slice(0, 14)}…` : '点开看！'}
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setActiveTitle(null)}
        >
          <div
            className="panel-card-strong w-full max-w-sm p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl',
                    active.tone,
                  )}
                >
                  {active.em}
                </span>
                <div>
                  <h4 className="text-lg font-bold text-on-surface">{active.title}</h4>
                  <p className="text-xs text-on-surface-variant">小犀的小发现</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTitle(null)}
                aria-label="关闭小发现"
                className="touch-target rounded-full p-1.5"
              >
                <X className="h-5 w-5 text-on-surface-variant" />
              </button>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-on-surface">{active.fact}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setActiveTitle(null);
                  onOpenCompanion();
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-on-primary"
              >
                <MessageCircle className="h-4 w-4" />
                让小犀讲给我听
              </button>
              <button
                onClick={() => setActiveTitle(null)}
                className="min-h-[44px] rounded-2xl bg-surface-container-high px-4 py-3 text-sm font-bold text-on-surface"
              >
                知道啦
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface Subject {
  key: SubjectKey;
  label: string;
  icon: LucideIcon;
  tone: string;
}

const SUBJECTS: Subject[] = [
  {
    key: 'language',
    label: '语言',
    icon: MessageCircle,
    tone: 'bg-secondary-container text-on-secondary-container',
  },
  {
    key: 'math',
    label: '数学',
    icon: Calculator,
    tone: 'bg-tertiary-container text-on-tertiary-container',
  },
  {
    key: 'science',
    label: '科学',
    icon: Microscope,
    tone: 'bg-primary-container text-on-primary-container',
  },
  {
    key: 'art',
    label: '艺术',
    icon: Palette,
    tone: 'bg-surface-container-highest text-on-surface',
  },
  {
    key: 'social',
    label: '社会',
    icon: Users,
    tone: 'bg-danger-container text-on-danger-container',
  },
  {
    key: 'music',
    label: '音乐',
    icon: Music,
    tone: 'bg-secondary-container text-on-secondary-container',
  },
];

/**
 * 低龄档只给 4 个学科，但「音乐」是独立业务入口，不能被裁掉，
 * 因此用「语言 / 数学 / 科学 / 音乐」而不是简单 slice(0, 4)。
 */
const SUBJECT_ORDER: Record<ChildDensityLevel, SubjectKey[]> = {
  0: ['language', 'math', 'science', 'music'],
  1: ['language', 'math', 'science', 'art', 'social', 'music'],
  2: ['language', 'math', 'science', 'art', 'social', 'music'],
};

const SUBJECT_TITLES: Record<ChildDensityLevel, string> = {
  0: '选一个大图标',
  1: '选个方向出发',
  2: '星图课程',
};

interface BigSubjectGridProps {
  onPick: (domain: Exclude<SubjectKey, 'music'>) => void;
  onMusic: () => void;
  density?: ChildDensity;
}

/** 大图标学科按钮：低龄孩子不依赖识字也能点 */
export function BigSubjectGrid({
  onPick,
  onMusic,
  density = CHILD_DENSITY[1],
}: BigSubjectGridProps) {
  const list = SUBJECT_ORDER[density.level]
    .slice(0, density.subjects)
    .map((key) => SUBJECTS.find((subject) => subject.key === key))
    .filter((subject): subject is Subject => Boolean(subject));

  return (
    <section className="child-subjects mb-10">
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <h3 className="section-title flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          {SUBJECT_TITLES[density.level]}
        </h3>
        <span className="text-xs font-bold text-on-surface-variant">{list.length} 个</span>
      </div>
      <div
        className={cn(
          'grid gap-3',
          density.subjectColumns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2',
        )}
      >
        {list.map((subject) => (
          <button
            key={subject.key}
            onClick={() => (subject.key === 'music' ? onMusic() : onPick(subject.key))}
            style={{ minHeight: density.subjectHeight }}
            className="child-subject panel-card flex flex-col items-center justify-center gap-2 p-4 tactile-press"
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-2xl',
                density.level === 0 ? 'h-16 w-16' : 'h-14 w-14',
                subject.tone,
              )}
            >
              <subject.icon className={density.level === 0 ? 'h-8 w-8' : 'h-7 w-7'} />
            </span>
            <span className="text-base font-bold text-on-surface">{subject.label}</span>
            {density.showMeta ? (
              <span className="text-[11px] font-semibold text-on-surface-variant">点开看看 →</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
