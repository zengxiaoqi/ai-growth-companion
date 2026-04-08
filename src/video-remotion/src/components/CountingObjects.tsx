import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_CONFIGS } from "../theme/animations";

type CountingItemProps = {
  emoji: string;
  index: number;
  total: number;
};

const getGridPosition = (
  index: number,
  total: number,
  centerX: number,
  startY: number,
) => {
  const itemSize = total <= 5 ? 90 : 72;
  const gap = total <= 5 ? 20 : 16;

  if (total <= 5) {
    const totalWidth = total * itemSize + (total - 1) * gap;
    const startX = centerX - totalWidth / 2 + itemSize / 2;
    return { x: startX + index * (itemSize + gap), y: startY, size: itemSize };
  }

  const firstRow = Math.ceil(total / 2);
  const secondRow = total - firstRow;
  const row = index < firstRow ? 0 : 1;
  const col = row === 0 ? index : index - firstRow;
  const rowCount = row === 0 ? firstRow : secondRow;

  const rowWidth = rowCount * itemSize + (rowCount - 1) * gap;
  const startX = centerX - rowWidth / 2 + itemSize / 2;
  const rowY = startY + row * (itemSize + gap + 8);

  return { x: startX + col * (itemSize + gap), y: rowY, size: itemSize };
};

const CountingItem: React.FC<CountingItemProps> = ({ emoji, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bounce = spring({
    frame,
    fps,
    config: SPRING_CONFIGS.bouncy,
  });

  const scale = interpolate(bounce, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });
  const rotate = interpolate(bounce, [0, 1], [-30, 0], {
    extrapolateRight: "clamp",
  });

  const size = total <= 5 ? 90 : 72;

  return (
    <div
      style={{
        fontSize: size,
        lineHeight: 1,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        userSelect: "none",
      }}
    >
      {emoji}
    </div>
  );
};

type CountingObjectsProps = {
  emoji: string;
  count: number;
  staggerDelay: number;
  startX: number;
  startY: number;
};

export const CountingObjects: React.FC<CountingObjectsProps> = ({
  emoji,
  count,
  startX,
  startY,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const pos = getGridPosition(i, count, startX, startY);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pos.x - pos.size / 2,
              top: pos.y - pos.size / 2,
            }}
          >
            <CountingItem emoji={emoji} index={i} total={count} />
          </div>
        );
      })}
    </div>
  );
};
