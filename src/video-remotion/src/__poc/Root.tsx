import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { FigureCanvas } from './FigureCanvas';
import { FigureSpec } from './figure-spec';
import { lensSpec, rainbowSpec, solarSpec } from './specs';

/**
 * PoC 舞台：故意照着现有模板的版式搭 —— 顶部标题、底部深色字幕条、中间留给画面。
 * 目的是验证 figure 通道接进真实镜头后能不能共存，而不是看一张孤立的图。
 */
const PocStage: React.FC<{
  spec: FigureSpec;
  duration: number;
  title: string;
  caption: string;
  accent: string;
}> = ({ spec, duration, title, caption, accent }) => (
  <AbsoluteFill style={{ backgroundColor: '#FBFCFE' }}>
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 46,
        fontWeight: 900,
        color: '#12303A',
        letterSpacing: 2,
      }}
    >
      {title}
    </div>
    <div
      style={{
        position: 'absolute',
        top: 122,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 30,
        fontWeight: 800,
        color: accent,
      }}
    >
      {caption}
    </div>
    <AbsoluteFill style={{ paddingTop: 214, alignItems: 'center' }}>
      <FigureCanvas spec={spec} duration={duration} accent={accent} />
    </AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          background: 'rgba(24, 38, 46, 0.9)',
          color: '#FFFFFF',
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1.42,
          padding: '20px 40px',
          borderRadius: 26,
        }}
      >
        {caption}
      </div>
    </div>
  </AbsoluteFill>
);

export const PocRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PocRainbow"
        component={PocStage}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          spec: rainbowSpec,
          duration: 150,
          title: '彩虹是怎么来的',
          caption: '阳光照到空中的小水滴，被折射和反射，散成七种颜色。',
          accent: '#F76B15',
        }}
      />
      <Composition
        id="PocSolar"
        component={PocStage}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          spec: solarSpec,
          duration: 150,
          title: '太阳系有几颗行星',
          caption: '行星都绕着太阳转，离太阳越远，走一圈用的时间越长。',
          accent: '#3E63DD',
        }}
      />
      <Composition
        id="PocLens"
        component={PocStage}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          spec: lensSpec,
          duration: 150,
          title: '放大镜为什么能把东西放大',
          caption: '光线穿过凸透镜会拐弯，最后聚在一起，就成了放大的像。',
          accent: '#3E63DD',
        }}
      />
    </>
  );
};
