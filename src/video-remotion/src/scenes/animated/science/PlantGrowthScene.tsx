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
import { FONT_FAMILY } from "../../../theme/fonts";
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

const STAGE_LABELS = ["种子", "发芽", "长叶", "开花"];

// SVG Sun with radiating triangle rays
const SunSVG: React.FC<{
  x: number;
  y: number;
  scale: number;
}> = ({ x, y, scale }) => (
  <svg
    style={{
      position: "absolute",
      left: x - 50,
      top: y - 50,
      transform: `scale(${scale})`,
      transformOrigin: "center center",
      zIndex: 2,
    }}
    width={100}
    height={100}
    viewBox="0 0 100 100"
  >
    <defs>
      <radialGradient id="sun-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFF9C4" />
        <stop offset="40%" stopColor="#FFD54F" />
        <stop offset="100%" stopColor="#FF8F00" />
      </radialGradient>
      <filter id="sun-glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#sun-glow)">
      {/* Triangle rays */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30) * Math.PI / 180;
        const innerR = 26;
        const outerR = 45;
        const halfWidth = 4;
        const ix1 = 50 + Math.cos(angle - halfWidth * Math.PI / 180) * innerR;
        const iy1 = 50 + Math.sin(angle - halfWidth * Math.PI / 180) * innerR;
        const ix2 = 50 + Math.cos(angle + halfWidth * Math.PI / 180) * innerR;
        const iy2 = 50 + Math.sin(angle + halfWidth * Math.PI / 180) * innerR;
        const ox = 50 + Math.cos(angle) * outerR;
        const oy = 50 + Math.sin(angle) * outerR;

        return (
          <polygon
            key={i}
            points={`${ix1},${iy1} ${ox},${oy} ${ix2},${iy2}`}
            fill="#FFB300"
            opacity={0.7}
          />
        );
      })}
      {/* Main circle */}
      <circle cx="50" cy="50" r="24" fill="url(#sun-grad)" />
      {/* Face highlight */}
      <circle cx="44" cy="44" r="8" fill="white" opacity={0.3} />
    </g>
  </svg>
);

// SVG raindrop (teardrop)
const RainDrop: React.FC<{
  x: number;
  y: number;
  opacity: number;
}> = ({ x, y, opacity }) => (
  <svg
    style={{ position: "absolute", left: x, top: y, opacity, zIndex: 1 }}
    width={10}
    height={14}
    viewBox="0 0 10 14"
  >
    <defs>
      <linearGradient id="rain-drop-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#81D4FA" stopOpacity={0.9} />
        <stop offset="100%" stopColor="#29B6F6" stopOpacity={0.6} />
      </linearGradient>
    </defs>
    <path
      d="M5 0 C5 0 0 7 0 10 C0 12.8 2.2 14 5 14 C7.8 14 10 12.8 10 10 C10 7 5 0 5 0Z"
      fill="url(#rain-drop-grad)"
    />
  </svg>
);

// SVG seed that can split open
const SeedSVG: React.FC<{
  x: number;
  y: number;
  splitProgress: number; // 0=closed, 1=fully open
  opacity: number;
}> = ({ x, y, splitProgress, opacity }) => {
  const leftRotation = interpolate(splitProgress, [0, 1], [0, -25]);
  const rightRotation = interpolate(splitProgress, [0, 1], [0, 25]);

  return (
    <svg
      style={{
        position: "absolute",
        left: x - 20,
        top: y - 14,
        opacity,
        zIndex: 3,
      }}
      width={40}
      height={28}
      viewBox="0 0 40 28"
    >
      <defs>
        <linearGradient id="seed-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A1887F" />
          <stop offset="100%" stopColor="#6D4C41" />
        </linearGradient>
      </defs>
      {/* Left half */}
      <g style={{ transformOrigin: "20px 14px", transform: `rotate(${leftRotation}deg)` }}>
        <path d="M20 2 C20 2 4 6 4 14 C4 22 12 26 20 26 Z" fill="url(#seed-grad)" />
        <path d="M20 6 C20 6 10 8 10 14 C10 18 14 22 20 22 Z" fill="#8D6E63" opacity={0.5} />
      </g>
      {/* Right half */}
      <g style={{ transformOrigin: "20px 14px", transform: `rotate(${rightRotation}deg)` }}>
        <path d="M20 2 C20 2 36 6 36 14 C36 22 28 26 20 26 Z" fill="url(#seed-grad)" />
        <path d="M20 6 C20 6 30 8 30 14 C30 18 26 22 20 22 Z" fill="#8D6E63" opacity={0.5} />
      </g>
      {/* Sprout peeking out when splitting */}
      {splitProgress > 0.3 && (
        <line
          x1="20"
          y1={14}
          x2="20"
          y2={14 - interpolate(splitProgress, [0.3, 1], [0, 12])}
          stroke="#66BB6A"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={interpolate(splitProgress, [0.3, 0.6], [0, 1], { extrapolateRight: "clamp" })}
        />
      )}
    </svg>
  );
};

// SVG leaf that unfurls
const LeafSVG: React.FC<{
  x: number;
  y: number;
  scale: number;
  mirror: boolean;
  swayAngle: number;
}> = ({ x, y, scale, mirror, swayAngle }) => (
  <svg
    style={{
      position: "absolute",
      left: x - 20,
      top: y - 12,
      transform: `scale(${scale})${mirror ? " scaleX(-1)" : ""} rotate(${swayAngle}deg)`,
      transformOrigin: "bottom center",
      zIndex: 3,
    }}
    width={40}
    height={30}
    viewBox="0 0 40 30"
  >
    <defs>
      <linearGradient id="leaf-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#81C784" />
        <stop offset="100%" stopColor="#4CAF50" />
      </linearGradient>
    </defs>
    {/* Leaf shape */}
    <path
      d="M20 28 Q0 20 8 8 Q14 0 20 4 Q26 0 32 8 Q40 20 20 28Z"
      fill="url(#leaf-grad)"
    />
    {/* Leaf vein */}
    <path d="M20 26 L20 8" stroke="#388E3C" strokeWidth={1} opacity={0.5} />
    <path d="M20 16 L12 12" stroke="#388E3C" strokeWidth={0.7} opacity={0.3} />
    <path d="M20 16 L28 12" stroke="#388E3C" strokeWidth={0.7} opacity={0.3} />
  </svg>
);

// SVG flower that blooms with multiple petal layers
const FlowerSVG: React.FC<{
  x: number;
  y: number;
  bloomProgress: number; // 0=bud, 1=full bloom
}> = ({ x, y, bloomProgress }) => {
  const petalCount = 8;
  const petalScale = interpolate(bloomProgress, [0, 1], [0.2, 1]);

  return (
    <svg
      style={{
        position: "absolute",
        left: x - 40,
        top: y - 40,
        zIndex: 4,
      }}
      width={80}
      height={80}
      viewBox="0 0 80 80"
    >
      <defs>
        <radialGradient id="petal-grad-1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F8BBD0" />
          <stop offset="100%" stopColor="#EC407A" />
        </radialGradient>
        <radialGradient id="petal-grad-2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FCE4EC" />
          <stop offset="100%" stopColor="#F48FB1" />
        </radialGradient>
        <radialGradient id="flower-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF9C4" />
          <stop offset="100%" stopColor="#FFD54F" />
        </radialGradient>
        <filter id="flower-glow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#EC407A" floodOpacity={0.3} />
        </filter>
      </defs>
      <g filter="url(#flower-glow)">
        {/* Outer petals */}
        {Array.from({ length: petalCount }).map((_, i) => {
          const angle = (i * 360 / petalCount) * Math.PI / 180;
          const rotation = i * (360 / petalCount);
          const distance = interpolate(petalScale, [0.2, 1], [5, 18]);

          return (
            <g
              key={i}
              style={{
                transformOrigin: "40px 40px",
                transform: `rotate(${rotation}deg) translateY(${-distance}px)`,
              }}
            >
              <ellipse
                cx={40}
                cy={40 - distance}
                rx={interpolate(petalScale, [0.2, 1], [3, 10])}
                ry={interpolate(petalScale, [0.2, 1], [5, 16])}
                fill="url(#petal-grad-1)"
                opacity={bloomProgress}
              />
            </g>
          );
        })}
        {/* Inner petals */}
        {Array.from({ length: 5 }).map((_, i) => {
          const rotation = i * 72 + 36;

          return (
            <g
              key={`inner-${i}`}
              style={{
                transformOrigin: "40px 40px",
                transform: `rotate(${rotation}deg) translateY(-8px)`,
              }}
            >
              <ellipse
                cx={40}
                cy={32}
                rx={interpolate(petalScale, [0.2, 1], [2, 6])}
                ry={interpolate(petalScale, [0.2, 1], [3, 10])}
                fill="url(#petal-grad-2)"
                opacity={bloomProgress * 0.8}
              />
            </g>
          );
        })}
        {/* Center */}
        <circle
          cx={40}
          cy={40}
          r={interpolate(bloomProgress, [0, 1], [3, 8])}
          fill="url(#flower-center)"
        />
      </g>
    </svg>
  );
};

// SVG butterfly
const ButterflySVG: React.FC<{
  x: number;
  y: number;
  opacity: number;
  wingAngle: number;
}> = ({ x, y, opacity, wingAngle }) => (
  <svg
    style={{
      position: "absolute",
      left: x - 16,
      top: y - 12,
      opacity,
      zIndex: 5,
    }}
    width={32}
    height={24}
    viewBox="0 0 32 24"
  >
    <defs>
      <linearGradient id="wing-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FF80AB" />
        <stop offset="100%" stopColor="#AA00FF" />
      </linearGradient>
    </defs>
    {/* Left wings */}
    <g style={{ transformOrigin: "16px 12px", transform: `scaleX(${wingAngle})` }}>
      <ellipse cx="10" cy="8" rx="8" ry="6" fill="url(#wing-grad)" opacity={0.8} />
      <ellipse cx="8" cy="16" rx="6" ry="5" fill="url(#wing-grad)" opacity={0.6} />
    </g>
    {/* Right wings */}
    <g style={{ transformOrigin: "16px 12px", transform: `scaleX(${wingAngle})` }}>
      <ellipse cx="22" cy="8" rx="8" ry="6" fill="url(#wing-grad)" opacity={0.8} />
      <ellipse cx="24" cy="16" rx="6" ry="5" fill="url(#wing-grad)" opacity={0.6} />
    </g>
    {/* Body */}
    <ellipse cx="16" cy="12" rx="2" ry="8" fill="#4A148C" />
    {/* Antennae */}
    <path d="M16 4 Q12 0 10 2" stroke="#4A148C" strokeWidth={0.8} fill="none" />
    <path d="M16 4 Q20 0 22 2" stroke="#4A148C" strokeWidth={0.8} fill="none" />
  </svg>
);

export const PlantGrowthScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const stages = Math.max(2, Math.min(5, Number(params.stages) || 4));

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Layout
  const soilTop = height * 0.75;
  const soilHeight = height * 0.15;
  const plantBaseY = soilTop;
  const centerX = width / 2;

  // Stage timing
  const stageDuration = 60;
  const currentStageFloat = Math.min(stages - 0.01, Math.max(0, (frame - 20) / stageDuration));
  const currentStage = Math.floor(currentStageFloat);
  const stageProgress = currentStageFloat - currentStage;

  // Sun
  const sunX = width * 0.8;
  const sunY = 80;
  const sunScale = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  // Stem
  const maxStemH = 250;
  const stemProgress = Math.min(1, currentStageFloat / (stages - 1));
  const stemH = stemProgress * maxStemH;

  // Leaf sway
  const leafSway = Math.sin(frame / fps * 1.5) * 5;

  // Butterfly wing flap
  const wingFlap = interpolate(
    Math.sin(frame / fps * 8),
    [-1, 1],
    [0.3, 1],
  );

  // Flower bloom
  const flowerBloom = currentStage >= 3
    ? interpolate(stageProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" })
    : 0;

  // Rain
  const rainDrops = 4;

  // Stage label
  const labelIdx = Math.min(stages - 1, currentStage);

  // Roots
  const rootProgress = currentStage >= 1 ? interpolate(stageProgress, [0, 1], [0, 1], { extrapolateRight: "clamp" }) : (currentStage >= 2 ? 1 : 0);

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* SVG Sky background */}
      <svg
        style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
        width={width}
        height={soilTop}
        viewBox={`0 0 ${width} ${soilTop}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="plant-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E3F2FD" />
            <stop offset="100%" stopColor="#F1F8E9" />
          </linearGradient>
        </defs>
        <rect width={width} height={soilTop} fill="url(#plant-sky)" />
      </svg>

      {/* Sun */}
      <SunSVG x={sunX} y={sunY} scale={sunScale} />

      {/* Rain drops */}
      {Array.from({ length: rainDrops }).map((_, i) => {
        const rx = centerX - 60 + i * 35;
        const ry = 60 + ((frame * 2 + i * 30) % (soilTop - 80));
        return (
          <RainDrop
            key={i}
            x={rx + Math.sin(frame / fps + i) * 5}
            y={ry}
            opacity={0.5}
          />
        );
      })}

      {/* SVG Soil with texture */}
      <svg
        style={{ position: "absolute", left: 0, top: soilTop, zIndex: 2 }}
        width={width}
        height={soilHeight + height * 0.1}
        viewBox={`0 0 ${width} ${soilHeight + height * 0.1}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="soil-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A1887F" />
            <stop offset="30%" stopColor="#8D6E63" />
            <stop offset="100%" stopColor="#5D4037" />
          </linearGradient>
          <filter id="soil-texture">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" />
          </filter>
        </defs>
        <rect width={width} height={soilHeight + height * 0.1} fill="url(#soil-grad)" rx="16" />
        {/* Soil particles/dots for texture */}
        {Array.from({ length: 30 }).map((_, i) => (
          <circle
            key={i}
            cx={((i * 137.5) % width)}
            cy={10 + ((i * 73) % (soilHeight - 10))}
            r={1.5 + (i % 3)}
            fill="#4E342E"
            opacity={0.3 + (i % 4) * 0.1}
          />
        ))}
        {/* Grass tufts at top */}
        {Array.from({ length: 15 }).map((_, i) => {
          const gx = (i + 0.5) * (width / 15);
          return (
            <g key={`grass-${i}`}>
              <line x1={gx - 4} y1={0} x2={gx - 6} y2={-8} stroke="#7CB342" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
              <line x1={gx} y1={0} x2={gx} y2={-10} stroke="#8BC34A" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
              <line x1={gx + 4} y1={0} x2={gx + 6} y2={-8} stroke="#7CB342" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
            </g>
          );
        })}
      </svg>

      {/* SVG Roots growing downward */}
      {currentStage >= 1 && (
        <svg
          style={{ position: "absolute", left: centerX - 50, top: plantBaseY, zIndex: 2 }}
          width={100}
          height={80}
          viewBox="0 0 100 80"
        >
          <defs>
            <linearGradient id="root-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8D6E63" />
              <stop offset="100%" stopColor="#6D4C41" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          {/* Main root */}
          <path
            d={`M50 0 Q48 ${30 * rootProgress} 45 ${60 * rootProgress}`}
            stroke="url(#root-grad)"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          {/* Left branch root */}
          <path
            d={`M50 ${15 * rootProgress} Q30 ${35 * rootProgress} 20 ${50 * rootProgress}`}
            stroke="url(#root-grad)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            opacity={rootProgress > 0.3 ? 1 : 0}
          />
          {/* Right branch root */}
          <path
            d={`M50 ${20 * rootProgress} Q70 ${40 * rootProgress} 80 ${55 * rootProgress}`}
            stroke="url(#root-grad)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            opacity={rootProgress > 0.4 ? 1 : 0}
          />
        </svg>
      )}

      {/* Seed (stage 0) */}
      {currentStage >= 0 && (
        <SeedSVG
          x={centerX}
          y={soilTop - 5}
          splitProgress={currentStage >= 1 ? interpolate(stageProgress, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) : 0}
          opacity={currentStage < 1 ? interpolate(stageProgress, [0, 0.5], [0, 1], { extrapolateRight: "clamp" }) : interpolate(stageProgress, [0.5, 1], [1, 0.2], { extrapolateRight: "clamp" })}
        />
      )}

      {/* Stem (SVG with slight curve) */}
      {currentStage >= 1 && (
        <svg
          style={{ position: "absolute", left: centerX - 15, top: plantBaseY - stemH - 5, zIndex: 3 }}
          width={30}
          height={stemH + 10}
          viewBox={`0 0 30 ${stemH + 10}`}
        >
          <defs>
            <linearGradient id="stem-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#66BB6A" />
              <stop offset="100%" stopColor="#4CAF50" />
            </linearGradient>
          </defs>
          <path
            d={`M15 ${stemH + 10} Q13 ${stemH * 0.6} 15 0`}
            stroke="url(#stem-grad)"
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
          />
          {/* Rounded top cap */}
          <ellipse cx={15} cy={3} rx={4} ry={4} fill="#66BB6A" />
        </svg>
      )}

      {/* Leaves (stage 2+) */}
      {currentStage >= 2 && Array.from({ length: Math.min(4, Math.floor(currentStageFloat - 1)) }).map((_, i) => {
        const leafY = plantBaseY - stemH * (0.3 + i * 0.2);
        const side = i % 2 === 0;
        const leafScale = interpolate(
          Math.max(0, currentStageFloat - 2),
          [0, 1],
          [0, 1],
          { extrapolateRight: "clamp" },
        );

        return (
          <LeafSVG
            key={`leaf-${i}`}
            x={centerX + (side ? 18 : -18)}
            y={leafY}
            scale={leafScale}
            mirror={!side}
            swayAngle={leafSway * (side ? 1 : -1)}
          />
        );
      })}

      {/* Flower (stage 3+) */}
      {currentStage >= 3 && (
        <FlowerSVG
          x={centerX}
          y={plantBaseY - stemH - 5}
          bloomProgress={flowerBloom}
        />
      )}

      {/* Butterflies around flower */}
      {currentStage >= 3 && stageProgress > 0.5 && (
        <>
          <ButterflySVG
            x={centerX + 50 + Math.sin(frame / fps * 1.2) * 20}
            y={plantBaseY - stemH - 30 + Math.cos(frame / fps * 0.8) * 15}
            opacity={interpolate(stageProgress, [0.5, 0.8], [0, 1], { extrapolateRight: "clamp" })}
            wingAngle={wingFlap}
          />
          <ButterflySVG
            x={centerX - 60 + Math.cos(frame / fps * 1.5) * 15}
            y={plantBaseY - stemH - 15 + Math.sin(frame / fps * 1.1) * 12}
            opacity={interpolate(stageProgress, [0.6, 0.9], [0, 0.7], { extrapolateRight: "clamp" })}
            wingAngle={interpolate(Math.sin(frame / fps * 7 + 1), [-1, 1], [0.3, 1])}
          />
        </>
      )}

      {/* Stage labels at bottom */}
      <div style={{
        position: "absolute",
        bottom: 25,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        gap: 30,
        zIndex: 5,
      }}>
        {STAGE_LABELS.slice(0, stages).map((label, i) => (
          <svg
            key={i}
            width={70}
            height={50}
            viewBox="0 0 70 50"
            style={{ opacity: i <= labelIdx ? 1 : 0.3 }}
          >
            <defs>
              <filter id={`stage-badge-${i}`}>
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity={0.1} />
              </filter>
            </defs>
            <rect
              x="2"
              y="2"
              width={66}
              height={46}
              rx={23}
              fill={i === labelIdx ? data.accentColor : PALETTE.white}
              stroke={i === labelIdx ? "transparent" : data.accentColor}
              strokeWidth={1.5}
              filter={`url(#stage-badge-${i})`}
            />
            <text
              x="35"
              y="32"
              textAnchor="middle"
              fontFamily={FONT_FAMILY}
              fontSize={i === labelIdx ? 20 : 16}
              fontWeight={i === labelIdx ? 900 : 700}
              fill={i === labelIdx ? PALETTE.white : PALETTE.dark}
            >
              {label}
            </text>
          </svg>
        ))}
      </div>
    </AbsoluteFill>
  );
};
