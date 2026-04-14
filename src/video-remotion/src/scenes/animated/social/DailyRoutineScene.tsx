import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { SPRING_CONFIGS } from "../../../theme/animations";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY, FONT_SIZES } from "../../../theme/fonts";
import { pulseScale, staggerDelay } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type DailyRoutineParams = {
  activities?: string[];
  highlightIndex?: number;
};

const DEFAULT_ACTIVITIES = ["起床", "吃饭", "学习", "玩耍", "睡觉"];
const TIME_LABELS = ["早上", "上午", "中午", "下午", "晚上"];

/** SVG activity station illustrations */
const SvgSunrise: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 42 42">
    <defs>
      <linearGradient id="sunriseSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFD93D" stopOpacity={0.3} />
        <stop offset="100%" stopColor="#FFE082" stopOpacity={0.1} />
      </linearGradient>
      <filter id="sunGlow">
        <feGaussianBlur stdDeviation={1.5} result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Horizon line */}
    <line x1={4} y1={30} x2={38} y2={30} stroke="#8D6E63" strokeWidth={1.5} />
    {/* Sun half */}
    <circle cx={21} cy={30} r={10} fill="#FFD93D" filter="url(#sunGlow)" />
    {/* Sun rays */}
    <line x1={21} y1={14} x2={21} y2={10} stroke="#FFD93D" strokeWidth={2} strokeLinecap="round" />
    <line x1={12} y1={18} x2={9} y2={15} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
    <line x1={30} y1={18} x2={33} y2={15} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
    {/* Bed/headboard shape */}
    <rect x={14} y={30} width={18} height={8} rx={2} fill="#795548" />
    <rect x={14} y={28} width={6} height={10} rx={2} fill="#8D6E63" />
    {/* Pillow */}
    <ellipse cx={17} cy={33} rx={3} ry={2} fill="#FFCCBC" />
    {/* Blanket */}
    <rect x={20} y={31} width={11} height={5} rx={2} fill="#90CAF9" />
  </svg>
);

const SvgRiceBowl: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 42 42">
    <defs>
      <linearGradient id="bowlGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F5F5F5" />
      </linearGradient>
    </defs>
    {/* Bowl */}
    <path d="M6,22 Q6,36 21,36 Q36,36 36,22 Z" fill="url(#bowlGrad)" stroke="#E0E0E0" strokeWidth={1.5} />
    {/* Rice */}
    <ellipse cx={21} cy={22} rx={15} ry={6} fill="#FFFEF0" stroke="#E8D5B7" strokeWidth={1} />
    {/* Chopsticks */}
    <line x1={28} y1={12} x2={34} y2={28} stroke="#8D6E63" strokeWidth={2} strokeLinecap="round" />
    <line x1={32} y1={12} x2={26} y2={28} stroke="#8D6E63" strokeWidth={2} strokeLinecap="round" />
    {/* Steam */}
    <path d="M14,16 Q16,12 14,8" fill="none" stroke="#BDBDBD" strokeWidth={1} opacity={0.5} />
    <path d="M21,14 Q23,10 21,6" fill="none" stroke="#BDBDBD" strokeWidth={1} opacity={0.5} />
    <path d="M28,16 Q30,12 28,8" fill="none" stroke="#BDBDBD" strokeWidth={1} opacity={0.5} />
  </svg>
);

const SvgBookStudy: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 42 42">
    <defs>
      <linearGradient id="bookCover" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4D96FF" />
        <stop offset="100%" stopColor="#3F51B5" />
      </linearGradient>
    </defs>
    {/* Open book */}
    <path d="M4,10 Q4,8 8,8 L18,10 L18,34 Q18,36 14,35 L4,33 Z" fill="url(#bookCover)" />
    <path d="M38,10 Q38,8 34,8 L24,10 L24,34 Q24,36 28,35 L38,33 Z" fill="url(#bookCover)" />
    {/* Pages */}
    <path d="M6,12 L18,13 L18,32 L6,31 Z" fill="#FFFEF5" />
    <path d="M36,12 L24,13 L24,32 L36,31 Z" fill="#FFFEF5" />
    {/* Text lines */}
    <line x1={8} y1={18} x2={16} y2={18.5} stroke="#BDBDBD" strokeWidth={1} />
    <line x1={8} y1={22} x2={16} y2={22.5} stroke="#BDBDBD" strokeWidth={1} />
    <line x1={8} y1={26} x2={16} y2={26.5} stroke="#BDBDBD" strokeWidth={1} />
    <line x1={26} y1={18} x2={34} y2={18.5} stroke="#BDBDBD" strokeWidth={1} />
    <line x1={26} y1={22} x2={34} y2={22.5} stroke="#BDBDBD" strokeWidth={1} />
    <line x1={26} y1={26} x2={34} y2={26.5} stroke="#BDBDBD" strokeWidth={1} />
    {/* Pencil */}
    <rect x={30} y={6} width={3} height={18} rx={1} fill="#FFD93D" transform="rotate(25, 31, 15)" />
    <polygon points="29,23 31,28 33,23" fill="#333" transform="rotate(25, 31, 25)" />
  </svg>
);

const SvgPlaygroundBall: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 42 42">
    <defs>
      <radialGradient id="ballGrad" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#FF8A80" />
        <stop offset="100%" stopColor="#F44336" />
      </radialGradient>
      <filter id="ballShadow">
        <feDropShadow dx={0} dy={2} stdDeviation={2} floodColor="#00000033" />
      </filter>
    </defs>
    {/* Ball */}
    <circle cx={21} cy={20} r={14} fill="url(#ballGrad)" filter="url(#ballShadow)" />
    {/* Ball highlight */}
    <ellipse cx={16} cy={15} rx={5} ry={4} fill="white" opacity={0.3} />
    {/* Ball seam lines */}
    <path d="M7,20 Q14,12 21,20 Q28,28 35,20" fill="none" stroke="#D32F2F" strokeWidth={1.5} />
    {/* Ground shadow */}
    <ellipse cx={21} cy={38} rx={10} ry={3} fill="#00000015" />
    {/* Star decorations */}
    <path d="M34,6 L35,9 L38,9 L36,11 L37,14 L34,12 L31,14 L32,11 L30,9 L33,9 Z" fill="#FFD93D" opacity={0.8} />
  </svg>
);

const SvgMoonNight: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 42 42">
    <defs>
      <filter id="moonGlow">
        <feGaussianBlur stdDeviation={2} result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Moon crescent */}
    <circle cx={21} cy={18} r={12} fill="#FFF9C4" filter="url(#moonGlow)" />
    <circle cx={27} cy={14} r={10} fill="#1A237E" opacity={0.9} />
    {/* Stars */}
    <circle cx={8} cy={8} r={1.5} fill="#FFD93D" />
    <circle cx={36} cy={12} r={1} fill="#FFD93D" />
    <circle cx={5} cy={30} r={1.2} fill="#FFD93D" />
    <circle cx={38} cy={28} r={1} fill="#FFD93D" />
    <circle cx={14} cy={34} r={0.8} fill="#FFD93D" />
    {/* Star shapes */}
    <path d="M32,4 L33,6 L35,6 L33.5,7.5 L34,9 L32,8 L30,9 L30.5,7.5 L29,6 L31,6 Z" fill="#FFD93D" opacity={0.7} />
    <path d="M6,20 L7,22 L9,22 L7.5,23.5 L8,25 L6,24 L4,25 L4.5,23.5 L3,22 L5,22 Z" fill="#FFD93D" opacity={0.5} />
    {/* Bed silhouette */}
    <rect x={10} y={34} width={22} height={6} rx={2} fill="#5C6BC0" opacity={0.5} />
    <rect x={10} y={32} width={6} height={8} rx={2} fill="#7986CB" opacity={0.5} />
    {/* Zzz */}
    <text x={32} y={20} fontFamily={FONT_FAMILY} fontSize={10} fontWeight={900} fill="#B39DDB" opacity={0.6}>z</text>
    <text x={35} y={16} fontFamily={FONT_FAMILY} fontSize={8} fontWeight={900} fill="#B39DDB" opacity={0.5}>z</text>
  </svg>
);

/** Map activity index to SVG component */
const ACTIVITY_SVGS = [SvgSunrise, SvgRiceBowl, SvgBookStudy, SvgPlaygroundBall, SvgMoonNight];

/** SVG timeline track (railroad style) */
const SvgTimelineTrack: React.FC<{
  startX: number;
  endX: number;
  y: number;
  progress: number;
  accentColor: string;
}> = ({ startX, endX, y, progress, accentColor }) => {
  const totalLen = endX - startX;
  const progressX = startX + totalLen * progress;
  return (
    <svg
      style={{ position: "absolute", left: startX - 10, top: y - 12, zIndex: 1 }}
      width={totalLen + 20} height={24}
      viewBox={`0 0 ${totalLen + 20} 24`}
    >
      {/* Track background - dashed line */}
      <line x1={10} y1={12} x2={totalLen + 10} y2={12} stroke="#E0E0E0" strokeWidth={6} strokeLinecap="round" />
      {/* Track ties */}
      {Array.from({ length: Math.floor(totalLen / 30) }).map((_, i) => (
        <rect key={i} x={10 + i * 30 + 5} y={4} width={8} height={16} rx={2} fill="#D0D0D0" />
      ))}
      {/* Progress fill */}
      {progress > 0 && (
        <line x1={10} y1={12} x2={10 + totalLen * progress} y2={12} stroke={accentColor} strokeWidth={6} strokeLinecap="round" />
      )}
    </svg>
  );
};

/** SVG clock face with animated hands */
const SvgClock: React.FC<{
  x: number;
  y: number;
  size: number;
  hourProgress: number; // 0-1 representing time of day
  accentColor: string;
}> = ({ x, y, size, hourProgress, accentColor }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  // Hour hand angle: 0 = 12 o'clock (top), rotates clockwise
  const hourAngle = hourProgress * 360;
  const hourHandLen = r * 0.5;
  const hourHandX = cx + Math.sin((hourAngle * Math.PI) / 180) * hourHandLen;
  const hourHandY = cy - Math.cos((hourAngle * Math.PI) / 180) * hourHandLen;
  // Minute hand (just for decoration, spins faster)
  const minuteAngle = (hourProgress * 12 * 360) % 360;
  const minuteHandLen = r * 0.7;
  const minuteHandX = cx + Math.sin((minuteAngle * Math.PI) / 180) * minuteHandLen;
  const minuteHandY = cy - Math.cos((minuteAngle * Math.PI) / 180) * minuteHandLen;

  return (
    <svg
      style={{ position: "absolute", left: x, top: y, zIndex: 2 }}
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <filter id="clockShadow">
          <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="#00000022" />
        </filter>
      </defs>
      {/* Clock face */}
      <circle cx={cx} cy={cy} r={r} fill="white" stroke={accentColor} strokeWidth={2} filter="url(#clockShadow)" />
      {/* Hour markers */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const innerR = r * 0.82;
        const outerR = r * 0.92;
        return (
          <line
            key={i}
            x1={cx + Math.sin(angle) * innerR}
            y1={cy - Math.cos(angle) * innerR}
            x2={cx + Math.sin(angle) * outerR}
            y2={cy - Math.cos(angle) * outerR}
            stroke={accentColor}
            strokeWidth={i % 3 === 0 ? 2.5 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {/* Hour hand */}
      <line x1={cx} y1={cy} x2={hourHandX} y2={hourHandY} stroke={PALETTE.dark} strokeWidth={3} strokeLinecap="round" />
      {/* Minute hand */}
      <line x1={cx} y1={cy} x2={minuteHandX} y2={minuteHandY} stroke={PALETTE.dark} strokeWidth={2} strokeLinecap="round" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={3} fill={accentColor} />
    </svg>
  );
};

/** SVG sun/moon arc showing time of day */
const SvgTimeArc: React.FC<{
  x: number;
  y: number;
  width: number;
  timeProgress: number; // 0-1 representing time of day
}> = ({ x, y, width, timeProgress }) => {
  const arcHeight = 40;
  // Position along arc
  const posX = x + width * timeProgress;
  const posY = y + arcHeight - Math.sin(timeProgress * Math.PI) * arcHeight;
  const isNight = timeProgress > 0.7;

  return (
    <svg
      style={{ position: "absolute", left: x, top: y - arcHeight - 10, zIndex: 1 }}
      width={width} height={arcHeight + 20}
      viewBox={`0 0 ${width} ${arcHeight + 20}`}
    >
      {/* Arc path */}
      <path
        d={`M0,${arcHeight + 10} Q${width / 2},-${10} ${width},${arcHeight + 10}`}
        fill="none" stroke="#E0E0E0" strokeWidth={1.5} strokeDasharray="4,4"
      />
      {/* Sun or Moon at current position */}
      {isNight ? (
        <g transform={`translate(${posX}, ${posY})`}>
          <circle cx={0} cy={0} r={8} fill="#FFF9C4" />
          <circle cx={4} cy={-3} r={7} fill="#1A237E" opacity={0.85} />
        </g>
      ) : (
        <g transform={`translate(${posX}, ${posY})`}>
          <circle cx={0} cy={0} r={8} fill="#FFD93D" />
          {/* Sun rays */}
          <line x1={0} y1={-12} x2={0} y2={-14} stroke="#FFD93D" strokeWidth={2} strokeLinecap="round" />
          <line x1={10} y1={-6} x2={12} y2={-7} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={-10} y1={-6} x2={-12} y2={-7} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={10} y1={6} x2={12} y2={7} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={-10} y1={6} x2={-12} y2={7} stroke="#FFD93D" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
};

/** SVG checkmark overlay for completed stations */
const SvgCheckmark: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <svg
    style={{ position: "absolute", left: x - 14, top: y - 14, zIndex: 5, opacity }}
    width={28} height={28} viewBox="0 0 28 28"
  >
    <circle cx={14} cy={14} r={12} fill="#6BCB77" />
    <path d="M8,14 L12,18 L20,10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** SVG glowing highlight border for active station */
const SvgGlowBorder: React.FC<{ x: number; y: number; size: number; color: string; frame: number; fps: number }> = ({
  x, y, size, color, frame, fps,
}) => {
  const pulse = 0.8 + Math.sin((frame / fps) * Math.PI * 3) * 0.2;
  return (
    <svg
      style={{ position: "absolute", left: x - size / 2 - 6, top: y - size / 2 - 6, zIndex: 3 }}
      width={size + 12} height={size + 12}
      viewBox={`0 0 ${size + 12} ${size + 12}`}
    >
      <defs>
        <filter id="stationGlow">
          <feGaussianBlur stdDeviation={3} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect
        x={2} y={2} width={size + 8} height={size + 8}
        rx={12} fill="none" stroke={color} strokeWidth={2.5}
        opacity={pulse} filter="url(#stationGlow)"
      />
    </svg>
  );
};

export const DailyRoutineScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: DailyRoutineParams = data.animationTemplate?.params ?? {};
  const activities = params.activities?.length ? params.activities : DEFAULT_ACTIVITIES;
  const highlightIndex = params.highlightIndex ?? -1;
  const total = activities.length;

  const centerY = height * 0.5;
  const timelineStartX = width * 0.12;
  const timelineEndX = width * 0.88;
  const timelineLen = timelineEndX - timelineStartX;
  const spacing = timelineLen / (total - 1);

  // Auto-cycle: move highlight through activities over time
  const cycleFramesPerActivity = Math.round(90 / total);
  const autoHighlight =
    highlightIndex >= 0
      ? highlightIndex
      : Math.min(total - 1, Math.floor(frame / cycleFramesPerActivity));

  // Glowing dot position
  const dotTargetX = timelineStartX + autoHighlight * spacing;
  const dotSpring = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
  });
  const dotX = interpolate(dotSpring, [0, 1], [timelineStartX, dotTargetX]);

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Timeline line entrance
  const lineProgress = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Time progress (0 = morning, 1 = night)
  const timeProgress = interpolate(frame, [0, 90], [0.1, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: height * 0.06,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.subtitle,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          zIndex: 2,
          textShadow: `0 2px 8px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      {/* Sun/Moon arc showing time of day */}
      <SvgTimeArc
        x={timelineStartX}
        y={centerY - 80}
        width={timelineLen}
        timeProgress={timeProgress}
      />

      {/* SVG Timeline track */}
      <SvgTimelineTrack
        startX={timelineStartX}
        endX={timelineEndX}
        y={centerY}
        progress={lineProgress}
        accentColor={data.accentColor}
      />

      {/* SVG Clock */}
      <SvgClock
        x={width - 80}
        y={height * 0.08}
        size={56}
        hourProgress={timeProgress}
        accentColor={data.accentColor}
      />

      {/* Activity nodes */}
      {activities.map((activity, idx) => {
        const x = timelineStartX + idx * spacing;
        const isPast = idx < autoHighlight;
        const isCurrent = idx === autoHighlight;
        const isFuture = idx > autoHighlight;
        const opacity = isPast ? 0.5 : isCurrent ? 1 : 0.7;

        // Zoom effect for current activity
        const currentScale = isCurrent
          ? 1 + interpolate(
              spring({
                frame: Math.max(0, frame - idx * cycleFramesPerActivity),
                fps,
                config: SPRING_CONFIGS.bouncy,
              }),
              [0, 1],
              [0, 0.3],
            )
          : 1;

        // Entrance spring
        const entranceDelay = staggerDelay(idx, 10, 8);
        const entranceSpring = spring({
          frame,
          fps,
          config: SPRING_CONFIGS.bouncy,
          delay: entranceDelay,
        });
        const entranceY = interpolate(entranceSpring, [0, 1], [30, 0]);
        const entranceOpacity = interpolate(entranceSpring, [0, 1], [0, 1]);

        const timeLabel = TIME_LABELS[idx % TIME_LABELS.length];

        // Get SVG component for this activity
        const ActivitySvg = ACTIVITY_SVGS[idx % ACTIVITY_SVGS.length];

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: x - 40,
              top: centerY - 70 + entranceY,
              width: 80,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: entranceOpacity * opacity,
              transform: `scale(${currentScale})`,
              zIndex: isCurrent ? 4 : 3,
            }}
          >
            {/* Time label */}
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 16,
                fontWeight: 700,
                color: PALETTE.dark,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              {timeLabel}
            </div>

            {/* SVG activity icon */}
            <div style={{ lineHeight: 1, userSelect: "none" }}>
              <ActivitySvg />
            </div>

            {/* Activity label */}
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 20,
                fontWeight: 700,
                color: isCurrent ? data.accentColor : PALETTE.dark,
                marginTop: 4,
                textShadow: isCurrent
                  ? `0 2px 8px ${data.accentColor}33`
                  : "none",
              }}
            >
              {activity}
            </div>

            {/* Checkmark for completed stations */}
            {isPast && (
              <SvgCheckmark x={35} y={-15} opacity={entranceOpacity * 0.9} />
            )}
          </div>
        );
      })}

      {/* Glowing highlight border on active station */}
      {autoHighlight >= 0 && (
        <SvgGlowBorder
          x={timelineStartX + autoHighlight * spacing}
          y={centerY - 30}
          size={50}
          color={data.accentColor}
          frame={frame}
          fps={fps}
        />
      )}

      {/* Glowing dot */}
      <svg
        style={{
          position: "absolute",
          left: dotX - 12,
          top: centerY - 12,
          zIndex: 5,
          transform: `scale(${pulseScale(frame, fps, 2, 0.15, 1)})`,
        }}
        width={24} height={24} viewBox="0 0 24 24"
      >
        <defs>
          <filter id="dotGlow">
            <feGaussianBlur stdDeviation={3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={12} cy={12} r={8} fill={data.accentColor} filter="url(#dotGlow)" />
        <circle cx={10} cy={10} r={2} fill="white" opacity={0.5} />
      </svg>

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.06,
            width: "100%",
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.label,
            fontWeight: 700,
            color: PALETTE.dark,
            opacity: interpolate(
              spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 }),
              [0, 1],
              [0, 0.7],
            ),
            zIndex: 2,
          }}
        >
          {data.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
