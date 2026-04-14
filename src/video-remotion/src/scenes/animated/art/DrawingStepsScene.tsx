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

type DrawingStepsParams = {
  steps?: string[];
  lineColor?: string;
};

const DEFAULT_STEPS = ["画圆", "加眼睛", "加嘴巴", "画完成"];

/** SVG icon components for each step (replacing emoji) */
const SvgCircleIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={56} height={56} viewBox="0 0 56 56">
    <defs>
      <filter id="circleIconShadow">
        <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#00000022" />
      </filter>
    </defs>
    <circle cx={28} cy={28} r={22} fill="none" stroke={color} strokeWidth={3.5} filter="url(#circleIconShadow)" />
    <circle cx={28} cy={28} r={22} fill={`${color}11`} />
  </svg>
);

const SvgEyesIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={56} height={56} viewBox="0 0 56 56">
    <defs>
      <filter id="eyesShadow">
        <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#00000022" />
      </filter>
    </defs>
    {/* Left eye */}
    <ellipse cx={18} cy={24} rx={8} ry={10} fill="white" stroke={color} strokeWidth={2} filter="url(#eyesShadow)" />
    <circle cx={19} cy={25} r={4} fill={color} />
    <circle cx={20} cy={23} r={1.5} fill="white" />
    {/* Right eye */}
    <ellipse cx={38} cy={24} rx={8} ry={10} fill="white" stroke={color} strokeWidth={2} />
    <circle cx={39} cy={25} r={4} fill={color} />
    <circle cx={40} cy={23} r={1.5} fill="white" />
  </svg>
);

const SvgMouthIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={56} height={56} viewBox="0 0 56 56">
    <defs>
      <filter id="mouthShadow">
        <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#00000022" />
      </filter>
    </defs>
    {/* Happy mouth curve */}
    <path
      d="M14,28 Q28,44 42,28"
      fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
      filter="url(#mouthShadow)"
    />
    {/* Little tongue */}
    <ellipse cx={28} cy={36} rx={6} ry={4} fill="#FF8A80" />
  </svg>
);

const SvgPaletteCompleteIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={56} height={56} viewBox="0 0 56 56">
    <defs>
      <filter id="completeGlow">
        <feGaussianBlur stdDeviation={2} result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Mini palette shape */}
    <path
      d="M8,28 Q8,8 28,8 Q48,8 48,28 Q48,48 28,48 Q18,48 14,40 Q10,34 8,28 Z"
      fill="#F5DEB3" stroke="#D2B48C" strokeWidth={1.5}
    />
    {/* Color dots on palette */}
    <circle cx={22} cy={22} r={4} fill="#FF6B6B" />
    <circle cx={34} cy={22} r={4} fill="#4D96FF" />
    <circle cx={28} cy={34} r={4} fill="#6BCB77" />
    <circle cx={18} cy={32} r={3} fill="#FFD93D" />
    {/* Sparkle on top */}
    <path
      d="M40,12 L41.5,16 L46,17 L41.5,18 L40,22 L38.5,18 L34,17 L38.5,16 Z"
      fill="#FFD700" filter="url(#completeGlow)"
    />
  </svg>
);

/** SVG pencil that "draws" */
const SvgPencil: React.FC<{ x: number; y: number; rotation: number; opacity: number }> = ({
  x, y, rotation, opacity,
}) => (
  <svg
    style={{ position: "absolute", left: x - 8, top: y - 50, transform: `rotate(${rotation}deg)`, opacity, zIndex: 5 }}
    width={16} height={100} viewBox="0 0 16 100"
  >
    <defs>
      <linearGradient id="pencilBody" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FFD93D" />
        <stop offset="50%" stopColor="#FFE566" />
        <stop offset="100%" stopColor="#FFD93D" />
      </linearGradient>
    </defs>
    {/* Eraser */}
    <rect x={3} y={0} width={10} height={12} rx={2} fill="#FF8A80" />
    {/* Ferrule */}
    <rect x={2} y={10} width={12} height={8} fill="#C0C0C0" />
    <line x1={4} y1={12} x2={4} y2={18} stroke="#A0A0A0" strokeWidth={0.5} />
    <line x1={8} y1={12} x2={8} y2={18} stroke="#A0A0A0" strokeWidth={0.5} />
    <line x1={12} y1={12} x2={12} y2={18} stroke="#A0A0A0" strokeWidth={0.5} />
    {/* Body */}
    <rect x={2} y={18} width={12} height={62} fill="url(#pencilBody)" />
    {/* Tip */}
    <polygon points="2,80 14,80 8,98" fill="#DEB887" />
    <polygon points="5,86 11,86 8,98" fill="#333" />
  </svg>
);

/** SVG canvas background with texture */
const SvgCanvas: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  <svg
    style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}
    width={width} height={height}
    viewBox={`0 0 ${width} ${height}`}
  >
    <defs>
      <filter id="paperTexture">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={4} result="noise" />
        <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
        <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" />
      </filter>
    </defs>
    <rect x={0} y={0} width={width} height={height} rx={20} fill="white" filter="url(#paperTexture)" />
    {/* Subtle grid dots for drawing paper look */}
    {Array.from({ length: Math.floor(width / 30) }).map((_, col) =>
      Array.from({ length: Math.floor(height / 30) }).map((_, row) => (
        <circle key={`dot-${col}-${row}`} cx={15 + col * 30} cy={15 + row * 30} r={0.8} fill="#E0E0E0" />
      ))
    )}
  </svg>
);

/** SVG step indicator circles */
const StepIndicators: React.FC<{ totalSteps: number; currentStep: number; accentColor: string }> = ({
  totalSteps, currentStep, accentColor,
}) => {
  const size = 36;
  const gap = 12;
  const totalWidth = totalSteps * size + (totalSteps - 1) * gap;
  return (
    <svg width={totalWidth} height={size} viewBox={`0 0 ${totalWidth} ${size}`}>
      {Array.from({ length: totalSteps }).map((_, i) => {
        const cx = i * (size + gap) + size / 2;
        const isActive = i <= currentStep;
        const isCurrent = i === currentStep;
        return (
          <g key={i}>
            <circle
              cx={cx} cy={size / 2} r={size / 2 - 2}
              fill={isActive ? accentColor : "#E8E8E8"}
              stroke={isCurrent ? accentColor : "#D0D0D0"}
              strokeWidth={isCurrent ? 3 : 1.5}
            />
            {/* Step number */}
            <text
              x={cx} y={size / 2 + 5}
              textAnchor="middle"
              fontFamily={FONT_FAMILY}
              fontSize={14}
              fontWeight={700}
              fill={isActive ? "white" : "#999"}
            >
              {i + 1}
            </text>
            {/* Checkmark for completed steps */}
            {i < currentStep && (
              <path
                d={`M${cx - 6},${size / 2} L${cx - 2},${size / 2 + 5} L${cx + 7},${size / 2 - 5}`}
                fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** SVG confetti for completion */
const ConfettiBurst: React.FC<{ opacity: number; scale: number; width: number; height: number; frame: number; fps: number }> = ({
  opacity, scale, width, height, frame, fps,
}) => {
  const pieces = [
    { x: width * 0.3, y: height * 0.2, color: "#FF6B6B", r: -30, size: 8 },
    { x: width * 0.5, y: height * 0.15, color: "#FFD93D", r: 45, size: 10 },
    { x: width * 0.7, y: height * 0.2, color: "#4D96FF", r: 15, size: 7 },
    { x: width * 0.35, y: height * 0.25, color: "#6BCB77", r: -60, size: 9 },
    { x: width * 0.65, y: height * 0.25, color: "#FF6B9D", r: 70, size: 8 },
    { x: width * 0.4, y: height * 0.18, color: "#9C27B0", r: -20, size: 6 },
    { x: width * 0.6, y: height * 0.22, color: "#FF9800", r: 50, size: 7 },
  ];
  const floatOffset = Math.sin((frame / fps) * Math.PI * 2) * 5;
  return (
    <svg
      style={{ position: "absolute", left: 0, top: 0, width, height, zIndex: 6, opacity, transform: `scale(${scale})`, pointerEvents: "none" }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {pieces.map((p, i) => (
        <g key={i} transform={`translate(${p.x}, ${p.y + floatOffset * (i % 2 === 0 ? 1 : -1)}) rotate(${p.r + frame * 2})`}>
          <rect x={-p.size / 2} y={-p.size / 4} width={p.size} height={p.size / 2} rx={1} fill={p.color} />
        </g>
      ))}
    </svg>
  );
};

export const DrawingStepsScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: DrawingStepsParams = data.animationTemplate?.params ?? {};
  const steps = params.steps?.length ? params.steps : DEFAULT_STEPS;
  const lineColor = params.lineColor ?? data.accentColor;
  const totalSteps = steps.length;

  // Each step takes 1.5s (45 frames at 30fps), first step starts at frame 20
  const stepDuration = 45;
  const startOffset = 20;
  const stepForFrame = (idx: number) => startOffset + idx * stepDuration;

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Canvas area dimensions
  const canvasW = width * 0.6;
  const canvasH = height * 0.45;
  const canvasLeft = (width - canvasW) / 2;
  const canvasTop = height * 0.2;

  // Determine current step index
  const currentStep = Math.min(
    totalSteps - 1,
    Math.max(-1, Math.floor((frame - startOffset) / stepDuration)),
  );

  // Progress bar fills as steps complete
  const progressWidth = interpolate(
    frame,
    [startOffset, stepForFrame(totalSteps - 1) + stepDuration],
    [0, canvasW],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Completion animation
  const allDoneFrame = stepForFrame(totalSteps - 1) + stepDuration * 0.6;
  const doneSpring = spring({
    frame: Math.max(0, frame - allDoneFrame),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
  const doneOpacity = interpolate(doneSpring, [0, 1], [0, 1]);

  // Pencil position - follows current drawing step
  const pencilStepFrame = currentStep >= 0 ? stepForFrame(currentStep) : 0;
  const pencilProgress = currentStep >= 0
    ? interpolate(frame, [pencilStepFrame, pencilStepFrame + stepDuration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const pencilX = canvasLeft + canvasW * 0.2 + pencilProgress * canvasW * 0.6;
  const pencilY = canvasTop + canvasH * 0.3 + Math.sin(pencilProgress * Math.PI) * canvasH * 0.2;
  const pencilRotation = interpolate(pencilProgress, [0, 0.5, 1], [-20, -10, -20]);
  const pencilOpacity = currentStep >= 0 && !doneOpacity ? 0.9 : 0;

  // SVG step icons
  const stepIcons: React.ReactNode[] = [
    <SvgCircleIcon key="circle" color={lineColor} />,
    <SvgEyesIcon key="eyes" color={lineColor} />,
    <SvgMouthIcon key="mouth" color={lineColor} />,
    <SvgPaletteCompleteIcon key="complete" color={lineColor} />,
  ];

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

      {/* Step indicator - SVG circles with numbers */}
      <div
        style={{
          position: "absolute",
          top: canvasTop - 46,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <StepIndicators
          totalSteps={totalSteps}
          currentStep={Math.max(0, currentStep)}
          accentColor={data.accentColor}
        />
      </div>

      {/* Canvas with SVG texture */}
      <div
        style={{
          position: "absolute",
          left: canvasLeft,
          top: canvasTop,
          width: canvasW,
          height: canvasH,
          borderRadius: 20,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <SvgCanvas width={canvasW} height={canvasH} />
      </div>

      {/* Pencil drawing indicator */}
      {pencilOpacity > 0 && (
        <SvgPencil x={pencilX} y={pencilY} rotation={pencilRotation} opacity={pencilOpacity} />
      )}

      {/* Animated drawing lines using stroke-dasharray */}
      <svg
        style={{ position: "absolute", left: canvasLeft, top: canvasTop, zIndex: 2 }}
        width={canvasW} height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
      >
        {steps.map((_, idx) => {
          const appearFrame = stepForFrame(idx);
          if (frame < appearFrame) return null;

          const drawProgress = interpolate(
            frame,
            [appearFrame, appearFrame + stepDuration * 0.7],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          // Each step draws a different shape
          const cx = canvasW / 2;
          const cy = canvasH / 2;
          const stepPaths: string[] = [
            // Step 0: Circle
            `M${cx - 40},${cy} A40,40 0 1,1 ${cx - 40},${cy - 0.01} Z`,
            // Step 1: Left eye
            `M${cx - 22},${cy - 15} A8,10 0 1,1 ${cx - 22},${cy - 15.01} Z`,
            // Step 1: Right eye
            `M${cx + 8},${cy - 15} A8,10 0 1,1 ${cx + 8},${cy - 15.01} Z`,
            // Step 2: Mouth
            `M${cx - 20},${cy + 8} Q${cx},${cy + 28} ${cx + 20},${cy + 8}`,
          ];

          if (idx === 0) {
            // Draw circle outline
            const pathLen = 260;
            return (
              <path
                key={`draw-${idx}`}
                d={stepPaths[0]}
                fill="none"
                stroke={lineColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={pathLen}
                strokeDashoffset={pathLen * (1 - drawProgress)}
              />
            );
          }
          if (idx === 1) {
            // Draw eyes
            const eyeLen = 60;
            return (
              <g key={`draw-${idx}`}>
                <path
                  d={stepPaths[1]}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  strokeDasharray={eyeLen}
                  strokeDashoffset={eyeLen * (1 - drawProgress)}
                />
                <path
                  d={stepPaths[2]}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  strokeDasharray={eyeLen}
                  strokeDashoffset={eyeLen * (1 - drawProgress)}
                />
                {/* Pupils appear after eyes drawn */}
                {drawProgress > 0.7 && (
                  <>
                    <circle cx={cx - 14} cy={cy - 13} r={3} fill={lineColor} opacity={interpolate(drawProgress, [0.7, 1], [0, 1])} />
                    <circle cx={cx + 16} cy={cy - 13} r={3} fill={lineColor} opacity={interpolate(drawProgress, [0.7, 1], [0, 1])} />
                  </>
                )}
              </g>
            );
          }
          if (idx === 2) {
            // Draw mouth
            const mouthLen = 65;
            return (
              <path
                key={`draw-${idx}`}
                d={stepPaths[3]}
                fill="none"
                stroke={lineColor}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={mouthLen}
                strokeDashoffset={mouthLen * (1 - drawProgress)}
              />
            );
          }
          return null;
        })}
      </svg>

      {/* Step items inside canvas - using SVG icons instead of emoji */}
      {steps.map((step, idx) => {
        const appearFrame = stepForFrame(idx);
        if (frame < appearFrame) return null;

        const stepSpring = spring({
          frame: Math.max(0, frame - appearFrame),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });
        const stepY = interpolate(stepSpring, [0, 1], [40, 0]);
        const stepOpacity = interpolate(stepSpring, [0, 1], [0, 1]);

        const cols = Math.min(totalSteps, 3);
        const rows = Math.ceil(totalSteps / cols);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellW = canvasW / cols;
        const cellH = canvasH / rows;

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: canvasLeft + col * cellW,
              top: canvasTop + row * cellH + 30,
              width: cellW,
              height: cellH,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transform: `translateY(${stepY}px)`,
              opacity: stepOpacity,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            {stepIcons[idx % stepIcons.length]}
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 18,
                fontWeight: 700,
                color: data.accentColor,
                marginTop: 2,
              }}
            >
              {step}
            </div>
          </div>
        );
      })}

      {/* Progress bar background */}
      <div
        style={{
          position: "absolute",
          left: canvasLeft,
          top: canvasTop + canvasH + 20,
          width: canvasW,
          height: 10,
          borderRadius: 5,
          backgroundColor: "rgba(0,0,0,0.08)",
          zIndex: 2,
        }}
      />
      {/* Progress bar fill */}
      <div
        style={{
          position: "absolute",
          left: canvasLeft,
          top: canvasTop + canvasH + 20,
          width: progressWidth,
          height: 10,
          borderRadius: 5,
          backgroundColor: data.accentColor,
          zIndex: 3,
        }}
      />

      {/* SVG color picker showing current drawing color */}
      <svg
        style={{ position: "absolute", left: canvasLeft + canvasW + 16, top: canvasTop + 20, zIndex: 3 }}
        width={40} height={40} viewBox="0 0 40 40"
      >
        <circle cx={20} cy={20} r={16} fill="white" stroke="#E0E0E0" strokeWidth={1.5} />
        <circle cx={20} cy={20} r={12} fill={lineColor} />
        <circle cx={16} cy={16} r={3} fill="white" opacity={0.4} />
      </svg>

      {/* Completion - SVG confetti instead of emoji */}
      {doneOpacity > 0 && (
        <ConfettiBurst
          opacity={doneOpacity}
          scale={doneSpring}
          width={width}
          height={height}
          frame={frame}
          fps={fps}
        />
      )}
      {doneOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: canvasLeft + canvasW / 2,
            top: canvasTop + canvasH + 50,
            transform: `translate(-50%, 0) scale(${doneSpring})`,
            fontFamily: FONT_FAMILY,
            fontSize: 40,
            fontWeight: 900,
            color: data.accentColor,
            opacity: doneOpacity,
            zIndex: 7,
            textShadow: `0 2px 12px ${data.accentColor}44`,
            whiteSpace: "nowrap",
          }}
        >
          完成!
        </div>
      )}

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
