/* 用生产函数生成年龄 A/B 编排窗口，供 preview-prepare.js 的 a1/a2 场景粘贴。
 * 跑法：npx ts-node -T scripts/preview-age-ab.js */
const {
  sanitizeBeats,
  beatWindows,
  enforceAgeProfile,
  ageMotionProfile,
} = require('../src/modules/learning/video/choreography');
const { normalizeSceneGraph } = require('../src/modules/learning/video/scene-graph');

const graph = normalizeSceneGraph({
  relation: 'cycle',
  caption: '水转一圈又回来了',
  nodes: [
    { id: 'n1', label: '太阳', subject: '太阳', role: 'place' },
    { id: 'n2', label: '水汽', subject: '水蒸气', role: 'abstract', sign: 'rise' },
    { id: 'n3', label: '白云', subject: '白云', role: 'object', swell: 'grow' },
    { id: 'n4', label: '雨滴', subject: '雨', role: 'object' },
  ],
});
const narration = '太阳出来了。水变热了。水汽上升。飞上天空。遇冷变云。云越积厚。落下雨滴。水又回来。';
const rawBeats = Array.from({ length: 8 }, (_, i) => ({
  sentenceIndex: i,
  focus: 'n' + ((i % 4) + 1),
  motion: 'focus-ring',
}));
const durationSec = 200 / 30;
for (const age of ['3-4', '5-6']) {
  const profile = ageMotionProfile(age);
  const beats = sanitizeBeats(rawBeats, { narration, graph }, age);
  const windows = enforceAgeProfile(beatWindows(beats, narration, durationSec), profile);
  const ch = {
    profile,
    beats: windows.map((w) => {
      const startFrame = Math.round(w.startSec * 30);
      return {
        sentenceIndex: w.beat.sentenceIndex,
        ...(w.beat.span ? { span: w.beat.span } : {}),
        ...(w.beat.focus ? { focus: w.beat.focus } : {}),
        ...(w.beat.reveal && w.beat.reveal.length ? { reveal: w.beat.reveal } : {}),
        motion: w.beat.motion,
        startFrame,
        endFrame: Math.max(startFrame + 1, Math.round(w.endSec * 30)),
      };
    }),
  };
  console.log('AGE ' + age + ' ' + JSON.stringify(ch));
}