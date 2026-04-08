/**
 * Shared animation template definitions.
 * Used by backend for LLM prompt generation and validation.
 * Must stay in sync with frontend registry.
 */

export interface AnimationTemplateSummary {
  id: string;
  domain: string;
  description: string;
  engine: 'p5' | 'three';
  ageGroups: ('3-4' | '5-6' | 'all')[];
  params: { name: string; type: string; required: boolean; label: string }[];
}

export const ANIMATION_TEMPLATES: AnimationTemplateSummary[] = [
  {
    id: 'language.character-stroke',
    domain: 'language',
    description: '汉字笔画动画，逐笔显示汉字书写过程',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'character', type: 'string', required: true, label: '要演示的汉字' },
      { name: 'strokeColor', type: 'color', required: false, label: '笔画颜色' },
      { name: 'showGrid', type: 'boolean', required: false, label: '显示田字格' },
    ],
  },
  {
    id: 'language.word-reveal',
    domain: 'language',
    description: '词语揭示动画，逐字出现并高亮显示',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'words', type: 'string[]', required: true, label: '要展示的词语列表' },
      { name: 'revealSpeed', type: 'number', required: false, label: '每个字出现间隔(毫秒)' },
      { name: 'highlightColor', type: 'color', required: false, label: '高亮颜色' },
    ],
  },
  {
    id: 'language.story-scene',
    domain: 'language',
    description: '故事场景动画，简单背景加角色移动',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'bgType', type: 'string', required: false, label: '背景类型(day/night/indoor)' },
      { name: 'characters', type: 'string[]', required: false, label: '角色名称列表' },
      { name: 'items', type: 'string[]', required: false, label: '场景物品列表' },
    ],
  },
  {
    id: 'math.counting-objects',
    domain: 'math',
    description: '物体计数动画，逐个出现并显示数字计数',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'objectType', type: 'string', required: false, label: '物体类型(apple/star/ball/heart)' },
      { name: 'targetCount', type: 'number', required: true, label: '目标数量' },
      { name: 'objectColor', type: 'color', required: false, label: '物体颜色' },
    ],
  },
  {
    id: 'math.shape-builder',
    domain: 'math',
    description: '图形拼搭动画，几何图形组合变换',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'shapes', type: 'string[]', required: false, label: '形状列表(circle/square/triangle)' },
      { name: 'buildOrder', type: 'number[]', required: false, label: '构建顺序' },
      { name: 'shapeColors', type: 'string[]', required: false, label: '形状颜色列表' },
    ],
  },
  {
    id: 'math.number-line',
    domain: 'math',
    description: '数字线动画，标尺上跳跃标记数字',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'startNum', type: 'number', required: false, label: '起始数字' },
      { name: 'endNum', type: 'number', required: false, label: '结束数字' },
      { name: 'highlightNum', type: 'number', required: false, label: '高亮数字' },
      { name: 'hopSequence', type: 'number[]', required: false, label: '跳跃序列' },
    ],
  },
  {
    id: 'math.abacus',
    domain: 'math',
    description: '算盘动画，珠子上下移动演示计数',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'rows', type: 'number', required: false, label: '算盘行数' },
      { name: 'values', type: 'number[]', required: false, label: '每行目标数量' },
      { name: 'showNumbers', type: 'boolean', required: false, label: '显示数字标签' },
    ],
  },
  {
    id: 'science.water-cycle',
    domain: 'science',
    description: '水循环动画，展示蒸发、凝结、降雨过程',
    engine: 'p5',
    ageGroups: ['5-6'],
    params: [
      { name: 'speed', type: 'number', required: false, label: '动画速度' },
      { name: 'showLabels', type: 'boolean', required: false, label: '显示标签' },
    ],
  },
  {
    id: 'science.day-night-cycle',
    domain: 'science',
    description: '日夜交替动画，3D地球自转展示白天黑夜',
    engine: 'three',
    ageGroups: ['5-6'],
    params: [
      { name: 'rotationSpeed', type: 'number', required: false, label: '旋转速度' },
      { name: 'showLabels', type: 'boolean', required: false, label: '显示标签' },
    ],
  },
  {
    id: 'science.plant-growth',
    domain: 'science',
    description: '植物生长动画，从种子到开花的完整过程',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'plantType', type: 'string', required: false, label: '植物类型(flower/tree/vegetable)' },
      { name: 'stages', type: 'number', required: false, label: '生长阶段数' },
    ],
  },
  {
    id: 'art.color-mixing',
    domain: 'art',
    description: '颜色混合动画，两种颜色混合展示结果',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'color1', type: 'color', required: false, label: '颜色1' },
      { name: 'color2', type: 'color', required: false, label: '颜色2' },
      { name: 'resultLabel', type: 'string', required: false, label: '结果颜色名称' },
    ],
  },
  {
    id: 'art.drawing-steps',
    domain: 'art',
    description: '分步绘画动画，一笔一笔教学简笔画',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'steps', type: 'string[]', required: false, label: '绘画步骤(形状列表)' },
      { name: 'lineColor', type: 'color', required: false, label: '线条颜色' },
    ],
  },
  {
    id: 'social.emotion-faces',
    domain: 'social',
    description: '表情变化动画，展示喜怒哀乐不同表情',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'emotions', type: 'string[]', required: false, label: '表情序列(happy/sad/angry/surprised)' },
      { name: 'transitionSpeed', type: 'number', required: false, label: '切换速度' },
    ],
  },
  {
    id: 'social.daily-routine',
    domain: 'social',
    description: '日常作息动画，时间线展示一天的活动',
    engine: 'p5',
    ageGroups: ['3-4', '5-6'],
    params: [
      { name: 'activities', type: 'string[]', required: false, label: '活动名称列表' },
      { name: 'highlightIndex', type: 'number', required: false, label: '当前高亮的活动索引' },
    ],
  },
];

/** Build the template list string for LLM prompt context */
export function buildTemplatePromptContext(): string {
  const lines = ANIMATION_TEMPLATES.map((t) => {
    const paramHints = t.params
      .filter((p) => p.required)
      .map((p) => `${p.name}(${p.type})`)
      .join(', ');
    return `- ${t.id}: ${t.description} [需要参数: ${paramHints || '无必填'}]`;
  });
  return `可选的动画模板(为每个场景选择最匹配的模板):\n${lines.join('\n')}`;
}

/** Known template IDs for validation */
export const KNOWN_TEMPLATE_IDS = new Set(ANIMATION_TEMPLATES.map((t) => t.id));

/** Domain-based template mapping for rule-based fallback */
export function suggestTemplateByDomain(domain: string, topic: string): string | null {
  const topicLower = topic.toLowerCase();

  // Language patterns
  if (domain === 'language' || domain === 'literacy') {
    if (/^[\u4e00-\u9fff]$/.test(topic)) return 'language.character-stroke';
    if (topic.length <= 4) return 'language.word-reveal';
    return 'language.story-scene';
  }

  // Math patterns
  if (domain === 'math') {
    if (/数|计数|加|减/.test(topic)) return 'math.counting-objects';
    if (/形|三角|圆|方/.test(topic)) return 'math.shape-builder';
    if (/算盘/.test(topic)) return 'math.abacus';
    return 'math.number-line';
  }

  // Science patterns
  if (domain === 'science') {
    if (/水|雨|蒸发/.test(topic)) return 'science.water-cycle';
    if (/白天|黑夜|地球|太阳/.test(topic)) return 'science.day-night-cycle';
    if (/植物|花|树|种子/.test(topic)) return 'science.plant-growth';
    return 'science.plant-growth';
  }

  // Art patterns
  if (domain === 'art') {
    if (/颜色|色彩|混/.test(topic)) return 'art.color-mixing';
    return 'art.drawing-steps';
  }

  // Social patterns
  if (domain === 'social') {
    if (/情绪|表情|开心|生气/.test(topic)) return 'social.emotion-faces';
    return 'social.daily-routine';
  }

  return null;
}
