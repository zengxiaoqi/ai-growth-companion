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
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

const BEAD_COLORS = ["#FF6B6B", "#FFD93D", "#4D96FF", "#6BCB77", "#FF6B9D"];

/* ---- SVG Abacus Frame ---- */
const SvgAbacusFrame: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
}> = ({ x, y, w, h }) => (
  <svg style={{ position: "absolute", left: x, top: y, width: w, height: h, zIndex: 1 }}>
    <defs>
      <linearGradient id="woodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#D4A04A" />
        <stop offset="30%" stopColor="#C49030" />
        <stop offset="70%" stopColor="#A67B20" />
        <stop offset="100%" stopColor="#8B6914" />
      </linearGradient>
      <linearGradient id="woodGradInner" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFF8E1" />
        <stop offset="100%" stopColor="#FFF3CC" />
      </linearGradient>
      <filter id="frameShadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" />
      </filter>
      {/* Decorative border pattern */}
      <pattern id="borderDots" width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="6" cy="6" r="1.5" fill="#A67B20" opacity="0.3" />
      </pattern>
    </defs>
    {/* Main frame */}
    <rect x="0" y="0" width={w} height={h} rx="18" ry="18" fill="url(#woodGrad)" filter="url(#frameShadow)" />
    {/* Inner area */}
    <rect x="8" y="8" width={w - 16} height={h - 16} rx="12" ry="12" fill="url(#woodGradInner)" />
    {/* Decorative border dots on top */}
    <rect x="16" y="2" width={w - 32} height="6" rx="3" fill="url(#borderDots)" />
    {/* Decorative border dots on bottom */}
    <rect x="16" y={h - 8} width={w - 32} height="6" rx="3" fill="url(#borderDots)" />
    {/* Corner accents */}
    <circle cx="14" cy="14" r="4" fill="#C49030" />
    <circle cx={w - 14} cy="14" r="4" fill="#C49030" />
    <circle cx="14" cy={h - 14} r="4" fill="#C49030" />
    <circle cx={w - 14} cy={h - 14} r="4" fill="#C49030" />
  </svg>
);

/* ---- SVG Metallic Rod ---- */
const SvgRod: React.FC<{
  rodX: number;
  y: number;
  rodWidth: number;
}> = ({ rodX, y, rodWidth }) => (
  <svg style={{ position: "absolute", left: rodX, top: y - 3, width: rodWidth, height: 6, zIndex: 2 }}>
    <defs>
      <linearGradient id="metalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#B0BEC5" />
        <stop offset="40%" stopColor="#90A4AE" />
        <stop offset="100%" stopColor="#78909C" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100%" height="6" rx="3" fill="url(#metalGrad)" />
    {/* Metallic highlight */}
    <rect x="0" y="0.5" width="100%" height="2" rx="1" fill="rgba(255,255,255,0.3)" />
  </svg>
);

/* ---- SVG Bead ---- */
const SvgBead: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  scale: number;
  index: number;
}> = ({ x, y, size, color, scale, index }) => (
  <div style={{
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    transform: `scale(${scale})`,
    zIndex: 3,
  }}>
    <svg width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <radialGradient id={`beadGrad-${index}-${color.replace('#','')}`} cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.75" />
        </radialGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="20" cy="36" rx="12" ry="3" fill="rgba(0,0,0,0.12)" />
      {/* Bead body */}
      <circle cx="20" cy="20" r="16" fill={`url(#beadGrad-${index}-${color.replace('#','')})`} />
      {/* Inner ring */}
      <circle cx="20" cy="20" r="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      {/* Highlight reflection */}
      <ellipse cx="16" cy="14" rx="6" ry="4" fill="rgba(255,255,255,0.35)" transform="rotate(-15 16 14)" />
      {/* Center dot */}
      <circle cx="20" cy="20" r="3" fill="rgba(255,255,255,0.15)" />
    </svg>
  </div>
);

/* ---- SVG Decorative Border ---- */
const SvgDecorativeBorder: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  accentColor: string;
}> = ({ x, y, w, h, accentColor }) => (
  <svg style={{ position: "absolute", left: x - 12, top: y - 12, width: w + 24, height: h + 24, pointerEvents: "none", zIndex: 0 }}>
    <defs>
      <filter id="decoGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Corner stars */}
    {[
      { cx: 8, cy: 8 },
      { cx: w + 16, cy: 8 },
      { cx: 8, cy: h + 16 },
      { cx: w + 16, cy: h + 16 },
    ].map((pos, i) => (
      <path
        key={i}
        d={`M${pos.cx} ${pos.cy - 6} L${pos.cx + 2} ${pos.cy - 2} L${pos.cx + 6} ${pos.cy} L${pos.cx + 2} ${pos.cy + 2} L${pos.cx} ${pos.cy + 6} L${pos.cx - 2} ${pos.cy + 2} L${pos.cx - 6} ${pos.cy} L${pos.cx - 2} ${pos.cy - 2} Z`}
        fill={accentColor}
        opacity="0.3"
        filter="url(#decoGlow)"
      />
    ))}
  </svg>
);

/* ---- Abacus Row with SVG ---- */
type AbacusRowProps = {
  y: number;
  value: number;
  maxValue: number;
  delay: number;
  rodWidth: number;
  rodX: number;
  beadSize: number;
  showNumbers: boolean;
  accentColor: string;
  rowIndex: number;
};

const AbacusRow: React.FC<AbacusRowProps> = ({
  y, value, maxValue, delay, rodWidth, rodX, beadSize, showNumbers, accentColor, rowIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = interpolate(
    frame,
    [delay, delay + 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <>
      {/* SVG Rod */}
      <SvgRod rodX={rodX} y={y} rodWidth={rodWidth} />

      {/* SVG Beads */}
      {Array.from({ length: maxValue }).map((_, i) => {
        const isMoved = i < value;
        const beadTargetX = isMoved
          ? rodX + rodWidth - (i + 1) * (beadSize + 6)
          : rodX + 8 + i * (beadSize + 6);

        const beadX = rodX + 8 + i * (beadSize + 6) + (beadTargetX - (rodX + 8 + i * (beadSize + 6))) * slideProgress;
        const beadY = y - (beadSize - 6) / 2;

        const beadBounce = isMoved
          ? spring({ frame: Math.max(0, frame - delay - 25), fps, config: SPRING_CONFIGS.bouncy, delay: i * 3 })
          : { value: 1 };

        const bounceScale = interpolate(typeof beadBounce === 'object' ? beadBounce.value : beadBounce, [0, 1], [1, 1.1], { extrapolateRight: "clamp" });

        return (
          <SvgBead
            key={i}
            x={beadX}
            y={beadY}
            size={beadSize}
            color={BEAD_COLORS[i % BEAD_COLORS.length]}
            scale={isMoved ? bounceScale : 1}
            index={rowIndex * 10 + i}
          />
        );
      })}

      {/* Number label that appears when beads settle */}
      {showNumbers && (
        <div style={{
          position: "absolute",
          left: rodX + rodWidth + 20,
          top: y - 12,
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 900,
          color: accentColor,
          opacity: slideProgress,
          zIndex: 4,
        }}>
          {value}
        </div>
      )}
    </>
  );
};

export const AbacusScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const rows = Math.max(1, Math.min(4, Number(params.rows) || 2));
  const values: number[] = Array.isArray(params.values) && params.values.length > 0
    ? params.values.map((v: unknown) => Math.max(0, Math.min(9, Number(v) || 0)))
    : Array.from({ length: rows }, (_, i) => 3 + i * 2);
  const showNumbers = params.showNumbers !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const frameWidth = 500;
  const frameHeight = rows * 90 + 60;
  const frameX = (width - frameWidth) / 2;
  const frameY = (height - frameHeight) / 2 - 20;
  const rodX = frameX + 30;
  const rodWidth = frameWidth - 60 - (showNumbers ? 60 : 0);
  const beadSize = 32;

  const totalValue = values.slice(0, rows).reduce((s, v) => s + v, 0);
  const totalDelay = 20 + rows * 25;
  const totalSpring = spring({ frame: Math.max(0, frame - totalDelay), fps, config: SPRING_CONFIGS.bouncy });
  const totalOpacity = interpolate(totalSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const totalScale = interpolate(totalSpring, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div style={{
        position: "absolute",
        top: 40,
        width: "100%",
        textAlign: "center",
        zIndex: 5,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {data.title || "\u7b97\u76d8\u8ba1\u6570"}
        </div>
      </div>

      {/* Decorative border around abacus */}
      <SvgDecorativeBorder
        x={frameX}
        y={frameY}
        w={frameWidth}
        h={frameHeight}
        accentColor={data.accentColor}
      />

      {/* SVG Abacus frame */}
      <SvgAbacusFrame x={frameX} y={frameY} w={frameWidth} h={frameHeight} />

      {/* Rows */}
      {values.slice(0, rows).map((value, i) => (
        <AbacusRow
          key={i}
          y={frameY + 40 + i * 90}
          value={value}
          maxValue={9}
          delay={20 + i * 25}
          rodWidth={rodWidth}
          rodX={rodX}
          beadSize={beadSize}
          showNumbers={showNumbers}
          accentColor={data.accentColor}
          rowIndex={i}
        />
      ))}

      {/* Total */}
      <div style={{
        position: "absolute",
        bottom: 50,
        width: "100%",
        textAlign: "center",
        zIndex: 5,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 36,
          fontWeight: 900,
          color: data.accentColor,
          opacity: totalOpacity,
          transform: `scale(${totalScale})`,
        }}>
          {"\u5408\u8ba1"}: {totalValue}
        </div>
      </div>
    </AbsoluteFill>
  );
};
