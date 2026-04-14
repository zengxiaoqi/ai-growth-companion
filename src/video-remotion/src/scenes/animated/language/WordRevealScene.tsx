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
import { staggerDelay, pulseScale } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

type AnimatedSceneProps = {
  data: TeachingSlide;
  width: number;
  height: number;
};

type WordRevealParams = {
  words?: string[];
  revealSpeed?: number;
  highlightColor?: string;
};

const DEFAULT_WORDS = ["大", "小", "多", "少"];
const CARD_WIDTH = 120;
const CARD_HEIGHT = 120;
const CARD_GAP = 24;
const PER_WORD_DELAY = 12; // 0.4s at 30fps

export const WordRevealScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: WordRevealParams = data.animationTemplate?.params ?? {};
  const words = params.words?.length ? params.words : DEFAULT_WORDS;
  const revealSpeed = params.revealSpeed ?? 1;
  const highlightColor =
    params.highlightColor || data.accentColor || PALETTE.accent;

  const centerX = width / 2;
  const gridY = height * 0.35;

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Calculate grid positions: 2 rows if > 4, otherwise 1 row
  const maxPerRow = 4;
  const rows = words.length <= maxPerRow ? 1 : 2;
  const firstRowCount = rows === 1 ? words.length : Math.ceil(words.length / 2);
  const secondRowCount = rows === 1 ? 0 : words.length - firstRowCount;

  function getCardPosition(index: number): { x: number; y: number } {
    const row = index < firstRowCount ? 0 : 1;
    const col = row === 0 ? index : index - firstRowCount;
    const rowCount = row === 0 ? firstRowCount : secondRowCount;
    const rowWidth = rowCount * CARD_WIDTH + (rowCount - 1) * CARD_GAP;
    const startX = centerX - rowWidth / 2;
    const rowY = gridY + row * (CARD_HEIGHT + CARD_GAP);
    return {
      x: startX + col * (CARD_WIDTH + CARD_GAP),
      y: rowY,
    };
  }

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

      {/* Word cards */}
      {words.map((word, i) => {
        const pos = getCardPosition(i);
        const adjustedDelay = staggerDelay(i, 15, PER_WORD_DELAY / revealSpeed);

        // Drop-in spring from above
        const dropSpring = spring({
          frame: Math.max(0, frame - adjustedDelay),
          fps,
          config: SPRING_CONFIGS.bouncy,
        });

        const dropY = interpolate(dropSpring, [0, 1], [-120, 0]);
        const dropOpacity = interpolate(dropSpring, [0, 0.3], [0, 1], {
          extrapolateRight: "clamp",
        });

        // Pulse after landing
        const landed = frame >= adjustedDelay + 20;
        const pulseVal = landed
          ? pulseScale(frame - adjustedDelay - 20, fps, 1.5, 0.04, 1)
          : 1;

        // Glow after landing
        const glowOpacity = landed
          ? interpolate(
              frame - adjustedDelay - 20,
              [0, 8, 20],
              [0, 0.6, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 0;

        // Star appears after landing
        const starOpacity = landed
          ? interpolate(
              frame - adjustedDelay - 20,
              [0, 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          : 0;

        const starScale = landed
          ? spring({
              frame: Math.max(0, frame - adjustedDelay - 20),
              fps,
              config: SPRING_CONFIGS.bouncy,
            })
          : 0;

        return (
          <React.Fragment key={i}>
            {/* Card outline */}
            <div
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: 16,
                border: `2px dashed ${highlightColor}33`,
                zIndex: 1,
              }}
            />

            {/* Card with character */}
            <div
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y + dropY,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: 16,
                backgroundColor: `${PALETTE.white}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_FAMILY,
                fontSize: 64,
                fontWeight: 900,
                color: PALETTE.dark,
                opacity: dropOpacity,
                transform: `scale(${pulseVal})`,
                boxShadow: `0 4px 16px ${highlightColor}${landed ? "22" : "11"}`,
                zIndex: 2,
              }}
            >
              {word}
            </div>

            {/* Glow ring */}
            {glowOpacity > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: pos.x - 4,
                  top: pos.y - 4,
                  width: CARD_WIDTH + 8,
                  height: CARD_HEIGHT + 8,
                  borderRadius: 20,
                  border: `3px solid ${highlightColor}`,
                  opacity: glowOpacity,
                  zIndex: 3,
                }}
              />
            )}

            {/* SVG Star */}
            {starOpacity > 0 && (
              <svg
                style={{
                  position: "absolute",
                  left: pos.x + CARD_WIDTH - 20,
                  top: pos.y - 16,
                  opacity: starOpacity,
                  transform: `scale(${starScale})`,
                  zIndex: 4,
                }}
                width="36"
                height="36"
                viewBox="0 0 36 36"
              >
                <defs>
                  <linearGradient id={`star-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FCD34D" />
                    <stop offset="100%" stopColor="#F59E0B" />
                  </linearGradient>
                  <filter id={`star-glow-${i}`}>
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <polygon
                  points="18,2 22,13 34,13 24,21 28,33 18,26 8,33 12,21 2,13 14,13"
                  fill={`url(#star-grad-${i})`}
                  stroke="#F59E0B"
                  strokeWidth="1"
                  filter={`url(#star-glow-${i})`}
                />
              </svg>
            )}
          </React.Fragment>
        );
      })}

      {/* Subtitle */}
      {data.subtitle && (
        <div
          style={{
            position: "absolute",
            bottom: height * 0.08,
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
