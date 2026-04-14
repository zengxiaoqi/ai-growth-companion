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

type EmotionFacesParams = {
  emotions?: string[];
  transitionSpeed?: number;
};

const EMOTION_MAP: Record<string, { label: string }> = {
  happy: { label: "开心" },
  sad: { label: "难过" },
  angry: { label: "生气" },
  surprised: { label: "惊讶" },
};

/** SVG face component that morphs between emotions */
const SvgEmotionFace: React.FC<{
  cx: number;
  cy: number;
  size: number;
  emotion: string;
  scale: number;
}> = ({ cx, cy, size, emotion, scale }) => {
  const r = size / 2;
  // Face color per emotion
  const faceColors: Record<string, string> = {
    happy: "#FFE082",
    sad: "#BBDEFB",
    angry: "#FFCDD2",
    surprised: "#C8E6C9",
  };
  const faceColor = faceColors[emotion] ?? "#FFE082";

  // Eye shapes per emotion
  const renderEyes = () => {
    const eyeOffsetX = r * 0.28;
    const eyeY = cy - r * 0.12;
    switch (emotion) {
      case "happy":
        return (
          <>
            {/* Happy curved arc eyes (closed smile eyes) */}
            <path d={`M${cx - eyeOffsetX - r * 0.12},${eyeY + 2} Q${cx - eyeOffsetX},${eyeY - r * 0.12} ${cx - eyeOffsetX + r * 0.12},${eyeY + 2}`} fill="none" stroke="#5D4037" strokeWidth={3.5} strokeLinecap="round" />
            <path d={`M${cx + eyeOffsetX - r * 0.12},${eyeY + 2} Q${cx + eyeOffsetX},${eyeY - r * 0.12} ${cx + eyeOffsetX + r * 0.12},${eyeY + 2}`} fill="none" stroke="#5D4037" strokeWidth={3.5} strokeLinecap="round" />
            {/* Rosy cheeks */}
            <circle cx={cx - r * 0.4} cy={cy + r * 0.15} r={r * 0.12} fill="#FFAB91" opacity={0.5} />
            <circle cx={cx + r * 0.4} cy={cy + r * 0.15} r={r * 0.12} fill="#FFAB91" opacity={0.5} />
          </>
        );
      case "sad":
        return (
          <>
            {/* Droopy sad eyes */}
            <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={r * 0.1} ry={r * 0.13} fill="white" stroke="#5D4037" strokeWidth={2} />
            <circle cx={cx - eyeOffsetX + 1} cy={eyeY + 2} r={r * 0.06} fill="#5D4037" />
            <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={r * 0.1} ry={r * 0.13} fill="white" stroke="#5D4037" strokeWidth={2} />
            <circle cx={cx + eyeOffsetX + 1} cy={eyeY + 2} r={r * 0.06} fill="#5D4037" />
            {/* Sad eyebrows - angled down toward center */}
            <line x1={cx - eyeOffsetX - r * 0.1} y1={eyeY - r * 0.2} x2={cx - eyeOffsetX + r * 0.1} y2={eyeY - r * 0.28} stroke="#5D4037" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={cx + eyeOffsetX + r * 0.1} y1={eyeY - r * 0.2} x2={cx + eyeOffsetX - r * 0.1} y2={eyeY - r * 0.28} stroke="#5D4037" strokeWidth={2.5} strokeLinecap="round" />
          </>
        );
      case "angry":
        return (
          <>
            {/* Angry eyes - normal with V-shaped brows */}
            <ellipse cx={cx - eyeOffsetX} cy={eyeY + 2} rx={r * 0.1} ry={r * 0.12} fill="white" stroke="#5D4037" strokeWidth={2} />
            <circle cx={cx - eyeOffsetX} cy={eyeY + 3} r={r * 0.06} fill="#5D4037" />
            <ellipse cx={cx + eyeOffsetX} cy={eyeY + 2} rx={r * 0.1} ry={r * 0.12} fill="white" stroke="#5D4037" strokeWidth={2} />
            <circle cx={cx + eyeOffsetX} cy={eyeY + 3} r={r * 0.06} fill="#5D4037" />
            {/* V-shaped angry eyebrows */}
            <line x1={cx - eyeOffsetX - r * 0.12} y1={eyeY - r * 0.28} x2={cx - eyeOffsetX + r * 0.1} y2={eyeY - r * 0.18} stroke="#5D4037" strokeWidth={3} strokeLinecap="round" />
            <line x1={cx + eyeOffsetX + r * 0.12} y1={eyeY - r * 0.28} x2={cx + eyeOffsetX - r * 0.1} y2={eyeY - r * 0.18} stroke="#5D4037" strokeWidth={3} strokeLinecap="round" />
            {/* Anger vein marks (cross shape) */}
            <g transform={`translate(${cx + r * 0.55}, ${cy - r * 0.45})`}>
              <line x1={0} y1={-6} x2={0} y2={6} stroke="#E53935" strokeWidth={2.5} strokeLinecap="round" />
              <line x1={-6} y1={0} x2={6} y2={0} stroke="#E53935" strokeWidth={2.5} strokeLinecap="round" />
            </g>
          </>
        );
      case "surprised":
        return (
          <>
            {/* Big round surprised eyes */}
            <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={r * 0.14} ry={r * 0.17} fill="white" stroke="#5D4037" strokeWidth={2.5} />
            <circle cx={cx - eyeOffsetX} cy={eyeY + 1} r={r * 0.08} fill="#5D4037" />
            <circle cx={cx - eyeOffsetX - r * 0.03} cy={eyeY - r * 0.04} r={r * 0.03} fill="white" />
            <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={r * 0.14} ry={r * 0.17} fill="white" stroke="#5D4037" strokeWidth={2.5} />
            <circle cx={cx + eyeOffsetX} cy={eyeY + 1} r={r * 0.08} fill="#5D4037" />
            <circle cx={cx + eyeOffsetX - r * 0.03} cy={eyeY - r * 0.04} r={r * 0.03} fill="white" />
            {/* Raised eyebrows */}
            <path d={`M${cx - eyeOffsetX - r * 0.1},${eyeY - r * 0.28} Q${cx - eyeOffsetX},${eyeY - r * 0.38} ${cx - eyeOffsetX + r * 0.1},${eyeY - r * 0.28}`} fill="none" stroke="#5D4037" strokeWidth={2.5} strokeLinecap="round" />
            <path d={`M${cx + eyeOffsetX - r * 0.1},${eyeY - r * 0.28} Q${cx + eyeOffsetX},${eyeY - r * 0.38} ${cx + eyeOffsetX + r * 0.1},${eyeY - r * 0.28}`} fill="none" stroke="#5D4037" strokeWidth={2.5} strokeLinecap="round" />
          </>
        );
      default:
        return null;
    }
  };

  // Mouth shapes per emotion
  const renderMouth = () => {
    const mouthY = cy + r * 0.32;
    switch (emotion) {
      case "happy":
        return (
          <path
            d={`M${cx - r * 0.22},${mouthY - 2} Q${cx},${mouthY + r * 0.22} ${cx + r * 0.22},${mouthY - 2}`}
            fill="none" stroke="#5D4037" strokeWidth={3} strokeLinecap="round"
          />
        );
      case "sad":
        return (
          <path
            d={`M${cx - r * 0.18},${mouthY + 4} Q${cx},${mouthY - r * 0.12} ${cx + r * 0.18},${mouthY + 4}`}
            fill="none" stroke="#5D4037" strokeWidth={3} strokeLinecap="round"
          />
        );
      case "angry":
        return (
          <>
            <path
              d={`M${cx - r * 0.2},${mouthY} L${cx - r * 0.08},${mouthY + 4} L${cx + r * 0.08},${mouthY - 2} L${cx + r * 0.2},${mouthY + 2}`}
              fill="none" stroke="#5D4037" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            />
          </>
        );
      case "surprised":
        return (
          <ellipse
            cx={cx} cy={mouthY + 4}
            rx={r * 0.1} ry={r * 0.14}
            fill="#5D4037" opacity={0.8}
          />
        );
      default:
        return null;
    }
  };

  // Extra decorations per emotion
  const renderExtras = () => {
    switch (emotion) {
      case "sad":
        return (
          <>
            {/* Tear drops */}
            <path d={`M${cx - r * 0.2},${cy + r * 0.08} Q${cx - r * 0.22},${cy + r * 0.2} ${cx - r * 0.18},${cy + r * 0.28} Q${cx - r * 0.14},${cy + r * 0.2} ${cx - r * 0.2},${cy + r * 0.08}`} fill="#64B5F6" opacity={0.7} />
            <path d={`M${cx + r * 0.18},${cy + r * 0.12} Q${cx + r * 0.2},${cy + r * 0.24} ${cx + r * 0.16},${cy + r * 0.32} Q${cx + r * 0.12},${cy + r * 0.24} ${cx + r * 0.18},${cy + r * 0.12}`} fill="#64B5F6" opacity={0.5} />
          </>
        );
      case "surprised":
        return (
          <>
            {/* Sweat drop */}
            <path d={`M${cx + r * 0.55},${cy - r * 0.1} Q${cx + r * 0.58},${cy + r * 0.05} ${cx + r * 0.52},${cy + r * 0.12} Q${cx + r * 0.46},${cy + r * 0.05} ${cx + r * 0.55},${cy - r * 0.1}`} fill="#64B5F6" opacity={0.6} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <svg
      style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, zIndex: 3, transform: `scale(${scale})` }}
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <radialGradient id={`faceGrad-${emotion}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.3} />
          <stop offset="100%" stopColor={faceColor} />
        </radialGradient>
        <filter id={`faceShadow-${emotion}`}>
          <feDropShadow dx={0} dy={3} stdDeviation={4} floodColor="#00000022" />
        </filter>
      </defs>
      {/* Face circle */}
      <circle cx={cx} cy={cy} r={r - 4} fill={`url(#faceGrad-${emotion})`} stroke="#E0C068" strokeWidth={2.5} filter={`url(#faceShadow-${emotion})`} />
      {/* Eyes */}
      {renderEyes()}
      {/* Mouth */}
      {renderMouth()}
      {/* Extras (tears, sweat, etc) */}
      {renderExtras()}
    </svg>
  );
};

/** Context decorations per emotion - SVG instead of emoji */
type ContextSvg = { dx: number; dy: number; type: string };
const CONTEXT_SVGS: Record<string, ContextSvg[]> = {
  happy: [
    { dx: -100, dy: -60, type: "heart" },
    { dx: 110, dy: -40, type: "heart" },
    { dx: -70, dy: 50, type: "heart" },
    { dx: 90, dy: 70, type: "heart" },
    { dx: 0, dy: -90, type: "heart" },
  ],
  sad: [
    { dx: -80, dy: -70, type: "teardrop" },
    { dx: 60, dy: -50, type: "teardrop" },
    { dx: -40, dy: -90, type: "teardrop" },
    { dx: 100, dy: -30, type: "teardrop" },
    { dx: 20, dy: -100, type: "teardrop" },
  ],
  angry: [
    { dx: -120, dy: 0, type: "flame" },
    { dx: 120, dy: 0, type: "flame" },
    { dx: -90, dy: -40, type: "flame" },
    { dx: 90, dy: -40, type: "flame" },
  ],
  surprised: [
    { dx: -90, dy: -50, type: "star" },
    { dx: 90, dy: -50, type: "star" },
    { dx: -60, dy: 60, type: "star" },
    { dx: 60, dy: 60, type: "star" },
    { dx: 0, dy: -100, type: "star" },
  ],
};

/** SVG floating decoration element */
const SvgContextDecoration: React.FC<{
  x: number;
  y: number;
  type: string;
  floatX: number;
  floatY: number;
}> = ({ x, y, type, floatX, floatY }) => {
  const px = x + floatX;
  const py = y + floatY;
  switch (type) {
    case "heart":
      return (
        <svg style={{ position: "absolute", left: px - 14, top: py - 14, zIndex: 1, opacity: 0.7 }} width={28} height={28} viewBox="0 0 28 28">
          <path d="M14,24 Q2,16 2,9 Q2,2 8,2 Q14,2 14,8 Q14,2 20,2 Q26,2 26,9 Q26,16 14,24 Z" fill="#FF6B6B" />
        </svg>
      );
    case "teardrop":
      return (
        <svg style={{ position: "absolute", left: px - 10, top: py - 14, zIndex: 1, opacity: 0.6 }} width={20} height={28} viewBox="0 0 20 28">
          <path d="M10,0 Q10,0 4,12 Q0,18 0,21 Q0,28 10,28 Q20,28 20,21 Q20,18 16,12 Q10,0 10,0 Z" fill="#64B5F6" />
        </svg>
      );
    case "flame":
      return (
        <svg style={{ position: "absolute", left: px - 12, top: py - 16, zIndex: 1, opacity: 0.7 }} width={24} height={32} viewBox="0 0 24 32">
          <defs>
            <linearGradient id="flameGrad" x1="0.5" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#FF9800" />
              <stop offset="100%" stopColor="#F44336" />
            </linearGradient>
          </defs>
          <path d="M12,0 Q16,8 20,14 Q24,20 20,26 Q16,32 12,32 Q8,32 4,26 Q0,20 4,14 Q8,8 12,0 Z" fill="url(#flameGrad)" />
          <path d="M12,10 Q14,14 16,18 Q18,22 16,26 Q14,28 12,28 Q10,28 8,26 Q6,22 8,18 Q10,14 12,10 Z" fill="#FFEB3B" opacity={0.6} />
        </svg>
      );
    case "star":
      return (
        <svg style={{ position: "absolute", left: px - 12, top: py - 12, zIndex: 1, opacity: 0.7 }} width={24} height={24} viewBox="0 0 24 24">
          <defs>
            <filter id="starGlow">
              <feGaussianBlur stdDeviation={1.5} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M12,1 L14.5,8.5 L22,12 L14.5,15.5 L12,23 L9.5,15.5 L2,12 L9.5,8.5 Z" fill="#FFD700" filter="url(#starGlow)" />
        </svg>
      );
    default:
      return null;
  }
};

/** Floating emotion word bubbles in background */
const EmotionWordBubbles: React.FC<{
  width: number;
  height: number;
  frame: number;
  fps: number;
}> = ({ width, height, frame, fps }) => {
  const words = ["开心", "难过", "生气", "惊讶", "快乐", "微笑"];
  const positions = [
    { x: width * 0.08, y: height * 0.2 },
    { x: width * 0.85, y: height * 0.15 },
    { x: width * 0.12, y: height * 0.75 },
    { x: width * 0.82, y: height * 0.72 },
    { x: width * 0.5, y: height * 0.88 },
    { x: width * 0.35, y: height * 0.12 },
  ];
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width, height, zIndex: 0 }} viewBox={`0 0 ${width} ${height}`}>
      {positions.map((pos, i) => {
        const floatY = Math.sin((frame / fps) * 1.5 + i * 1.1) * 10;
        const floatX = Math.cos((frame / fps) * 1.2 + i * 0.9) * 6;
        const opacity = 0.12 + Math.sin((frame / fps) * 0.8 + i) * 0.04;
        return (
          <g key={i} transform={`translate(${pos.x + floatX}, ${pos.y + floatY})`}>
            <rect x={-30} y={-14} width={60} height={28} rx={14} fill={PALETTE.dark} opacity={opacity} />
            <text x={0} y={4} textAnchor="middle" fontFamily={FONT_FAMILY} fontSize={14} fontWeight={700} fill="white" opacity={opacity + 0.1}>
              {words[i % words.length]}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const EmotionFacesScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: EmotionFacesParams = data.animationTemplate?.params ?? {};
  const emotions = params.emotions?.length ? params.emotions : ["happy", "sad", "angry", "surprised"];
  const speed = params.transitionSpeed ?? 1;

  const centerX = width / 2;
  const centerY = height * 0.42;

  // Each emotion cycle: 2s display = 60 frames at 30fps, divided by speed
  const cycleFrames = Math.round(60 / speed);
  const transitionFrames = Math.round(9 / speed); // 0.3s for scale transitions

  // Current emotion index (loops)
  const rawIdx = Math.floor(frame / cycleFrames);
  const emotionIdx = rawIdx % emotions.length;
  const cycleFrame = frame % cycleFrames;

  const emotion = emotions[emotionIdx];
  const emotionData = EMOTION_MAP[emotion] ?? EMOTION_MAP["happy"];

  // Scale animation: 1 → 0 → swap → 0 → 1 within each cycle
  const halfTransition = Math.floor(transitionFrames / 2);
  let scale = 1;
  if (cycleFrame < halfTransition) {
    scale = interpolate(cycleFrame, [0, halfTransition], [1, 0]);
  } else if (cycleFrame < transitionFrames) {
    scale = interpolate(cycleFrame, [halfTransition, transitionFrames], [0, 1]);
  } else if (cycleFrame > cycleFrames - halfTransition) {
    scale = interpolate(cycleFrame, [cycleFrames - halfTransition, cycleFrames], [1, 0]);
  }

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Label entrance
  const labelScale = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Context SVG decorations
  const contextSvgs = CONTEXT_SVGS[emotion] ?? CONTEXT_SVGS["happy"];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Floating emotion word bubbles */}
      <EmotionWordBubbles width={width} height={height} frame={frame} fps={fps} />

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

      {/* Context SVG decorations */}
      {contextSvgs.map((ce, i) => {
        const floatY = Math.sin((frame / fps) * 2 + i * 1.2) * 12;
        const floatX = Math.cos((frame / fps) * 1.5 + i * 0.8) * 8;
        return (
          <SvgContextDecoration
            key={`${emotion}-${i}`}
            x={centerX + ce.dx}
            y={centerY + ce.dy}
            type={ce.type}
            floatX={floatX}
            floatY={floatY}
          />
        );
      })}

      {/* Main emotion face - SVG drawn */}
      <SvgEmotionFace
        cx={100}
        cy={100}
        size={200}
        emotion={emotion}
        scale={scale}
      />

      {/* Emotion label */}
      <div
        style={{
          position: "absolute",
          top: centerY + 120,
          left: 0,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.chineseChar,
          fontWeight: 900,
          color: data.accentColor,
          transform: `scale(${labelScale})`,
          zIndex: 3,
          textShadow: `0 2px 12px ${data.accentColor}33`,
        }}
      >
        {emotionData.label}
      </div>

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.06,
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
