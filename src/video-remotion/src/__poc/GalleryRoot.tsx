import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { FigureCanvas } from './FigureCanvas';
import { gallery } from './gallery-specs';

/**
 * 画廊舞台 — 只做一件事：把实测报告里真实模型输出的 figure 一张张渲染出来。
 * 版式刻意贴近生产模板（顶部标题、中间画布、底部字幕条），
 * 这样"图形在这个尺寸下还看不看得清"是被真实约束住的，而不是看一张孤立的图。
 */
const GalleryStage: React.FC<{
  topic: string;
  title: string;
  accent: string;
  spec: (typeof gallery)[number]['spec'];
}> = ({ topic, title, accent, spec }) => (
  <AbsoluteFill style={{ backgroundColor: '#FBFCFE' }}>
    <div
      style={{
        position: 'absolute',
        top: 44,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 30,
        fontWeight: 700,
        color: '#7A8B99',
        letterSpacing: 1,
      }}
    >
      {topic}
    </div>
    <div
      style={{
        position: 'absolute',
        top: 92,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: 48,
        fontWeight: 900,
        color: '#12303A',
        letterSpacing: 2,
      }}
    >
      {title}
    </div>
    <AbsoluteFill style={{ paddingTop: 196, alignItems: 'center' }}>
      <FigureCanvas spec={spec} duration={150} accent={accent} />
    </AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 60,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          background: 'rgba(24, 38, 46, 0.9)',
          color: '#FFFFFF',
          fontSize: 32,
          fontWeight: 700,
          padding: '18px 40px',
          borderRadius: 24,
        }}
      >
        讲解字幕条位置（此处验证图形底边有没有被压住）
      </div>
    </div>
  </AbsoluteFill>
);

export const GalleryRoot: React.FC = () => (
  <>
    {gallery.map((item) => (
      <Composition
        key={item.id}
        id={item.id}
        component={GalleryStage}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          topic: item.topic,
          title: item.title,
          accent: item.accent,
          spec: item.spec,
        }}
      />
    ))}
  </>
);
