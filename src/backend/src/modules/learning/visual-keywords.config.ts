export interface KeywordMapping {
  value: string;
  keywords: string[];
}

export const ACTION_KEYWORDS: KeywordMapping[] = [
  { value: 'swim', keywords: ['游泳', '河', '溪', 'swim', 'river', '水'] },
  {
    value: 'eat',
    keywords: [
      '胡萝卜',
      '萝卜',
      '菜叶',
      'carrot',
      'eat',
      'food',
      '吃',
      '香蕉',
      'banana',
      '桃子',
      '水果',
    ],
  },
  {
    value: 'jump',
    keywords: ['蹦', '跳', 'jump', 'hop', '攀', '爬树', 'climb'],
  },
  { value: 'run', keywords: ['跑', '奔跑', '追', 'run'] },
  { value: 'roar', keywords: ['吼', '叫声', 'roar'] },
  { value: 'rest', keywords: ['睡', '休息', 'rest'] },
  {
    value: 'showFeatures',
    keywords: ['条纹', '外形', '样子', 'feature', 'stripe', '外貌', '尾巴'],
  },
  { value: 'listen', keywords: ['耳朵', '长耳', 'ear'] },
  { value: 'climb', keywords: ['攀', '爬树', '爬', 'climb', '树'] },
];

export const HABITAT_KEYWORDS: KeywordMapping[] = [
  { value: 'night', keywords: ['夜', '晚上', 'night'] },
  {
    value: 'river',
    keywords: ['河', '溪', '水', '游泳', 'river', 'swim'],
  },
  { value: 'grassland', keywords: ['草地', '草原', 'grass'] },
];

export const ENVIRONMENT_TAG_KEYWORDS: KeywordMapping[] = [
  { value: 'stripe', keywords: ['条纹', 'stripe'] },
  { value: 'forest', keywords: ['森林', '树', 'forest', 'jungle'] },
  { value: 'tree', keywords: ['森林', '树', 'forest', 'jungle'] },
  {
    value: 'grassland',
    keywords: ['草地', '草原', '青草', 'grassland', 'meadow'],
  },
  { value: 'grass', keywords: ['草地', '草原', '青草', 'grassland', 'meadow'] },
  {
    value: 'carrot',
    keywords: ['胡萝卜', '萝卜', '菜叶', 'carrot', 'vegetable'],
  },
  {
    value: 'vegetable',
    keywords: ['胡萝卜', '萝卜', '菜叶', 'carrot', 'vegetable'],
  },
  { value: 'long-ears', keywords: ['耳朵', '长耳', 'ear'] },
  { value: 'jump', keywords: ['蹦', '跳', 'jump', 'hop'] },
  {
    value: 'legs',
    keywords: ['蹦', '跳', 'jump', 'hop', '跑', '奔跑', '追', 'run'],
  },
  { value: 'river', keywords: ['河', '溪', '水', '游泳', 'river', 'swim'] },
  { value: 'water', keywords: ['河', '溪', '水', '游泳', 'river', 'swim'] },
  { value: 'swim', keywords: ['河', '溪', '水', '游泳', 'river', 'swim'] },
  { value: 'run', keywords: ['跑', '奔跑', '追', 'run'] },
  { value: 'roar', keywords: ['吼', '叫声', 'roar'] },
  { value: 'sound', keywords: ['吼', '叫声', 'roar'] },
  { value: 'night', keywords: ['夜', '晚上', 'night'] },
  { value: 'moon', keywords: ['夜', '晚上', 'night'] },
  { value: 'claw', keywords: ['牙', '爪', '本领', 'ability'] },
  { value: 'teeth', keywords: ['牙', '爪', '本领', 'ability'] },
];

export function matchKeyword(source: string, mappings: KeywordMapping[]): string | null {
  for (const mapping of mappings) {
    if (mapping.keywords.some((kw) => source.toLowerCase().includes(kw.toLowerCase()))) {
      return mapping.value;
    }
  }
  return null;
}
