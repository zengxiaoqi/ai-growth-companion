import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";

interface GeneratedScene {
  id: string;
  sequence: number;
  title: string;
  concept: string;
  narration: string;
  onScreenText: string;
  visualDescription: string;
  durationSec: number;
  transitionToNext: string;
  emphasis: string;
  accentColor: string;
  action: string;
  habitat: string;
  assetKey: string;
  assetTags: string[];
  audioSrc: string;
  visualAssets: {
    characterAssetSrc?: string;
    backgroundAssetSrc?: string;
    hasCharacterAsset?: boolean;
    hasBackgroundAsset?: boolean;
  };
}

interface GeneratedLessonProps {
  title: string;
  topic: string;
  scenes: GeneratedScene[];
  durationFrames: number;
}

export const GeneratedLesson: React.FC<GeneratedLessonProps> = ({ title, topic, scenes, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 场景持续时间计算
  const getSceneDuration = (sceneIndex: number) => {
    return scenes[sceneIndex]?.durationSec * fps || 90;
  };

  // 场景开始帧
  const getSceneStartFrame = (sceneIndex: number) => {
    let start = 0;
    for (let i = 0; i < sceneIndex; i++) {
      start += getSceneDuration(i);
    }
    return start;
  };

  // 森林背景组件
  const ForestBackground: React.FC<{ frame: number }> = ({ frame }) => {
    const tree sway = Math.sin(frame * 0.05) * 5;
    const grassWave = Math.sin(frame * 0.03 + 1) * 8;
    
    return (
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
        {/* 天空渐变 */}
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#87CEEB" />
            <stop offset="100%" stopColor="#E0F2F1" />
          </linearGradient>
          <linearGradient id="grassGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#90EE90" />
            <stop offset="100%" stopColor="#228B22" />
          </linearGradient>
        </defs>
        
        {/* 天空 */}
        <rect x="0" y="0" width="1920" height="700" fill="url(#skyGrad)" />
        
        {/* 太阳 */}
        <circle cx="1600" cy="150" r="60" fill="#FFD700" opacity={0.9} />
        <circle cx="1600" cy="150" r="80" fill="#FFD700" opacity={0.3} />
        
        {/* 远处的树木 */}
        <g transform={`translate(${sway}, 0)`}>
          <path d="M100 700 L180 400 L260 700 Z" fill="#2E7D32" />
          <path d="M180 700 L250 450 L320 700 Z" fill="#388E3C" />
          <path d="M250 700 L320 380 L390 700 Z" fill="#2E7D32" />
        </g>
        
        <g transform={`translate(${sway * 0.8}, 0)`}>
          <path d="M1500 700 L1580 420 L1660 700 Z" fill="#2E7D32" />
          <path d="M1580 700 L1650 460 L1720 700 Z" fill="#388E3C" />
          <path d="M1650 700 L1720 400 L1790 700 Z" fill="#2E7D32" />
        </g>
        
        {/* 草地 */}
        <rect x="0" y="650" width="1920" height="430" fill="url(#grassGrad)" />
        
        {/* 草丛细节 */}
        <g transform={`translate(0, ${grassWave})`}>
          <path d="M50 700 Q60 660 70 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M80 700 Q90 655 100 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M110 700 Q120 665 130 700" stroke="#228B22" strokeWidth="3" fill="none" />
        </g>
        
        <g transform={`translate(200, ${grassWave * 0.9})`}>
          <path d="M0 700 Q10 660 20 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M30 700 Q40 650 50 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M60 700 Q70 665 80 700" stroke="#228B22" strokeWidth="3" fill="none" />
        </g>
        
        <g transform={`translate(1700, ${grassWave * 0.8})`}>
          <path d="M0 700 Q10 660 20 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M30 700 Q40 655 50 700" stroke="#228B22" strokeWidth="3" fill="none" />
          <path d="M60 700 Q70 665 80 700" stroke="#228B22" strokeWidth="3" fill="none" />
        </g>
      </svg>
    );
  };

  // 孔雀身体组件
  const PeacockBody: React.FC<{ frame: number; x: number; y: number; scale: number; isDisplaying?: boolean }> = 
    ({ frame, x, y, scale, isDisplaying = false }) => {
    const walkBob = Math.sin(frame * 0.1) * 3;
    const headBob = Math.sin(frame * 0.1 + 0.5) * 2;
    const crestWave = Math.sin(frame * 0.08) * 3;
    
    // 开屏动画
    const tailSpread = isDisplaying ? 
      Math.min(interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" }), 1) : 0;
    const tailAngle = tailSpread * 80;
    const tailScale = 1 + tailSpread * 0.5;

    return (
      <svg 
        viewBox="0 0 1920 1080" 
        style={{ 
          position: "absolute", 
          left: x, 
          top: y, 
          width: 600 * scale, 
          height: 600 * scale,
          transform: `scale(${scale})`
        }}
      >
        {/* 尾羽（开屏时展开） */}
        {isDisplaying ? (
          <g transform={`translate(300, 450)`}>
            {/* 后层尾羽 */}
            {[...Array(8)].map((_, i) => {
              const angle = (i - 3.5) * 12;
              const length = 350 * tailScale;
              const spread = tailSpread;
              return (
                <g key={i} transform={`rotate(${angle * spread})`}>
                  <path 
                    d={`M0 0 L${length} ${-40 - i * 5} L${length} ${40 + i * 5} Z`}
                    fill="#00695C"
                    opacity={0.7}
                  />
                  {/* 眼状斑纹 */}
                  <g transform={`translate(${length * 0.7}, 0)`}>
                    <ellipse cx="0" cy="0" rx="25" ry="35" fill="#1A237E" />
                    <ellipse cx="0" cy="0" rx="18" ry="25" fill="#0D47A1" />
                    <circle cx="0" cy="0" r="10" fill="#1565C0" />
                    <circle cx="0" cy="0" r="5" fill="#1976D2" />
                  </g>
                </g>
              );
            })}
            
            {/* 中层尾羽 */}
            {[...Array(6)].map((_, i) => {
              const angle = (i - 2.5) * 16;
              const length = 320 * tailScale;
              return (
                <g key={i} transform={`rotate(${angle * tailSpread})`}>
                  <path 
                    d={`M0 0 L${length} ${-35 - i * 6} L${length} ${35 + i * 6} Z`}
                    fill="#00796B"
                  />
                  <g transform={`translate(${length * 0.65}, 0)`}>
                    <ellipse cx="0" cy="0" rx="22" ry="30" fill="#1A237E" />
                    <ellipse cx="0" cy="0" rx="15" ry="22" fill="#0D47A1" />
                    <circle cx="0" cy="0" r="8" fill="#1565C0" />
                  </g>
                </g>
              );
            })}
            
            {/* 前层尾羽 */}
            {[...Array(4)].map((_, i) => {
              const angle = (i - 1.5) * 20;
              const length = 280 * tailScale;
              return (
                <g key={i} transform={`rotate(${angle * tailSpread})`}>
                  <path 
                    d={`M0 0 L${length} ${-30 - i * 7} L${length} ${30 + i * 7} Z`}
                    fill="#00897B"
                  />
                  <g transform={`translate(${length * 0.6}, 0)`}>
                    <ellipse cx="0" cy="0" rx="20" ry="28" fill="#1A237E" />
                    <ellipse cx="0" cy="0" rx="14" ry="20" fill="#0D47A1" />
                    <circle cx="0" cy="0" r="7" fill="#1565C0" />
                  </g>
                </g>
              );
            })}
          </g>
        ) : (
          /* 闭合的尾羽 */
          <g transform={`translate(280, ${480 + walkBob})`}>
            <path d="M0 0 Q-50 100 -30 200 Q-60 250 -20 280" 
                  stroke="#00796B" strokeWidth="8" fill="none" />
            <path d="M5 0 Q-30 100 -10 200 Q-35 250 0 280" 
                  stroke="#00897B" strokeWidth="6" fill="none" />
            <path d="M10 0 Q-10 100 10 200 Q-10 250 20 280" 
                  stroke="#009688" strokeWidth="6" fill="none" />
          </g>
        )}
        
        {/* 身体 */}
        <ellipse 
          cx="300" 
          cy={480 + walkBob} 
          rx="70" 
          ry="90" 
          fill="#1565C0"
        />
        
        {/* 胸部蓝色渐变区域 */}
        <ellipse 
          cx="300" 
          cy={470 + walkBob} 
          rx="55" 
          ry="75" 
          fill="#1976D2"
        />
        
        {/* 翅膀 */}
        <path 
          d={`M250 ${460 + walkBob} Q180 ${420 + walkBob} 160 ${480 + walkBob} Q180 ${520 + walkBob} 250 ${500 + walkBob}`}
          fill="#0D47A1"
        />
        <path 
          d={`M255 ${465 + walkBob} Q190 ${430 + walkBob} 175 ${480 + walkBob} Q190 ${515 + walkBob} 255 ${495 + walkBob}`}
          fill="#1565C0"
        />
        
        {/* 脖子 */}
        <path 
          d={`M285 ${400 + walkBob} Q275 ${350 + walkBob} 290 ${300 + headBob}`}
          stroke="#1565C0" 
          strokeWidth="35" 
          fill="none"
          strokeLinecap="round"
        />
        <path 
          d={`M285 ${400 + walkBob} Q275 ${350 + walkBob} 290 ${300 + headBob}`}
          stroke="#1976D2" 
          strokeWidth="25" 
          fill="none"
          strokeLinecap="round"
        />
        
        {/* 头部 */}
        <ellipse 
          cx={295 + headBob} 
          cy={280 + headBob} 
          rx="35" 
          ry="40" 
          fill="#1565C0"
        />
        
        {/* 羽冠 */}
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i - 2) * 8;
          const height = 35 + i * 2;
          return (
            <g key={i} transform={`translate(${295 + headBob}, ${245 + headBob})`}>
              <path 
                d={`M0 0 L${Math.sin(angle * 0.1) * 10} ${-height + Math.sin(frame * 0.1 + i) * 3}`}
                stroke="#00897B" 
                strokeWidth="3" 
                fill="none"
                strokeLinecap="round"
              />
              <circle 
                cx={`${Math.sin(angle * 0.1) * 10}`}
                cy={`${-height + Math.sin(frame * 0.1 + i) * 3}`}
                r="4"
                fill="#4DB6AC"
              />
            </g>
          );
        })}
        
        {/* 眼睛 */}
        <circle cx={308 + headBob} cy={275 + headBob} r="10" fill="white" />
        <circle cx={310 + headBob} cy={275 + headBob} r="6" fill="black" />
        <circle cx={312 + headBob} cy={273 + headBob} r="2" fill="white" />
        
        {/* 喙 */}
        <path 
          d={`M330 ${280 + headBob} L360 ${285 + headBob} L330 ${290 + headBob} Z`}
          fill="#FFB300"
        />
        <path 
          d={`M330 ${282 + headBob} L355 ${285 + headBob} L330 ${288 + headBob} Z`}
          fill="#FF8F00"
        />
        
        {/* 白色脸颊斑 */}
        <ellipse 
          cx={325 + headBob} 
          cy={290 + headBob} 
          rx="12" 
          ry="10" 
          fill="white"
        />
        
        {/* 腿 */}
        <g transform={`translate(275, ${560 + walkBob})`}>
          <line x1="0" y1="0" x2="0" y2="50" stroke="#FFB300" strokeWidth="6" />
          <ellipse cx="0" cy="55" rx="15" ry="5" fill="#FFB300" />
        </g>
        <g transform={`translate(315, ${560 + walkBob})`}>
          <line x1="0" y1="0" x2="0" y2="45" stroke="#FFB300" strokeWidth="6" />
          <ellipse cx="0" cy="50" rx="15" ry="5" fill="#FFB300" />
        </g>
      </svg>
    );
  };

  // 雌孔雀（灰色）
  const FemalePeacock: React.FC<{ frame: number; x: number; y: number }> = ({ frame, x, y }) => {
    const headBob = Math.sin(frame * 0.08 + 2) * 2;
    
    return (
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", left: x, top: y, width: 400, height: 400 }}>
        {/* 身体 */}
        <ellipse cx="200" cy="320" rx="50" ry="70" fill="#78909C" />
        
        {/* 脖子 */}
        <path 
          d="M185 260 Q175 220 190 175"
          stroke="#78909C" 
          strokeWidth="28" 
          fill="none"
          strokeLinecap="round"
        />
        <path 
          d="M185 260 Q175 220 190 175"
          stroke="#90A4AE" 
          strokeWidth="20" 
          fill="none"
          strokeLinecap="round"
        />
        
        {/* 头部 */}
        <ellipse cx={195 + headBob} cy="160" rx="28" ry="32" fill="#78909C" />
        
        {/* 羽冠（较短） */}
        {[0, 1, 2].map((i) => {
          const angle = (i - 1) * 8;
          return (
            <g key={i} transform={`translate(${195 + headBob}, 130)`}>
              <path 
                d={`M0 0 L${Math.sin(angle * 0.1) * 5} ${-20}`}
                stroke="#546E7A" 
                strokeWidth="2" 
                fill="none"
                strokeLinecap="round"
              />
              <circle 
                cx={`${Math.sin(angle * 0.1) * 5}`}
                cy={-20}
                r="2.5"
                fill="#78909C"
              />
            </g>
          );
        })}
        
        {/* 眼睛 */}
        <circle cx={205 + headBob} cy="155" r="7" fill="white" />
        <circle cx={206 + headBob} cy="155" r="4" fill="black" />
        
        {/* 喙 */}
        <path 
          d={`M220 ${160 + headBob} L240 ${163 + headBob} L220 ${166 + headBob} Z`}
          fill="#A1887F"
        />
        
        {/* 尾羽 */}
        <path d="M180 380 Q140 420 160 460 Q130 490 150 520" 
              stroke="#78909C" strokeWidth="5" fill="none" />
        <path d="M185 380 Q155 420 170 460 Q150 490 165 520" 
              stroke="#90A4AE" strokeWidth="4" fill="none" />
        <path d="M190 380 Q170 420 180 460 Q170 490 180 520" 
              stroke="#90A4AE" strokeWidth="4" fill="none" />
        
        {/* 腿 */}
        <g transform="translate(180, 380)">
          <line x1="0" y1="0" x2="0" y2="40" stroke="#A1887F" strokeWidth="5" />
          <ellipse cx="0" cy="44" rx="12" ry="4" fill="#A1887F" />
        </g>
        <g transform="translate(210, 380)">
          <line x1="0" y1="0" x2="0" y2="35" stroke="#A1887F" strokeWidth="5" />
          <ellipse cx="0" cy="39" rx="12" ry="4" fill="#A1887F" />
        </g>
      </svg>
    );
  };

  // 场景1：认识孔雀朋友
  const Scene1: React.FC<{ frame: number }> = ({ frame }) => {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
    const peacockX = interpolate(frame, [0, 180], [-200, 700], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
    const textOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" });
    const titleY = interpolate(frame, [60, 90], [100, 150], { extrapolateRight: "clamp" });
    
    return (
      <AbsoluteFill style={{ opacity }}>
        <ForestBackground frame={frame} />
        <PeacockBody frame={frame} x={peacockX} y={200} scale={1} />
        
        {/* 标题 */}
        <div 
          style={{
            position: "absolute",
            top: titleY,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 100,
            fontWeight: "bold",
            color: "#1565C0",
            textShadow: "4px 4px 8px rgba(0,0,0,0.3)",
            opacity: textOpacity
          }}
        >
          认识孔雀朋友
        </div>
        
        {/* 屏幕文字 */}
        <div 
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 121, 107, 0.85)",
            padding: "20px 60px",
            borderRadius: 30,
            fontSize: 56,
            color: "white",
            fontWeight: "bold",
            opacity: textOpacity
          }}
        >
          这是孔雀
        </div>
      </AbsoluteFill>
    );
  };

  // 场景2：华丽的羽毛
  const Scene2: React.FC<{ frame: number }> = ({ frame }) => {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
    const featherScale = interpolate(frame, [0, 60], [0.5, 1], { extrapolateRight: "clamp" });
    const textOpacity = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });
    
    // 羽毛绘制动画
    const featherProgress = Math.min(frame / 90, 1);
    
    return (
      <AbsoluteFill style={{ opacity }}>
        {/* 虚化森林背景 */}
        <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%", filter: "blur(8px)" }}>
          <rect x="0" y="0" width="1920" height="1080" fill="#E0F2F1" />
        </svg>
        
        {/* 羽毛特写 */}
        <svg 
          viewBox="0 0 1920 1080" 
          style={{ 
            position: "absolute", 
            width: "100%", 
            height: "100%",
            transform: `scale(${featherScale})`
          }}
        >
          <defs>
            <linearGradient id="featherGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00695C" />
              <stop offset="50%" stopColor="#00897B" />
              <stop offset="100%" stopColor="#00796B" />
            </linearGradient>
          </defs>
          
          {/* 三根羽毛 */}
          {[0, 1, 2].map((i) => {
            const yOffset = i * 120;
            const xOffset = i * 40;
            const drawProgress = Math.max(0, Math.min((featherProgress - i * 0.2) / 0.8, 1));
            
            return (
              <g key={i} transform={`translate(${500 + xOffset}, ${350 + yOffset})`}>
                {/* 羽毛杆 */}
                <line 
                  x1="0" 
                  y1="0" 
                  x2={`${500 * drawProgress}`} 
                  y2="0" 
                  stroke="#004D40" 
                  strokeWidth="4"
                />
                
                {/* 羽毛主体 */}
                <path 
                  d={`M0 0 Q${250 * drawProgress} ${-30 - i * 10} ${500 * drawProgress} 0 Q${250 * drawProgress} ${30 + i * 10} 0 0`}
                  fill="url(#featherGrad)"
                  opacity={drawProgress}
                />
                
                {/* 眼状斑纹 */}
                {drawProgress > 0.7 && (
                  <g transform={`translate(${350}, 0)`} opacity={drawProgress}>
                    <ellipse cx="0" cy="0" rx="30" ry="40" fill="#1A237E" />
                    <ellipse cx="0" cy="0" rx="22" ry="30" fill="#0D47A1" />
                    <circle cx="0" cy="0" r="12" fill="#1565C0" />
                    <circle cx="0" cy="0" r="6" fill="#1976D2" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        
        {/* 标题 */}
        <div 
          style={{
            position: "absolute",
            top: 120,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 90,
            fontWeight: "bold",
            color: "#00695C",
            textShadow: "4px 4px 8px rgba(0,0,0,0.2)",
            opacity: textOpacity
          }}
        >
          华丽的羽毛
        </div>
        
        {/* 屏幕文字 */}
        <div 
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 121, 107, 0.85)",
            padding: "20px 60px",
            borderRadius: 30,
            fontSize: 56,
            color: "white",
            fontWeight: "bold",
            opacity: textOpacity
          }}
        >
          翠绿的长尾羽
        </div>
      </AbsoluteFill>
    );
  };

  // 场景3：孔雀为什么开屏
  const Scene3: React.FC<{ frame: number }> = ({ frame }) => {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
    const textOpacity = interpolate(frame, [180, 210], [0, 1], { extrapolateRight: "clamp" });
    
    return (
      <AbsoluteFill style={{ opacity }}>
        <ForestBackground frame={frame} />
        
        {/* 雄孔雀开屏 */}
        <PeacockBody frame={frame} x={600} y={150} scale={1.3} isDisplaying={true} />
        
        {/* 雌孔雀在旁边观察 */}
        <FemalePeacock frame={frame} x={1200} y={480} />
        
        {/* 爱心动画 */}
        {frame > 90 && (
          <svg 
            viewBox="0 0 1920 1080" 
            style={{ position: "absolute", width: "100%", height: "100%" }}
          >
            <g transform="translate(1050, 400)">
              {[0, 1, 2].map((i) => {
                const heartDelay = i * 30;
                const heartFrame = Math.max(0, frame - 90 - heartDelay);
                const heartOpacity = interpolate(heartFrame, [0, 15, 45], [0, 1, 0], { extrapolateRight: "clamp" });
                const heartY = interpolate(heartFrame, [0, 45], [0, -80], { extrapolateRight: "clamp" });
                const heartScale = interpolate(heartFrame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
                
                return (
                  <g key={i} transform={`translate(${i * 40}, ${heartY}) scale(${heartScale})`} opacity={heartOpacity}>
                    <path 
                      d="M0 10 C-20 -10, -40 10, 0 40 C40 10, 20 -10, 0 10"
                      fill="#E91E63"
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        
        {/* 标题 */}
        <div 
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 80,
            fontWeight: "bold",
            color: "#1565C0",
            textShadow: "4px 4px 8px rgba(0,0,0,0.3)",
            opacity: textOpacity
          }}
        >
          孔雀为什么开屏
        </div>
        
        {/* 屏幕文字 */}
        <div 
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 121, 107, 0.85)",
            padding: "20px 60px",
            borderRadius: 30,
            fontSize: 56,
            color: "white",
            fontWeight: "bold",
            opacity: textOpacity
          }}
        >
          开屏求偶
        </div>
      </AbsoluteFill>
    );
  };

  // 场景4：羽毛上的眼睛
  const Scene4: React.FC<{ frame: number }> = ({ frame }) => {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
    const textOpacity = interpolate(frame, [150, 180], [0, 1], { extrapolateRight: "clamp" });
    
    return (
      <AbsoluteFill style={{ opacity }}>
        {/* 深色背景突出眼状斑纹 */}
        <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
          <rect x="0" y="0" width="1920" height="1080" fill="#1A237E" opacity={0.3} />
          <rect x="0" y="0" width="1920" height="1080" fill="#E0F2F1" />
        </svg>
        
        {/* 三个眼状斑纹依次高亮 */}
        <svg viewBox="0 0 1920 1080" style={{ position: "absolute", width: "100%", height: "100%" }}>
          {[0, 1, 2].map((i) => {
            const highlightDelay = i * 50;
            const highlightFrame = Math.max(0, frame - highlightDelay);
            const scale = interpolate(highlightFrame, [0, 20, 180], [0.5, 1.5, 1.5], { extrapolateRight: "clamp" });
            const glowOpacity = interpolate(highlightFrame, [0, 20, 40, 180], [0, 0.8, 0.4, 0], { extrapolateRight: "clamp" });
            const textFade = interpolate(highlightFrame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
            
            const xPos = 450 + i * 350;
            const yPos = 440;
            
            return (
              <g key={i} transform={`translate(${xPos}, ${yPos}) scale(${scale})`}>
                {/* 发光效果 */}
                <ellipse 
                  cx="0" 
                  cy="0" 
                  rx="50" 
                  ry="65" 
                  fill="#FFD54F"
                  opacity={glowOpacity * 0.3}
                />
                
                {/* 斑纹 */}
                <ellipse cx="0" cy="0" rx="35" ry="48" fill="#1A237E" />
                <ellipse cx="0" cy="0" rx="26" ry="36" fill="#0D47A1" />
                <circle cx="0" cy="0" r="14" fill="#1565C0" />
                <circle cx="0" cy="0" r="7" fill="#1976D2" />
                <circle cx="-2" cy="-2" r="3" fill="#42A5F5" />
                
                {/* 编号 */}
                {textFade > 0 && (
                  <text 
                    x="0" 
                    y="80" 
                    textAnchor="middle"
                    fontSize="36"
                    fill="#1565C0"
                    fontWeight="bold"
                    opacity={textFade}
                  >
                    {i + 1}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        
        {/* 标题 */}
        <div 
          style={{
            position: "absolute",
            top: 100,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 85,
            fontWeight: "bold",
            color: "#1565C0",
            textShadow: "4px 4px 8px rgba(0,0,0,0.2)",
            opacity: textOpacity
          }}
        >
          羽毛上的眼睛
        </div>
        
        {/* 屏幕文字 */}
        <div 
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 121, 107, 0.85)",
            padding: "20px 60px",
            borderRadius: 30,
            fontSize: 56,
            color: "white",
            fontWeight: "bold",
            opacity: textOpacity
          }}
        >
          眼状斑纹
        </div>
      </AbsoluteFill>
    );
  };

  // 场景5：孔雀小总结
  const Scene5: React.FC<{ frame: number }> = ({ frame }) => {
    const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
    const textOpacity = interpolate(frame, [120, 150], [0, 1], { extrapolateRight: "clamp" });
    
    // 关键词动画
    const keyword1Opacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });
    const keyword2Opacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: "clamp" });
    const keyword3Opacity = interpolate(frame, [90, 120], [0, 1], { extrapolateRight: "clamp" });
    
    const keyword1Y = interpolate(frame, [30, 60], [150, 250], { extrapolateRight: "clamp" });
    const keyword2Y = interpolate(frame, [60, 90], [150, 350], { extrapolateRight: "clamp" });
    const keyword3Y = interpolate(frame, [90, 120], [150, 450], { extrapolateRight: "clamp" });
    
    return (
      <AbsoluteFill style={{ opacity }}>
        <ForestBackground frame={frame} />
        
        {/* 开屏的孔雀 */}
        <PeacockBody frame={frame} x={660} y={120} scale={1.4} isDisplaying={true} />
        
        {/* 关键词展示 */}
        <div style={{ position: "absolute", left: 1300, top: 0, width: 500 }}>
          <div 
            style={{
              fontSize: 70,
              fontWeight: "bold",
              color: "#00695C",
              marginTop: keyword1Y,
              opacity: keyword1Opacity,
              backgroundColor: "rgba(255,255,255,0.9)",
              padding: "15px 40px",
              borderRadius: 20,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            孔雀
          </div>
          
          <div 
            style={{
              fontSize: 70,
              fontWeight: "bold",
              color: "#1565C0",
              marginTop: 30,
              opacity: keyword2Opacity,
              backgroundColor: "rgba(255,255,255,0.9)",
              padding: "15px 40px",
              borderRadius: 20,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            冠羽
          </div>
          
          <div 
            style={{
              fontSize: 70,
              fontWeight: "bold",
              color: "#00897B",
              marginTop: 30,
              opacity: keyword3Opacity,
              backgroundColor: "rgba(255,255,255,0.9)",
              padding: "15px 40px",
              borderRadius: 20,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            开屏
          </div>
        </div>
        
        {/* 标题 */}
        <div 
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 90,
            fontWeight: "bold",
            color: "#1565C0",
            textShadow: "4px 4px 8px rgba(0,0,0,0.3)",
            opacity: textOpacity
          }}
        >
          孔雀小总结
        </div>
        
        {/* 屏幕文字 */}
        <div 
          style={{
            position: "absolute",
            bottom: 150,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 121, 107, 0.85)",
            padding: "20px 60px",
            borderRadius: 30,
            fontSize: 56,
            color: "white",
            fontWeight: "bold",
            opacity: textOpacity
          }}
        >
          森林里的孔雀
        </div>
      </AbsoluteFill>
    );
  };

  // 旁白文字组件
  const NarrationText: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
    const opacity = interpolate(frame, [0, 15, 60, 75], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
    
    return (
      <div 
        style={{
          position: "absolute",
          bottom: 50,
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "20px 50px",
          borderRadius: 25,
          fontSize: 42,
          color: "white",
          fontWeight: "500",
          maxWidth: 1600,
          textAlign: "center",
          opacity
        }}
      >
        {text}
      </div>
    );
  };

  return (
    <AbsoluteFill>
      {scenes.map((scene, index) => {
        const startFrame = getSceneStartFrame(index);
        const sceneDuration = getSceneDuration(index);
        
        return (
          <Sequence 
            key={scene.id} 
            from={startFrame} 
            durationInFrames={sceneDuration}
            premountFor={30}
          >
            {/* 音频播放 */}
            {scene.audioSrc && (
              <Audio 
                src={staticFile(scene.audioSrc)} 
                volume={0.94}
              />
            )}
            
            {/* 场景内容 */}
            {index === 0 && <Scene1 frame={frame - startFrame} />}
            {index === 1 && <Scene2 frame={frame - startFrame} />}
            {index === 2 && <Scene3 frame={frame - startFrame} />}
            {index === 3 && <Scene4 frame={frame - startFrame} />}
            {index === 4 && <Scene5 frame={frame - startFrame} />}
            
            {/* 旁白文字 */}
            <NarrationText text={scene.narration} frame={frame - startFrame} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export default GeneratedLesson;