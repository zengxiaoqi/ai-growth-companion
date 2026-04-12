import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { SPRING_CONFIGS } from "../theme/animations";
import { PALETTE } from "../theme/colors";
import { FONT_FAMILY, FONT_SIZES } from "../theme/fonts";
import { BackgroundBubbles } from "../components/BackgroundBubbles";
import { AnimatedSceneRouter } from "./animated/AnimatedSceneRouter";
import type { TeachingSlide } from "../data/topic-video";

type SlideSceneProps = {
  data: TeachingSlide;
  index: number;
};

export const HeroLayout: React.FC<{ data: TeachingSlide }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const emojiEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy });
  const emojiScale = interpolate(emojiEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const emojiRotate = interpolate(emojiEntrance, [0, 1], [-20, 0], { extrapolateRight: "clamp" });

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 10 });
  const titleY = interpolate(titleEntrance, [0, 1], [30, 0], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const subtitleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 20 });
  const subtitleOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const itemsEntrance = spring({ frame, fps, config: SPRING_CONFIGS.gentle, delay: 35 });
  const itemsOpacity = interpolate(itemsEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {data.emoji && (
        <div
          style={{
            fontSize: 120,
            lineHeight: 1,
            transform: `scale(${emojiScale}) rotate(${emojiRotate}deg)`,
            userSelect: "none",
          }}
        >
          {data.emoji}
        </div>
      )}

      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.chineseChar,
          fontWeight: 900,
          color: data.accentColor,
          marginTop: 16,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      {data.subtitle && (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.label,
            fontWeight: 700,
            color: PALETTE.dark,
            opacity: subtitleOpacity * 0.7,
            marginTop: 8,
          }}
        >
          {data.subtitle}
        </div>
      )}

      {data.items && data.items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 24,
            opacity: itemsOpacity,
          }}
        >
          {data.items.map((item, i) => {
            const itemDelay = 35 + i * 8;
            const itemSpring = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: itemDelay });
            const itemScale = interpolate(itemSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  transform: `scale(${itemScale})`,
                }}
              >
                <div style={{ fontSize: 48, lineHeight: 1 }}>{item.emoji}</div>
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 20,
                    fontWeight: 700,
                    color: data.accentColor,
                  }}
                >
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

const GridLayout: React.FC<{ data: TeachingSlide }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const items = data.items || [];
  const cols = Math.min(items.length, 4);
  const itemSize = items.length <= 4 ? 80 : 64;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 52,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          marginBottom: 32,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${itemSize}px)`,
          gap: 16,
          justifyContent: "center",
        }}
      >
        {items.map((item, i) => {
          const itemSpring = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 10 + i * 8 });
          const itemScale = interpolate(itemSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                transform: `scale(${itemScale})`,
              }}
            >
              <div style={{ fontSize: itemSize * 0.7, lineHeight: 1 }}>{item.emoji}</div>
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 18,
                  fontWeight: 700,
                  color: data.accentColor,
                }}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ListLayout: React.FC<{ data: TeachingSlide }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const items = data.items || [];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {data.emoji && (
        <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 12 }}>{data.emoji}</div>
      )}

      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          opacity: titleOpacity,
          marginBottom: 28,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 400 }}>
        {items.map((item, i) => {
          const itemSpring = spring({ frame, fps, config: SPRING_CONFIGS.gentle, delay: 15 + i * 10 });
          const itemX = interpolate(itemSpring, [0, 1], [-40, 0], { extrapolateRight: "clamp" });
          const itemOpacity = interpolate(itemSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: itemOpacity,
                transform: `translateX(${itemX}px)`,
                padding: "8px 16px",
                borderRadius: 12,
                backgroundColor: `${data.accentColor}15`,
              }}
            >
              <div style={{ fontSize: 32, lineHeight: 1 }}>{item.emoji}</div>
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 24,
                  fontWeight: 700,
                  color: PALETTE.dark,
                }}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const SlideScene: React.FC<SlideSceneProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Delegate to animated scene router when animationTemplate is present
  if (data.animationTemplate) {
    return <AnimatedSceneRouter data={data} />;
  }

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data.bgColor,
        opacity: bgOpacity,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
        {data.layout === "hero" && <HeroLayout data={data} />}
        {data.layout === "grid" && <GridLayout data={data} />}
        {data.layout === "list" && <ListLayout data={data} />}
      </div>
    </AbsoluteFill>
  );
};
