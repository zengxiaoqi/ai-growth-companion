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

const SHAPE_LABELS: Record<string, string> = {
  circle: "\u5706\u5f62",
  square: "\u6b63\u65b9\u5f62",
  triangle: "\u4e09\u89d2\u5f62",
  diamond: "\u83f1\u5f62",
  star: "\u4e94\u89d2\u661f",
};

const DEFAULT_SHAPES = ["circle", "triangle", "square"];
const DEFAULT_COLORS: string[] = [...PALETTE.rainbow];

/* ---- SVG Construction Zone Grid Background ---- */
const SvgGridBackground: React.FC<{ width: number; height: number }> = ({ width, height: h }) => (
  <svg style={{ position: "absolute", left: 0, top: 0, width, height: h, pointerEvents: "none", zIndex: 0 }}>
    <defs>
      <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1.5" fill="rgba(0,0,0,0.06)" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#gridPattern)" />
  </svg>
);

/* ---- SVG Shape Components ---- */

const SvgCircleShape: React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }> = ({
  size, color, drawProgress, fillOpacity, isPlacing, placementProgress,
}) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <defs>
      <radialGradient id={`circGrad-${color.replace('#','')}`} cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor={color} stopOpacity="0.9" />
        <stop offset="100%" stopColor={color} stopOpacity="0.6" />
      </radialGradient>
      <filter id={`circShadow-${color.replace('#','')}`}>
        <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.2" />
      </filter>
    </defs>
    {/* Dotted outline guide */}
    {isPlacing && (
      <circle cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity={1 - placementProgress * 0.5} />
    )}
    {/* Main shape */}
    <circle
      cx="60" cy="60" r="48"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeDasharray={`${301.6 * drawProgress} ${301.6 * (1 - drawProgress)}`}
      transform="rotate(-90 60 60)"
      filter={drawProgress >= 1 ? `url(#circShadow-${color.replace('#','')})` : undefined}
    />
    {/* Fill */}
    {drawProgress >= 1 && (
      <circle cx="60" cy="60" r="48" fill={`url(#circGrad-${color.replace('#','')})`} opacity={fillOpacity} />
    )}
    {/* Highlight reflection */}
    {drawProgress >= 1 && fillOpacity > 0.1 && (
      <ellipse cx="45" cy="42" rx="14" ry="8" fill="rgba(255,255,255,0.25)" transform="rotate(-20 45 42)" />
    )}
  </svg>
);

const SvgSquareShape: React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }> = ({
  size, color, drawProgress, fillOpacity, isPlacing, placementProgress,
}) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <defs>
      <linearGradient id={`sqGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={color} stopOpacity="0.9" />
        <stop offset="100%" stopColor={color} stopOpacity="0.6" />
      </linearGradient>
      <filter id={`sqShadow-${color.replace('#','')}`}>
        <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.2" />
      </filter>
    </defs>
    {/* Dotted outline guide */}
    {isPlacing && (
      <rect x="10" y="10" width="100" height="100" rx="10" ry="10" fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity={1 - placementProgress * 0.5} />
    )}
    {/* Main shape */}
    <rect
      x="14" y="14" width="92" height="92" rx="10" ry="10"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeDasharray={`${368 * drawProgress} ${368 * (1 - drawProgress)}`}
      filter={drawProgress >= 1 ? `url(#sqShadow-${color.replace('#','')})` : undefined}
    />
    {/* Fill */}
    {drawProgress >= 1 && (
      <rect x="14" y="14" width="92" height="92" rx="10" ry="10" fill={`url(#sqGrad-${color.replace('#','')})`} opacity={fillOpacity} />
    )}
    {/* Highlight reflection */}
    {drawProgress >= 1 && fillOpacity > 0.1 && (
      <rect x="20" y="18" width="40" height="12" rx="4" fill="rgba(255,255,255,0.2)" transform="rotate(-5 40 24)" />
    )}
  </svg>
);

const SvgTriangleShape: React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }> = ({
  size, color, drawProgress, fillOpacity, isPlacing, placementProgress,
}) => {
  const triPath = "M60 12 L108 100 L12 100 Z";
  const triLen = 310;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <linearGradient id={`triGrad-${color.replace('#','')}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
        <filter id={`triShadow-${color.replace('#','')}`}>
          <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      {/* Dotted outline guide */}
      {isPlacing && (
        <path d={triPath} fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity={1 - placementProgress * 0.5} />
      )}
      {/* Main shape */}
      <path
        d={triPath}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinejoin="round"
        strokeDasharray={`${triLen * drawProgress} ${triLen * (1 - drawProgress)}`}
        filter={drawProgress >= 1 ? `url(#triShadow-${color.replace('#','')})` : undefined}
      />
      {/* Fill */}
      {drawProgress >= 1 && (
        <path d={triPath} fill={`url(#triGrad-${color.replace('#','')})`} opacity={fillOpacity} />
      )}
      {/* Highlight reflection */}
      {drawProgress >= 1 && fillOpacity > 0.1 && (
        <ellipse cx="52" cy="40" rx="12" ry="6" fill="rgba(255,255,255,0.2)" transform="rotate(-8 52 40)" />
      )}
    </svg>
  );
};

const SvgDiamondShape: React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }> = ({
  size, color, drawProgress, fillOpacity, isPlacing, placementProgress,
}) => {
  const diaPath = "M60 8 L110 60 L60 112 L10 60 Z";
  const diaLen = 340;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <linearGradient id={`diaGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
        <filter id={`diaShadow-${color.replace('#','')}`}>
          <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      {isPlacing && (
        <path d={diaPath} fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity={1 - placementProgress * 0.5} />
      )}
      <path
        d={diaPath}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinejoin="round"
        strokeDasharray={`${diaLen * drawProgress} ${diaLen * (1 - drawProgress)}`}
        filter={drawProgress >= 1 ? `url(#diaShadow-${color.replace('#','')})` : undefined}
      />
      {drawProgress >= 1 && (
        <path d={diaPath} fill={`url(#diaGrad-${color.replace('#','')})`} opacity={fillOpacity} />
      )}
      {drawProgress >= 1 && fillOpacity > 0.1 && (
        <ellipse cx="48" cy="42" rx="10" ry="6" fill="rgba(255,255,255,0.2)" transform="rotate(-20 48 42)" />
      )}
    </svg>
  );
};

const SvgStarShape: React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }> = ({
  size, color, drawProgress, fillOpacity, isPlacing, placementProgress,
}) => {
  const starPath = "M60 8 L72 42 L108 44 L80 66 L88 100 L60 82 L32 100 L40 66 L12 44 L48 42 Z";
  const starLen = 380;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <linearGradient id={`starShapeGrad-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.65" />
        </linearGradient>
        <filter id={`starShapeShadow-${color.replace('#','')}`}>
          <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      {isPlacing && (
        <path d={starPath} fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 4" opacity={1 - placementProgress * 0.5} />
      )}
      <path
        d={starPath}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinejoin="round"
        strokeDasharray={`${starLen * drawProgress} ${starLen * (1 - drawProgress)}`}
        filter={drawProgress >= 1 ? `url(#starShapeShadow-${color.replace('#','')})` : undefined}
      />
      {drawProgress >= 1 && (
        <path d={starPath} fill={`url(#starShapeGrad-${color.replace('#','')})`} opacity={fillOpacity} />
      )}
      {drawProgress >= 1 && fillOpacity > 0.1 && (
        <ellipse cx="50" cy="38" rx="8" ry="5" fill="rgba(255,255,255,0.3)" transform="rotate(-15 50 38)" />
      )}
    </svg>
  );
};

const SHAPE_SVG_MAP: Record<string, React.FC<{ size: number; color: string; drawProgress: number; fillOpacity: number; isPlacing: boolean; placementProgress: number }>> = {
  circle: SvgCircleShape,
  square: SvgSquareShape,
  triangle: SvgTriangleShape,
  diamond: SvgDiamondShape,
  star: SvgStarShape,
};

type ShapeDrawProps = {
  shape: string;
  color: string;
  delay: number;
  size: number;
  x: number;
  y: number;
};

const ShapeDraw: React.FC<ShapeDrawProps> = ({ shape, color, delay, size, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drawProgress = interpolate(
    frame,
    [delay, delay + 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const fillSpring = spring({
    frame: Math.max(0, frame - delay - 25),
    fps,
    config: SPRING_CONFIGS.smooth,
  });
  const fillOpacity = interpolate(fillSpring, [0, 1], [0, 0.3], { extrapolateRight: "clamp" });

  const labelSpring = spring({
    frame: Math.max(0, frame - delay - 35),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
  const labelScale = interpolate(labelSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const labelOpacity = interpolate(labelSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // Placement rotation animation
  const placementSpring = spring({
    frame: Math.max(0, frame - delay - 20),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
  const placementProgress = interpolate(placementSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const placementRotation = interpolate(placementSpring, [0, 1], [45, 0], { extrapolateRight: "clamp" });
  const placementScale = interpolate(placementSpring, [0, 1], [1.3, 1], { extrapolateRight: "clamp" });

  const SvgShapeComponent = SHAPE_SVG_MAP[shape];

  return (
    <>
      {SvgShapeComponent ? (
        <div style={{
          position: "absolute",
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          opacity: drawProgress > 0 ? 1 : 0,
          transform: `rotate(${placementRotation}deg) scale(${placementScale})`,
        }}>
          <SvgShapeComponent
            size={size}
            color={color}
            drawProgress={drawProgress}
            fillOpacity={fillOpacity}
            isPlacing={drawProgress < 0.5}
            placementProgress={placementProgress}
          />
        </div>
      ) : null}

      <div style={{
        position: "absolute",
        left: x,
        top: y + size / 2 + 12,
        transform: `translateX(-50%) scale(${labelScale})`,
        opacity: labelOpacity,
        fontFamily: FONT_FAMILY,
        fontSize: 24,
        fontWeight: 700,
        color: color,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}>
        {SHAPE_LABELS[shape] || shape}
      </div>
    </>
  );
};

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

export const ShapeBuilderScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const shapes: string[] = Array.isArray(params.shapes) && params.shapes.length > 0
    ? params.shapes.map(String)
    : DEFAULT_SHAPES;
  const shapeColors: string[] = Array.isArray(params.shapeColors) && params.shapeColors.length > 0
    ? params.shapeColors.map(String)
    : DEFAULT_COLORS;

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const spacing = width / (shapes.length + 1);
  const centerY = height * 0.48;
  const shapeSize = Math.min(140, (width - 200) / shapes.length - 40);
  const perShapeDelay = 30;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* SVG construction zone grid background */}
      <SvgGridBackground width={width} height={height} />

      <div style={{
        position: "absolute",
        top: 50,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {"\u8ba4\u8bc6\u56fe\u5f62"}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {shapes.map((shape, i) => (
          <ShapeDraw
            key={shape + i}
            shape={shape}
            color={shapeColors[i % shapeColors.length]}
            delay={15 + i * perShapeDelay}
            size={shapeSize}
            x={spacing * (i + 1)}
            y={centerY}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
