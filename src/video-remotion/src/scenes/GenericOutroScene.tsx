import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { SPRING_CONFIGS } from "../theme/animations";
import { PALETTE } from "../theme/colors";
import { FONT_FAMILY } from "../theme/fonts";
import { GENERIC_OUTRO_DURATION } from "../data/topic-video";
import type { TeachingSlide } from "../data/topic-video";

type GenericOutroProps = {
  slides: TeachingSlide[];
  bgColor: string;
};

/* ---------- SVG Sub-components ---------- */

const ConfettiSVG: React.FC<{
  width: number;
  height: number;
  frame: number;
  fps: number;
}> = ({ width, height, frame, fps }) => {
  const count = 30;
  const colors = PALETTE.rainbow;

  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const startX = (i / count) * width + Math.sin(i * 3.7) * 40;
        const speed = 1.2 + (i % 5) * 0.4;
        const fallY = ((frame * speed + i * 25) % (height + 60)) - 30;
        const drift = Math.sin(frame / fps * 1.5 + i * 2.1) * 20;
        const rot = frame * 3 + i * 36;
        const color = colors[i % colors.length];
        const isRect = i % 3 !== 0;
        const size = 4 + (i % 4) * 2;
        const opacity = fallY > height - 40 ? interpolate(fallY, [height - 40, height], [0.8, 0], { extrapolateRight: "clamp" }) : 0.8;

        return (
          <g key={i} transform={`translate(${startX + drift}, ${fallY}) rotate(${rot})`} opacity={opacity}>
            {isRect ? (
              <rect x={-size / 2} y={-size / 4} width={size} height={size / 2} rx={1} fill={color} />
            ) : (
              <circle cx={0} cy={0} r={size / 2} fill={color} />
            )}
          </g>
        );
      })}
    </g>
  );
};

const StarBurstSVG: React.FC<{
  cx: number;
  cy: number;
  progress: number;
}> = ({ cx, cy, progress }) => {
  const rayCount = 12;
  const maxLen = 120;
  const currentLen = maxLen * progress;

  return (
    <g opacity={progress * 0.4}>
      {/* Center glow */}
      <circle cx={cx} cy={cy} r={20 * progress} fill={PALETTE.rainbow[0]} opacity={0.3} />
      {/* Rays */}
      {Array.from({ length: rayCount }).map((_, i) => {
        const angle = (i / rayCount) * Math.PI * 2;
        const x2 = cx + Math.cos(angle) * currentLen;
        const y2 = cy + Math.sin(angle) * currentLen;
        const color = PALETTE.rainbow[i % PALETTE.rainbow.length];
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={3 - progress * 1.5}
            strokeLinecap="round"
            opacity={1 - progress * 0.5}
          />
        );
      })}
      {/* Sparkle dots at ray tips */}
      {Array.from({ length: rayCount }).map((_, i) => {
        const angle = (i / rayCount) * Math.PI * 2;
        const x = cx + Math.cos(angle) * currentLen;
        const y = cy + Math.sin(angle) * currentLen;
        return (
          <circle key={`tip-${i}`} cx={x} cy={y} r={3 * (1 - progress * 0.5)} fill={PALETTE.rainbow[i % PALETTE.rainbow.length]} opacity={1 - progress * 0.3} />
        );
      })}
    </g>
  );
};

const TrophyBadgeSVG: React.FC<{
  x: number;
  y: number;
  scale: number;
  opacity: number;
  frame: number;
  fps: number;
}> = ({ x, y, scale, opacity, frame, fps }) => {
  const pulse = 1 + Math.sin(frame / fps * 2) * 0.03;

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale * pulse})`} opacity={opacity}>
      {/* Trophy cup */}
      <path
        d="M-18,-20 L18,-20 L14,10 C12,18 6,22 0,24 C-6,22 -12,18 -14,10 Z"
        fill="#FFD700"
        stroke="#DAA520"
        strokeWidth={2}
      />
      {/* Left handle */}
      <path d="M-18,-16 C-28,-14 -30,0 -20,4 L-14,0" fill="none" stroke="#FFD700" strokeWidth={4} strokeLinecap="round" />
      {/* Right handle */}
      <path d="M18,-16 C28,-14 30,0 20,4 L14,0" fill="none" stroke="#FFD700" strokeWidth={4} strokeLinecap="round" />
      {/* Base */}
      <rect x={-12} y={24} width={24} height={6} rx={2} fill="#DAA520" />
      <rect x={-16} y={30} width={32} height={5} rx={2} fill="#DAA520" />
      {/* Star on trophy */}
      <path
        d={fiveStarPath(0, 2, 8, 4)}
        fill="#FF8C00"
      />
      {/* Shine */}
      <path d="M-10,-16 C-6,-14 -2,-16 0,-14" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
};

const SlideIconSVG: React.FC<{
  slide: TeachingSlide;
  index: number;
  scale: number;
}> = ({ slide, index, scale }) => {
  const colors = PALETTE.rainbow;
  const color = slide.accentColor || colors[index % colors.length];

  return (
    <g transform={`scale(${scale})`}>
      <rect
        x={-32}
        y={-32}
        width={64}
        height={64}
        rx={14}
        fill={`${color}22`}
        stroke={color}
        strokeWidth={2}
      />
      {/* Star icon as default slide marker */}
      <path
        d={fiveStarPath(0, -6, 12, 5)}
        fill={color}
        opacity={0.8}
      />
      {/* Title text */}
      <text
        x={0}
        y={22}
        textAnchor="middle"
        fontFamily={FONT_FAMILY}
        fontSize={14}
        fontWeight={800}
        fill={color}
      >
        {slide.title.length > 3 ? slide.title.slice(0, 3) : slide.title}
      </text>
    </g>
  );
};

/* ---------- Helpers ---------- */

function fiveStarPath(cx: number, cy: number, outerR: number, innerR: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += i === 0 ? `M${x},${y} ` : `L${x},${y} `;
  }
  return d + "Z";
}

/* ---------- Main Scene ---------- */

export const GenericOutroScene: React.FC<GenericOutroProps> = ({ slides, bgColor }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 0.3, 1], [0, 0.5, 1], { extrapolateRight: "clamp" });

  const gridEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 20 });
  const gridOpacity = interpolate(gridEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // Star burst animation
  const burstEntrance = spring({ frame, fps, config: SPRING_CONFIGS.gentle, delay: 10 });
  const burstProgress = interpolate(burstEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // Trophy entrance
  const trophyEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 8 });
  const trophyScale = interpolate(trophyEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const trophyOpacity = interpolate(trophyEntrance, [0, 0.3, 1], [0, 0.5, 1], { extrapolateRight: "clamp" });

  const fadeOut = interpolate(
    frame,
    [GENERIC_OUTRO_DURATION - 20, GENERIC_OUTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Layout: slides in a row
  const slideSpacing = 80;
  const totalSlideWidth = slides.length * slideSpacing;
  const slideStartX = width / 2 - totalSlideWidth / 2 + slideSpacing / 2;
  const slideY = height / 2 + 70;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}>
        <defs>
          <linearGradient id="outro-bg-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bgColor} />
            <stop offset="100%" stopColor={darkenHex(bgColor, 30)} />
          </linearGradient>
          <filter id="text-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation={5} floodColor="rgba(0,0,0,0.2)" />
          </filter>
          <filter id="trophy-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={4} />
          </filter>
        </defs>

        {/* Background gradient overlay */}
        <rect x={0} y={0} width={width} height={height} fill="url(#outro-bg-grad)" opacity={0.2} />

        {/* Animated confetti */}
        <ConfettiSVG width={width} height={height} frame={frame} fps={fps} />

        {/* Star burst from center */}
        <StarBurstSVG cx={width / 2} cy={height / 2 - 40} progress={burstProgress} />

        {/* Trophy / badge */}
        <g filter="url(#trophy-glow)" opacity={0.3}>
          <circle cx={width / 2} cy={height / 2 - 80} r={30} fill="#FFD700" />
        </g>
        <TrophyBadgeSVG
          x={width / 2}
          y={height / 2 - 80}
          scale={trophyScale}
          opacity={trophyOpacity}
          frame={frame}
          fps={fps}
        />

        {/* Title */}
        <text
          x={width / 2}
          y={height / 2 - 5}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT_FAMILY}
          fontSize={48}
          fontWeight={900}
          fill={PALETTE.white}
          filter="url(#text-glow)"
          transform={`scale(${titleScale})`}
          opacity={titleOpacity}
          style={{ transformOrigin: `${width / 2}px ${height / 2 - 5}px` }}
        >
          太棒了！你学会了！
        </text>

        {/* Slide icons row */}
        <g opacity={gridOpacity}>
          {slides.map((slide, i) => {
            const itemEntrance = spring({
              frame,
              fps,
              config: SPRING_CONFIGS.bouncy,
              delay: 25 + i * 4,
            });
            const itemScale = interpolate(itemEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

            return (
              <g key={i} transform={`translate(${slideStartX + i * slideSpacing}, ${slideY})`}>
                <SlideIconSVG slide={slide} index={i} scale={itemScale} />
              </g>
            );
          })}
        </g>

        {/* Decorative floating particles */}
        {Array.from({ length: 8 }).map((_, i) => {
          const px = width * 0.1 + i * width * 0.11;
          const py = height * 0.1 + Math.sin(frame / fps * 0.8 + i * 1.3) * 15 + i * height * 0.1;
          const pr = 2 + (i % 3) * 1.5;
          const pOpacity = 0.15 + Math.sin(frame / fps * 1.5 + i * 2) * 0.1;
          return (
            <circle key={`p-${i}`} cx={px} cy={py} r={pr} fill={PALETTE.rainbow[i % PALETTE.rainbow.length]} opacity={pOpacity} />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
