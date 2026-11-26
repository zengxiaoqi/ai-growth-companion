type ScienceScene = {
  title?: unknown;
  shot?: unknown;
  scene?: unknown;
  concept?: unknown;
  narration?: unknown;
  visualDescription?: unknown;
  visualPrompt?: unknown;
  imagePrompt?: unknown;
  onScreenText?: unknown;
  caption?: unknown;
  sceneGraph?: { caption?: unknown; nodes?: Array<{ label?: unknown; subject?: unknown }> };
  figure?: { labels?: Array<{ text?: unknown }> };
  performance?: { actions?: Array<{ speech?: unknown; caption?: unknown }> };
  interaction?: {
    speech?: unknown;
    caption?: unknown;
    puppet?: { sequence?: Array<{ speech?: unknown; caption?: unknown }> };
    vectorPerformance?: { steps?: Array<{ speech?: unknown; caption?: unknown }> };
  };
};

export class ScienceFactGateError extends Error {
  constructor(topic: string, issues: string[]) {
    super(`science fact gate failed for "${topic}": ${issues.join('; ')}`);
    this.name = 'ScienceFactGateError';
  }
}

export function findTopicSpecificScienceIssues(
  payload: { videoLesson?: { shots?: ScienceScene[] }; scenes?: ScienceScene[] },
  topic: string,
): string[] {
  if (!/蜗牛/.test(topic)) return [];
  const shots = Array.isArray(payload.videoLesson?.shots)
    ? payload.videoLesson.shots
    : Array.isArray(payload.scenes)
      ? payload.scenes
      : [];
  const riskyClaims: Array<[RegExp, string]> = [
    [/从里向外(?:长大|生长)/, '蜗牛壳从里向外长'],
    [
      /(?:长大|生长|长一岁|长到)[^。！？]{0,10}(?:多绕一圈|多一圈|增加一圈)/,
      '把长大描述成固定增加一圈',
    ],
    [
      /(?:圈圈|圈|花纹|纹路|环纹)[^。！？]{0,30}(?:越多|变多)[^。！？]{0,30}(?:越大|越老|年龄)/,
      '用花纹数量推断年龄或大小',
    ],
    [/年轮[^。！？]{0,30}(?:一岁|年龄|越老|越多)/, '把蜗牛壳当年轮推断年龄'],
    [/不怕[^。！？]{0,16}(?:啄|咬|吃)/, '把有壳说成绝对不怕天敌'],
  ];
  const issues: string[] = [];
  shots.forEach((scene, index) => {
    const graphText = [
      scene.sceneGraph?.caption,
      ...(scene.sceneGraph?.nodes || []).map(
        (node) => `${String(node.label || '')} ${String(node.subject || '')}`,
      ),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
    const figureText = (scene.figure?.labels || [])
      .map((label) => String(label.text || ''))
      .join(' ');
    const performanceText = [
      scene.interaction?.speech,
      scene.interaction?.caption,
      ...(scene.performance?.actions || []).flatMap((action) => [action.speech, action.caption]),
      ...(scene.interaction?.puppet?.sequence || []).flatMap((step) => [step.speech, step.caption]),
      ...(scene.interaction?.vectorPerformance?.steps || []).flatMap((step) => [
        step.speech,
        step.caption,
      ]),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('。');
    const text = [
      scene.title,
      scene.shot,
      scene.scene,
      scene.concept,
      scene.narration,
      scene.visualDescription,
      scene.visualPrompt,
      scene.imagePrompt,
      scene.onScreenText,
      scene.caption,
      graphText,
      figureText,
      performanceText,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('。');
    const sentences = text
      .split(/[。！？!?]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      // 儿童科普常把错误说法作为反例纠正；明确否定该结论的句子不是风险断言。
      const negatesRisk =
        /(?:不能|不可以|不要|不是|不代表|无法|并不)[^。！？]{0,18}(?:越老|越大|年龄|年轮|多一圈|多绕一圈|增加一圈|不怕)/.test(
          sentence,
        ) ||
        /(?:越老|越大|年龄|年轮|多一圈|多绕一圈|增加一圈|不怕)[^。！？]{0,12}(?:说法|结论)?(?:不对|错误)/.test(
          sentence,
        );
      if (negatesRisk) continue;
      for (const [pattern, label] of riskyClaims) {
        if (pattern.test(sentence)) issues.push(`scene ${index + 1}: ${label}`);
      }
    }
  });
  return issues;
}

export function assertTopicSpecificScienceFacts(
  payload: { videoLesson?: { shots?: ScienceScene[] }; scenes?: ScienceScene[] },
  topic: string,
): void {
  const issues = findTopicSpecificScienceIssues(payload, topic);
  if (issues.length > 0) throw new ScienceFactGateError(topic, issues);
}
