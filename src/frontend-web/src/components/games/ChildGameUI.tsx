import {
  useEffect,
  useRef,
  useState,
  type DragEventHandler,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { useGameVoice } from '@/hooks/useGameVoice';

/**
 * Shared "child-first" UI primitives for the six parameterized games.
 *
 * Design goals (from the child UX pass): pictures before words, very large
 * tap targets, bright tactile cards, star progress, calm spoken guidance and
 * a single celebratory animation. Nothing here changes the data contract or
 * the result of any game — it only wraps and decorates the existing markup.
 */

export type ChildFeedbackTone = 'cheer' | 'think' | 'tip' | 'info';

/* -------------------------------------------------------------------------- */
/* visualFor — always turn a piece of data into a picture                      */
/* -------------------------------------------------------------------------- */

const SHAPE_EMOJI: Record<string, string> = {
  circle: '⭕',
  star: '⭐',
  heart: '❤️',
  triangle: '🔺',
  square: '🔷',
  flower: '🌸',
  sun: '☀️',
  moon: '🌙',
  cloud: '☁️',
  fish: '🐟',
};

/** Ordered so the more specific words win over the generic ones. */
const LABEL_KEYWORDS: Array<[RegExp, string]> = [
  [/春/, '🌱'],
  [/夏/, '🌞'],
  [/秋/, '🍂'],
  [/冬/, '❄️'],
  [/蝴蝶/, '🌸'],
  [/小鸟|鸟/, '🐦'],
  [/小鱼|鱼/, '🐟'],
  [/小猫|猫/, '🐱'],
  [/小狗|狗/, '🐶'],
  [/小兔|兔/, '🐰'],
  [/小鸭|鸭/, '🐤'],
  [/小鸡|鸡/, '🐥'],
  [/小猪|猪/, '🐷'],
  [/苹果/, '🍎'],
  [/香蕉/, '🍌'],
  [/葡萄/, '🍇'],
  [/西瓜/, '🍉'],
  [/草莓/, '🍓'],
  [/水果|果/, '🍎'],
  [/花/, '🌸'],
  [/树|叶|草/, '🌳'],
  [/太阳/, '☀️'],
  [/月亮/, '🌙'],
  [/星星/, '⭐'],
  [/云/, '☁️'],
  [/雨/, '☔'],
  [/雪/, '❄️'],
  [/山/, '🌋'],
  [/火/, '🔥'],
  [/水|河|海/, '💧'],
  [/风/, '🍃'],
  [/心|爱心/, '❤️'],
  [/数字|数/, '🔢'],
  [/圆|球/, '⚽'],
  [/方|积木/, '🎨'],
  [/汽车|车/, '🚗'],
  [/船/, '⛵'],
  [/飞机/, '✈️'],
  [/早上|早晨|上午/, '🌅'],
  [/晚上|夜/, '🌃'],
];

const FALLBACK_EMOJI = [
  '🍎', '🌟', '🐻', '🎈', '🍓', '🐥', '🌈', '🍭', '🍋', '🐬', '🎁', '🌻',
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* -------------------------------------------------------------------------- */
/* safeGlyph — old Android / MuMu emoji font compatibility                     */
/* -------------------------------------------------------------------------- */

/**
 * MuMu and older Android WebViews ship an emoji font that predates Unicode 11:
 * a few glyphs render as tofu boxes (🪷) and some dingbats degrade to
 * monochrome shapes (☃️). The content factory may emit any emoji, so the fix
 * belongs in the render layer — keep it identical to Flutter `safeChildGlyph`.
 *
 * Semantic fidelity is a hard constraint (fixed 2026-11): for 3-6 year olds
 * learning by matching pictures to words, swapping 🧸 teddy bear → 🎈 balloon
 * or 🧺 basket → 🏠 house teaches the WRONG concept — worse than a tofu box on
 * a very old device. The old hash-based random fallback could turn any new
 * glyph into an unrelated picture and has been removed. Only semantic
 * equivalents (or clear hypernyms) are substituted; everything else is
 * returned untouched and left to the system font.
 */
const COMPAT_EMOJI: Record<string, string> = {
  '🪷': '🌸', '☃': '⛄', '🃏': '🎲', '🦉': '🐦',
  '⛰': '🌋', '🌧': '☔', '🖍': '🎨',
  '🟦': '🔷', '🟡': '☀️', '🟢': '🍀', '🟣': '🍇', '🟠': '🍊',
};

export function safeGlyph(glyph: string): string {
  if (!glyph) return glyph;
  let out = '';
  let replaced = false;
  for (const ch of glyph) {
    const cp = ch.codePointAt(0)!;
    // Variation selector / keycap: drop when the base glyph was replaced
    // (e.g. ☃️), otherwise keep (e.g. ❄️, 1️⃣).
    if (cp === 0xfe0f || cp === 0x20e3) {
      if (!replaced) out += ch;
      continue;
    }
    const mapped = COMPAT_EMOJI[ch];
    if (mapped) {
      out += mapped;
      replaced = true;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Always returns a glyph: explicit icon → shape → label keyword → stable hash. */
export function visualFor(opts: {
  icon?: string | null;
  label: string;
  shape?: string;
}): string {
  const { icon, label, shape } = opts;
  if (icon && icon.trim().length > 0) return safeGlyph(icon);
  if (shape && SHAPE_EMOJI[shape]) return safeGlyph(SHAPE_EMOJI[shape]);

  const text = label || '';
  // When the label itself carries a pictograph, reuse it instead of hashing.
  const pictograph = text.match(/\p{Extended_Pictographic}/u);
  if (pictograph) return safeGlyph(pictograph[0]);
  for (const [pattern, emoji] of LABEL_KEYWORDS) {
    if (pattern.test(text)) return safeGlyph(emoji);
  }
  return safeGlyph(FALLBACK_EMOJI[hashString(text) % FALLBACK_EMOJI.length]);
}

/** Derive a feedback tone from the existing (unchanged) Chinese copy. */
export function inferTone(text: string): ChildFeedbackTone {
  if (/再想一想|再试|再描|再听|没关系|不太对|不对|再换/.test(text)) return 'think';
  if (/答对|放对|配对成功|涂对|真棒|太棒|成功|很准/.test(text)) return 'cheer';
  if (/先|选一个|点一张/.test(text)) return 'tip';
  return 'info';
}

/* -------------------------------------------------------------------------- */
/* Pure-CSS animations (no new dependency, no timers)                          */
/* -------------------------------------------------------------------------- */

const CHILD_GAME_CSS = `
@keyframes child-pop-in {
  0% { opacity: 0; transform: translateY(8px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes child-float-up {
  0% { opacity: 0; transform: translateY(10px) scale(0.4) rotate(0deg); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-90px) scale(1.25) rotate(200deg); }
}
@keyframes child-twinkle {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
.child-pop-in { animation: child-pop-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.child-float-up { animation: child-float-up 900ms ease-out both; }
.child-twinkle { animation: child-twinkle 1.2s ease-in-out infinite; }
`;

/* -------------------------------------------------------------------------- */
/* VisualTile — big picture, small label, huge tap target                      */
/* -------------------------------------------------------------------------- */

export type VisualTileState =
  | 'normal'
  | 'selected'
  | 'correct'
  | 'wrong'
  | 'dim'
  | 'revealed';

interface VisualTileProps {
  visual: string;
  label: string;
  /** Optional same-origin situation picture; preferred over `visual` emoji. */
  imageUrl?: string;
  state?: VisualTileState;
  onClick?: () => void;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  /** Renders a non-interactive tile (used for read-only sequence items). */
  as?: 'button' | 'div';
  /** Forwarded to aria-pressed so existing semantics survive the restyle. */
  pressed?: boolean;
}

const TILE_STATE_CLASS: Record<VisualTileState, string> = {
  normal: 'bg-surface-container-lowest border-outline-variant/40 text-on-surface',
  selected:
    'bg-primary-container/70 border-primary text-on-primary-container ring-2 ring-primary/40',
  correct: 'bg-success-container border-success text-on-success-container',
  wrong: 'bg-danger-container/60 border-danger text-on-danger-container',
  dim: 'bg-surface-container/60 border-outline-variant/30 text-on-surface-variant opacity-60',
  revealed:
    'bg-primary-container/60 border-primary text-on-primary-container ring-2 ring-primary/40',
};

const TILE_SIZE_CLASS = {
  sm: 'min-h-[64px] min-w-[64px] px-2 py-2',
  md: 'min-h-[88px] min-w-[80px] px-3 py-2',
  lg: 'min-h-[104px] min-w-[104px] px-4 py-3',
} as const;

const TILE_EMOJI_CLASS = {
  sm: 'text-3xl',
  md: 'text-4xl',
  lg: 'text-5xl',
} as const;

/** Append the JWT to a media URL — <img> cannot send an Authorization header. */
export function withAuthToken(url: string): string {
  let token = '';
  try {
    token = localStorage.getItem('auth_token') || '';
  } catch {
    // Storage may be blocked in private mode; the image simply falls back.
  }
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
}

/** Situation picture with graceful fallback to the emoji if it fails to load. */
function SituationPicture({
  src,
  fallback,
  size,
}: {
  src: string;
  fallback: string;
  size: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={cn('leading-none drop-shadow-sm', TILE_EMOJI_CLASS[size])} aria-hidden="true">
        {fallback}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={cn('object-contain', {
        'h-12 w-12': size === 'sm',
        'h-16 w-16': size === 'md',
        'h-20 w-20': size === 'lg',
      })}
      onError={() => setFailed(true)}
    />
  );
}

export function VisualTile({
  visual,
  label,
  imageUrl,
  state = 'normal',
  onClick,
  ariaLabel,
  size = 'md',
  className,
  draggable,
  onDragStart,
  as = 'button',
  pressed,
}: VisualTileProps) {
  // className is merged last so callers can override border/bg colours
  // (e.g. tap_target's "border-primary" reveal assertion).
  const classes = cn(
    'touch-target relative flex flex-col items-center justify-center gap-1 rounded-3xl border-2',
    'font-bold transition-tactile tactile-press select-none',
    'hover:-translate-y-0.5 hover:shadow-lg active:scale-95',
    TILE_SIZE_CLASS[size],
    TILE_STATE_CLASS[state],
    className,
  );

  const inner = (
    <>
      {imageUrl ? (
        <SituationPicture src={withAuthToken(imageUrl)} fallback={visual} size={size} />
      ) : (
        <span
          className={cn('leading-none drop-shadow-sm', TILE_EMOJI_CLASS[size])}
          aria-hidden="true"
        >
          {visual}
        </span>
      )}
      <span className="text-center text-xs font-bold leading-tight">{label}</span>
    </>
  );

  if (as === 'div') {
    return (
      <div className={classes} aria-label={ariaLabel}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel ?? (label || undefined)}
      aria-pressed={pressed}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {inner}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* StarProgress                                                                */
/* -------------------------------------------------------------------------- */

export function StarProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const safeTotal = Math.max(1, total);
  const clamped = Math.min(Math.max(0, current), safeTotal);
  const pct = Math.round((clamped / safeTotal) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: safeTotal }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'text-xl leading-none transition-transform',
              i < clamped ? 'child-twinkle' : 'opacity-30',
            )}
            aria-hidden="true"
          >
            {i < clamped ? '⭐' : '☆'}
          </span>
        ))}
      </div>
      <div className="h-2.5 w-16 overflow-hidden rounded-full bg-outline-variant/30 sm:w-20">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs font-bold text-on-surface-variant">
        {clamped} / {safeTotal}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VoiceButton                                                                 */
/* -------------------------------------------------------------------------- */

interface VoiceButtonProps {
  onReplay: () => void;
  speaking?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
  /**
   * Deliberately NOT "再听一遍指令": tap_target owns that exact label and must
   * stay the only button with it so its tests keep resolving a single button.
   */
  ariaLabel?: string;
}

export function VoiceButton({
  onReplay,
  speaking = false,
  muted = false,
  onToggleMute,
  ariaLabel = '再听一遍引导',
}: VoiceButtonProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onReplay}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border-2',
          'bg-primary-container text-2xl text-on-primary-container border-primary/40',
          'shadow-tactile transition-tactile tactile-press active:scale-95',
          speaking && 'animate-voice-pulse',
        )}
      >
        {speaking ? '📢' : '🔊'}
      </button>
      {onToggleMute ? (
        <button
          type="button"
          aria-label={muted ? '打开语音' : '关闭语音'}
          onClick={onToggleMute}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-outline-variant/50 bg-surface-container-lowest text-base transition-tactile active:scale-95"
        >
          {muted ? '🔇' : '🔈'}
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FeedbackBanner — the ONE role="status" in a running game                   */
/* -------------------------------------------------------------------------- */

const TONE_EMOJI: Record<ChildFeedbackTone, string> = {
  cheer: '🎉',
  think: '🤔',
  tip: '💡',
  info: 'ℹ️',
};

const TONE_CLASS: Record<ChildFeedbackTone, string> = {
  cheer: 'bg-success-container/70 border-success/50 text-on-success-container',
  think: 'bg-warning-container border-warning/60 text-on-warning-container',
  tip: 'bg-secondary-container/60 border-secondary/40 text-on-secondary-container',
  info: 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant',
};

export function FeedbackBanner({
  feedback,
}: {
  feedback: { tone: ChildFeedbackTone; text: string } | null;
}) {
  if (!feedback) {
    // Reserved space avoids layout jumps; no role="status" while empty.
    return <div className="min-h-[56px]" aria-hidden="true" />;
  }
  return (
    <div
      key={feedback.text}
      role="status"
      className={cn(
        'child-pop-in flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3',
        TONE_CLASS[feedback.tone],
      )}
    >
      <span className="text-3xl leading-none" aria-hidden="true">
        {TONE_EMOJI[feedback.tone]}
      </span>
      <span className="text-sm font-bold leading-snug sm:text-base">
        {feedback.text}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CheerBurst — ~900ms confetti, restarted by a changing trigger              */
/* -------------------------------------------------------------------------- */

const CHEER_PARTICLES = [
  '🎉', '✨', '⭐', '🌟', '🎊', '💫', '🎈', '🍬', '🥳', '💛',
];

export function CheerBurst({ trigger }: { trigger: number }) {
  if (trigger <= 0) return null;
  return (
    <div
      key={trigger}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      {CHEER_PARTICLES.map((particle, i) => (
        <span
          key={i}
          className="child-float-up absolute text-2xl"
          style={{
            left: `${6 + ((i * 13) % 88)}%`,
            top: `${35 + (i % 4) * 8}%`,
            fontSize: `${18 + (i % 4) * 8}px`,
            animationDelay: `${i * 55}ms`,
          }}
        >
          {particle}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared voice controls                                                       */
/* -------------------------------------------------------------------------- */

export interface ChildVoiceControls {
  speaking: boolean;
  muted: boolean;
  onToggleMute?: () => void;
  onReplay: () => void;
  speak: (text: string) => void;
}

/**
 * Speaks the guide once on entry and re-speaks every feedback line.
 * `enabled` / `toggle` are optional at runtime: tap_target's tests mock
 * useGameVoice with only { speak, stop, isPlaying }, so nothing here may
 * destructure-and-call them unconditionally.
 *
 * NOTE: tap_target deliberately does NOT use this helper — its speak() timing
 * is asserted by tests and must stay exactly as it was.
 */
export function useChildGameVoice(
  guide: string,
  feedbackText: string | null,
): ChildVoiceControls {
  const voice = useGameVoice();
  const speak = voice.speak;
  const enabled = voice.enabled;
  const toggle = voice.toggle;

  useEffect(() => {
    speak(guide);
  }, [speak, guide]);

  useEffect(() => {
    if (feedbackText) speak(feedbackText);
  }, [feedbackText, speak]);

  return {
    speaking: Boolean(voice.isPlaying),
    muted: enabled === false,
    onToggleMute: typeof toggle === 'function' ? toggle : undefined,
    onReplay: () => speak(guide),
    speak,
  };
}

/* -------------------------------------------------------------------------- */
/* ChildGameShell                                                              */
/* -------------------------------------------------------------------------- */

interface ChildGameShellProps {
  title: string;
  mascot?: string;
  prompt: string;
  current?: number;
  total?: number;
  stepLabel?: string;
  feedback?: { tone: ChildFeedbackTone; text: string } | null;
  onReplay: () => void;
  speaking?: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
  cheerKey?: number;
  /** tap_target keeps its own "再听一遍指令" button and hides this one. */
  showVoiceButton?: boolean;
  children: ReactNode;
}

export function ChildGameShell({
  title,
  mascot = '🐻',
  prompt,
  current = 0,
  total = 0,
  stepLabel,
  feedback = null,
  onReplay,
  speaking = false,
  muted = false,
  onToggleMute,
  cheerKey,
  showVoiceButton = true,
  children,
}: ChildGameShellProps) {
  // Celebrate whenever a fresh "cheer" line appears — no game has to manage it.
  const [burst, setBurst] = useState(0);
  const lastCheerRef = useRef<string | null>(null);
  const tone = feedback?.tone;
  const text = feedback?.text;
  useEffect(() => {
    if (tone === 'cheer' && text && text !== lastCheerRef.current) {
      setBurst((value) => value + 1);
    }
    lastCheerRef.current = text ?? null;
  }, [tone, text]);

  return (
    <div
      className="relative overflow-hidden rounded-[2rem] border-2 border-white/70 shadow-card-hover"
      style={{
        backgroundImage:
          'linear-gradient(145deg, #fff9e6 0%, #fff1f2 48%, #eff6ff 100%)',
      }}
    >
      {/* soft decorative bubbles */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/40"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-amber-100/50"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-16 top-24 h-10 w-10 rounded-full bg-sky-100/60"
        aria-hidden="true"
      />

      <div className="relative space-y-4 p-4 sm:p-5">
        <header className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-3xl shadow-card"
            aria-hidden="true"
          >
            {safeGlyph(mascot)}
          </div>
          <h3 className="min-w-0 flex-1 truncate text-lg font-black text-on-surface sm:text-xl">
            {title}
          </h3>
          {showVoiceButton ? (
            <VoiceButton
              onReplay={onReplay}
              speaking={speaking}
              muted={muted}
              onToggleMute={onToggleMute}
            />
          ) : null}
        </header>

        {/* speech-bubble prompt: few words, big type */}
        <div className="relative rounded-2xl rounded-tl-sm border-2 border-primary/20 bg-white/80 px-4 py-3 shadow-card">
          <span className="mr-2 text-xl" aria-hidden="true">
            💬
          </span>
          <span className="text-base font-bold leading-snug text-on-surface sm:text-lg">
            {prompt}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <StarProgress current={current} total={total} />
          {stepLabel ? (
            <span className="text-xs font-bold text-on-surface-variant">
              {stepLabel}
            </span>
          ) : null}
        </div>

        <div>{children}</div>

        <FeedbackBanner feedback={feedback} />
      </div>

      <CheerBurst trigger={cheerKey ?? burst} />
      {/* Static, hard-coded CSS — no user input, no variables, no dependency. */}
      <style dangerouslySetInnerHTML={{ __html: CHILD_GAME_CSS }} />
    </div>
  );
}
