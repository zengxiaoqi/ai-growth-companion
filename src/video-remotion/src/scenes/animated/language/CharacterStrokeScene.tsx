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
import { staggerDelay } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type CharacterStrokeParams = {
  character?: string;
  strokeColor?: string;
  showGrid?: boolean;
};

const TOTAL_STRIPS = 8;
const STRIP_REVEAL_FRAMES = 15;
const STRIP_STAGGER = 15;

// SVG rice-character grid with decorative border
const TianGrid: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}> = ({ x, y, size, color, opacity }) => (
  <svg
    style={{ position: "absolute", left: x, top: y, opacity, zIndex: 1 }}
    width={size}
    height={size}
    viewBox="0 0 220 220"
    fill="none"
  >
    <defs>
      <filter id="grid-glow">
        <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor={color} floodOpacity={0.15} />
      </filter>
      {/* Decorative corner pattern */}
      <pattern id="corner-dots" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="0.8" fill={color} opacity={0.15} />
      </pattern>
    </defs>

    {/* Outer decorative double border */}
    <rect x="2" y="2" width="216" height="216" rx="8" stroke={color} strokeWidth={2} opacity={0.2} />
    <rect x="6" y="6" width="208" height="208" rx="6" stroke={color} strokeWidth={1} opacity={0.12} />

    {/* Corner dot fill */}
    <rect x="6" y="6" width="208" height="208" rx="6" fill="url(#corner-dots)" />

    {/* Cross-hair center lines */}
    <line x1="110" y1="6" x2="110" y2="214" stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.25} />
    <line x1="6" y1="110" x2="214" y2="110" stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.25} />

    {/* Diagonal guides */}
    <line x1="6" y1="6" x2="214" y2="214" stroke={color} strokeWidth={1} strokeDasharray="4 6" opacity={0.12} />
    <line x1="214" y1="6" x2="6" y2="214" stroke={color} strokeWidth={1} strokeDasharray="4 6" opacity={0.12} />

    {/* Corner accent marks */}
    {[
      [20, 20], [200, 20], [20, 200], [200, 200],
    ].map(([cx, cy], i) => (
      <g key={i}>
        <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke={color} strokeWidth={1.5} opacity={0.3} />
        <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke={color} strokeWidth={1.5} opacity={0.3} />
      </g>
    ))}

    {/* Subtle mid-point marks on edges */}
    <circle cx="110" cy="6" r="2" fill={color} opacity={0.2} />
    <circle cx="110" cy="214" r="2" fill={color} opacity={0.2} />
    <circle cx="6" cy="110" r="2" fill={color} opacity={0.2} />
    <circle cx="214" cy="110" r="2" fill={color} opacity={0.2} />
  </svg>
);

// SVG ink brush icon
const InkBrush: React.FC<{
  x: number;
  y: number;
  opacity: number;
  rotation: number;
}> = ({ x, y, opacity, rotation }) => (
  <svg
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      transform: `rotate(${rotation}deg)`,
      transformOrigin: "center center",
      zIndex: 5,
    }}
    width={32}
    height={48}
    viewBox="0 0 32 48"
    fill="none"
  >
    <defs>
      <linearGradient id="brush-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8D6E63" />
        <stop offset="60%" stopColor="#5D4037" />
        <stop offset="100%" stopColor="#3E2723" />
      </linearGradient>
    </defs>
    {/* Handle */}
    <rect x="12" y="0" width="8" height="28" rx="2" fill="url(#brush-grad)" />
    {/* Ferrule */}
    <rect x="10" y="24" width="12" height="6" rx="1" fill="#9E9E9E" />
    <line x1="12" y1="26" x2="20" y2="26" stroke="#BDBDBD" strokeWidth={0.5} />
    <line x1="12" y1="28" x2="20" y2="28" stroke="#BDBDBD" strokeWidth={0.5} />
    {/* Bristle tip */}
    <path d="M10 30 L12 46 Q16 48 20 46 L22 30 Z" fill="#212121" />
    <path d="M12 32 L14 44 Q16 45 18 44 L20 32 Z" fill="#424242" opacity={0.5} />
  </svg>
);

// Ink splash particles
const InkSplash: React.FC<{
  cx: number;
  cy: number;
  progress: number;
  color: string;
}> = ({ cx, cy, progress, color }) => {
  const particleCount = 12;
  return (
    <svg
      style={{ position: "absolute", left: cx - 60, top: cy - 60, zIndex: 6, pointerEvents: "none" }}
      width={120}
      height={120}
      viewBox="0 0 120 120"
    >
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * Math.PI * 2;
        const dist = progress * 55;
        const px = 60 + Math.cos(angle) * dist;
        const py = 60 + Math.sin(angle) * dist;
        const size = interpolate(progress, [0, 1], [4, 2]);
        const opacity = interpolate(progress, [0, 0.8, 1], [0.8, 0.5, 0], { extrapolateRight: "clamp" });

        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={size}
            fill={color}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
};

export const CharacterStrokeScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: CharacterStrokeParams = data.animationTemplate?.params ?? {};
  const character = params.character || data.title || "字";
  const strokeColor = params.strokeColor || data.accentColor || PALETTE.dark;
  const showGrid = params.showGrid !== false;

  const centerX = width / 2;
  const centerY = height * 0.45;
  const charSize = 180;
  const gridPad = 20;
  const gridSize = charSize + gridPad * 2;

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Reference character entrance
  const refSpring = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Stroke count label
  const currentStrip = Math.min(
    TOTAL_STRIPS,
    Math.floor(frame / STRIP_STAGGER) + 1,
  );
  const strokeLabelOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // All strips done?
  const allDone = currentStrip >= TOTAL_STRIPS;
  const completionScale = allDone
    ? spring({
        frame: Math.max(0, frame - TOTAL_STRIPS * STRIP_STAGGER),
        fps,
        config: SPRING_CONFIGS.bouncy,
      })
    : 1;

  // Ink brush position: follows the current strip being revealed
  const brushStripIndex = Math.min(TOTAL_STRIPS - 1, currentStrip - 1);
  const brushY = centerY - charSize / 2 + (brushStripIndex + 0.5) * (charSize / TOTAL_STRIPS);
  const brushProgress = (() => {
    const stripStart = staggerDelay(brushStripIndex, 0, STRIP_STAGGER);
    return interpolate(frame, [stripStart, stripStart + STRIP_REVEAL_FRAMES], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  })();
  const brushX = centerX - charSize / 2 + brushProgress * charSize;
  const brushOpacity = allDone ? 0 : interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });

  // Ink splash progress on completion
  const splashProgress = allDone
    ? interpolate(
        frame,
        [TOTAL_STRIPS * STRIP_STAGGER, TOTAL_STRIPS * STRIP_STAGGER + 30],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;

  // Stroke order numbers
  const strokeNumbers = Array.from({ length: TOTAL_STRIPS }).map((_, i) => {
    const stripStart = staggerDelay(i, 0, STRIP_STAGGER);
    const done = frame >= stripStart + STRIP_REVEAL_FRAMES;
    const appearProgress = interpolate(
      frame,
      [stripStart + STRIP_REVEAL_FRAMES - 5, stripStart + STRIP_REVEAL_FRAMES + 10],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    return { index: i, done, appearProgress };
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

      {/* SVG Tian grid */}
      {showGrid && (
        <TianGrid
          x={centerX - gridSize / 2}
          y={centerY - gridSize / 2}
          size={gridSize}
          color={strokeColor}
          opacity={interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" })}
        />
      )}

      {/* Decorative Chinese-pattern SVG border around main area */}
      <svg
        style={{
          position: "absolute",
          left: centerX - gridSize / 2 - 12,
          top: centerY - gridSize / 2 - 12,
          zIndex: 1,
        }}
        width={gridSize + 24}
        height={gridSize + 24}
        viewBox={`0 0 ${gridSize + 24} ${gridSize + 24}`}
        fill="none"
      >
        <defs>
          <pattern id="chinese-border" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M0 8 L8 0 L16 8 L8 16 Z" fill="none" stroke={strokeColor} strokeWidth={0.5} opacity={0.12} />
          </pattern>
        </defs>
        <rect
          x="4"
          y="4"
          width={gridSize + 16}
          height={gridSize + 16}
          rx="12"
          stroke={strokeColor}
          strokeWidth={1}
          opacity={0.15}
          fill="url(#chinese-border)"
        />
      </svg>

      {/* Main character with strip-by-strip reveal */}
      <div
        style={{
          position: "absolute",
          left: centerX - charSize / 2,
          top: centerY - charSize / 2,
          width: charSize,
          height: charSize,
          zIndex: 2,
          overflow: "hidden",
          transform: allDone ? `scale(${completionScale})` : undefined,
        }}
      >
        {/* Full character underneath */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: charSize,
            height: charSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT_FAMILY,
            fontSize: charSize,
            fontWeight: 900,
            lineHeight: 1,
            color: strokeColor,
            clipPath: `inset(0 0 0 0)`,
          }}
        >
          {character}
        </div>

        {/* SVG clip-based overlay strips */}
        <svg
          style={{ position: "absolute", left: 0, top: 0, zIndex: 3 }}
          width={charSize}
          height={charSize}
          viewBox={`0 0 ${charSize} ${charSize}`}
        >
          {Array.from({ length: TOTAL_STRIPS }).map((_, i) => {
            const stripStart = staggerDelay(i, 0, STRIP_STAGGER);
            const revealProgress = interpolate(
              frame,
              [stripStart, stripStart + STRIP_REVEAL_FRAMES],
              [1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            const stripHeight = charSize / TOTAL_STRIPS;
            const stripY = i * stripHeight;

            return (
              <rect
                key={i}
                x={0}
                y={stripY}
                width={charSize}
                height={stripHeight + 1}
                fill={data.bgColor}
                opacity={revealProgress}
              />
            );
          })}
        </svg>
      </div>

      {/* Ink brush following reveal */}
      <InkBrush
        x={brushX - 16}
        y={brushY - 24}
        opacity={brushOpacity}
        rotation={-30}
      />

      {/* Stroke order numbers along the right side */}
      {strokeNumbers.map(({ index, done, appearProgress }) => {
        const numY = centerY - charSize / 2 + (index + 0.5) * (charSize / TOTAL_STRIPS);
        return (
          <svg
            key={`num-${index}`}
            style={{
              position: "absolute",
              left: centerX + gridSize / 2 + 12,
              top: numY - 12,
              opacity: appearProgress,
              zIndex: 2,
            }}
            width={24}
            height={24}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="11" fill={done ? strokeColor : "transparent"} stroke={strokeColor} strokeWidth={1.5} />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fontFamily={FONT_FAMILY}
              fontSize={13}
              fontWeight={700}
              fill={done ? PALETTE.white : strokeColor}
            >
              {index + 1}
            </text>
          </svg>
        );
      })}

      {/* Reference character with SVG border */}
      <svg
        style={{
          position: "absolute",
          left: centerX + gridSize / 2 + 24,
          top: centerY - gridSize / 2,
          opacity: refSpring,
          transform: `scale(${refSpring})`,
          transformOrigin: "center center",
          zIndex: 2,
        }}
        width={56}
        height={56}
        viewBox="0 0 56 56"
      >
        <defs>
          <filter id="ref-shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor={strokeColor} floodOpacity={0.15} />
          </filter>
        </defs>
        <rect x="1" y="1" width={54} height={54} rx="6" fill="white" stroke={strokeColor} strokeWidth={1} strokeDasharray="3 3" filter="url(#ref-shadow)" />
        <text
          x="28"
          y="40"
          textAnchor="middle"
          fontFamily={FONT_FAMILY}
          fontSize={36}
          fontWeight={700}
          fill={strokeColor}
        >
          {character}
        </text>
      </svg>

      {/* Stroke count label */}
      <div
        style={{
          position: "absolute",
          top: centerY + gridSize / 2 + 16,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: strokeColor,
          opacity: strokeLabelOpacity,
          zIndex: 2,
        }}
      >
        {allDone ? "完成！" : `第${currentStrip}笔`}
      </div>

      {/* Ink splash celebration on completion */}
      {allDone && splashProgress > 0 && (
        <InkSplash
          cx={centerX}
          cy={centerY}
          progress={splashProgress}
          color={strokeColor}
        />
      )}

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.08,
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
