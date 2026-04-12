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
import type { TeachingSlide } from "../../../data/topic-video";

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

const BEAD_COLORS = ["#FF6B6B", "#FFD93D", "#4D96FF", "#6BCB77", "#FF6B9D"];

type AbacusRowProps = {
  y: number;
  value: number;
  maxValue: number;
  delay: number;
  rodWidth: number;
  rodX: number;
  beadSize: number;
  showNumbers: boolean;
  accentColor: string;
};

const AbacusRow: React.FC<AbacusRowProps> = ({
  y, value, maxValue, delay, rodWidth, rodX, beadSize, showNumbers, accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = interpolate(
    frame,
    [delay, delay + 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <>
      {/* Rod */}
      <div style={{
        position: "absolute",
        left: rodX,
        top: y,
        width: rodWidth,
        height: 6,
        backgroundColor: "#A0845C",
        borderRadius: 3,
      }} />

      {/* Beads */}
      {Array.from({ length: maxValue }).map((_, i) => {
        const isMoved = i < value;
        const beadTargetX = isMoved
          ? rodX + rodWidth - (i + 1) * (beadSize + 6)
          : rodX + 8 + i * (beadSize + 6);

        const beadX = rodX + 8 + i * (beadSize + 6) + (beadTargetX - (rodX + 8 + i * (beadSize + 6))) * slideProgress;

        const beadBounce = isMoved
          ? spring({ frame: Math.max(0, frame - delay - 25), fps, config: SPRING_CONFIGS.bouncy, delay: i * 3 })
          : { value: 1 };

        const bounceScale = interpolate(typeof beadBounce === 'object' ? beadBounce.value : beadBounce, [0, 1], [1, 1.1], { extrapolateRight: "clamp" });

        return (
          <div key={i} style={{
            position: "absolute",
            left: beadX,
            top: y - (beadSize - 6) / 2,
            width: beadSize,
            height: beadSize,
            borderRadius: "50%",
            backgroundColor: BEAD_COLORS[i % BEAD_COLORS.length],
            transform: `scale(${isMoved ? bounceScale : 1})`,
            boxShadow: `inset 0 -3px 6px rgba(0,0,0,0.2)`,
          }} />
        );
      })}

      {/* Count label */}
      {showNumbers && (
        <div style={{
          position: "absolute",
          left: rodX + rodWidth + 20,
          top: y - 12,
          fontFamily: FONT_FAMILY,
          fontSize: 28,
          fontWeight: 900,
          color: accentColor,
          opacity: slideProgress,
        }}>
          {value}
        </div>
      )}
    </>
  );
};

export const AbacusScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const rows = Math.max(1, Math.min(4, Number(params.rows) || 2));
  const values: number[] = Array.isArray(params.values) && params.values.length > 0
    ? params.values.map((v: unknown) => Math.max(0, Math.min(9, Number(v) || 0)))
    : Array.from({ length: rows }, (_, i) => 3 + i * 2);
  const showNumbers = params.showNumbers !== false;

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const titleEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy });
  const titleScale = interpolate(titleEntrance, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const frameWidth = 500;
  const frameHeight = rows * 90 + 60;
  const frameX = (width - frameWidth) / 2;
  const frameY = (height - frameHeight) / 2 - 20;
  const rodX = frameX + 30;
  const rodWidth = frameWidth - 60 - (showNumbers ? 60 : 0);
  const beadSize = 32;

  const totalValue = values.slice(0, rows).reduce((s, v) => s + v, 0);
  const totalDelay = 20 + rows * 25;
  const totalSpring = spring({ frame: Math.max(0, frame - totalDelay), fps, config: SPRING_CONFIGS.bouncy });
  const totalOpacity = interpolate(totalSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const totalScale = interpolate(totalSpring, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* Title */}
      <div style={{
        position: "absolute",
        top: 40,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 48,
          fontWeight: 900,
          color: data.accentColor,
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {data.title || "算盘计数"}
        </div>
      </div>

      {/* Abacus frame */}
      <div style={{
        position: "absolute",
        left: frameX,
        top: frameY,
        width: frameWidth,
        height: frameHeight,
        border: `6px solid #8B6914`,
        borderRadius: 16,
        backgroundColor: "#FFF8E1",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        zIndex: 1,
      }} />

      {/* Rows */}
      {values.slice(0, rows).map((value, i) => (
        <AbacusRow
          key={i}
          y={frameY + 40 + i * 90}
          value={value}
          maxValue={9}
          delay={20 + i * 25}
          rodWidth={rodWidth}
          rodX={rodX}
          beadSize={beadSize}
          showNumbers={showNumbers}
          accentColor={data.accentColor}
        />
      ))}

      {/* Total */}
      <div style={{
        position: "absolute",
        bottom: 50,
        width: "100%",
        textAlign: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 36,
          fontWeight: 900,
          color: data.accentColor,
          opacity: totalOpacity,
          transform: `scale(${totalScale})`,
        }}>
          合计: {totalValue}
        </div>
      </div>
    </AbsoluteFill>
  );
};
