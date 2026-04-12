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
import { staggerDelay, resolveEmoji } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type StorySceneParams = {
  bgType?: "day" | "night" | "indoor";
  characters?: string[];
  items?: string[];
};

type BgConfig = {
  skyColor: string;
  groundColor: string;
  groundY: number; // fraction of height where ground starts
  emoji?: string;
  emojiX?: number;
  emojiY?: number;
};

const BG_CONFIGS: Record<string, BgConfig> = {
  day: {
    skyColor: "#87CEEB",
    groundColor: "#7BC67E",
    groundY: 0.72,
    emoji: "☀️",
    emojiX: 0.85,
    emojiY: 0.12,
  },
  night: {
    skyColor: "#1B2838",
    groundColor: "#2D4A2D",
    groundY: 0.72,
    emoji: "🌙",
    emojiX: 0.82,
    emojiY: 0.1,
  },
  indoor: {
    skyColor: "#FFF3E0",
    groundColor: "#D7CCC8",
    groundY: 0.78,
  },
};

export const StorySceneScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: StorySceneParams = data.animationTemplate?.params ?? {};
  const bgType = params.bgType || "day";
  const characters = params.characters?.length
    ? params.characters
    : [data.emoji || "👦"];
  const items = params.items?.length ? params.items : ["🌳", "🏠"];

  const bgConfig = BG_CONFIGS[bgType] || BG_CONFIGS["day"];

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Character movement: slide left and right
  const charBaseX = width * 0.35;
  const charSlideX = interpolate(
    frame,
    [0, 90, 180],
    [0, 80, 0],
    { extrapolateRight: "clamp" },
  );

  // Speech bubble text (first 20 chars of narration)
  const speechText = (data.narration || "").slice(0, 20);
  const speechOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const speechScale = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Stars for night mode
  const nightStars =
    bgType === "night"
      ? Array.from({ length: 8 }).map((_, i) => ({
          x: 0.05 + (i * 0.12) % 0.9,
          y: 0.05 + ((i * 0.17 + 0.03) % 0.55),
          size: 14 + (i % 3) * 6,
        }))
      : [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgConfig.skyColor,
        overflow: "hidden",
      }}
    >
      <BackgroundBubbles width={width} height={height} />

      {/* Sky emoji (sun/moon) */}
      {bgConfig.emoji && (
        <div
          style={{
            position: "absolute",
            left: (bgConfig.emojiX ?? 0.8) * width - 24,
            top: (bgConfig.emojiY ?? 0.1) * height - 24,
            fontSize: 48,
            zIndex: 1,
            userSelect: "none",
          }}
        >
          {bgConfig.emoji}
        </div>
      )}

      {/* Night stars */}
      {nightStars.map((star, i) => {
        const twinkle = interpolate(
          (Math.sin((frame / fps) * 2 + i * 1.5) + 1) / 2,
          [0, 1],
          [0.3, 1],
        );
        return (
          <div
            key={`star-${i}`}
            style={{
              position: "absolute",
              left: star.x * width,
              top: star.y * height,
              fontSize: star.size,
              opacity: twinkle,
              zIndex: 1,
              userSelect: "none",
            }}
          >
            ⭐
          </div>
        );
      })}

      {/* Indoor roof shape */}
      {bgType === "indoor" && (
        <div
          style={{
            position: "absolute",
            left: width * 0.15,
            top: -10,
            width: 0,
            height: 0,
            borderLeft: `${width * 0.35}px solid transparent`,
            borderRight: `${width * 0.35}px solid transparent`,
            borderBottom: `60px solid #A1887F`,
            zIndex: 1,
          }}
        />
      )}

      {/* Ground */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: bgConfig.groundY * height,
          width: "100%",
          height: height * (1 - bgConfig.groundY),
          backgroundColor: bgConfig.groundColor,
          zIndex: 1,
        }}
      />

      {/* Scene items with staggered entrance */}
      {items.map((item, i) => {
        const itemX = width * (0.15 + i * 0.25);
        const itemY = bgConfig.groundY * height - 40;
        const entranceDelay = staggerDelay(i, 20, 10);
        const itemSpring = spring({
          frame: Math.max(0, frame - entranceDelay),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });
        const itemYOffset = interpolate(itemSpring, [0, 1], [40, 0]);

        return (
          <div
            key={`item-${i}`}
            style={{
              position: "absolute",
              left: itemX,
              top: itemY + itemYOffset,
              fontSize: 52,
              opacity: itemSpring,
              transform: `scale(${itemSpring})`,
              zIndex: 2,
              userSelect: "none",
            }}
          >
            {resolveEmoji(item)}
          </div>
        );
      })}

      {/* Characters on ground */}
      {characters.map((char, i) => {
        const baseX = charBaseX + i * 70 + charSlideX;
        const charY = bgConfig.groundY * height - 50;
        const charEntrance = spring({
          frame: Math.max(0, frame - 10),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });

        return (
          <div
            key={`char-${i}`}
            style={{
              position: "absolute",
              left: baseX,
              top: charY,
              fontSize: 56,
              opacity: charEntrance,
              transform: `scale(${charEntrance})`,
              zIndex: 3,
              userSelect: "none",
            }}
          >
            {resolveEmoji(char)}
          </div>
        );
      })}

      {/* Speech bubble */}
      {speechText && speechOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            left: charBaseX + charSlideX + 20,
            top: bgConfig.groundY * height - 110,
            zIndex: 4,
            opacity: speechOpacity,
            transform: `scale(${speechScale})`,
          }}
        >
          {/* Bubble body */}
          <div
            style={{
              backgroundColor: PALETTE.white,
              borderRadius: 16,
              padding: "8px 16px",
              fontFamily: FONT_FAMILY,
              fontSize: 20,
              fontWeight: 700,
              color: PALETTE.dark,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
            }}
          >
            {speechText}
          </div>
          {/* Bubble tail */}
          <div
            style={{
              position: "absolute",
              left: 16,
              bottom: -8,
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: `8px solid ${PALETTE.white}`,
            }}
          />
        </div>
      )}

      {/* Title overlay */}
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
          zIndex: 5,
          textShadow: `0 2px 8px ${data.accentColor}33`,
        }}
      >
        {data.title}
      </div>

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.04,
            width: "100%",
            textAlign: "center",
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZES.label,
            fontWeight: 700,
            color: PALETTE.white,
            opacity: interpolate(
              spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 }),
              [0, 1],
              [0, 0.8],
            ),
            zIndex: 5,
            textShadow: "0 1px 6px rgba(0,0,0,0.3)",
          }}
        >
          {data.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
