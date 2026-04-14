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
import { staggerDelay, getGridPosition } from "../../../utils/animation-helpers";
import type { TeachingSlide } from "../../../data/topic-video";

const CHINESE_NUMERALS: Record<number, string> = {
  1: "\u4e00", 2: "\u4e8c", 3: "\u4e09", 4: "\u56db", 5: "\u4e94",
  6: "\u516d", 7: "\u4e03", 8: "\u516b", 9: "\u4e5d", 10: "\u5341",
};

type Props = {
  data: TeachingSlide;
  width: number;
  height: number;
};

/* ---- SVG object renderers (no emoji) ---- */

const SvgApple: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="appleGrad" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#FF4444" />
        <stop offset="100%" stopColor="#CC0000" />
      </radialGradient>
      <filter id="appleShadow">
        <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.25" />
      </filter>
    </defs>
    <ellipse cx="50" cy="55" rx="32" ry="34" fill="url(#appleGrad)" filter="url(#appleShadow)" />
    <ellipse cx="38" cy="42" rx="8" ry="6" fill="rgba(255,255,255,0.3)" transform="rotate(-20 38 42)" />
    <path d="M50 20 Q55 10 60 15" stroke="#4a7c2e" strokeWidth="3" fill="none" strokeLinecap="round" />
    <ellipse cx="57" cy="18" rx="8" ry="5" fill="#5a9e3e" transform="rotate(25 57 18)" />
  </svg>
);

const SvgStar: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFD93D" />
        <stop offset="100%" stopColor="#FFB300" />
      </linearGradient>
      <filter id="starShadow">
        <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.2" />
      </filter>
    </defs>
    <path
      d="M50 8 L61 38 L93 38 L67 58 L77 90 L50 70 L23 90 L33 58 L7 38 L39 38 Z"
      fill="url(#starGrad)"
      filter="url(#starShadow)"
    />
    <ellipse cx="42" cy="38" rx="6" ry="4" fill="rgba(255,255,255,0.4)" transform="rotate(-15 42 38)" />
  </svg>
);

const SvgBall: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="ballGrad" cx="40%" cy="35%" r="55%">
        <stop offset="0%" stopColor="#5CBEFF" />
        <stop offset="100%" stopColor="#2196F3" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="38" fill="url(#ballGrad)" />
    <ellipse cx="40" cy="38" rx="12" ry="8" fill="rgba(255,255,255,0.35)" transform="rotate(-15 40 38)" />
    <path d="M30 55 Q50 48 70 55" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
  </svg>
);

const SvgHeart: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="heartGrad" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#FF6B9D" />
        <stop offset="100%" stopColor="#E91E63" />
      </radialGradient>
    </defs>
    <path
      d="M50 88 C20 65 5 45 15 28 C25 10 42 14 50 30 C58 14 75 10 85 28 C95 45 80 65 50 88Z"
      fill="url(#heartGrad)"
    />
    <ellipse cx="35" cy="35" rx="8" ry="5" fill="rgba(255,255,255,0.3)" transform="rotate(-30 35 35)" />
  </svg>
);

const SvgFlower: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="flowerCenter" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFE082" />
        <stop offset="100%" stopColor="#FFC107" />
      </radialGradient>
    </defs>
    {[0, 60, 120, 180, 240, 300].map((angle) => (
      <ellipse
        key={angle}
        cx="50"
        cy="28"
        rx="14"
        ry="22"
        fill="#F48FB1"
        opacity="0.9"
        transform={`rotate(${angle} 50 50)`}
      />
    ))}
    <circle cx="50" cy="50" r="12" fill="url(#flowerCenter)" />
  </svg>
);

const SvgCat: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="catGrad" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#FFB74D" />
        <stop offset="100%" stopColor="#FF9800" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="55" r="32" fill="url(#catGrad)" />
    <polygon points="26,35 22,8 42,28" fill="#FF9800" />
    <polygon points="74,35 78,8 58,28" fill="#FF9800" />
    <polygon points="28,33 25,14 40,28" fill="#FFE0B2" />
    <polygon points="72,33 75,14 60,28" fill="#FFE0B2" />
    <ellipse cx="40" cy="50" rx="5" ry="6" fill="#333" />
    <ellipse cx="60" cy="50" rx="5" ry="6" fill="#333" />
    <ellipse cx="41" cy="48" rx="2" ry="2.5" fill="#fff" />
    <ellipse cx="61" cy="48" rx="2" ry="2.5" fill="#fff" />
    <ellipse cx="50" cy="58" rx="4" ry="3" fill="#FF7043" />
    <line x1="20" y1="55" x2="38" y2="54" stroke="#795548" strokeWidth="1.5" />
    <line x1="20" y1="60" x2="38" y2="59" stroke="#795548" strokeWidth="1.5" />
    <line x1="62" y1="54" x2="80" y2="55" stroke="#795548" strokeWidth="1.5" />
    <line x1="62" y1="59" x2="80" y2="60" stroke="#795548" strokeWidth="1.5" />
  </svg>
);

const SvgDog: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="dogGrad" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#BCAAA4" />
        <stop offset="100%" stopColor="#8D6E63" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="55" r="32" fill="url(#dogGrad)" />
    <ellipse cx="28" cy="42" rx="14" ry="22" fill="#8D6E63" transform="rotate(-15 28 42)" />
    <ellipse cx="72" cy="42" rx="14" ry="22" fill="#8D6E63" transform="rotate(15 72 42)" />
    <ellipse cx="40" cy="50" rx="5" ry="6" fill="#333" />
    <ellipse cx="60" cy="50" rx="5" ry="6" fill="#333" />
    <ellipse cx="41" cy="48" rx="2" ry="2.5" fill="#fff" />
    <ellipse cx="61" cy="48" rx="2" ry="2.5" fill="#fff" />
    <ellipse cx="50" cy="60" rx="6" ry="4" fill="#3E2723" />
    <path d="M44 66 Q50 72 56 66" stroke="#3E2723" strokeWidth="2" fill="none" />
  </svg>
);

const SvgFish: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="fishGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4FC3F7" />
        <stop offset="100%" stopColor="#0288D1" />
      </linearGradient>
    </defs>
    <ellipse cx="45" cy="50" rx="32" ry="22" fill="url(#fishGrad)" />
    <polygon points="75,50 95,35 95,65" fill="#0288D1" />
    <circle cx="32" cy="45" r="5" fill="#fff" />
    <circle cx="33" cy="44" r="2.5" fill="#333" />
    <path d="M20 52 Q35 56 50 52" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
    <path d="M15 48 Q30 44 45 48" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />
  </svg>
);

const SvgBird: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="birdGrad" cx="45%" cy="40%" r="55%">
        <stop offset="0%" stopColor="#81D4FA" />
        <stop offset="100%" stopColor="#1E88E5" />
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="55" rx="26" ry="22" fill="url(#birdGrad)" />
    <circle cx="38" cy="40" r="16" fill="url(#birdGrad)" />
    <circle cx="34" cy="38" r="3.5" fill="#fff" />
    <circle cx="34" cy="37" r="2" fill="#333" />
    <polygon points="22,40 12,38 22,43" fill="#FF9800" />
    <path d="M26,54 Q42,65 72,54" fill="#1565C0" />
    <ellipse cx="55" cy="52" rx="3" ry="8" fill="#FFE082" />
    <ellipse cx="63" cy="52" rx="3" ry="8" fill="#FFE082" />
  </svg>
);

const SvgSun: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFF176" />
        <stop offset="100%" stopColor="#FFB300" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="26" fill="url(#sunGrad)" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
      <line
        key={angle}
        x1="50"
        y1="16"
        x2="50"
        y2="8"
        stroke="#FFB300"
        strokeWidth="4"
        strokeLinecap="round"
        transform={`rotate(${angle} 50 50)`}
      />
    ))}
    <circle cx="42" cy="46" r="3" fill="#FF8F00" />
    <circle cx="58" cy="46" r="3" fill="#FF8F00" />
    <path d="M42 56 Q50 62 58 56" stroke="#FF8F00" strokeWidth="2" fill="none" />
  </svg>
);

const SvgGenericCircle: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <radialGradient id={`genGrad-${color.replace('#','')}`} cx="40%" cy="35%" r="55%">
        <stop offset="0%" stopColor={color} stopOpacity="1" />
        <stop offset="100%" stopColor={color} stopOpacity="0.7" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="40" fill={`url(#genGrad-${color.replace('#','')})`} />
    <ellipse cx="40" cy="38" rx="10" ry="7" fill="rgba(255,255,255,0.35)" transform="rotate(-20 40 38)" />
  </svg>
);

/* Map object type to SVG component */
const OBJECT_SVG_MAP: Record<string, React.FC<{ size: number }>> = {
  apple: SvgApple,
  star: SvgStar,
  ball: SvgBall,
  heart: SvgHeart,
  flower: SvgFlower,
  cat: SvgCat,
  dog: SvgDog,
  fish: SvgFish,
  bird: SvgBird,
  sun: SvgSun,
};

/* ---- SVG sparkle / confetti ---- */
const SvgSparkle: React.FC<{ x: number; y: number; size: number; color: string; opacity: number; rotation: number }> = ({
  x, y, size, color, opacity, rotation,
}) => (
  <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, opacity, transform: `rotate(${rotation}deg)` }}>
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M20 2 L23 15 L36 18 L23 21 L20 34 L17 21 L4 18 L17 15 Z" fill={color} />
    </svg>
  </div>
);

/* ---- SVG counting tray ---- */
const SvgCountingTray: React.FC<{ width: number; height: number; y: number }> = ({ width, height: h, y }) => (
  <svg style={{ position: "absolute", left: 0, top: y, width, height: h, pointerEvents: "none" }}>
    <defs>
      <linearGradient id="trayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#DEB887" />
        <stop offset="100%" stopColor="#C4A265" />
      </linearGradient>
      <filter id="trayShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
      </filter>
    </defs>
    <rect x="8%" y="0" width="84%" height={h} rx="18" ry="18" fill="url(#trayGrad)" filter="url(#trayShadow)" />
    <rect x="8.5%" y="2" width="83%" height={h - 4} rx="16" ry="16" fill="none" stroke="#B8924A" strokeWidth="2" />
  </svg>
);

export const CountingObjectsScene: React.FC<Props> = ({ data, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const params = data.animationTemplate?.params ?? {};
  const targetCount = Math.max(1, Math.min(10, Number(params.targetCount) || 5));
  const objectType = String(params.objectType || "apple").trim().toLowerCase();

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const numberEntrance = spring({ frame, fps, config: SPRING_CONFIGS.bouncy, delay: 5 });
  const numberScale = interpolate(numberEntrance, [0, 1], [0, 1.2], { extrapolateRight: "clamp" });
  const numberOpacity = interpolate(numberEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  const perItemDelay = 15;
  const countingStartFrame = 25;
  const centerY = height * 0.55;
  const centerX = width / 2;

  const visibleCount = Math.min(
    targetCount,
    Math.max(0, Math.floor((frame - countingStartFrame) / perItemDelay) + 1),
  );

  const doneFrame = countingStartFrame + targetCount * perItemDelay;
  const pulseActive = frame > doneFrame;
  const pulseScaleVal = pulseActive
    ? interpolate(
        Math.sin((frame - doneFrame) / fps * 3 * Math.PI * 2),
        [-1, 1],
        [1, 1.15],
      )
    : 1;

  const chineseNumeral = CHINESE_NUMERALS[targetCount] || String(targetCount);
  const chineseEntrance = spring({
    frame, fps, config: SPRING_CONFIGS.smooth, delay: doneFrame + 5,
  });
  const chineseOpacity = interpolate(chineseEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  const chineseY = interpolate(chineseEntrance, [0, 1], [20, 0], { extrapolateRight: "clamp" });

  const countLabelEntrance = spring({
    frame, fps, config: SPRING_CONFIGS.snappy, delay: countingStartFrame - 5,
  });
  const countLabelOpacity = interpolate(countLabelEntrance, [0, 1], [0, 1], { extrapolateRight: "clamp" });

  // Confetti sparkles when counting done
  const sparkleColors = PALETTE.rainbow;
  const sparkles = pulseActive
    ? Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 80 + interpolate(
          Math.sin((frame - doneFrame) / fps * 2 * Math.PI * 2 + i),
          [-1, 1],
          [0, 40],
        );
        const sparkOpacity = interpolate(
          frame,
          [doneFrame, doneFrame + 30],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return {
          x: centerX + Math.cos(angle) * dist,
          y: centerY + Math.sin(angle) * dist,
          size: 16 + (i % 3) * 6,
          color: sparkleColors[i % sparkleColors.length],
          opacity: sparkOpacity,
          rotation: interpolate(frame, [doneFrame, doneFrame + 30], [0, 180 + i * 30]),
        };
      })
    : [];

  // Resolve SVG object component
  const SvgObject = OBJECT_SVG_MAP[objectType] || (() => <SvgGenericCircle size={1} color={PALETTE.accent} />);

  // Tray position
  const trayY = centerY - 55;
  const trayH = 130;

  return (
    <AbsoluteFill style={{ backgroundColor: data.bgColor, opacity: bgOpacity, overflow: "hidden" }}>
      <BackgroundBubbles width={width} height={height} />

      {/* SVG decorative tray */}
      <SvgCountingTray width={width} height={trayH} y={trayY} />

      {/* Big number */}
      <div style={{
        position: "absolute",
        top: height * 0.08,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 180,
          fontWeight: 900,
          color: data.accentColor,
          transform: `scale(${numberScale * pulseScaleVal})`,
          opacity: numberOpacity,
          textShadow: `0 6px 24px ${data.accentColor}44`,
          lineHeight: 1,
        }}>
          {visibleCount}
        </div>

        {/* Running count label (text only, no emoji) */}
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZES.label,
          fontWeight: 700,
          color: PALETTE.dark,
          opacity: countLabelOpacity * 0.7,
          marginTop: 8,
        }}>
          x {visibleCount}
        </div>
      </div>

      {/* Counting objects grid (SVG) */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 1 }}>
        {Array.from({ length: visibleCount }).map((_, i) => {
          const pos = getGridPosition(i, targetCount, centerX, centerY);
          const itemFrame = Math.max(0, frame - countingStartFrame - i * perItemDelay);
          const itemSpring = spring({ frame: itemFrame, fps, config: SPRING_CONFIGS.bouncy });
          const itemScale = interpolate(itemSpring, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const itemRotate = interpolate(itemSpring, [0, 1], [-30, 0], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              position: "absolute",
              left: pos.x - pos.size / 2,
              top: pos.y - pos.size / 2,
              transform: `scale(${itemScale}) rotate(${itemRotate}deg)`,
              userSelect: "none",
            }}>
              <SvgObject size={pos.size * 0.8} />
            </div>
          );
        })}
      </div>

      {/* Sparkle confetti on completion */}
      {sparkles.map((sp, i) => (
        <SvgSparkle key={i} {...sp} />
      ))}

      {/* Chinese numeral at bottom */}
      <div style={{
        position: "absolute",
        bottom: 60,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT_FAMILY,
          fontSize: 56,
          fontWeight: 900,
          color: data.accentColor,
          opacity: chineseOpacity,
          transform: `translateY(${chineseY}px) scale(${pulseScaleVal})`,
          textShadow: `0 3px 12px ${data.accentColor}33`,
        }}>
          {chineseNumeral}
        </div>
      </div>
    </AbsoluteFill>
  );
};
