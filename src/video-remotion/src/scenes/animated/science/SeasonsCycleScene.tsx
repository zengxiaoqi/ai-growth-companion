import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BackgroundBubbles } from "../../../components/BackgroundBubbles";
import { PALETTE } from "../../../theme/colors";
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type SeasonConfig = {
  label: string;
  crownColor: string;
  groundColor: string;
  skyTop: string;
  skyBottom: string;
  leafColors: string[];
  groundDetail: "snow" | "flowers" | "grass" | "leaves";
};

const SEASONS: SeasonConfig[] = [
  { label: "春", crownColor: "#FFB7C5", groundColor: "#90EE90", skyTop: "#87CEEB", skyBottom: "#E0F0FF", leafColors: ["#FFB7C5", "#FF69B4", "#FFD1DC"], groundDetail: "flowers" },
  { label: "夏", crownColor: "#228B22", groundColor: "#3CB371", skyTop: "#4DA6FF", skyBottom: "#87CEEB", leafColors: ["#228B22", "#32CD32", "#2E8B57"], groundDetail: "grass" },
  { label: "秋", crownColor: "#FF8C00", groundColor: "#DAA520", skyTop: "#FFB347", skyBottom: "#FFD89B", leafColors: ["#FF8C00", "#FF4500", "#DAA520"], groundDetail: "leaves" },
  { label: "冬", crownColor: "#B0C4DE", groundColor: "#F0F0F0", skyTop: "#B0C4DE", skyBottom: "#E8E8E8", leafColors: ["#B0C4DE", "#C0C0C0"], groundDetail: "snow" },
];

/* ---------- SVG Sub-components ---------- */

const SeasonalTreeSVG: React.FC<{
  season: SeasonConfig;
  opacity: number;
  cx: number;
  groundY: number;
  frame: number;
  fps: number;
}> = ({ season, opacity, cx, groundY, frame, fps }) => {
  const trunkW = 30;
  const trunkH = 120;
  const crownR = 80;
  const isWinter = season.groundDetail === "snow";

  // Gentle swaying
  const sway = Math.sin(frame / fps * 0.8) * 2;

  return (
    <g opacity={opacity} transform={`translate(${sway}, 0)`}>
      {/* Trunk */}
      <rect
        x={cx - trunkW / 2}
        y={groundY - trunkH}
        width={trunkW}
        height={trunkH}
        rx={4}
        fill="#8B6914"
      />
      {/* Branches for winter / buds for spring */}
      {isWinter && (
        <>
          <line x1={cx} y1={groundY - trunkH + 20} x2={cx - 45} y2={groundY - trunkH - 30} stroke="#8B6914" strokeWidth={6} strokeLinecap="round" />
          <line x1={cx} y1={groundY - trunkH + 35} x2={cx + 40} y2={groundY - trunkH - 20} stroke="#8B6914" strokeWidth={5} strokeLinecap="round" />
          <line x1={cx - 20} y1={groundY - trunkH + 10} x2={cx - 30} y2={groundY - trunkH - 15} stroke="#8B6914" strokeWidth={4} strokeLinecap="round" />
        </>
      )}

      {/* Crown blob clusters */}
      {!isWinter && (
        <>
          <circle cx={cx} cy={groundY - trunkH - crownR * 0.5} r={crownR * 0.65} fill={season.crownColor} opacity={0.9} />
          <circle cx={cx - crownR * 0.45} cy={groundY - trunkH - crownR * 0.25} r={crownR * 0.5} fill={season.crownColor} opacity={0.85} />
          <circle cx={cx + crownR * 0.45} cy={groundY - trunkH - crownR * 0.25} r={crownR * 0.5} fill={season.crownColor} opacity={0.85} />
          <circle cx={cx - crownR * 0.2} cy={groundY - trunkH - crownR * 0.9} r={crownR * 0.4} fill={season.crownColor} opacity={0.8} />
          <circle cx={cx + crownR * 0.25} cy={groundY - trunkH - crownR * 0.85} r={crownR * 0.38} fill={season.crownColor} opacity={0.8} />
        </>
      )}

      {/* Spring buds on branches */}
      {season.groundDetail === "flowers" && (
        <>
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            const bx = cx + Math.cos(angle) * crownR * 0.6;
            const by = groundY - trunkH - crownR * 0.5 + Math.sin(angle) * crownR * 0.4;
            const pulseR = 4 + Math.sin(frame / fps * 2 + i) * 1.5;
            return (
              <circle key={i} cx={bx} cy={by} r={pulseR} fill="#FF69B4" opacity={0.7} />
            );
          })}
        </>
      )}

      {/* Summer fruit/apples */}
      {season.groundDetail === "grass" && (
        <>
          {Array.from({ length: 4 }).map((_, i) => {
            const angle = (i / 4) * Math.PI * 2 + 0.5;
            const bx = cx + Math.cos(angle) * crownR * 0.5;
            const by = groundY - trunkH - crownR * 0.4 + Math.sin(angle) * crownR * 0.3;
            return (
              <circle key={i} cx={bx} cy={by} r={5} fill="#FF4444" />
            );
          })}
        </>
      )}
    </g>
  );
};

const FallingElementsSVG: React.FC<{
  season: SeasonConfig;
  cx: number;
  groundY: number;
  frame: number;
  fps: number;
  width: number;
}> = ({ season, cx, groundY, frame, fps, width }) => {
  const count = 8;

  if (season.groundDetail === "snow") {
    return (
      <g>
        {Array.from({ length: count }).map((_, i) => {
          const sx = width * 0.15 + (i / count) * width * 0.7;
          const sy = ((frame * 1.5 + i * 60) % (groundY + 40));
          const drift = Math.sin(frame / fps * 1.2 + i * 2) * 20;
          const size = 3 + (i % 3) * 2;
          const opacity = sy > groundY - 10 ? interpolate(sy, [groundY - 10, groundY], [0.8, 0], { extrapolateRight: "clamp" }) : 0.8;
          return (
            <g key={i} transform={`translate(${sx + drift}, ${sy})`} opacity={opacity}>
              <circle cx={0} cy={0} r={size} fill="white" />
              <circle cx={-size * 0.5} cy={0} r={size * 0.8} fill="white" />
              <circle cx={size * 0.5} cy={0} r={size * 0.8} fill="white" />
              <circle cx={0} cy={-size * 0.5} r={size * 0.8} fill="white" />
              <circle cx={0} cy={size * 0.5} r={size * 0.8} fill="white" />
            </g>
          );
        })}
      </g>
    );
  }

  if (season.groundDetail === "leaves") {
    return (
      <g>
        {Array.from({ length: count }).map((_, i) => {
          const lx = cx - 120 + i * 40;
          const ly = groundY - 180 + ((frame * 2 + i * 35) % 220);
          const drift = Math.sin(frame / fps * 2 + i) * 18;
          const rot = frame * 3 + i * 45;
          const color = season.leafColors[i % season.leafColors.length];
          const opacity = ly > groundY - 15 ? interpolate(ly, [groundY - 15, groundY], [0.9, 0], { extrapolateRight: "clamp" }) : 0.85;
          return (
            <g key={i} transform={`translate(${lx + drift}, ${ly}) rotate(${rot})`} opacity={opacity}>
              <path d={`M0,-6 C4,-3 5,2 0,6 C-5,2 -4,-3 0,-6`} fill={color} />
            </g>
          );
        })}
      </g>
    );
  }

  if (season.groundDetail === "flowers") {
    return (
      <g>
        {Array.from({ length: 5 }).map((_, i) => {
          const px = cx - 100 + i * 60;
          const py = groundY - 120 + Math.sin(frame / fps * 0.7 + i * 1.5) * 25;
          const drift = Math.sin(frame / fps + i * 2) * 12;
          const petalSize = 5 + Math.sin(frame / fps * 1.5 + i) * 1;
          return (
            <g key={i} transform={`translate(${px + drift}, ${py})`} opacity={0.8}>
              {[0, 60, 120, 180, 240, 300].map((angle, j) => (
                <ellipse
                  key={j}
                  cx={Math.cos((angle * Math.PI) / 180) * petalSize}
                  cy={Math.sin((angle * Math.PI) / 180) * petalSize}
                  rx={3}
                  ry={5}
                  fill={season.leafColors[j % season.leafColors.length]}
                  transform={`rotate(${angle})`}
                />
              ))}
              <circle cx={0} cy={0} r={3} fill="#FFD700" />
            </g>
          );
        })}
      </g>
    );
  }

  // Summer: butterflies
  if (season.groundDetail === "grass") {
    return (
      <g>
        {Array.from({ length: 3 }).map((_, i) => {
          const bx = cx - 80 + i * 80 + Math.sin(frame / fps * 0.6 + i * 3) * 30;
          const by = groundY - 160 + Math.sin(frame / fps * 0.9 + i * 2) * 40;
          const wingFlap = Math.sin(frame / fps * 8 + i) * 15;
          return (
            <g key={i} transform={`translate(${bx}, ${by})`} opacity={0.85}>
              <ellipse cx={-6} cy={0} rx={6} ry={4 + Math.abs(wingFlap) * 0.2} fill={PALETTE.rainbow[i % PALETTE.rainbow.length]} />
              <ellipse cx={6} cy={0} rx={6} ry={4 + Math.abs(wingFlap) * 0.2} fill={PALETTE.rainbow[(i + 1) % PALETTE.rainbow.length]} />
              <line x1={0} y1={-2} x2={0} y2={4} stroke="#333" strokeWidth={1.5} />
              <line x1={-2} y1={-4} x2={-4} y2={-7} stroke="#333" strokeWidth={1} strokeLinecap="round" />
              <line x1={2} y1={-4} x2={4} y2={-7} stroke="#333" strokeWidth={1} strokeLinecap="round" />
              <circle cx={-4} cy={-7} r={1} fill="#333" />
              <circle cx={4} cy={-7} r={1} fill="#333" />
            </g>
          );
        })}
      </g>
    );
  }

  return null;
};

const SeasonBadgeSVG: React.FC<{
  season: SeasonConfig;
  isActive: boolean;
  scale: number;
  x: number;
  y: number;
}> = ({ season, isActive, scale, x, y }) => {
  const r = 14;
  let badgeColor = season.crownColor;
  if (season.groundDetail === "snow") badgeColor = "#B0C4DE";

  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={isActive ? 1 : 0.35}>
      <circle cx={0} cy={0} r={r} fill={badgeColor} opacity={0.3} />
      <circle cx={0} cy={0} r={r - 3} fill={badgeColor} opacity={0.6} />
      {/* Season-specific icon */}
      {season.groundDetail === "flowers" && (
        <circle cx={0} cy={0} r={4} fill="#FFD700" />
      )}
      {season.groundDetail === "grass" && (
        <path d="M0,-5 L2,-1 L6,-1 L3,2 L4,6 L0,3.5 L-4,6 L-3,2 L-6,-1 L-2,-1 Z" fill="#FFD700" />
      )}
      {season.groundDetail === "leaves" && (
        <path d="M0,-5 C3,-2 4,2 0,5 C-4,2 -3,-2 0,-5" fill="#FF8C00" />
      )}
      {season.groundDetail === "snow" && (
        <>
          <line x1={0} y1={-5} x2={0} y2={5} stroke="white" strokeWidth={1.5} />
          <line x1={-5} y1={0} x2={5} y2={0} stroke="white" strokeWidth={1.5} />
          <line x1={-3.5} y1={-3.5} x2={3.5} y2={3.5} stroke="white" strokeWidth={1.5} />
          <line x1={3.5} y1={-3.5} x2={-3.5} y2={3.5} stroke="white" strokeWidth={1.5} />
        </>
      )}
    </g>
  );
};

/* ---------- Main Scene ---------- */

export const SeasonsCycleScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const seasonNames: string[] = Array.isArray(params.seasonNames) && params.seasonNames.length > 0
    ? params.seasonNames.map(String)
    : SEASONS.map(s => s.label);
  const focusSeason = params.focusSeason != null ? Number(params.focusSeason) : -1;
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Determine current season
  const numSeasons = seasonNames.length;
  const isFocus = focusSeason >= 0 && focusSeason < numSeasons;
  const framesPerSeason = isFocus ? 999 : 90;
  const transitionFrames = 15;

  const currentSeasonFloat = isFocus
    ? focusSeason
    : Math.min(numSeasons - 1, frame / (framesPerSeason + transitionFrames));
  const currentIdx = Math.floor(currentSeasonFloat) % numSeasons;
  const nextIdx = (currentIdx + 1) % numSeasons;
  const crossfade = currentSeasonFloat - Math.floor(currentSeasonFloat);

  const season = SEASONS[currentIdx % SEASONS.length];
  const nextSeason = SEASONS[nextIdx % SEASONS.length];

  const treeX = width / 2;
  const groundY = height * 0.72;

  const fadeMain = crossfade < 0.5 ? 1 : interpolate(crossfade, [0.5, 1], [1, 0], { extrapolateRight: "clamp" });
  const fadeNext = crossfade > 0.5 ? interpolate(crossfade, [0.5, 1], [0, 1], { extrapolateRight: "clamp" }) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}>
        <defs>
          {/* Sky gradients for each season */}
          {SEASONS.map((s, i) => (
            <linearGradient key={i} id={`sky-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.skyTop} />
              <stop offset="100%" stopColor={s.skyBottom} />
            </linearGradient>
          ))}
          {/* Ground gradients */}
          {SEASONS.map((s, i) => (
            <linearGradient key={i} id={`ground-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.groundColor} />
              <stop offset="100%" stopColor={darkenColor(s.groundColor, 30)} />
            </linearGradient>
          ))}
          {/* Glow filter */}
          <filter id="sun-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={8} />
          </filter>
        </defs>

        {/* Sky */}
        <rect x={0} y={0} width={width} height={groundY} fill={`url(#sky-${currentIdx % SEASONS.length})`} opacity={fadeMain} />
        {crossfade > 0.5 && (
          <rect x={0} y={0} width={width} height={groundY} fill={`url(#sky-${nextIdx % SEASONS.length})`} opacity={fadeNext} />
        )}

        {/* Sun for spring/summer/dawn, cloud for winter */}
        {(currentIdx % 4 !== 3) && (
          <g opacity={interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }) * fadeMain}>
            <circle cx={width - 100} cy={70} r={30} fill="#FFD700" filter="url(#sun-glow)" opacity={0.4} />
            <circle cx={width - 100} cy={70} r={22} fill="#FFD700" />
            {/* Sun rays */}
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2 + frame / fps * 0.3;
              const x1 = width - 100 + Math.cos(angle) * 26;
              const y1 = 70 + Math.sin(angle) * 26;
              const x2 = width - 100 + Math.cos(angle) * 36;
              const y2 = 70 + Math.sin(angle) * 36;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFD700" strokeWidth={3} strokeLinecap="round" />;
            })}
          </g>
        )}
        {(currentIdx % 4 === 3) && (
          <g opacity={interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }) * fadeMain}>
            {/* Cloud */}
            <g transform={`translate(${width - 130 + Math.sin(frame / fps * 0.3) * 8}, 60)`}>
              <ellipse cx={0} cy={0} rx={30} ry={18} fill="white" opacity={0.8} />
              <ellipse cx={-22} cy={5} rx={20} ry={14} fill="white" opacity={0.7} />
              <ellipse cx={22} cy={5} rx={22} ry={15} fill="white" opacity={0.7} />
            </g>
          </g>
        )}

        {/* Ground */}
        <rect x={0} y={groundY} width={width} height={height - groundY} fill={`url(#ground-${currentIdx % SEASONS.length})`} opacity={fadeMain} />
        {crossfade > 0.5 && (
          <rect x={0} y={groundY} width={width} height={height - groundY} fill={`url(#ground-${nextIdx % SEASONS.length})`} opacity={fadeNext} />
        )}

        {/* Ground detail decorations */}
        {season.groundDetail === "snow" && (
          <g opacity={fadeMain * 0.6}>
            {Array.from({ length: 12 }).map((_, i) => (
              <circle key={i} cx={width * 0.05 + i * width * 0.08} cy={groundY + 5 + (i % 3) * 4} r={3 + (i % 2) * 2} fill="white" opacity={0.7} />
            ))}
          </g>
        )}
        {season.groundDetail === "flowers" && (
          <g opacity={fadeMain * 0.6}>
            {Array.from({ length: 6 }).map((_, i) => {
              const fx = width * 0.1 + i * width * 0.14;
              const fy = groundY + 8;
              return (
                <g key={i} transform={`translate(${fx}, ${fy})`}>
                  <line x1={0} y1={0} x2={0} y2={12} stroke="#228B22" strokeWidth={2} />
                  <circle cx={0} cy={0} r={4} fill={season.leafColors[i % season.leafColors.length]} />
                  <circle cx={0} cy={0} r={2} fill="#FFD700" />
                </g>
              );
            })}
          </g>
        )}

        {/* Tree */}
        <SeasonalTreeSVG season={season} opacity={fadeMain} cx={treeX} groundY={groundY} frame={frame} fps={fps} />
        {crossfade > 0.5 && (
          <SeasonalTreeSVG season={nextSeason} opacity={fadeNext} cx={treeX} groundY={groundY} frame={frame} fps={fps} />
        )}

        {/* Falling elements (snowflakes, leaves, petals, butterflies) */}
        <FallingElementsSVG season={season} cx={treeX} groundY={groundY} frame={frame} fps={fps} width={width} />

        {/* Season labels with badges */}
        {showLabels && (
          <g opacity={1}>
            {seasonNames.map((name, i) => {
              const labelSpacing = 120;
              const totalW = seasonNames.length * labelSpacing;
              const startX = width / 2 - totalW / 2 + labelSpacing / 2;
              const lx = startX + i * labelSpacing;
              const ly = height - 50;
              const isActive = i === currentIdx;
              const s = isActive ? 1.2 : 1;
              return (
                <g key={i}>
                  <SeasonBadgeSVG season={SEASONS[i % SEASONS.length]} isActive={isActive} scale={s} x={lx} y={ly - 28} />
                  <text
                    x={lx}
                    y={ly + 10}
                    textAnchor="middle"
                    fontFamily={FONT_FAMILY}
                    fontSize={isActive ? 44 : 36}
                    fontWeight={900}
                    fill={isActive ? data.accentColor : PALETTE.dark}
                    opacity={isActive ? 1 : 0.35}
                  >
                    {name}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};

function darkenColor(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}
