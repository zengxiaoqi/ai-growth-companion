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

const EMOTION_MAP: Record<string, { emoji: string; label: string }> = {
  happy: { emoji: "😊", label: "开心" },
  sad: { emoji: "😢", label: "难过" },
  angry: { emoji: "😠", label: "生气" },
  surprised: { emoji: "😲", label: "惊讶" },
};

type ContextEmoji = { emoji: string; dx: number; dy: number };

const CONTEXT_EMOJIS: Record<string, ContextEmoji[]> = {
  happy: [
    { emoji: "❤️", dx: -100, dy: -60 },
    { emoji: "❤️", dx: 110, dy: -40 },
    { emoji: "❤️", dx: -70, dy: 50 },
    { emoji: "❤️", dx: 90, dy: 70 },
    { emoji: "❤️", dx: 0, dy: -90 },
  ],
  sad: [
    { emoji: "💧", dx: -80, dy: -70 },
    { emoji: "💧", dx: 60, dy: -50 },
    { emoji: "💧", dx: -40, dy: -90 },
    { emoji: "💧", dx: 100, dy: -30 },
    { emoji: "💧", dx: 20, dy: -100 },
  ],
  angry: [
    { emoji: "🔥", dx: -120, dy: 0 },
    { emoji: "🔥", dx: 120, dy: 0 },
    { emoji: "🔥", dx: -90, dy: -40 },
    { emoji: "🔥", dx: 90, dy: -40 },
  ],
  surprised: [
    { emoji: "⭐", dx: -90, dy: -50 },
    { emoji: "⭐", dx: 90, dy: -50 },
    { emoji: "⭐", dx: -60, dy: 60 },
    { emoji: "⭐", dx: 60, dy: 60 },
    { emoji: "⭐", dx: 0, dy: -100 },
  ],
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

  // Context emoji floating offset
  const contextEmojis = CONTEXT_EMOJIS[emotion] ?? CONTEXT_EMOJIS["happy"];

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

      {/* Context emojis */}
      {contextEmojis.map((ce, i) => {
        const floatY = Math.sin((frame / fps) * 2 + i * 1.2) * 12;
        const floatX = Math.cos((frame / fps) * 1.5 + i * 0.8) * 8;
        return (
          <div
            key={`${emotion}-${i}`}
            style={{
              position: "absolute",
              left: centerX + ce.dx - 16 + floatX,
              top: centerY + ce.dy - 16 + floatY,
              fontSize: 32,
              zIndex: 1,
              opacity: 0.7,
              userSelect: "none",
            }}
          >
            {ce.emoji}
          </div>
        );
      })}

      {/* Main emotion face */}
      <div
        style={{
          position: "absolute",
          left: centerX - 100,
          top: centerY - 100,
          width: 200,
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 200,
          lineHeight: 1,
          transform: `scale(${scale})`,
          zIndex: 3,
          userSelect: "none",
        }}
      >
        {emotionData.emoji}
      </div>

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
