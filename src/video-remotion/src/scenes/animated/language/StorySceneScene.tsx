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
import {
  staggerDelay,
  resolveSvgItem,
} from "../../../utils/animation-helpers";
import type { SvgItemDescriptor } from "../../../utils/animation-helpers";
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
  groundY: number;
  celestialType?: "sun" | "moon";
  celestialX: number;
  celestialY: number;
};

const BG_CONFIGS: Record<string, BgConfig> = {
  day: {
    skyColor: "#87CEEB",
    groundColor: "#7BC67E",
    groundY: 0.72,
    celestialType: "sun",
    celestialX: 0.85,
    celestialY: 0.12,
  },
  night: {
    skyColor: "#1B2838",
    groundColor: "#2D4A2D",
    groundY: 0.72,
    celestialType: "moon",
    celestialX: 0.82,
    celestialY: 0.1,
  },
  indoor: {
    skyColor: "#FFF3E0",
    groundColor: "#D7CCC8",
    groundY: 0.78,
    celestialX: 0.8,
    celestialY: 0.1,
  },
};

// ---------------------------------------------------------------------------
// Inline SVG renderers
// ---------------------------------------------------------------------------

/** SVG sun with triangle rays and radial gradient */
const SunSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFF176" />
        <stop offset="100%" stopColor="#FFB300" />
      </radialGradient>
    </defs>
    {/* Triangle rays */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
      <polygon
        key={`ray-${angle}`}
        points="46,4 54,4 50,22"
        fill="#FFD54F"
        transform={`rotate(${angle} 50 50)`}
      />
    ))}
    <circle cx="50" cy="50" r="22" fill="url(#sunGrad)" />
  </svg>
);

/** SVG crescent moon with craters */
const MoonSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="moonGrad" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#FFF9C4" />
        <stop offset="100%" stopColor="#F9A825" />
      </radialGradient>
    </defs>
    {/* Crescent via two overlapping circles */}
    <clipPath id="crescentClip">
      <rect x="0" y="0" width="100" height="100" />
    </clipPath>
    <circle cx="50" cy="50" r="32" fill="url(#moonGrad)" />
    <circle cx="64" cy="42" r="26" fill="#1B2838" />
    {/* Craters */}
    <circle cx="36" cy="44" r="4" fill="#FBC02D" opacity={0.35} />
    <circle cx="44" cy="62" r="3" fill="#FBC02D" opacity={0.3} />
    <circle cx="30" cy="58" r="2.5" fill="#FBC02D" opacity={0.25} />
  </svg>
);

/** SVG star polygon with gradient */
const StarSvg: React.FC<{ size: number; opacity?: number }> = ({
  size,
  opacity = 1,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    style={{ opacity }}
  >
    <defs>
      <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF176" />
        <stop offset="100%" stopColor="#FFC107" />
      </linearGradient>
    </defs>
    <polygon
      points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35"
      fill="url(#starGrad)"
    />
  </svg>
);

/** Render a character as a simple cartoon circle with face + label */
const CharacterSvg: React.FC<{
  descriptor: SvgItemDescriptor;
  size: number;
}> = ({ descriptor, size }) => {
  const { primaryColor, secondaryColor, label } = descriptor;
  return (
    <svg
      width={size}
      height={size + 22}
      viewBox="0 0 80 102"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Body circle */}
      <circle cx="40" cy="40" r="36" fill={primaryColor} />
      <circle cx="40" cy="40" r="36" fill="none" stroke={secondaryColor} strokeWidth="3" />
      {/* Eyes */}
      <circle cx="28" cy="34" r="5" fill="#FFFFFF" />
      <circle cx="52" cy="34" r="5" fill="#FFFFFF" />
      <circle cx="29" cy="34" r="2.8" fill="#333333" />
      <circle cx="53" cy="34" r="2.8" fill="#333333" />
      {/* Smile */}
      <path
        d="M 28 48 Q 40 60 52 48"
        fill="none"
        stroke="#333333"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Label */}
      {label && (
        <text
          x="40"
          y="90"
          textAnchor="middle"
          fontSize="14"
          fontFamily={FONT_FAMILY}
          fontWeight={700}
          fill="#333333"
        >
          {label}
        </text>
      )}
    </svg>
  );
};

/** Render an item as an SVG mini-illustration based on its shape */
const ItemSvg: React.FC<{
  descriptor: SvgItemDescriptor;
  size: number;
}> = ({ descriptor, size }) => {
  const { shape, primaryColor, secondaryColor, label } = descriptor;

  const viewBoxW = 80;
  const viewBoxH = label ? 100 : 78;

  switch (shape) {
    case "tree":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Trunk */}
          <rect x="34" y="46" width="12" height="24" rx="2" fill={secondaryColor} />
          {/* Canopy */}
          <ellipse cx="40" cy="34" rx="28" ry="24" fill={primaryColor} />
          <ellipse cx="40" cy="30" rx="22" ry="18" fill={primaryColor} opacity={0.8} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "house":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Roof */}
          <polygon points="40,8 8,42 72,42" fill={secondaryColor} />
          {/* Walls */}
          <rect x="14" y="42" width="52" height="30" rx="2" fill={primaryColor} />
          {/* Door */}
          <rect x="32" y="52" width="16" height="20" rx="2" fill={secondaryColor} opacity={0.6} />
          {/* Window */}
          <rect x="20" y="48" width="10" height="10" rx="1" fill="#E3F2FD" stroke={secondaryColor} strokeWidth="1" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "flower":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Stem */}
          <line x1="40" y1="70" x2="40" y2="38" stroke={secondaryColor} strokeWidth="4" strokeLinecap="round" />
          {/* Leaf */}
          <ellipse cx="50" cy="56" rx="10" ry="5" fill={secondaryColor} transform="rotate(-30 50 56)" />
          {/* Petals */}
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <circle
              key={`petal-${angle}`}
              cx={40 + 12 * Math.cos((angle * Math.PI) / 180)}
              cy={28 + 12 * Math.sin((angle * Math.PI) / 180)}
              r="9"
              fill={primaryColor}
            />
          ))}
          {/* Center */}
          <circle cx="40" cy="28" r="7" fill="#FFF176" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "bird":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="40" rx="22" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="58" cy="32" r="10" fill={primaryColor} />
          {/* Beak */}
          <polygon points="68,30 76,33 68,36" fill="#FF8F00" />
          {/* Eye */}
          <circle cx="60" cy="30" r="2.5" fill="#333333" />
          {/* Wing */}
          <ellipse cx="34" cy="36" rx="14" ry="8" fill={secondaryColor} />
          {/* Tail */}
          <polygon points="18,36 8,28 10,44" fill={secondaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "fish":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="42" cy="38" rx="24" ry="14" fill={primaryColor} />
          {/* Tail */}
          <polygon points="18,38 4,26 4,50" fill={secondaryColor} />
          {/* Eye */}
          <circle cx="54" cy="35" r="4" fill="#FFFFFF" />
          <circle cx="55" cy="35" r="2" fill="#333333" />
          {/* Fin */}
          <ellipse cx="36" cy="28" rx="8" ry="5" fill={secondaryColor} opacity={0.6} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "cat":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="48" rx="20" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="40" cy="28" r="18" fill={primaryColor} />
          {/* Ears */}
          <polygon points="26,16 22,2 34,12" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
          <polygon points="54,16 58,2 46,12" fill={primaryColor} stroke={secondaryColor} strokeWidth="1" />
          {/* Inner ears */}
          <polygon points="27,15 24,6 33,13" fill="#FFAB91" />
          <polygon points="53,15 56,6 47,13" fill="#FFAB91" />
          {/* Eyes */}
          <circle cx="33" cy="26" r="4" fill="#FFFFFF" />
          <circle cx="47" cy="26" r="4" fill="#FFFFFF" />
          <circle cx="34" cy="26" r="2" fill="#333333" />
          <circle cx="48" cy="26" r="2" fill="#333333" />
          {/* Nose */}
          <polygon points="40,31 38,33 42,33" fill="#FF8A65" />
          {/* Whiskers */}
          <line x1="20" y1="30" x2="32" y2="32" stroke={secondaryColor} strokeWidth="1" />
          <line x1="20" y1="34" x2="32" y2="34" stroke={secondaryColor} strokeWidth="1" />
          <line x1="48" y1="32" x2="60" y2="30" stroke={secondaryColor} strokeWidth="1" />
          <line x1="48" y1="34" x2="60" y2="34" stroke={secondaryColor} strokeWidth="1" />
          {/* Tail */}
          <path d="M 58 50 Q 72 36 66 26" fill="none" stroke={primaryColor} strokeWidth="4" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "dog":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Body */}
          <ellipse cx="40" cy="50" rx="22" ry="16" fill={primaryColor} />
          {/* Head */}
          <circle cx="40" cy="28" r="18" fill={primaryColor} />
          {/* Floppy ears */}
          <ellipse cx="20" cy="30" rx="10" ry="16" fill={secondaryColor} transform="rotate(-15 20 30)" />
          <ellipse cx="60" cy="30" rx="10" ry="16" fill={secondaryColor} transform="rotate(15 60 30)" />
          {/* Eyes */}
          <circle cx="33" cy="25" r="4" fill="#FFFFFF" />
          <circle cx="47" cy="25" r="4" fill="#FFFFFF" />
          <circle cx="34" cy="25" r="2.2" fill="#333333" />
          <circle cx="48" cy="25" r="2.2" fill="#333333" />
          {/* Nose */}
          <ellipse cx="40" cy="33" rx="4" ry="3" fill="#333333" />
          {/* Mouth */}
          <path d="M 36 36 Q 40 40 44 36" fill="none" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
          {/* Tail */}
          <path d="M 60 48 Q 72 38 68 28" fill="none" stroke={primaryColor} strokeWidth="4" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "cloud":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="40" r="16" fill={primaryColor} />
          <circle cx="48" cy="36" r="20" fill={primaryColor} />
          <circle cx="64" cy="42" r="14" fill={primaryColor} />
          <rect x="20" y="40" width="52" height="16" rx="4" fill={primaryColor} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "mountain":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <polygon points="40,8 8,68 72,68" fill={primaryColor} />
          <polygon points="40,8 32,24 48,24" fill="#FFFFFF" opacity={0.7} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "river":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <path d="M 8 30 Q 24 20 40 30 Q 56 40 72 30" fill="none" stroke={primaryColor} strokeWidth="8" strokeLinecap="round" />
          <path d="M 8 50 Q 24 40 40 50 Q 56 60 72 50" fill="none" stroke={secondaryColor} strokeWidth="6" strokeLinecap="round" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "book":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          {/* Left page */}
          <rect x="10" y="14" width="28" height="44" rx="2" fill={primaryColor} />
          {/* Right page */}
          <rect x="42" y="14" width="28" height="44" rx="2" fill="#FFFFFF" stroke={primaryColor} strokeWidth="2" />
          {/* Spine */}
          <line x1="40" y1="12" x2="40" y2="60" stroke={secondaryColor} strokeWidth="3" />
          {/* Page lines */}
          <line x1="18" y1="26" x2="32" y2="26" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="18" y1="34" x2="32" y2="34" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="18" y1="42" x2="32" y2="42" stroke={secondaryColor} strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="26" x2="64" y2="26" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="34" x2="64" y2="34" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          <line x1="50" y1="42" x2="64" y2="42" stroke="#B0BEC5" strokeWidth="1.5" opacity={0.4} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "sun":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="itemSunGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF176" />
              <stop offset="100%" stopColor="#FFB300" />
            </radialGradient>
          </defs>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <polygon
              key={`item-ray-${angle}`}
              points="37,6 43,6 40,16"
              fill="#FFD54F"
              transform={`rotate(${angle} 40 40)`}
            />
          ))}
          <circle cx="40" cy="40" r="18" fill="url(#itemSunGrad)" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "moon":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="itemMoonGrad" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#FFF9C4" />
              <stop offset="100%" stopColor="#F9A825" />
            </radialGradient>
          </defs>
          <circle cx="40" cy="38" r="24" fill="url(#itemMoonGrad)" />
          <circle cx="52" cy="32" r="20" fill={viewBoxH > 80 ? "#FFF3E0" : "#1B2838"} />
          <circle cx="30" cy="34" r="3" fill="#FBC02D" opacity={0.35} />
          <circle cx="36" cy="48" r="2" fill="#FBC02D" opacity={0.3} />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    case "star":
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="itemStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF176" />
              <stop offset="100%" stopColor="#FFC107" />
            </linearGradient>
          </defs>
          <polygon
            points="40,6 47,28 70,28 52,42 58,64 40,50 22,64 28,42 10,28 33,28"
            fill="url(#itemStarGrad)"
          />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );

    // circle, generic, and anything else fall through to the generic circle
    default:
      return (
        <svg width={size} height={size + 20} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="36" r="30" fill={primaryColor} />
          <circle cx="40" cy="36" r="30" fill="none" stroke={secondaryColor} strokeWidth="2" />
          {label && (
            <text x="40" y={viewBoxH - 4} textAnchor="middle" fontSize="12" fontFamily={FONT_FAMILY} fontWeight={700} fill="#333333">
              {label}
            </text>
          )}
        </svg>
      );
  }
};

/** Render a character descriptor — characters always use the face-circle style */
const renderCharacter = (name: string, size: number) => {
  const descriptor = resolveSvgItem(name);
  return <CharacterSvg descriptor={descriptor} size={size} />;
};

/** Render an item descriptor — uses shape-specific SVG */
const renderItem = (name: string, size: number) => {
  const descriptor = resolveSvgItem(name);
  return <ItemSvg descriptor={descriptor} size={size} />;
};

/** SVG background: wavy ground edge */
const WavyGroundSvg: React.FC<{
  width: number;
  height: number;
  groundY: number;
  color: string;
}> = ({ width, height, groundY, color }) => {
  const groundTop = groundY * height;
  const groundH = height - groundTop;
  // Create wavy top edge using a sine-like path
  const waveAmplitude = 8;
  const segments = 12;
  const segW = width / segments;
  let d = `M 0 ${groundTop}`;
  for (let i = 0; i < segments; i++) {
    const x1 = i * segW + segW / 4;
    const x2 = i * segW + (segW * 3) / 4;
    const x3 = (i + 1) * segW;
    const yOff =
      i % 2 === 0 ? -waveAmplitude : waveAmplitude;
    d += ` Q ${x1} ${groundTop + yOff} ${x2} ${groundTop}`;
    d += ` Q ${(x2 + x3) / 2} ${groundTop - yOff} ${x3} ${groundTop}`;
  }
  d += ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={groundH + waveAmplitude}
      viewBox={`0 0 ${width} ${groundH + waveAmplitude}`}
      style={{
        position: "absolute",
        left: 0,
        top: groundTop - waveAmplitude,
        zIndex: 1,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={d} fill={color} />
    </svg>
  );
};

/** SVG indoor room background */
const IndoorRoomSvg: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => (
  <svg
    width={width}
    height={height}
    style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Back wall */}
    <rect x="0" y="0" width={width} height={height * 0.78} fill="#FFF3E0" />
    {/* Floor */}
    <rect
      x="0"
      y={height * 0.78}
      width={width}
      height={height * 0.22}
      fill="#D7CCC8"
    />
    {/* Wall-floor border */}
    <line
      x1="0"
      y1={height * 0.78}
      x2={width}
      y2={height * 0.78}
      stroke="#BCAAA4"
      strokeWidth="2"
    />
    {/* Window */}
    <rect
      x={width * 0.6}
      y={height * 0.12}
      width={width * 0.22}
      height={height * 0.3}
      rx="4"
      fill="#B3E5FC"
      stroke="#90A4AE"
      strokeWidth="2"
    />
    <line
      x1={width * 0.6 + width * 0.11}
      y1={height * 0.12}
      x2={width * 0.6 + width * 0.11}
      y2={height * 0.42}
      stroke="#90A4AE"
      strokeWidth="1.5"
    />
    <line
      x1={width * 0.6}
      y1={height * 0.27}
      x2={width * 0.6 + width * 0.22}
      y2={height * 0.27}
      stroke="#90A4AE"
      strokeWidth="1.5"
    />
    {/* Roof triangle */}
    <polygon
      points={`${width * 0.15},0 ${width * 0.5},${-60 + 10} ${width * 0.85},0`}
      fill="#A1887F"
    />
  </svg>
);

/** SVG gradient sky */
const SkyGradientSvg: React.FC<{
  width: number;
  height: number;
  isNight: boolean;
}> = ({ width, height, isNight }) => (
  <svg
    width={width}
    height={height}
    style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id={isNight ? "nightSky" : "daySky"} x1="0" y1="0" x2="0" y2="1">
        {isNight ? (
          <>
            <stop offset="0%" stopColor="#0D1B2A" />
            <stop offset="100%" stopColor="#1B2838" />
          </>
        ) : (
          <>
            <stop offset="0%" stopColor="#64B5F6" />
            <stop offset="100%" stopColor="#87CEEB" />
          </>
        )}
      </linearGradient>
    </defs>
    <rect x="0" y="0" width={width} height={height} fill={`url(#${isNight ? "nightSky" : "daySky"})`} />
  </svg>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
    : [data.emoji || "boy"];
  const items = params.items?.length ? params.items : ["tree", "house"];

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
          x: 0.05 + ((i * 0.12) % 0.9),
          y: 0.05 + (((i * 0.17 + 0.03) % 0.55)),
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
      {/* Sky gradient background */}
      <SkyGradientSvg
        width={width}
        height={height}
        isNight={bgType === "night"}
      />

      <BackgroundBubbles width={width} height={height} />

      {/* Celestial body (sun or moon) */}
      {bgConfig.celestialType === "sun" && (
        <div
          style={{
            position: "absolute",
            left: bgConfig.celestialX * width - 30,
            top: bgConfig.celestialY * height - 30,
            zIndex: 1,
            userSelect: "none",
          }}
        >
          <SunSvg size={60} />
        </div>
      )}
      {bgConfig.celestialType === "moon" && (
        <div
          style={{
            position: "absolute",
            left: bgConfig.celestialX * width - 30,
            top: bgConfig.celestialY * height - 30,
            zIndex: 1,
            userSelect: "none",
          }}
        >
          <MoonSvg size={60} />
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
              zIndex: 1,
              userSelect: "none",
            }}
          >
            <StarSvg size={star.size} opacity={twinkle} />
          </div>
        );
      })}

      {/* Indoor room */}
      {bgType === "indoor" && <IndoorRoomSvg width={width} height={height} />}

      {/* Ground with wavy top edge */}
      {bgType !== "indoor" ? (
        <WavyGroundSvg
          width={width}
          height={height}
          groundY={bgConfig.groundY}
          color={bgConfig.groundColor}
        />
      ) : (
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
      )}

      {/* Scene items with staggered entrance */}
      {items.map((item, i) => {
        const itemX = width * (0.15 + i * 0.25);
        const itemY = bgConfig.groundY * height - 56;
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
              opacity: itemSpring,
              transform: `scale(${itemSpring})`,
              zIndex: 2,
              userSelect: "none",
            }}
          >
            {renderItem(item, 56)}
          </div>
        );
      })}

      {/* Characters on ground */}
      {characters.map((char, i) => {
        const baseX = charBaseX + i * 70 + charSlideX;
        const charY = bgConfig.groundY * height - 60;
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
              opacity: charEntrance,
              transform: `scale(${charEntrance})`,
              zIndex: 3,
              userSelect: "none",
            }}
          >
            {renderCharacter(char, 60)}
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
