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

const COLORS = [
  { name: "红", hex: "#F44336" },
  { name: "橙", hex: "#FF9800" },
  { name: "黄", hex: "#FFEB3B" },
  { name: "绿", hex: "#4CAF50" },
  { name: "青", hex: "#00BCD4" },
  { name: "蓝", hex: "#2196F3" },
  { name: "紫", hex: "#9C27B0" },
];

export const RainbowScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const highlightRing = String(params.highlightRing || "none");
  const showLabels = params.showLabels !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const cx = width / 2;
  // Keep the ground band tall enough for the color chips to sit above the
  // 100px subtitle bar without touching the rainbow feet.
  const groundY = height * 0.7;
  const bandWidth = Math.min(width, height) * 0.045;
  const outerR = Math.min(width * 0.42, height * 0.62);

  const entrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 5 });

  // Continuous shimmer sweep + sun ray rotation
  const shimmer = 0.5 + 0.5 * Math.sin(frame / 8);
  const rayAngle = (frame / fps) * 20;

  const activeIndex = Math.floor(frame / (fps * 1.5)) % COLORS.length;

  const ringBadge =
    highlightRing === "outer"
      ? { text: "外圈 · 红", color: COLORS[0].hex, r: outerR }
      : highlightRing === "inner"
        ? { text: "内圈 · 紫", color: COLORS[6].hex, r: outerR - 6 * bandWidth }
        : null;
  const ringPulse = 0.45 + 0.3 * Math.sin(frame / 6);

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Sky */}
      <svg style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="rb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#81D4FA" />
            <stop offset="100%" stopColor="#E1F5FE" />
          </linearGradient>
          <linearGradient id="rb-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A5D6A7" />
            <stop offset="100%" stopColor="#66BB6A" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#rb-sky)" />
        <rect y={groundY} width={width} height={height - groundY} fill="url(#rb-ground)" />
      </svg>

      {/* Sun with rotating rays */}
      <svg style={{ position: "absolute", left: width * 0.06, top: height * 0.08, zIndex: 1 }} width={120} height={120} viewBox="0 0 120 120">
        <g transform={`rotate(${rayAngle} 60 60)`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={i} x1={60} y1={8} x2={60} y2={22} stroke="#FFD54F" strokeWidth={5} strokeLinecap="round" transform={`rotate(${i * 45} 60 60)`} />
          ))}
        </g>
        <circle cx={60} cy={60} r={26} fill="#FFCA28" />
        <circle cx={60} cy={60} r={26} fill="#FFF59D" opacity={0.4 * shimmer} />
      </svg>

      {/* Rainbow arcs */}
      <svg style={{ position: "absolute", left: 0, top: 0, zIndex: 2, transform: `scale(${0.9 + 0.1 * entrance})`, transformOrigin: `${cx}px ${groundY}px` }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {COLORS.map((c, i) => {
          const r = outerR - i * bandWidth;
          const arcLen = Math.PI * r;
          const start = 12 + i * 7;
          const prog = interpolate(frame, [start, start + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <path
              key={c.name}
              d={`M ${cx - r} ${groundY} A ${r} ${r} 0 0 1 ${cx + r} ${groundY}`}
              stroke={c.hex}
              strokeWidth={bandWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={arcLen}
              strokeDashoffset={arcLen * (1 - prog)}
              opacity={0.95}
            />
          );
        })}
        {/* shimmer sweep overlay */}
        <path
          d={`M ${cx - outerR} ${groundY} A ${outerR} ${outerR} 0 0 1 ${cx + outerR} ${groundY}`}
          stroke="#FFFFFF"
          strokeWidth={bandWidth * 7}
          fill="none"
          opacity={0.08 * shimmer}
        />
        {/* highlighted ring */}
        {ringBadge && (
          <path
            d={`M ${cx - ringBadge.r} ${groundY} A ${ringBadge.r} ${ringBadge.r} 0 0 1 ${cx + ringBadge.r} ${groundY}`}
            stroke="#FFFFFF"
            strokeWidth={bandWidth * 0.5}
            fill="none"
            strokeLinecap="round"
            opacity={ringPulse}
          />
        )}
      </svg>

      {/* ring badge */}
      {ringBadge && (
        <div style={{ position: "absolute", top: height * 0.12, right: width * 0.08, zIndex: 4, background: ringBadge.color, color: PALETTE.white, fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 30, padding: "10px 22px", borderRadius: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", opacity: 0.7 + 0.3 * shimmer }}>
          {ringBadge.text}
        </div>
      )}

      {/* color labels */}
      {showLabels && (
        <div style={{ position: "absolute", bottom: 108, width: "100%", display: "flex", justifyContent: "center", gap: 18, zIndex: 4 }}>
          {COLORS.map((c, i) => {
            const appear = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 20 + i * 5 });
            const active = i === activeIndex;
            const bob = Math.sin(frame / 10 + i) * 3;
            return (
              <div key={c.name} style={{ transform: `translateY(${bob}px) scale(${(0.6 + 0.4 * appear) * (active ? 1.15 : 1)})`, opacity: appear, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: c.hex, border: active ? `3px solid ${PALETTE.white}` : "3px solid transparent", boxShadow: active ? `0 0 14px ${c.hex}` : "0 2px 6px rgba(0,0,0,0.15)" }} />
                <span style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 26, color: PALETTE.dark }}>{c.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};