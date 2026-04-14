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
import { hopArc } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

/* ---- SVG Number Line Background ---- */
const SvgNumberLineBg: React.FC<{ lineStartX: number; lineY: number; lineLen: number; reveal: number }> = ({
  lineStartX, lineY, lineLen, reveal,
}) => (
  <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
    <defs>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#667EEA" stopOpacity="0.3" />
        <stop offset="50%" stopColor="#764BA2" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#F093FB" stopOpacity="0.3" />
      </linearGradient>
      <filter id="lineGlow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Glow background line */}
    <rect
      x={lineStartX - 4}
      y={lineY - 6}
      width={reveal + 8}
      height={12}
      rx={6}
      fill="url(#lineGrad)"
    />
    {/* Main line */}
    <rect
      x={lineStartX}
      y={lineY - 2}
      width={reveal}
      height={4}
      rx={2}
      fill={PALETTE.dark}
      opacity={0.5}
    />
    {/* Arrow at end */}
    {reveal >= lineLen - 5 && (
      <polygon
        points={`${lineStartX + lineLen},${lineY} ${lineStartX + lineLen - 12},${lineY - 8} ${lineStartX + lineLen - 12},${lineY + 8}`}
        fill={PALETTE.dark}
        opacity={0.5}
      />
    )}
    {/* Start arrow */}
    {reveal > 10 && (
      <polygon
        points={`${lineStartX},${lineY} ${lineStartX + 12},${lineY - 8} ${lineStartX + 12},${lineY + 8}`}
        fill={PALETTE.dark}
        opacity={0.4}
      />
    )}
  </svg>
);

/* ---- SVG Tick Mark ---- */
const SvgTick: React.FC<{
  x: number;
  lineY: number;
  isHighlighted: boolean;
  color: string;
  opacity: number;
}> = ({ x, lineY, isHighlighted, color, opacity }) => (
  <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}>
    <rect
      x={x - 1.5}
      y={lineY - 10}
      width={3}
      height={24}
      rx={1}
      fill={isHighlighted ? color : PALETTE.dark}
      opacity={opacity * (isHighlighted ? 1 : 0.4)}
    />
  </svg>
);

/* ---- SVG Glowing Highlight Circle ---- */
const SvgGlowCircle: React.FC<{
  x: number;
  lineY: number;
  color: string;
  opacity: number;
  scale: number;
}> = ({ x, lineY, color, opacity, scale }) => (
  <div style={{
    position: "absolute",
    left: x - 24,
    top: lineY - 24,
    width: 48,
    height: 48,
    opacity,
    transform: `scale(${scale})`,
  }}>
    <svg width="48" height="48" viewBox="0 0 48 48">
      <defs>
        <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="70%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#glowGrad)" />
      <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="3" opacity="0.7" />
    </svg>
  </div>
);

/* ---- SVG Hopping Frog Character ---- */
const SvgHoppingFrog: React.FC<{
  x: number;
  y: number;
  size: number;
}> = ({ x, y, size }) => (
  <div style={{
    position: "absolute",
    left: x - size / 2,
    top: y - size / 2,
    zIndex: 3,
  }}>
    <svg width={size} height={size} viewBox="0 0 80 80">
      <defs>
        <radialGradient id="frogGrad" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#81C784" />
          <stop offset="100%" stopColor="#4CAF50" />
        </radialGradient>
        <filter id="frogShadow">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.2" />
        </filter>
      </defs>
      {/* Body */}
      <ellipse cx="40" cy="48" rx="28" ry="24" fill="url(#frogGrad)" filter="url(#frogShadow)" />
      {/* Head */}
      <circle cx="40" cy="30" r="20" fill="url(#frogGrad)" />
      {/* Eyes (bulging) */}
      <circle cx="30" cy="22" r="10" fill="#E8F5E9" />
      <circle cx="50" cy="22" r="10" fill="#E8F5E9" />
      <circle cx="31" cy="21" r="5" fill="#333" />
      <circle cx="51" cy="21" r="5" fill="#333" />
      <circle cx="32.5" cy="19.5" r="2" fill="#fff" />
      <circle cx="52.5" cy="19.5" r="2" fill="#fff" />
      {/* Smile */}
      <path d="M30 36 Q40 44 50 36" stroke="#2E7D32" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Cheeks */}
      <circle cx="24" cy="34" r="5" fill="#F48FB1" opacity="0.4" />
      <circle cx="56" cy="34" r="5" fill="#F48FB1" opacity="0.4" />
      {/* Legs */}
      <ellipse cx="24" cy="65" rx="8" ry="5" fill="#4CAF50" />
      <ellipse cx="56" cy="65" rx="8" ry="5" fill="#4CAF50" />
    </svg>
  </div>
);

/* ---- SVG Trail Dots ---- */
const SvgTrailDots: React.FC<{
  positions: Array<{ x: number; y: number }>;
  opacity: number;
}> = ({ positions, opacity }) => (
  <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}>
    {positions.map((pos, i) => (
      <circle
        key={i}
        cx={pos.x}
        cy={pos.y}
        r={4}
        fill={PALETTE.rainbow[i % PALETTE.rainbow.length]}
        opacity={opacity * (0.3 + 0.5 * (i / positions.length))}
      />
    ))}
  </svg>
);

export const NumberLineScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const startNum = Number(params.startNum) || 0;
  const endNum = Math.max(startNum + 3, Number(params.endNum) || 10);
  const highlightNum = params.highlightNum != null ? Number(params.highlightNum) : Math.floor((startNum + endNum) / 2);

  const totalNumbers = endNum - startNum + 1;
  const lineY = height * 0.55;
  const lineStartX = 120;
  const lineEndX = width - 120;
  const lineLen = lineEndX - lineStartX;
  const stepWidth = lineLen / (totalNumbers - 1);

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Line entrance
  const lineEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const lineReveal = interpolate(lineEntrance, [0, 1], [0, lineLen], { extrapolateRight: "clamp" });

  // Number labels appear
  const labelDelay = 15;
  const perLabelDelay = 3;

  // Hop animation
  const hopStartFrame = 30 + totalNumbers * perLabelDelay;
  const hopSequence: number[] = [];
  for (let n = startNum; n <= endNum; n++) hopSequence.push(n);

  const hopsPerSecond = 1.5;
  const framesPerHop = fps / hopsPerSecond;

  // Highlight pulse
  const highlightPulse = interpolate(
    Math.sin(frame / fps * 2 * Math.PI * 2),
    [-1, 1],
    [0.9, 1.1],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div style={{
        position: "absolute",
        top: 40,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {data.title || "\u6570\u5b57\u7ebf"}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {/* SVG number line with gradient background */}
        <SvgNumberLineBg lineStartX={lineStartX} lineY={lineY} lineLen={lineLen} reveal={lineReveal} />

        {/* Tick marks and labels */}
        {hopSequence.map((num, i) => {
          const x = lineStartX + i * stepWidth;
          const tickDelay = labelDelay + i * perLabelDelay;
          const tickSpring = spring({ frame: Math.max(0, frame - tickDelay), fps, config: SPRING_CONFIGS.snappy });
          const tickOpacity = interpolate(tickSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });

          const isHighlighted = num === highlightNum;

          return (
            <React.Fragment key={num}>
              {/* SVG Tick */}
              <SvgTick x={x} lineY={lineY} isHighlighted={isHighlighted} color={data.accentColor} opacity={tickOpacity} />

              {/* Number label */}
              <div style={{
                position: "absolute",
                left: x,
                top: lineY + 28,
                transform: "translateX(-50%)",
                fontFamily: FONT_FAMILY,
                fontSize: isHighlighted ? 32 : 24,
                fontWeight: isHighlighted ? 900 : 700,
                color: isHighlighted ? data.accentColor : PALETTE.dark,
                opacity: tickOpacity,
                zIndex: 2,
              }}>
                {num}
              </div>

              {/* SVG Highlight glow circle */}
              {isHighlighted && (
                <SvgGlowCircle
                  x={x}
                  lineY={lineY}
                  color={data.accentColor}
                  opacity={tickOpacity * 0.8}
                  scale={highlightPulse}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Trail dots + Hopping frog */}
        {(() => {
          if (frame < hopStartFrame) return null;

          const hopFrame = frame - hopStartFrame;
          const currentHopIndex = Math.min(
            Math.floor(hopFrame / framesPerHop),
            hopSequence.length - 1,
          );
          const hopProgress = Math.min(
            (hopFrame - currentHopIndex * framesPerHop) / framesPerHop,
            1,
          );

          const fromX = lineStartX + currentHopIndex * stepWidth;
          const toX = lineStartX + Math.min(currentHopIndex + 1, hopSequence.length - 1) * stepWidth;
          const ballX = fromX + (toX - fromX) * hopProgress;
          const arcHeight = 50;
          const ballY = lineY - 30 + hopArc(hopProgress, arcHeight);

          // Trail dots for past hops
          const trailPositions = Array.from({ length: currentHopIndex + 1 }).map((_, ti) => ({
            x: lineStartX + ti * stepWidth,
            y: lineY - 2,
          }));

          return (
            <>
              <SvgTrailDots positions={trailPositions} opacity={0.7} />
              <SvgHoppingFrog x={ballX} y={ballY} size={60} />
            </>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};
