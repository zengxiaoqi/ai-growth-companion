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

type CharacterStrokeParams = {
  character?: string;
  strokeColor?: string;
  showGrid?: boolean;
};

const TOTAL_STRIPS = 8;
const STRIP_REVEAL_FRAMES = 15; // 0.5s per strip at 30fps
const STRIP_STAGGER = 15; // 0.5s delay between strips

export const CharacterStrokeScene: React.FC<AnimatedSceneProps> = ({
  data,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params: CharacterStrokeParams = data.animationTemplate?.params ?? {};
  const character = params.character || data.title || "字";
  const strokeColor = params.strokeColor || data.accentColor || PALETTE.dark;
  const showGrid = params.showGrid !== false;

  const centerX = width / 2;
  const centerY = height * 0.45;
  const charSize = 180;
  const gridPad = 20;
  const gridSize = charSize + gridPad * 2;

  // Title entrance
  const titleSpring = spring({ frame, fps, config: SPRING_CONFIGS.snappy });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  // Reference character entrance
  const refSpring = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  // Stroke count label - shows which strip is currently being revealed
  const currentStrip = Math.min(
    TOTAL_STRIPS,
    Math.floor(frame / STRIP_STAGGER) + 1,
  );
  const strokeLabelOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // All strips done?
  const allDone = currentStrip >= TOTAL_STRIPS;
  const completionScale = allDone
    ? spring({
        frame: Math.max(0, frame - TOTAL_STRIPS * STRIP_STAGGER),
        fps,
        config: SPRING_CONFIGS.bouncy,
      })
    : 1;

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

      {/* 田字格 grid guide */}
      {showGrid && (
        <div
          style={{
            position: "absolute",
            left: centerX - gridSize / 2,
            top: centerY - gridSize / 2,
            width: gridSize,
            height: gridSize,
            border: `2px dashed ${strokeColor}33`,
            borderRadius: 8,
            zIndex: 1,
          }}
        >
          {/* Horizontal center line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: gridSize / 2 - 1,
              width: gridSize,
              height: 0,
              borderTop: `1px dashed ${strokeColor}22`,
            }}
          />
          {/* Vertical center line */}
          <div
            style={{
              position: "absolute",
              left: gridSize / 2 - 1,
              top: 0,
              width: 0,
              height: gridSize,
              borderLeft: `1px dashed ${strokeColor}22`,
            }}
          />
          {/* Diagonal top-left to bottom-right */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: gridSize,
              height: gridSize,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: gridSize / 2,
                top: -gridSize / 2,
                width: 0,
                height: gridSize * 1.42,
                borderLeft: `1px dashed ${strokeColor}18`,
                transform: "rotate(45deg)",
                transformOrigin: "top left",
              }}
            />
          </div>
          {/* Diagonal top-right to bottom-left */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: gridSize,
              height: gridSize,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: gridSize / 2,
                top: -gridSize / 2,
                width: 0,
                height: gridSize * 1.42,
                borderLeft: `1px dashed ${strokeColor}18`,
                transform: "rotate(-45deg)",
                transformOrigin: "top right",
              }}
            />
          </div>
        </div>
      )}

      {/* Main character with strip-by-strip reveal */}
      <div
        style={{
          position: "absolute",
          left: centerX - charSize / 2,
          top: centerY - charSize / 2,
          width: charSize,
          height: charSize,
          zIndex: 2,
          overflow: "hidden",
          transform: allDone ? `scale(${completionScale})` : undefined,
        }}
      >
        {/* Full character underneath, clipped */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: charSize,
            height: charSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT_FAMILY,
            fontSize: charSize,
            fontWeight: 900,
            lineHeight: 1,
            color: strokeColor,
            clipPath: `inset(0 0 0 0)`,
          }}
        >
          {character}
        </div>

        {/* Overlay strips that hide the character, each reveals over time */}
        {Array.from({ length: TOTAL_STRIPS }).map((_, i) => {
          const stripStart = staggerDelay(i, 0, STRIP_STAGGER);
          const revealProgress = interpolate(
            frame,
            [stripStart, stripStart + STRIP_REVEAL_FRAMES],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          const stripHeight = charSize / TOTAL_STRIPS;
          const bounceScale =
            revealProgress < 1
              ? spring({
                  frame: Math.max(0, frame - stripStart),
                  fps,
                  config: SPRING_CONFIGS.bouncy,
                })
              : 0;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                top: i * stripHeight,
                width: charSize,
                height: stripHeight + 1, // slight overlap to avoid gaps
                backgroundColor: data.bgColor,
                opacity: revealProgress,
                zIndex: 3,
                transform:
                  revealProgress > 0
                    ? `scaleX(${1 - bounceScale * 0.02})`
                    : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Reference character (small, top-right) */}
      <div
        style={{
          position: "absolute",
          left: centerX + gridSize / 2 + 24,
          top: centerY - gridSize / 2,
          width: 56,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 40,
          fontWeight: 700,
          color: strokeColor,
          border: `1px dashed ${strokeColor}44`,
          borderRadius: 6,
          opacity: refSpring,
          transform: `scale(${refSpring})`,
          zIndex: 2,
        }}
      >
        {character}
      </div>

      {/* Stroke count label */}
      <div
        style={{
          position: "absolute",
          top: centerY + gridSize / 2 + 16,
          width: "100%",
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 700,
          color: strokeColor,
          opacity: strokeLabelOpacity,
          zIndex: 2,
        }}
      >
        {allDone ? "完成！" : `第${currentStrip}笔`}
      </div>

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
