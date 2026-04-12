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
import { pulseScale, staggerDelay } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type DailyRoutineParams = {
  activities?: string[];
  highlightIndex?: number;
};

const DEFAULT_ACTIVITIES = ["起床", "吃饭", "学习", "玩耍", "睡觉"];
const ACTIVITY_EMOJIS = ["🌅", "🍚", "📖", "⚽", "🌙"];
const TIME_LABELS = ["早上", "上午", "中午", "下午", "晚上"];

export const DailyRoutineScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: DailyRoutineParams = data.animationTemplate?.params ?? {};
  const activities = params.activities?.length ? params.activities : DEFAULT_ACTIVITIES;
  const highlightIndex = params.highlightIndex ?? -1;
  const total = activities.length;

  const centerY = height * 0.5;
  const timelineStartX = width * 0.12;
  const timelineEndX = width * 0.88;
  const timelineLen = timelineEndX - timelineStartX;
  const spacing = timelineLen / (total - 1);

  // Auto-cycle: move highlight through activities over time
  const cycleFramesPerActivity = Math.round(90 / total);
  const autoHighlight =
    highlightIndex >= 0
      ? highlightIndex
      : Math.min(total - 1, Math.floor(frame / cycleFramesPerActivity));

  // Glowing dot position
  const dotTargetX = timelineStartX + autoHighlight * spacing;
  const dotSpring = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.smooth,
  });
  const dotX = interpolate(dotSpring, [0, 1], [timelineStartX, dotTargetX]);

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Timeline line entrance
  const lineProgress = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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

      {/* Timeline background line */}
      <div
        style={{
          position: "absolute",
          left: timelineStartX,
          top: centerY,
          width: timelineLen,
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(0,0,0,0.1)",
          zIndex: 1,
        }}
      />

      {/* Timeline progress fill */}
      <div
        style={{
          position: "absolute",
          left: timelineStartX,
          top: centerY,
          width: timelineLen * lineProgress,
          height: 4,
          borderRadius: 2,
          backgroundColor: data.accentColor,
          zIndex: 2,
        }}
      />

      {/* Activity nodes */}
      {activities.map((activity, idx) => {
        const x = timelineStartX + idx * spacing;
        const isPast = idx < autoHighlight;
        const isCurrent = idx === autoHighlight;
        const isFuture = idx > autoHighlight;
        const opacity = isPast ? 0.5 : isCurrent ? 1 : 0.7;

        // Zoom effect for current activity
        const currentScale = isCurrent
          ? 1 + interpolate(
              spring({
                frame: Math.max(0, frame - idx * cycleFramesPerActivity),
                fps,
                config: SPRING_CONFIGS.bouncy,
              }),
              [0, 1],
              [0, 0.3],
            )
          : 1;

        // Entrance spring
        const entranceDelay = staggerDelay(idx, 10, 8);
        const entranceSpring = spring({
          frame,
          fps,
          config: SPRING_CONFIGS.bouncy,
          delay: entranceDelay,
        });
        const entranceY = interpolate(entranceSpring, [0, 1], [30, 0]);
        const entranceOpacity = interpolate(entranceSpring, [0, 1], [0, 1]);

        const emoji = ACTIVITY_EMOJIS[idx % ACTIVITY_EMOJIS.length];
        const timeLabel = TIME_LABELS[idx % TIME_LABELS.length];

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: x - 40,
              top: centerY - 70 + entranceY,
              width: 80,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: entranceOpacity * opacity,
              transform: `scale(${currentScale})`,
              zIndex: isCurrent ? 4 : 3,
            }}
          >
            {/* Time label */}
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 16,
                fontWeight: 700,
                color: PALETTE.dark,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              {timeLabel}
            </div>

            {/* Emoji */}
            <div style={{ fontSize: 42, lineHeight: 1, userSelect: "none" }}>
              {emoji}
            </div>

            {/* Activity label */}
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 20,
                fontWeight: 700,
                color: isCurrent ? data.accentColor : PALETTE.dark,
                marginTop: 4,
                textShadow: isCurrent
                  ? `0 2px 8px ${data.accentColor}33`
                  : "none",
              }}
            >
              {activity}
            </div>
          </div>
        );
      })}

      {/* Glowing dot */}
      <div
        style={{
          position: "absolute",
          left: dotX - 10,
          top: centerY - 10,
          width: 20,
          height: 20,
          borderRadius: "50%",
          backgroundColor: data.accentColor,
          boxShadow: `0 0 16px ${data.accentColor}88, 0 0 32px ${data.accentColor}44`,
          transform: `scale(${pulseScale(frame, fps, 2, 0.15, 1)})`,
          zIndex: 5,
        }}
      />

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
