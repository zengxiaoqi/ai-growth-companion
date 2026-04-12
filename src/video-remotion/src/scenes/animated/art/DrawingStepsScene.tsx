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
const STEP_EMOJIS = ["⭕", "👀", "👄", "🎨"];

export const DrawingStepsScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: DrawingStepsParams = data.animationTemplate?.params ?? {};
  const steps = params.steps?.length ? params.steps : DEFAULT_STEPS;
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

      {/* Step indicator */}
      <div
        style={{
          position: "absolute",
          top: canvasTop - 36,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 26,
          fontWeight: 700,
          color: PALETTE.dark,
          opacity: currentStep >= 0 ? 1 : 0,
          zIndex: 2,
        }}
      >
        步骤 {Math.min(currentStep + 1, totalSteps)}/{totalSteps}
      </div>

      {/* Canvas area */}
      <div
        style={{
          position: "absolute",
          left: canvasLeft,
          top: canvasTop,
          width: canvasW,
          height: canvasH,
          borderRadius: 20,
          backgroundColor: PALETTE.white,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          zIndex: 1,
        }}
      />

      {/* Step items inside canvas */}
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
              top: canvasTop + row * cellH,
              width: cellW,
              height: cellH,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transform: `translateY(${stepY}px)`,
              opacity: stepOpacity,
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 56, lineHeight: 1, userSelect: "none" }}>
              {STEP_EMOJIS[idx % STEP_EMOJIS.length]}
            </div>
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 22,
                fontWeight: 700,
                color: data.accentColor,
                marginTop: 6,
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

      {/* Completion label */}
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
            zIndex: 3,
            textShadow: `0 2px 12px ${data.accentColor}44`,
            whiteSpace: "nowrap",
          }}
        >
          完成! 🎉
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
