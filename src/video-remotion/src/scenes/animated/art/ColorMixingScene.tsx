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
import { pulseScale } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type ColorMixingParams = {
  color1?: string;
  color2?: string;
  resultLabel?: string;
};

// Merge duplicate case-insensitive hex entries via normalization
const COLOR_NAMES: Record<string, string> = {
  red: "红", yellow: "黄", blue: "蓝", green: "绿",
};

const MIXING_TABLE: Record<string, string> = {
  "red+yellow": "#FF9800",
  "yellow+red": "#FF9800",
  "blue+yellow": "#4CAF50",
  "yellow+blue": "#4CAF50",
  "red+blue": "#9C27B0",
  "blue+red": "#9C27B0",
  "red+green": "#795548",
  "green+red": "#795548",
  "blue+green": "#009688",
  "green+blue": "#009688",
};

const MIXED_NAMES: Record<string, string> = {
  "#FF9800": "橙",
  "#4CAF50": "绿",
  "#9C27B0": "紫",
  "#795548": "棕",
  "#009688": "青",
};

function normalizeColorKey(hex: string): string {
  const map: Record<string, string> = {
    "#FF0000": "red", "#ff0000": "red",
    "#FFFF00": "yellow", "#ffff00": "yellow",
    "#0000FF": "blue", "#0000ff": "blue",
    "#00FF00": "green", "#00ff00": "green",
  };
  return map[hex.toUpperCase()] ?? map[hex] ?? hex.toLowerCase();
}

function getMixedColor(c1: string, c2: string): string {
  const key = `${normalizeColorKey(c1)}+${normalizeColorKey(c2)}`;
  return MIXING_TABLE[key] ?? "#888888";
}

/** SVG paint palette with color wells */
const SvgPalette: React.FC<{ x: number; y: number; color1: string; color2: string; mixedColor: string; paletteProgress: number }> = ({
  x, y, color1, color2, mixedColor, paletteProgress,
}) => (
  <svg
    style={{ position: "absolute", left: x - 60, top: y - 40, zIndex: 2, opacity: paletteProgress }}
    width={120} height={80} viewBox="0 0 120 80"
  >
    <defs>
      <filter id="paletteShadow">
        <feDropShadow dx={0} dy={2} stdDeviation={3} floodColor="#00000033" />
      </filter>
    </defs>
    {/* Palette body - oval thumb hole shape */}
    <path
      d="M10,40 Q10,10 60,10 Q110,10 110,40 Q110,70 60,70 Q30,70 20,55 Q15,48 10,40 Z"
      fill="#DEB887" stroke="#C4A265" strokeWidth={2}
      filter="url(#paletteShadow)"
    />
    {/* Thumb hole */}
    <ellipse cx={35} cy={48} rx={12} ry={10} fill="#F5DEB3" stroke="#C4A265" strokeWidth={1.5} />
    {/* Color well 1 */}
    <circle cx={60} cy={32} r={10} fill={color1} opacity={0.9}>
      <animate attributeName="r" values="9;10;9" dur="2s" repeatCount="indefinite" />
    </circle>
    {/* Color well 2 */}
    <circle cx={85} cy={38} r={9} fill={color2} opacity={0.9} />
    {/* Mixed well */}
    <circle cx={72} cy={55} r={8} fill={mixedColor} opacity={paletteProgress * 0.9} />
  </svg>
);

/** SVG paint brush icon */
const SvgBrush: React.FC<{ x: number; y: number; rotation: number; opacity: number }> = ({
  x, y, rotation, opacity,
}) => (
  <svg
    style={{ position: "absolute", left: x - 15, top: y - 45, zIndex: 3, transform: `rotate(${rotation}deg)`, opacity }}
    width={30} height={90} viewBox="0 0 30 90"
  >
    <defs>
      <linearGradient id="brushHandle" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#8B6914" />
        <stop offset="50%" stopColor="#D4A545" />
        <stop offset="100%" stopColor="#8B6914" />
      </linearGradient>
      <linearGradient id="brushFerrule" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#888" />
        <stop offset="50%" stopColor="#CCC" />
        <stop offset="100%" stopColor="#888" />
      </linearGradient>
    </defs>
    {/* Handle */}
    <rect x={10} y={0} width={10} height={50} rx={2} fill="url(#brushHandle)" />
    {/* Ferrule */}
    <rect x={8} y={48} width={14} height={10} rx={1} fill="url(#brushFerrule)" />
    {/* Bristles */}
    <path d="M8,58 Q8,90 15,90 Q22,90 22,58 Z" fill="#E8D5B7" stroke="#C4A265" strokeWidth={0.5} />
  </svg>
);

/** SVG paint drip */
const SvgDrip: React.FC<{ x: number; y: number; color: string; opacity: number; scale: number }> = ({
  x, y, color, opacity, scale,
}) => (
  <svg
    style={{ position: "absolute", left: x - 8, top: y - 14, zIndex: 2, opacity, transform: `scale(${scale})` }}
    width={16} height={28} viewBox="0 0 16 28"
  >
    <path
      d="M8,0 Q8,0 3,12 Q0,18 0,21 Q0,28 8,28 Q16,28 16,21 Q16,18 13,12 Q8,0 8,0 Z"
      fill={color}
    />
  </svg>
);

/** SVG sparkle star */
const SvgSparkle: React.FC<{ x: number; y: number; size: number; opacity: number; scale: number; rotation: number }> = ({
  x, y, size, opacity, scale, rotation,
}) => (
  <svg
    style={{ position: "absolute", left: x - size / 2, top: y - size / 2, zIndex: 4, opacity, transform: `scale(${scale}) rotate(${rotation}deg)` }}
    width={size} height={size} viewBox="0 0 40 40"
  >
    <defs>
      <filter id="sparkleGlow">
        <feGaussianBlur stdDeviation={2} result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path
      d="M20,2 L23,15 L36,20 L23,25 L20,38 L17,25 L4,20 L17,15 Z"
      fill="#FFD700"
      filter="url(#sparkleGlow)"
    />
  </svg>
);

/** SVG mixing bowl */
const SvgMixingBowl: React.FC<{ x: number; y: number; color1: string; color2: string; mixProgress: number }> = ({
  x, y, color1, color2, mixProgress,
}) => {
  const swirlAngle = mixProgress * 360;
  return (
    <svg
      style={{ position: "absolute", left: x - 50, top: y - 35, zIndex: 2 }}
      width={100} height={70} viewBox="0 0 100 70"
    >
      <defs>
        <radialGradient id="bowlGrad" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#E0E0E0" stopOpacity={0} />
        </radialGradient>
        <clipPath id="bowlClip">
          <ellipse cx={50} cy={38} rx={40} ry={26} />
        </clipPath>
      </defs>
      {/* Bowl body */}
      <path
        d="M5,30 Q5,65 50,65 Q95,65 95,30 Q95,18 50,18 Q5,18 5,30 Z"
        fill="#F5F5DC" stroke="#D2B48C" strokeWidth={2}
      />
      {/* Bowl highlight */}
      <ellipse cx={50} cy={38} rx={40} ry={26} fill="url(#bowlGrad)" />
      {/* Color 1 swirl */}
      <g clipPath="url(#bowlClip)">
        <circle cx={38} cy={35} r={14} fill={color1} opacity={1 - mixProgress * 0.5} />
        {/* Color 2 swirl */}
        <circle cx={62} cy={35} r={14} fill={color2} opacity={1 - mixProgress * 0.5} />
        {/* Swirl mixing indicator */}
        <ellipse
          cx={50} cy={38}
          rx={16 * mixProgress} ry={10 * mixProgress}
          fill={mixProgress > 0.5 ? undefined : "none"}
          style={{ mixBlendMode: "multiply" }}
        >
          {mixProgress > 0.5 && <title>mixed</title>}
        </ellipse>
        {/* Animated swirl line */}
        {mixProgress > 0 && (
          <path
            d={`M${50 - 15 * mixProgress},${35} Q${50},${35 - 12 * mixProgress} ${50 + 15 * mixProgress},${35} Q${50},${35 + 12 * mixProgress} ${50 - 15 * mixProgress},${35}`}
            fill="none" stroke="#FFFFFF66" strokeWidth={2}
            transform={`rotate(${swirlAngle}, 50, 36)`}
          />
        )}
      </g>
    </svg>
  );
};

/** SVG paint splatter background decoration */
const PaintSplatters: React.FC<{ width: number; height: number; frame: number; fps: number }> = ({
  width, height, frame, fps,
}) => {
  const splatters = [
    { cx: width * 0.08, cy: height * 0.25, r: 18, color: "#FF6B6B44" },
    { cx: width * 0.92, cy: height * 0.15, r: 14, color: "#4D96FF44" },
    { cx: width * 0.15, cy: height * 0.75, r: 22, color: "#FFD93D44" },
    { cx: width * 0.85, cy: height * 0.7, r: 16, color: "#6BCB7744" },
    { cx: width * 0.5, cy: height * 0.9, r: 20, color: "#FF6B9D44" },
    { cx: width * 0.75, cy: height * 0.85, r: 12, color: "#9C27B044" },
    { cx: width * 0.3, cy: height * 0.12, r: 10, color: "#FF980044" },
  ];
  const pulse = Math.sin((frame / fps) * Math.PI) * 0.08;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width, height, zIndex: 0 }} viewBox={`0 0 ${width} ${height}`}>
      {splatters.map((s, i) => (
        <g key={i}>
          <circle cx={s.cx} cy={s.cy} r={s.r * (1 + pulse)} fill={s.color} />
          <circle cx={s.cx + 5} cy={s.cy - 3} r={s.r * 0.4 * (1 + pulse)} fill={s.color} />
          <circle cx={s.cx - 4} cy={s.cy + 6} r={s.r * 0.3 * (1 + pulse)} fill={s.color} />
        </g>
      ))}
    </svg>
  );
};

export const ColorMixingScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: ColorMixingParams = data.animationTemplate?.params ?? {};
  const color1 = params.color1 ?? "#FF0000";
  const color2 = params.color2 ?? "#0000FF";
  const resultLabel = params.resultLabel;

  const mixedColor = getMixedColor(color1, color2);
  const mixedName = resultLabel ?? MIXED_NAMES[mixedColor] ?? "混合色";
  const name1 = COLOR_NAMES[normalizeColorKey(color1)] ?? "色1";
  const name2 = COLOR_NAMES[normalizeColorKey(color2)] ?? "色2";

  const centerX = width / 2;
  const circleY = height * 0.38;
  const circleSize = 100;

  // Slide-in progress: 0→0.6 of total frames
  const slideProgress = interpolate(frame, [15, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const leftX = interpolate(slideProgress, [0, 1], [centerX - 240, centerX - 30]);
  const rightX = interpolate(slideProgress, [0, 1], [centerX + 240, centerX + 30]);

  // Result circle appears at ~60% through
  const resultAppear = interpolate(frame, [75, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const resultScale = spring({
    frame: Math.max(0, frame - 75),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Sparkle burst
  const sparkleOpacity = interpolate(frame, [85, 95, 120], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Palette entrance
  const paletteProgress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Mixing bowl progress
  const mixProgress = interpolate(frame, [75, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Brush animation
  const brushRotation = interpolate(frame, [0, 60, 75], [-15, 15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Drip animations
  const dripData = [
    { x: centerX - 80, delay: 30, color: color1 },
    { x: centerX + 60, delay: 40, color: color2 },
    { x: centerX - 20, delay: 80, color: mixedColor },
    { x: centerX + 30, delay: 85, color: mixedColor },
  ];

  const sparklePositions = [
    { x: centerX - 60, y: circleY - 60 },
    { x: centerX + 70, y: circleY - 50 },
    { x: centerX - 50, y: circleY + 70 },
    { x: centerX + 55, y: circleY + 65 },
    { x: centerX, y: circleY - 80 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Paint splatter background */}
      <PaintSplatters width={width} height={height} frame={frame} fps={fps} />

      {/* SVG Palette decoration */}
      <SvgPalette
        x={width * 0.12}
        y={height * 0.82}
        color1={color1}
        color2={color2}
        mixedColor={mixedColor}
        paletteProgress={paletteProgress}
      />

      {/* SVG Brush decoration */}
      <SvgBrush
        x={width * 0.88}
        y={height * 0.75}
        rotation={brushRotation}
        opacity={paletteProgress}
      />

      {/* Paint drips */}
      {dripData.map((drip, i) => {
        const dripAppear = interpolate(frame, [drip.delay, drip.delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const dripFall = interpolate(frame, [drip.delay, drip.delay + 25], [0, 50], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const dripFade = interpolate(frame, [drip.delay + 20, drip.delay + 30], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (dripAppear <= 0) return null;
        return (
          <SvgDrip
            key={i}
            x={drip.x}
            y={circleY + circleSize / 2 + dripFall}
            color={drip.color}
            opacity={dripFade * dripAppear}
            scale={dripAppear}
          />
        );
      })}

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: height * 0.08,
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

      {/* Mixing bowl */}
      <SvgMixingBowl
        x={centerX}
        y={circleY - 10}
        color1={color1}
        color2={color2}
        mixProgress={mixProgress}
      />

      {/* Left color circle */}
      <svg
        style={{
          position: "absolute",
          left: leftX - circleSize / 2,
          top: circleY - circleSize / 2,
          zIndex: 2,
        }}
        width={circleSize} height={circleSize} viewBox="0 0 100 100"
      >
        <defs>
          <radialGradient id={`leftGrad`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.4} />
            <stop offset="100%" stopColor={color1} />
          </radialGradient>
          <filter id="leftGlow">
            <feGaussianBlur stdDeviation={4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={50} cy={50} r={48} fill={`url(#leftGrad)`} filter="url(#leftGlow)" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: leftX - circleSize / 2,
          top: circleY + circleSize / 2 + 12,
          width: circleSize,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: PALETTE.dark,
          zIndex: 2,
        }}
      >
        {name1}
      </div>

      {/* Right color circle */}
      <svg
        style={{
          position: "absolute",
          left: rightX - circleSize / 2,
          top: circleY - circleSize / 2,
          zIndex: 2,
        }}
        width={circleSize} height={circleSize} viewBox="0 0 100 100"
      >
        <defs>
          <radialGradient id={`rightGrad`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.4} />
            <stop offset="100%" stopColor={color2} />
          </radialGradient>
          <filter id="rightGlow">
            <feGaussianBlur stdDeviation={4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={50} cy={50} r={48} fill={`url(#rightGrad)`} filter="url(#rightGlow)" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: rightX - circleSize / 2,
          top: circleY + circleSize / 2 + 12,
          width: circleSize,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: PALETTE.dark,
          zIndex: 2,
        }}
      >
        {name2}
      </div>

      {/* Mixed result circle */}
      {resultAppear > 0 && (
        <svg
          style={{
            position: "absolute",
            left: centerX - circleSize / 2 - 30,
            top: circleY - circleSize / 2 + 80,
            zIndex: 3,
            transform: `scale(${resultScale})`,
          }}
          width={circleSize} height={circleSize} viewBox="0 0 100 100"
        >
          <defs>
            <radialGradient id="resultGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.5} />
              <stop offset="100%" stopColor={mixedColor} />
            </radialGradient>
            <filter id="resultGlow">
              <feGaussianBlur stdDeviation={6} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={50} cy={50} r={48} fill="url(#resultGrad)" filter="url(#resultGlow)" />
        </svg>
      )}
      {resultAppear > 0 && (
        <div
          style={{
            position: "absolute",
            left: centerX - circleSize / 2 - 30,
            top: circleY + circleSize / 2 + 92,
            width: circleSize,
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: 32,
            fontWeight: 900,
            color: mixedColor,
            transform: `scale(${resultScale})`,
            zIndex: 3,
          }}
        >
          {mixedName}
        </div>
      )}

      {/* Sparkle burst - SVG stars instead of emoji */}
      {sparkleOpacity > 0 &&
        sparklePositions.map((pos, i) => {
          const scale = pulseScale(frame + i * 5, fps, 3, 0.15, 0.8);
          const rotation = interpolate(frame, [85, 120], [0, 180 + i * 45], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <SvgSparkle
              key={i}
              x={pos.x}
              y={pos.y}
              size={36}
              opacity={sparkleOpacity}
              scale={scale}
              rotation={rotation}
            />
          );
        })}

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.1,
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
