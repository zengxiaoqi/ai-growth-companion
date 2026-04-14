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
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";
import { GENERIC_INTRO_DURATION } from "../data/topic-video";

type GenericIntroProps = {
  title: string;
  subtitle: string;
  bgColor: string;
};

/* ---------- SVG Sub-components ---------- */

const FloatingShape: React.FC<{
  x: number;
  y: number;
  size: number;
  type: "circle" | "triangle" | "star" | "diamond";
  color: string;
  frame: number;
  fps: number;
  phaseOffset: number;
}> = ({ x, y, size, type, color, frame, fps, phaseOffset }) => {
  const floatY = Math.sin(frame / fps * 0.6 + phaseOffset) * 12;
  const floatX = Math.cos(frame / fps * 0.4 + phaseOffset * 0.7) * 6;
  const rotation = frame / fps * 20 + phaseOffset * 30;

  return (
    <g transform={`translate(${x + floatX}, ${y + floatY}) rotate(${rotation})`} opacity={0.2}>
      {type === "circle" && <circle cx={0} cy={0} r={size / 2} fill={color} />}
      {type === "triangle" && (
        <polygon
          points={`0,${-size / 2} ${size / 2},${size / 2} ${-size / 2},${size / 2}`}
          fill={color}
        />
      )}
      {type === "star" && (
        <path
          d={starPath(0, 0, size / 2, size / 4, 5)}
          fill={color}
        />
      )}
      {type === "diamond" && (
        <polygon
          points={`0,${-size / 2} ${size / 2},0 0,${size / 2} ${-size / 2},0`}
          fill={color}
        />
      )}
    </g>
  );
};

const SparkleSVG: React.FC<{
  x: number;
  y: number;
  size: number;
  frame: number;
  fps: number;
  delay: number;
  color: string;
}> = ({ x, y, size, frame, fps, delay, color }) => {
  const twinkle = Math.max(0, Math.sin(frame / fps * 2.5 + delay));
  const pulse = 1 + twinkle * 0.3;

  return (
    <g transform={`translate(${x}, ${y}) scale(${pulse})`} opacity={twinkle * 0.8}>
      <path
        d={`M0,${-size} C${size * 0.12},${-size * 0.12} ${size * 0.12},${-size * 0.12} ${size},0 C${size * 0.12},${size * 0.12} ${size * 0.12},${size * 0.12} 0,${size} C${-size * 0.12},${size * 0.12} ${-size * 0.12},${size * 0.12} ${-size},0 C${-size * 0.12},${-size * 0.12} ${-size * 0.12},${-size * 0.12} 0,${-size} Z`}
        fill={color}
      />
    </g>
  );
};

const DecorativeFrameSVG: React.FC<{
  width: number;
  height: number;
  frame: number;
  fps: number;
  color: string;
}> = ({ width, height, frame, fps, color }) => {
  const margin = 30;
  const r = 24;
  const dashAnim = frame / fps * 30;

  return (
    <g opacity={0.25}>
      {/* Main frame */}
      <rect
        x={margin}
        y={margin}
        width={width - margin * 2}
        height={height - margin * 2}
        rx={r}
        ry={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray="12 8"
        strokeDashoffset={dashAnim}
      />
      {/* Corner dots */}
      {[
        [margin + 10, margin + 10],
        [width - margin - 10, margin + 10],
        [margin + 10, height - margin - 10],
        [width - margin - 10, height - margin - 10],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={4} fill={color} opacity={0.6} />
      ))}
      {/* Wave pattern on top */}
      <path
        d={`M${margin + 50},${margin} Q${margin + 70},${margin - 10} ${margin + 90},${margin} Q${margin + 110},${margin + 10} ${margin + 130},${margin} Q${margin + 150},${margin - 10} ${margin + 170},${margin}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={0.4}
      />
      {/* Wave pattern on bottom */}
      <path
        d={`M${width - margin - 170},${height - margin} Q${width - margin - 150},${height - margin + 10} ${width - margin - 130},${height - margin} Q${width - margin - 110},${height - margin - 10} ${width - margin - 90},${height - margin} Q${width - margin - 70},${height - margin + 10} ${width - margin - 50},${height - margin}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={0.4}
      />
    </g>
  );
};

/* ---------- Helper ---------- */

function starPath(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += i === 0 ? `M${x},${y} ` : `L${x},${y} `;
  }
  return d + "Z";
}

/* ---------- Main Scene ---------- */

export const GenericIntroScene: React.FC<GenericIntroProps> = ({
  title,
  subtitle,
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 0.3, 1], [0, 0.5, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(titleEntrance, [0, 1], [-30, 0], { extrapolateRight: "clamp" });

  const subtitleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 20 });
  const subtitleY = interpolate(subtitleEntrance, [0, 1], [20, 0], { extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const fadeOut = interpolate(
    frame,
    [GENERIC_INTRO_DURATION - 20, GENERIC_INTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Sparkle entrance delays
  const sparkleEntrances = [8, 12, 16, 10, 14, 18];
  const sparklePositions = [
    { x: width * 0.2, y: height * 0.25 },
    { x: width * 0.8, y: height * 0.2 },
    { x: width * 0.15, y: height * 0.6 },
    { x: width * 0.85, y: height * 0.65 },
    { x: width * 0.35, y: height * 0.15 },
    { x: width * 0.7, y: height * 0.75 },
  ];

  // Floating background shapes
  const bgShapes: Array<{ x: number; y: number; size: number; type: "circle" | "triangle" | "star" | "diamond"; color: string; phase: number }> = [
    { x: width * 0.1, y: height * 0.3, size: 40, type: "circle", color: PALETTE.rainbow[0], phase: 0 },
    { x: width * 0.9, y: height * 0.4, size: 35, type: "triangle", color: PALETTE.rainbow[1], phase: 1.2 },
    { x: width * 0.25, y: height * 0.7, size: 30, type: "star", color: PALETTE.rainbow[2], phase: 2.4 },
    { x: width * 0.75, y: height * 0.2, size: 25, type: "diamond", color: PALETTE.rainbow[3], phase: 3.6 },
    { x: width * 0.5, y: height * 0.8, size: 28, type: "circle", color: PALETTE.rainbow[4], phase: 4.8 },
    { x: width * 0.6, y: height * 0.15, size: 32, type: "triangle", color: PALETTE.rainbow[0], phase: 1.8 },
    { x: width * 0.4, y: height * 0.85, size: 22, type: "star", color: PALETTE.rainbow[3], phase: 3.0 },
  ];

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
          <linearGradient id="intro-bg-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bgColor} />
            <stop offset="100%" stopColor={darkenHex(bgColor, 40)} />
          </linearGradient>
          <filter id="title-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(0,0,0,0.25)" />
          </filter>
          <filter id="sparkle-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={3} />
          </filter>
        </defs>

        {/* Background gradient overlay */}
        <rect x={0} y={0} width={width} height={height} fill="url(#intro-bg-grad)" opacity={0.3} />

        {/* Floating geometric shapes */}
        {bgShapes.map((shape, i) => (
          <FloatingShape
            key={i}
            x={shape.x}
            y={shape.y}
            size={shape.size}
            type={shape.type}
            color={shape.color}
            frame={frame}
            fps={fps}
            phaseOffset={shape.phase}
          />
        ))}

        {/* Decorative frame */}
        <DecorativeFrameSVG width={width} height={height} frame={frame} fps={fps} color={PALETTE.white} />

        {/* Sparkles around title area */}
        {sparklePositions.map((pos, i) => (
          <SparkleSVG
            key={i}
            x={pos.x}
            y={pos.y}
            size={8 + (i % 3) * 3}
            frame={frame}
            fps={fps}
            delay={sparkleEntrances[i]}
            color={PALETTE.rainbow[i % PALETTE.rainbow.length]}
          />
        ))}

        {/* Glow behind sparkles */}
        {sparklePositions.map((pos, i) => (
          <circle
            key={`glow-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={12 + (i % 3) * 4}
            fill={PALETTE.rainbow[i % PALETTE.rainbow.length]}
            filter="url(#sparkle-glow)"
            opacity={Math.max(0, Math.sin(frame / fps * 2.5 + sparkleEntrances[i])) * 0.3}
          />
        ))}

        {/* Title text with SVG shadow */}
        <text
          x={width / 2}
          y={height / 2 - 20}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT_FAMILY}
          fontSize={FONT_SIZES.title}
          fontWeight={900}
          fill={PALETTE.white}
          filter="url(#title-shadow)"
          opacity={titleOpacity}
          transform={`translate(0, ${titleY}) scale(${titleScale})`}
          style={{ transformOrigin: `${width / 2}px ${height / 2 - 20}px` }}
        >
          {title}
        </text>

        {/* Subtitle */}
        <text
          x={width / 2}
          y={height / 2 + 40}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT_FAMILY}
          fontSize={FONT_SIZES.subtitle}
          fontWeight={700}
          fill={PALETTE.white}
          opacity={subtitleOpacity * 0.8}
          transform={`translate(0, ${subtitleY})`}
        >
          {subtitle}
        </text>

        {/* Small decorative dots along bottom */}
        {Array.from({ length: 9 }).map((_, i) => (
          <circle
            key={`dot-${i}`}
            cx={width * 0.15 + i * width * 0.085}
            cy={height - 55 + Math.sin(frame / fps + i) * 3}
            r={3}
            fill={PALETTE.rainbow[i % PALETTE.rainbow.length]}
            opacity={0.3}
          />
        ))}
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
