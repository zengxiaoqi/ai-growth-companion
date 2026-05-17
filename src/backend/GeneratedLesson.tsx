import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";

type GeneratedScene = {
  id: string;
  sequence: number;
  title: string;
  concept: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  durationSec: number;
  accentColor?: string;
  action?: string;
  habitat?: string;
  assetKey?: string;
  assetTags?: string[];
  audioSrc?: string;
  visualAssets?: {
    characterAssetSrc?: string;
    backgroundAssetSrc?: string;
    hasCharacterAsset?: boolean;
    [key: string]: any;
  };
};

type GeneratedLessonProps = {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
};

const PeacockSVG: React.FC<{ frame: number; displayTail?: boolean; sceneType?: string }> = ({ frame, displayTail = false, sceneType = "walking" }) => {
  const headBob = Math.sin(frame * 0.08) * 5;
  const bodyBob = Math.sin(frame * 0.05) * 3;
  const wingFlap = Math.sin(frame * 0.1) * 8;
  const tailSpread = displayTail ? Math.min(interpolate(frame, [0, 30], [0, 1]), 1) : 0;
  const tailWave = Math.sin(frame * 0.03) * 5 * tailSpread;
  
  // Tail feathers animation when displayed
  const featherOscillation = displayTail ? Math.sin(frame * 0.05 + 1) * 3 : 0;
  
  const bodyX = 960;
  const bodyY = 540 + bodyBob;
  const headX = bodyX + headBob;
  const headY = bodyY - 80;
  
  const neckColor = "#1A5F7A";
  const bodyColor = "#2C6E49";
  const crestColor = "#4ECDC4";
  const tailColors = ["#FF6B6B", "#FFE66D", "#4ECDC4", "#95E1D3", "#F38181", "#AA96DA"];
  
  // Create tail feathers
  const tailFeathers: React.ReactNode[] = [];
  if (displayTail) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 11) * Math.PI - Math.PI / 2;
      const length = 280 + Math.sin(i * 0.5) * 30;
      const endX = bodyX + Math.cos(angle) * length * tailSpread;
      const endY = bodyY + 120 + Math.sin(angle) * length * tailSpread;
      const colorIndex = i % tailColors.length;
      const featherWobble = Math.sin(frame * 0.03 + i * 0.3) * 8;
      
      const actualEndX = endX + featherWobble;
      const actualEndY = endY;
      
      tailFeathers.push(
        <g key={`feather-${i}`}>
          <path
            d={`M ${bodyX}, ${bodyY + 60} Q ${bodyX + Math.cos(angle) * 80}, ${bodyY + 80 + Math.sin(angle) * 60} ${actualEndX}, ${actualEndY}`}
            stroke={tailColors[colorIndex]}
            strokeWidth="12"
            fill="none"
            opacity={tailSpread}
          />
          {/* Eye spot on feather */}
          <circle
            cx={actualEndX - Math.cos(angle) * 40}
            cy={actualEndY - Math.sin(angle) * 40}
            r={15}
            fill="#2C3E50"
            opacity={tailSpread}
          />
          <circle
            cx={actualEndX - Math.cos(angle) * 40}
            cy={actualEndY - Math.sin(angle) * 40}
            r={8}
            fill="#3498DB"
            opacity={tailSpread}
          />
          <circle
            cx={actualEndX - Math.cos(angle) * 40}
            cy={actualEndY - Math.sin(angle) * 40}
            r={4}
            fill="#1ABC9C"
            opacity={tailSpread}
          />
        </g>
      );
    }
  }
  
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
      {/* Background elements */}
      <rect x="0" y="0" width="1920" height="1080" fill="#E8F5E9" />
      
      {/* Grass ground */}
      <path d={`M 0,850 Q 480,830 960,850 T 1920,850 L 1920,1080 L 0,1080 Z`} fill="#81C784" />
      
      {/* Trees in background */}
      <g>
        <circle cx="200" cy="350" r="120" fill="#4CAF50" opacity="0.6" />
        <circle cx="280" cy="280" r="100" fill="#66BB6A" opacity="0.5" />
        <circle cx="150" cy="300" r="90" fill="#81C784" opacity="0.5" />
        <rect x="180" y="420" width="40" height="150" fill="#795548" />
        
        <circle cx="1700" cy="380" r="140" fill="#4CAF50" opacity="0.6" />
        <circle cx="1780" cy="300" r="110" fill="#66BB6A" opacity="0.5" />
        <circle cx="1640" cy="320" r="100" fill="#81C784" opacity="0.5" />
        <rect x="1670" y="450" width="45" height="160" fill="#795548" />
      </g>
      
      {/* Sun */}
      <circle cx="1600" cy="200" r="60" fill="#FFD54F" />
      <circle cx="1600" cy="200" r="80" fill="#FFD54F" opacity="0.3" />
      
      {/* Tail feathers (behind body) */}
      {tailFeathers}
      
      {/* Peacock body */}
      <ellipse cx={bodyX} cy={bodyY} rx="70" ry="90" fill={bodyColor} />
      
      {/* Wings */}
      <ellipse
        cx={bodyX - 40 + wingFlap}
        cy={bodyY + 20}
        rx="45"
        ry="70"
        fill={bodyColor}
        transform={`rotate(-10, ${bodyX - 40}, ${bodyY + 20})`}
      />
      <ellipse
        cx={bodyX + 40 - wingFlap}
        cy={bodyY + 20}
        rx="45"
        ry="70"
        fill={bodyColor}
        transform={`rotate(10, ${bodyX + 40}, ${bodyY + 20})`}
      />
      
      {/* Neck */}
      <path
        d={`M ${bodyX - 20}, ${bodyY - 60} Q ${headX - 15}, ${headY + 30} ${headX}, ${headY}`}
        stroke={neckColor}
        strokeWidth="35"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Head */}
      <circle cx={headX} cy={headY} r="35" fill={neckColor} />
      
      {/* Crest (crown) */}
      <g>
        <line x1={headX - 10} y1={headY - 30} x2={headX - 15} y2={headY - 60} stroke={crestColor} strokeWidth="4" />
        <circle cx={headX - 15} cy={headY - 62} r="6" fill={crestColor} />
        
        <line x1={headX} y1={headY - 32} x2={headX} y2={headY - 68} stroke={crestColor} strokeWidth="4" />
        <circle cx={headX} cy={headY - 70} r="7" fill={crestColor} />
        
        <line x1={headX + 10} y1={headY - 30} x2={headX + 15} y2={headY - 60} stroke={crestColor} strokeWidth="4" />
        <circle cx={headX + 15} cy={headY - 62} r="6" fill={crestColor} />
        
        <line x1={headX - 5} y1={headY - 28} x2={headX - 8} y2={headY - 55} stroke={crestColor} strokeWidth="3" />
        <circle cx={headX - 8} cy={headY - 56} r="5" fill={crestColor} />
        
        <line x1={headX + 5} y1={headY - 28} x2={headX + 8} y2={headY - 55} stroke={crestColor} strokeWidth="3" />
        <circle cx={headX + 8} cy={headY - 56} r="5" fill={crestColor} />
      </g>
      
      {/* Eye */}
      <circle cx={headX + 12} cy={headY} r="10" fill="white" />
      <circle cx={headX + 14} cy={headY} r="6" fill="#2C3E50" />
      <circle cx={headX + 16} cy={headY - 2} r="2" fill="white" />
      
      {/* Beak */}
      <path
        d={`M ${headX + 30}, ${headY + 2} L ${headX + 50}, ${headY + 5} L ${headX + 30}, ${headY + 12} Z`}
        fill="#F4A460"
      />
      
      {/* Legs */}
      <line x1={bodyX - 25} y1={bodyY + 80} x2={bodyX - 25} y2={bodyY + 140} stroke="#F4A460" strokeWidth="8" />
      <line x1={bodyX + 25} y1={bodyY + 80} x2={bodyX + 25} y2={bodyY + 140} stroke="#F4A460" strokeWidth="8" />
      
      {/* Feet */}
      <path d={`M ${bodyX - 35}, ${bodyY + 138} L ${bodyX - 15}, ${bodyY + 138} L ${bodyX - 25}, ${bodyY + 130} Z`} fill="#F4A460" />
      <path d={`M ${bodyX + 15}, ${bodyY + 138} L ${bodyX + 35}, ${bodyY + 138} L ${bodyX + 25}, ${bodyY + 130} Z`} fill="#F4A460" />
    </svg>
  );
};

const FeatherCloseupSVG: React.FC<{ frame: number }> = ({ frame }) => {
  const shimmer = Math.sin(frame * 0.1) * 0.15;
  const scale = interpolate(frame, [0, 20], [0.5, 1], { extrapolateRight: "clamp" });
  const centerX = 960;
  const centerY = 540;
  
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
      {/* Blurred background */}
      <rect x="0" y="0" width="1920" height="1080" fill="#81C784" opacity="0.3" />
      <circle cx="400" cy="500" r="200" fill="#4CAF50" opacity="0.2" />
      <circle cx="1500" cy="600" r="250" fill="#66BB6A" opacity="0.2" />
      
      {/* Main feather */}
      <g transform={`translate(${centerX}, ${centerY}) scale(${scale})`}>
        {/* Feather shaft */}
        <path
          d="M -10, -300 Q 0, 0 10, 300"
          stroke="#5D4E37"
          strokeWidth="6"
          fill="none"
        />
        
        {/* Feather barbs - left side */}
        {[...Array(15)].map((_, i) => {
          const y = -280 + i * 40;
          const length = 80 - Math.abs(i - 7) * 5;
          return (
            <path
              key={`left-${i}`}
              d={`M -5, ${y} Q ${-length * 0.5}, ${y + 10} ${-length}, ${y}`}
              stroke={i % 2 === 0 ? "#FF6B6B" : "#4ECDC4"}
              strokeWidth="8"
              fill="none"
              opacity={0.8 + shimmer}
            />
          );
        })}
        
        {/* Feather barbs - right side */}
        {[...Array(15)].map((_, i) => {
          const y = -280 + i * 40;
          const length = 80 - Math.abs(i - 7) * 5;
          return (
            <path
              key={`right-${i}`}
              d={`M 5, ${y} Q ${length * 0.5}, ${y + 10} ${length}, ${y}`}
              stroke={i % 2 === 0 ? "#FF6B6B" : "#4ECDC4"}
              strokeWidth="8"
              fill="none"
              opacity={0.8 + shimmer}
            />
          );
        })}
        
        {/* Eye spot */}
        <circle cx="0" cy="0" r="50" fill="#2C3E50" />
        <circle cx="0" cy="0" r="35" fill="#3498DB" />
        <circle cx="0" cy="0" r="20" fill="#1ABC9C" />
        <circle cx="0" cy="0" r="10" fill="#16A085" />
        <circle cx="-8" cy="-8" r="5" fill="white" opacity="0.4" />
      </g>
      
      {/* Sparkle effects */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const radius = 300 + Math.sin(frame * 0.05 + i) * 30;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        const sparkleSize = 10 + Math.sin(frame * 0.1 + i) * 5;
        return (
          <circle
            key={`sparkle-${i}`}
            cx={x}
            cy={y}
            r={sparkleSize}
            fill="#FFD54F"
            opacity={0.6 + Math.sin(frame * 0.08 + i) * 0.3}
          />
        );
      })}
    </svg>
  );
};

const PeacockDisplaySVG: React.FC<{ frame: number }> = ({ frame }) => {
  const tailProgress = Math.min(interpolate(frame, [0, 40], [0, 1]), 1);
  const featherWave = Math.sin(frame * 0.04) * 8;
  const bodyBob = Math.sin(frame * 0.03) * 5;
  
  const bodyX = 960;
  const bodyY = 600 + bodyBob;
  const tailColors = ["#FF6B6B", "#FFE66D", "#4ECDC4", "#95E1D3", "#F38181", "#AA96DA", "#74B9FF", "#FD79A8"];
  
  // Create fan of tail feathers
  const tailFeathers: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 15) * Math.PI - Math.PI / 2;
    const length = 380 + Math.sin(i * 0.8) * 40;
    const endX = bodyX + Math.cos(angle) * length * tailProgress;
    const endY = bodyY - 50 + Math.sin(angle) * length * tailProgress;
    const colorIndex = i % tailColors.length;
    const featherWobble = Math.sin(frame * 0.03 + i * 0.4) * 10;
    
    const actualEndX = endX + featherWobble * tailProgress;
    const actualEndY = endY;
    
    tailFeathers.push(
      <g key={`fan-feather-${i}`}>
        {/* Feather shaft */}
        <path
          d={`M ${bodyX}, ${bodyY} Q ${bodyX + Math.cos(angle) * 100 * tailProgress}, ${bodyY - 20 + Math.sin(angle) * 60 * tailProgress} ${actualEndX}, ${actualEndY}`}
          stroke={tailColors[colorIndex]}
          strokeWidth="14"
          fill="none"
          opacity={tailProgress}
        />
        
        {/* Eye spot */}
        const eyeX = actualEndX - Math.cos(angle) * 50;
        const eyeY = actualEndY - Math.sin(angle) * 50;
        const eyeScale = tailProgress;
        
        <g transform={`translate(${eyeX}, ${eyeY}) scale(${eyeScale})`}>
          <circle cx="0" cy="0" r="25" fill="#2C3E50" />
          <circle cx="0" cy="0" r="18" fill="#3498DB" />
          <circle cx="0" cy="0" r="10" fill="#1ABC9C" />
          <circle cx="0" cy="0" r="5" fill="#16A085" />
        </g>
      </g>
    );
  }
  
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
      {/* Simple background */}
      <rect x="0" y="0" width="1920" height="1080" fill="#E0F7FA" />
      
      {/* Ground */}
      <path d="M 0,800 Q 960,780 1920,800 L 1920,1080 L 0,1080 Z" fill="#81C784" />
      
      {/* Tail feathers (behind body) */}
      {tailFeathers}
      
      {/* Peacock body */}
      <ellipse cx={bodyX} cy={bodyY} rx="80" ry="100" fill="#2C6E49" />
      
      {/* Neck */}
      <path
        d={`M ${bodyX - 15}, ${bodyY - 70} Q ${bodyX - 10}, ${bodyY - 100} ${bodyX}, ${bodyY - 130}`}
        stroke="#1A5F7A"
        strokeWidth="40"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Head */}
      <circle cx={bodyX} cy={bodyY - 140} r="40" fill="#1A5F7A" />
      
      {/* Crest */}
      {[...Array(5)].map((_, i) => {
        const offsetX = (i - 2) * 12;
        return (
          <g key={`crest-${i}`}>
            <line
              x1={bodyX + offsetX}
              y1={bodyY - 175}
              x2={bodyX + offsetX * 1.2}
              y2={bodyY - 210}
              stroke="#4ECDC4"
              strokeWidth="5"
            />
            <circle
              cx={bodyX + offsetX * 1.2}
              cy={bodyY - 212}
              r={7}
              fill="#4ECDC4"
            />
          </g>
        );
      })}
      
      {/* Eye */}
      <circle cx={bodyX + 12} cy={bodyY - 140} r="12" fill="white" />
      <circle cx={bodyX + 14} cy={bodyY - 140} r="7" fill="#2C3E50" />
      <circle cx={bodyX + 16} cy={bodyY - 142} r="3" fill="white" />
      
      {/* Beak */}
      <path
        d={`M ${bodyX + 35}, ${bodyY - 138} L ${bodyX + 55}, ${bodyY - 135} L ${bodyX + 35}, ${bodyY - 128} Z`}
        fill="#F4A460"
      />
      
      {/* Legs */}
      <line x1={bodyX - 30} y1={bodyY + 90} x2={bodyX - 30} y2={bodyY + 150} stroke="#F4A460" strokeWidth="10" />
      <line x1={bodyX + 30} y1={bodyY + 90} x2={bodyX + 30} y2={bodyY + 150} stroke="#F4A460" strokeWidth="10" />
      
      {/* Light rays */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <line
            key={`ray-${i}`}
            x1={bodyX + Math.cos(angle) * 450}
            y1={bodyY + Math.sin(angle) * 450}
            x2={bodyX + Math.cos(angle) * 520}
            y2={bodyY + Math.sin(angle) * 520}
            stroke="#FFD54F"
            strokeWidth="4"
            opacity={0.3 + Math.sin(frame * 0.05 + i) * 0.2}
          />
        );
      })}
    </svg>
  );
};

const CourtshipSVG: React.FC<{ frame: number }> = ({ frame }) => {
  const tailProgress = Math.min(interpolate(frame, [0, 30], [0, 1]), 1);
  const bodyBob = Math.sin(frame * 0.04) * 5;
  const heartFloat = Math.sin(frame * 0.06) * 20;
  const heartOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  
  const maleX = 700;
  const maleY = 600 + bodyBob;
  const femaleX = 1220;
  const femaleY = 650 + Math.sin(frame * 0.03 + 1) * 3;
  
  const tailColors = ["#FF6B6B", "#FFE66D", "#4ECDC4", "#95E1D3", "#F38181"];
  
  // Male tail feathers
  const maleTailFeathers: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 11) * Math.PI - Math.PI / 2 + 0.3;
    const length = 320;
    const endX = maleX + Math.cos(angle) * length * tailProgress;
    const endY = maleY - 50 + Math.sin(angle) * length * tailProgress;
    const colorIndex = i % tailColors.length;
    const featherWobble = Math.sin(frame * 0.04 + i * 0.3) * 8;
    
    const actualEndX = endX + featherWobble * tailProgress;
    const actualEndY = endY;
    
    maleTailFeathers.push(
      <g key={`male-feather-${i}`}>
        <path
          d={`M ${maleX}, ${maleY} Q ${maleX + Math.cos(angle) * 80 * tailProgress}, ${maleY - 20 + Math.sin(angle) * 50 * tailProgress} ${actualEndX}, ${actualEndY}`}
          stroke={tailColors[colorIndex]}
          strokeWidth="12"
          fill="none"
          opacity={tailProgress}
        />
        
        <circle
          cx={actualEndX - Math.cos(angle) * 40}
          cy={actualEndY - Math.sin(angle) * 40}
          r="15"
          fill="#2C3E50"
          opacity={tailProgress}
        />
        <circle
          cx={actualEndX - Math.cos(angle) * 40}
          cy={actualEndY - Math.sin(angle) * 40}
          r="8"
          fill="#3498DB"
          opacity={tailProgress}
        />
      </g>
    );
  }
  
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
      {/* Background */}
      <rect x="0" y="0" width="1920" height="1080" fill="#FFF3E0" />
      
      {/* Ground */}
      <path d="M 0,750 Q 960,730 1920,750 L 1920,1080 L 0,1080 Z" fill="#A5D6A7" />
      
      {/* Bushes */}
      <ellipse cx="300" cy="720" rx="150" ry="80" fill="#66BB6A" opacity="0.5" />
      <ellipse cx="1620" cy="710" rx="180" ry="90" fill="#66BB6A" opacity="0.5" />
      
      {/* Male peacock tail (behind body) */}
      {maleTailFeathers}
      
      {/* Male peacock body */}
      <ellipse cx={maleX} cy={maleY} rx="70" ry="90" fill="#2C6E49" />
      
      {/* Male neck */}
      <path
        d={`M ${maleX - 15}, ${maleY - 65} Q ${maleX - 10}, ${maleY - 95} ${maleX}, ${maleY - 125}`}
        stroke="#1A5F7A"
        strokeWidth="35"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Male head */}
      <circle cx={maleX} cy={maleY - 135} r="35" fill="#1A5F7A" />
      
      {/* Male crest */}
      {[...Array(3)].map((_, i) => {
        const offsetX = (i - 1) * 10;
        return (
          <g key={`male-crest-${i}`}>
            <line
              x1={maleX + offsetX}
              y1={maleY - 168}
              x2={maleX + offsetX * 1.3}
              y2={maleY - 195}
              stroke="#4ECDC4"
              strokeWidth="4"
            />
            <circle
              cx={maleX + offsetX * 1.3}
              cy={maleY - 197}
              r={6}
              fill="#4ECDC4"
            />
          </g>
        );
      })}
      
      {/* Male eye */}
      <circle cx={maleX + 10} cy={maleY - 135} r="10" fill="white" />
      <circle cx={maleX + 12} cy={maleY - 135} r="6" fill="#2C3E50" />
      
      {/* Male beak */}
      <path
        d={`M ${maleX + 32}, ${maleY - 133} L ${maleX + 50}, ${maleY - 130} L ${maleX + 32}, ${maleY - 124} Z`}
        fill="#F4A460"
      />
      
      {/* Male legs */}
      <line x1={maleX - 25} y1={maleY + 80} x2={maleX - 25} y2={maleY + 140} stroke="#F4A460" strokeWidth="8" />
      <line x1={maleX + 25} y1={maleY + 80} x2={maleX + 25} y2={maleY + 140} stroke="#F4A460" strokeWidth="8" />
      
      {/* Female peacock (brown, simpler) */}
      <ellipse cx={femaleX} cy={femaleY} rx="60" ry="80" fill="#8D6E63" />
      
      {/* Female neck */}
      <path
        d={`M ${femaleX - 10}, ${femaleY - 55} Q ${femaleX - 5}, ${femaleY - 85} ${femaleX}, ${femaleY - 115}`}
        stroke="#A1887F"
        strokeWidth="30"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Female head */}
      <circle cx={femaleX} cy={femaleY - 125} r="30" fill="#A1887F" />
      
      {/* Female crest */}
      {[...Array(3)].map((_, i) => {
        const offsetX = (i - 1) * 8;
        return (
          <g key={`female-crest-${i}`}>
            <line
              x1={femaleX + offsetX}
              y1={femaleY - 152}
              x2={femaleX + offsetX * 1.2}
              y2={femaleY - 175}
              stroke="#BCAAA4"
              strokeWidth="3"
            />
            <circle
              cx={femaleX + offsetX * 1.2}
              cy={femaleY - 177}
              r={5}
              fill="#BCAAA4"
            />
          </g>
        );
      })}
      
      {/* Female eye */}
      <circle cx={femaleX + 8} cy={femaleY - 125} r="8" fill="white" />
      <circle cx={femaleX + 10} cy={femaleY - 125} r="5" fill="#2C3E50" />
      
      {/* Female beak */}
      <path
        d={`M ${femaleX + 28}, ${femaleY - 123} L ${femaleX + 45}, ${femaleY - 120} L ${femaleX + 28}, ${femaleY - 115} Z`}
        fill="#F4A460"
      />
      
      {/* Female legs */}
      <line x1={femaleX - 20} y1={femaleY + 70} x2={femaleX - 20} y2={femaleY + 130} stroke="#F4A460" strokeWidth="7" />
      <line x1={femaleX + 20} y1={femaleY + 70} x2={femaleX + 20} y2={femaleY + 130} stroke="#F4A460" strokeWidth="7" />
      
      {/* Floating hearts */}
      <g opacity={heartOpacity}>
        <path
          d={`M 960, ${350 + heartFloat} C 920, ${310 + heartFloat} 860, ${330 + heartFloat} 860, ${380 + heartFloat} C 860, ${430 + heartFloat} 960, ${490 + heartFloat} 1060, ${430 + heartFloat} C 1060, ${380 + heartFloat} 1000, ${310 + heartFloat} 960, ${350 + heartFloat}`}
          fill="#E91E63"
          transform="scale(0.8)"
        />
        <path
          d={`M 850, ${450 + heartFloat * 0.7} C 830, ${430 + heartFloat * 0.7} 800, ${440 + heartFloat * 0.7} 800, ${465 + heartFloat * 0.7} C 800, ${490 + heartFloat * 0.7} 850, ${520 + heartFloat * 0.7} 900, ${490 + heartFloat * 0.7} C 900, ${465 + heartFloat * 0.7} 870, ${430 + heartFloat * 0.7} 850, ${450 + heartFloat * 0.7}`}
          fill="#E91E63"
          transform="scale(0.5)"
          opacity="0.7"
        />
      </g>
    </svg>
  );
};

const SummarySVG: React.FC<{ frame: number }> = ({ frame }) => {
  const bodyBob = Math.sin(frame * 0.05) * 3;
  const bubbleScale = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  
  const bodyX = 960;
  const bodyY = 580 + bodyBob;
  
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
      {/* Background */}
      <rect x="0" y="0" width="1920" height="1080" fill="#E8F5E9" />
      
      {/* Ground */}
      <path d="M 0,750 Q 960,730 1920,750 L 1920,1080 L 0,1080 Z" fill="#81C784" />
      
      {/* Decorative trees */}
      <circle cx="200" cy="400" r="100" fill="#4CAF50" opacity="0.4" />
      <circle cx="1700" cy="420" r="110" fill="#4CAF50" opacity="0.4" />
      
      {/* Peacock body */}
      <ellipse cx={bodyX} cy={bodyY} rx="75" ry="95" fill="#2C6E49" />
      
      {/* Wings */}
      <ellipse
        cx={bodyX - 45}
        cy={bodyY + 25}
        rx="50"
        ry="75"
        fill="#2C6E49"
        transform="rotate(-8, ${bodyX - 45}, ${bodyY + 25})"
      />
      <ellipse
        cx={bodyX + 45}
        cy={bodyY + 25}
        rx="50"
        ry="75"
        fill="#2C6E49"
        transform="rotate(8, ${bodyX + 45}, ${bodyY + 25})"
      />
      
      {/* Neck */}
      <path
        d={`M ${bodyX - 18}, ${bodyY - 68} Q ${bodyX - 12}, ${bodyY - 100} ${bodyX}, ${bodyY - 130}`}
        stroke="#1A5F7A"
        strokeWidth="38"
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Head */}
      <circle cx={bodyX} cy={bodyY - 140} r="38" fill="#1A5F7A" />
      
      {/* Crest */}
      {[...Array(5)].map((_, i) => {
        const offsetX = (i - 2) * 12;
        return (
          <g key={`summary-crest-${i}`}>
            <line
              x1={bodyX + offsetX}
              y1={bodyY - 175}
              x2={bodyX + offsetX * 1.2}
              y2={bodyY - 215}
              stroke="#4ECDC4"
              strokeWidth="5"
            />
            <circle
              cx={bodyX + offsetX * 1.2}
              cy={bodyY - 217}
              r={7}
              fill="#4ECDC4"
            />
          </g>
        );
      })}
      
      {/* Eye */}
      <circle cx={bodyX + 12} cy={bodyY - 140} r="11" fill="white" />
      <circle cx={bodyX + 14} cy={bodyY - 140} r="7" fill="#2C3E50" />
      <circle cx={bodyX + 16} cy={bodyY - 142} r="3" fill="white" />
      
      {/* Beak */}
      <path
        d={`M ${bodyX + 35}, ${bodyY - 138} L ${bodyX + 55}, ${bodyY - 135} L ${bodyX + 35}, ${bodyY - 128} Z`}
        fill="#F4A460"
      />
      
      {/* Legs */}
      <line x1={bodyX - 28} y1={bodyY + 85} x2={bodyX - 28} y2={bodyY + 145} stroke="#F4A460" strokeWidth="10" />
      <line x1={bodyX + 28} y1={bodyY + 85} x2={bodyX + 28} y2={bodyY + 145" stroke="#F4A460" strokeWidth="10" />
      
      {/* Feature bubbles */}
      {/* Crest bubble */}
      <g transform={`translate(500, 280) scale(${bubbleScale})`}>
        <ellipse cx="0" cy="0" rx="100" ry="70" fill="#4ECDC4" opacity="0.3" />
        <text x="0" y="10" fontSize="40" fill="#00695C" textAnchor="middle" fontWeight="bold">羽冠</text>
        <path d="M 50, 60 L 80, 100 L 60, 100 L 70, 130 L 40, 90 L 60, 90 Z" fill="#4ECDC4" />
      </g>
      
      {/* Tail spot bubble */}
      <g transform={`translate(1420, 280) scale(${bubbleScale})`}>
        <ellipse cx="0" cy="0" rx="100" ry="70" fill="#FF6B6B" opacity="0.3" />
        <text x="0" y="10" fontSize="40" fill="#C62828" textAnchor="middle" fontWeight="bold">眼斑</text>
        <circle cx="-40" cy="-10" r="20" fill="#2C3E50" />
        <circle cx="-40" cy="-10" r="12" fill="#3498DB" />
        <circle cx="-40" cy="-10" r="6" fill="#1ABC9C" />
      </g>
      
      {/* Display bubble */}
      <g transform={`translate(960, 200) scale(${bubbleScale})`}>
        <ellipse cx="0" cy="0" rx="90" ry="65" fill="#FFE66D" opacity="0.3" />
        <text x="0" y="10" fontSize="40" fill="#F57F17" textAnchor="middle" fontWeight="bold">开屏</text>
        {/* Mini tail display */}
        {[...Array(5)].map((_, i) => {
          const angle = (i / 4) * Math.PI - Math.PI / 2;
          return (
            <path
              key={`mini-tail-${i}`}
              d={`M 0, 25 L ${Math.cos(angle) * 40}, ${Math.sin(angle) * 40}`}
              stroke="#FF6B6B"
              strokeWidth="6"
              strokeLinecap="round"
            />
          );
        })}
      </g>
      
      {/* Waving wing (goodbye gesture) */}
      <ellipse
        cx={bodyX + 55 + Math.sin(frame * 0.15) * 15}
        cy={bodyY + 40}
        rx="40"
        ry="60"
        fill="#2C6E49"
        transform={`rotate(${20 + Math.sin(frame * 0.15) * 10}, ${bodyX + 55}, ${bodyY + 40})`}
      />
    </svg>
  );
};

const SceneComponent: React.FC<{
  scene: GeneratedScene;
  sceneFrame: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}> = ({ scene, sceneFrame, fadeInFrames = 15, fadeOutFrames = 15 }) => {
  const opacity = interpolate(
    sceneFrame,
    [0, fadeInFrames, scene.durationFrames * 30 - fadeOutFrames, scene.durationFrames * 30],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const getVisualComponent = () => {
    switch (scene.sequence) {
      case 1:
        return <PeacockSVG frame={sceneFrame} displayTail={false} sceneType="walking" />;
      case 2:
        return <FeatherCloseupSVG frame={sceneFrame} />;
      case 3:
        return <PeacockDisplaySVG frame={sceneFrame} />;
      case 4:
        return <CourtshipSVG frame={sceneFrame} />;
      case 5:
        return <SummarySVG frame={sceneFrame} />;
      default:
        return <PeacockSVG frame={sceneFrame} displayTail={false} />;
    }
  };
  
  return (
    <AbsoluteFill style={{ opacity }}>
      {getVisualComponent()}
      
      {/* Title at top */}
      <div
        style={{
          position: "absolute",
          top: "80px",
          left: "0",
          right: "0",
          textAlign: "center",
          fontSize: "64px",
          fontWeight: "bold",
          color: "#00695C",
          textShadow: "3px 3px 6px rgba(0,0,0,0.2)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {scene.title}
      </div>
      
      {/* On-screen text at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: "200px",
          left: "0",
          right: "0",
          textAlign: "center",
          fontSize: "48px",
          fontWeight: "bold",
          color: "#FFFFFF",
          backgroundColor: "rgba(0, 150, 136, 0.85)",
          padding: "20px 40px",
          margin: "0 100px",
          borderRadius: "20px",
          fontFamily: "Arial, sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {scene.onScreenText}
      </div>
      
      {/* Narration bar */}
      <div
        style={{
          position: "absolute",
          bottom: "50px",
          left: "0",
          right: "0",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "15px 40px",
          color: "#FFFFFF",
          fontSize: "28px",
          fontFamily: "Arial, sans-serif",
          lineHeight: "1.4",
          textAlign: "center",
        }}
      >
        {scene.narration}
      </div>
    </AbsoluteFill>
  );
};

export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({
  title,
  topic,
  scenes,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  let currentFrame = 0;
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#E0F2F1" }}>
      {scenes.map((scene, index) => {
        const sceneDuration = scene.durationSec * fps;
        const from = currentFrame;
        currentFrame += sceneDuration;
        
        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={sceneDuration}
            premountFor={fps}
          >
            <SceneComponent scene={scene} sceneFrame={frame - from} />
            {scene.audioSrc ? (
              <Audio src={staticFile(scene.audioSrc)} volume={0.94} />
            ) : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export default GeneratedLesson;