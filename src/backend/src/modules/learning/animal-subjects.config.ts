export interface AnimalSubjectConfig {
  id: string;
  keywords: string[];
  actionRoles: Record<string, string>;
  defaultRole: string;
  accentColor: string;
  visualTerms: string[];
  hasInlineSvg: boolean;
}

export const ANIMAL_SUBJECTS: AnimalSubjectConfig[] = [
  {
    id: 'tiger',
    keywords: ['tiger', '老虎', '虎'],
    actionRoles: {
      run: 'tiger-running',
      swim: 'tiger-swimming',
      roar: 'tiger-roaring',
    },
    defaultRole: 'tiger-standing',
    accentColor: '#f08c00',
    visualTerms: ['tiger', 'stripe', 'claw', 'forest'],
    hasInlineSvg: true,
  },
  {
    id: 'rabbit',
    keywords: ['rabbit', 'bunny', '兔子', '小兔', '兔'],
    actionRoles: {
      eat: 'rabbit-eating',
      run: 'rabbit-jumping',
      jump: 'rabbit-jumping',
      listen: 'rabbit-listening',
      showFeatures: 'rabbit-listening',
    },
    defaultRole: 'rabbit-standing',
    accentColor: '#e76f8a',
    visualTerms: ['rabbit', 'long-ears', 'grassland'],
    hasInlineSvg: true,
  },
  {
    id: 'monkey',
    keywords: ['monkey', '猴子', '小猴', '猴'],
    actionRoles: {
      run: 'monkey-running',
      jump: 'monkey-jumping',
      eat: 'monkey-eating',
      climb: 'monkey-climbing',
      showFeatures: 'monkey-sitting',
    },
    defaultRole: 'monkey-sitting',
    accentColor: '#a0522d',
    visualTerms: ['monkey', 'tail', 'tree', 'banana'],
    hasInlineSvg: true,
  },
];

/**
 * 中文动物名 → 稳定 id。放在模块级，既供「认识动物X」兜底，
 * 也供 findAnimalSubject 做通用动物识别——小熊、熊猫、小狗等角色
 * 虽然不在 ANIMAL_SUBJECTS 里，但矢量库有对应素材，应当能被画出来。
 */
const CN_ANIMAL_MAP: Record<string, string> = {
  虎: 'tiger',
  老虎: 'tiger',
  兔: 'rabbit',
  兔子: 'rabbit',
  小兔: 'rabbit',
  兔兔: 'rabbit',
  猴: 'monkey',
  猴子: 'monkey',
  小猴: 'monkey',
  海豚: 'dolphin',
  大象: 'elephant',
  象: 'elephant',
  狮子: 'lion',
  狮: 'lion',
  熊猫: 'panda',
  大熊猫: 'panda',
  猫: 'cat',
  小猫: 'cat',
  狗: 'dog',
  小狗: 'dog',
  鱼: 'fish',
  小鱼: 'fish',
  鸟: 'bird',
  小鸟: 'bird',
  蛇: 'snake',
  乌龟: 'turtle',
  龟: 'turtle',
  青蛙: 'frog',
  蛙: 'frog',
  蝴蝶: 'butterfly',
  蜗牛: 'snail',
  蜜蜂: 'bee',
  蚂蚁: 'ant',
  企鹅: 'penguin',
  长颈鹿: 'giraffe',
  鹿: 'deer',
  斑马: 'zebra',
  河马: 'hippo',
  鳄鱼: 'crocodile',
  袋鼠: 'kangaroo',
  考拉: 'koala',
  树懒: 'sloth',
  松鼠: 'squirrel',
  狐狸: 'fox',
  狼: 'wolf',
  北极熊: 'polar-bear',
  熊: 'bear',
  小熊: 'bear',
  鲨鱼: 'shark',
  鲸鱼: 'whale',
  鲸: 'whale',
  章鱼: 'octopus',
  螃蟹: 'crab',
  海星: 'starfish',
  水母: 'jellyfish',
  孔雀: 'peacock',
  鹦鹉: 'parrot',
  猫头鹰: 'owl',
  老鹰: 'eagle',
  鹰: 'eagle',
};

/** 非 ANIMAL_SUBJECTS 角色的通用关键词，用于场景主角识别 */
const EXTRA_ANIMAL_KEYWORDS: Array<{ id: string; keyword: string }> = [
  ...Object.entries(CN_ANIMAL_MAP)
    .filter(([name, id]) => !ANIMAL_SUBJECTS.some((subject) => subject.id === id) && name.length >= 2)
    .map(([name, id]) => ({ id, keyword: name })),
  // 英文角色名（矢量库以英文 id 命名）
  ...Array.from(new Set(Object.values(CN_ANIMAL_MAP)))
    .filter((id) => !ANIMAL_SUBJECTS.some((subject) => subject.id === id))
    .map((id) => ({ id, keyword: id })),
];

interface AnimalHit {
  config: AnimalSubjectConfig;
  index: number;
  length: number;
}

/**
 * 选场景主角：按「文本里最先提到的动物」而不是配置数组顺序。
 *
 * 旧实现按 tiger → rabbit → monkey 的固定顺序扫描，只要台词里出现「兔」，
 * 即使整段都在讲小熊递皮球，也会先命中兔子——这就是「学会分享」六场全画
 * 白兔、台词却讲小熊的原因。视觉描述里第一个出现的角色才是这一幕的主角。
 */
export function findAnimalSubject(source: string, assetKey?: string): AnimalSubjectConfig | null {
  const lowered = source.toLowerCase();
  if (assetKey) {
    const exact = ANIMAL_SUBJECTS.find((subject) => subject.id === assetKey);
    if (exact) return exact;
  }

  const hits: AnimalHit[] = [];
  for (const subject of ANIMAL_SUBJECTS) {
    for (const keyword of subject.keywords) {
      const index = lowered.indexOf(keyword.toLowerCase());
      if (index >= 0) {
        hits.push({ config: subject, index, length: keyword.length });
      }
    }
  }
  for (const extra of EXTRA_ANIMAL_KEYWORDS) {
    const index = lowered.indexOf(extra.keyword.toLowerCase());
    if (index >= 0) {
      hits.push({
        config: getOrCreateAnimalConfig(extra.id),
        index,
        length: extra.keyword.length,
      });
    }
  }
  if (hits.length === 0) return null;

  // 同一起点优先更长的名字（「小熊」胜过「熊」），其余按出现先后
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  return hits[0].config;
}

/**
 * Infer animal name from topic text, even if not in ANIMAL_SUBJECTS config.
 * Handles patterns like "认识动物海豚", "认识动物大象", "learn about dolphins", etc.
 * Returns a known config if matched, or a synthetic config for any detected animal.
 */
export function inferAnimalFromText(
  source: string,
  assetKey?: string,
): { id: string; config: AnimalSubjectConfig | null } | null {
  // 1. Try known config first (exact match)
  const knownConfig = findAnimalSubject(source, assetKey);
  if (knownConfig) return { id: knownConfig.id, config: knownConfig };

  // 2. Try "认识动物X" pattern (Chinese topic format)
  const cnMatch = source.match(/认识\s*动物\s*([^\s,，。！？、\d]{1,6})/);
  if (cnMatch) {
    const name = cnMatch[1].trim();
    const id = cnToAnimalId(name);
    if (id) return { id, config: getOrCreateAnimalConfig(id) };
  }

  // 3. Try "learn about X" / "all about X" pattern (English)
  const enMatch = source.match(/(?:learn\s+about|all\s+about|discover)\s+(\w+)/i);
  if (enMatch) {
    const id = enMatch[1].toLowerCase();
    return { id, config: getOrCreateAnimalConfig(id) };
  }

  // 4. Use assetKey if it looks like an animal name (not "topic")
  if (assetKey && assetKey !== 'topic' && /^[a-z]+$/.test(assetKey)) {
    return { id: assetKey, config: getOrCreateAnimalConfig(assetKey) };
  }

  return null;
}

function cnToAnimalId(name: string): string | null {
  return CN_ANIMAL_MAP[name] || null;
}

export interface AnimalMention {
  id: string;
  /** 文案里实际用的叫法（小熊 / 兔兔 / 小兔），直接拿去当画面标签 */
  label: string;
  /** 在原文里的位置，用于判断"谁先出现 / 谁把东西递给谁" */
  index: number;
}

/**
 * 反向表：id → 最完整的中文名。
 *
 * 英文别名命中时拿它当 label。名条是给孩子看的中文，"bear" 直接上屏会变成
 * 中英混排，反查后中英两种输入最终都显示中文。
 */
const ID_TO_CN: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, id] of Object.entries(CN_ANIMAL_MAP)) {
    if (!out[id] || name.length > out[id].length) out[id] = name;
  }
  return out;
})();

/**
 * 找出一段文案里提到的**所有**角色，按出现顺序返回（同一角色只保留最早的一处）。
 *
 * findAnimalSubject 只回答"这一幕的主角是谁"，但"小熊把皮球递给小兔"这类
 * 交互场景需要同时知道两个角色，才能按关系摆位。交互关系层用这个函数拿演员表。
 */
export function findAnimalMentions(source: string): AnimalMention[] {
  const hits = new Map<string, AnimalMention>();
  const consider = (name: string, id: string) => {
    if (!name) return;
    const isCjk = /[\u4e00-\u9fa5]/.test(name);
    if (!isCjk) {
      // 英文别名也要认：visualDescription 走的是生图提示词那一路，几乎恒为
      // 英文（"a cheerful cartoon bear ..."）。以前这里直接 return，导致英文
      // 输入拿不到任何角色——上层 deriveInteractionFromText 见 mentions 为空
      // 就整份放弃，交互层在英文分镜上等于不存在。
      // 用词边界而不是 indexOf：bear 不能撞 beard，rat 不能撞 strawberry；
      // 过短的别名（<=2）一律不认，避免 "ox" 之类的误命中。
      if (name.length < 3) return;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(source);
      if (!match) return;
      const existing = hits.get(id);
      if (!existing || match.index < existing.index) {
        // 名条最终要给孩子看中文，英文命中时反查中文名
        hits.set(id, { id, label: ID_TO_CN[id] || name, index: match.index });
      }
      return;
    }
    let from = 0;
    while (true) {
      const index = source.indexOf(name, from);
      if (index < 0) break;
      const existing = hits.get(id);
      if (
        !existing ||
        index < existing.index ||
        (index === existing.index && name.length > existing.label.length)
      ) {
        hits.set(id, { id, label: name, index });
      }
      from = index + 1;
    }
  };

  for (const [name, id] of Object.entries(CN_ANIMAL_MAP)) consider(name, id);
  for (const subject of ANIMAL_SUBJECTS) {
    for (const keyword of subject.keywords) consider(keyword, subject.id);
  }
  // 英文名补一层：ANIMAL_VISUAL_TERMS 的第一个词约定就是这只动物的英文名
  // （'bear': ['bear', 'fur', 'strong', 'forest']）。不加这层的话，只有
  // tiger/rabbit/monkey 三个能靠 keywords 命中英文，其余动物在英文描
  // 述里一律识别不到。
  for (const [id, terms] of Object.entries(ANIMAL_VISUAL_TERMS)) {
    if (terms[0]) consider(terms[0], id);
  }

  return Array.from(hits.values()).sort((a, b) => a.index - b.index);
}

export function getInlineSvgAssetKeys(): Set<string> {
  return new Set(ANIMAL_SUBJECTS.filter((s) => s.hasInlineSvg).map((s) => s.id));
}

/** Visual search terms for animals not in ANIMAL_SUBJECTS */
const ANIMAL_VISUAL_TERMS: Record<string, string[]> = {
  dolphin: ['dolphin', 'ocean', 'jump', 'swim'],
  elephant: ['elephant', 'trunk', 'tusks', 'savanna'],
  lion: ['lion', 'mane', 'roar', 'savanna'],
  panda: ['panda', 'bamboo', 'black-white', 'forest'],
  cat: ['cat', 'whiskers', 'tail', 'indoor'],
  dog: ['dog', 'wag', 'tail', 'pet'],
  fish: ['fish', 'fins', 'scales', 'underwater'],
  bird: ['bird', 'feathers', 'wings', 'sky'],
  snake: ['snake', 'slither', 'scales', 'grass'],
  turtle: ['turtle', 'shell', 'slow', 'pond'],
  frog: ['frog', 'jump', 'lily-pad', 'pond'],
  butterfly: ['butterfly', 'wings', 'colorful', 'garden'],
  snail: ['snail', 'shell', 'slow', 'garden'],
  bee: ['bee', 'hive', 'honey', 'flowers'],
  ant: ['ant', 'colony', 'antenna', 'ground'],
  penguin: ['penguin', 'ice', 'waddle', 'snow'],
  giraffe: ['giraffe', 'long-neck', 'spots', 'savanna'],
  deer: ['deer', 'antlers', 'graceful', 'forest'],
  zebra: ['zebra', 'stripes', 'savanna', 'run'],
  hippo: ['hippo', 'river', 'big', 'water'],
  crocodile: ['crocodile', 'teeth', 'river', 'reptile'],
  kangaroo: ['kangaroo', 'pouch', 'hop', 'outback'],
  koala: ['koala', 'eucalyptus', 'cuddly', 'tree'],
  sloth: ['sloth', 'slow', 'tree', 'hang'],
  squirrel: ['squirrel', 'acorn', 'bushy-tail', 'tree'],
  fox: ['fox', 'clever', 'bushy-tail', 'forest'],
  wolf: ['wolf', 'howl', 'pack', 'forest'],
  'polar-bear': ['polar-bear', 'arctic', 'ice', 'white'],
  bear: ['bear', 'fur', 'strong', 'forest'],
  shark: ['shark', 'fins', 'teeth', 'ocean'],
  whale: ['whale', 'blowhole', 'ocean', 'massive'],
  octopus: ['octopus', 'tentacles', 'underwater', 'ink'],
  crab: ['crab', 'claws', 'beach', 'shell'],
  starfish: ['starfish', 'arms', 'beach', 'ocean'],
  jellyfish: ['jellyfish', 'tentacles', 'translucent', 'ocean'],
  peacock: ['peacock', 'feathers', 'tail', 'colorful', 'bird'],
  parrot: ['parrot', 'colorful', 'beak', 'tropical'],
  owl: ['owl', 'eyes', 'night', 'wise'],
  eagle: ['eagle', 'soar', 'beak', 'mountains'],
};

/** Unicode emoji for animals */
export const ANIMAL_EMOJI_MAP: Record<string, string> = {
  tiger: '\u{1F42F}',
  rabbit: '\u{1F430}',
  monkey: '\u{1F412}',
  dolphin: '\u{1F42C}',
  elephant: '\u{1F418}',
  lion: '\u{1F981}',
  panda: '\u{1F43C}',
  cat: '\u{1F431}',
  dog: '\u{1F436}',
  fish: '\u{1F41F}',
  bird: '\u{1F426}',
  snake: '\u{1F40D}',
  turtle: '\u{1F422}',
  frog: '\u{1F438}',
  butterfly: '\u{1F98B}',
  snail: '\u{1F40C}',
  bee: '\u{1F41D}',
  ant: '\u{1F41C}',
  penguin: '\u{1F427}',
  giraffe: '\u{1F992}',
  deer: '\u{1F98C}',
  zebra: '\u{1F993}',
  hippo: '\u{1F99B}',
  crocodile: '\u{1F40A}',
  kangaroo: '\u{1F998}',
  koala: '\u{1F428}',
  sloth: '\u{1F9A5}',
  squirrel: '\u{1F43F}',
  fox: '\u{1F98A}',
  wolf: '\u{1F43A}',
  'polar-bear': '\u{1F43B}',
  bear: '\u{1F43B}',
  shark: '\u{1F988}',
  whale: '\u{1F40B}',
  octopus: '\u{1F419}',
  crab: '\u{1F980}',
  starfish: '\u{1FAB1}',
  jellyfish: '\u{1FAB9}',
  peacock: '\u{1F99A}',
  parrot: '\u{1F99C}',
  owl: '\u{1F989}',
  eagle: '\u{1F985}',
};

/**
 * 矢量素材库里真实存在的动物 id（对应 public/assets/vector/animals/<id>.svg）。
 * 渲染层用它判断能否用矢量角色：命中则 staticFile 加载 SVG + 代码动画，
 * 否则回退 emoji 头像。清单来自 vector/manifest.json 的 staticPath，
 * 新增素材时同步这里即可（不读文件，保持渲染模板为纯字符串）。
 */
export const VECTOR_ANIMAL_IDS: string[] = [
  'tiger', 'rabbit', 'monkey', 'elephant', 'lion', 'panda', 'cat', 'dog', 'fish', 'bird',
  'snake', 'turtle', 'frog', 'butterfly', 'bee', 'ant', 'penguin', 'giraffe', 'deer', 'zebra',
  'hippo', 'crocodile', 'kangaroo', 'bear', 'fox', 'owl', 'cow', 'duck', 'pig', 'horse',
  'sheep', 'chicken', 'rooster', 'chick', 'mouse', 'goat', 'camel', 'wolf', 'dolphin', 'whale',
  'octopus', 'crab', 'shrimp', 'snail', 'squirrel', 'ladybug', 'peacock', 'parrot', 'bat',
  'dragon', 'unicorn',
];

export type AnimalVisualVariant = 'generic' | 'white' | 'striped' | 'retracted';

const SNAIL_VARIANT_ASSETS: Record<AnimalVisualVariant, string> = {
  generic: 'assets/lesson/animals/snail-generic.svg',
  white: 'assets/lesson/animals/snail-white.svg',
  striped: 'assets/lesson/animals/snail-striped.svg',
  retracted: 'assets/lesson/animals/snail-retracted.svg',
};

/**
 * Infer explicit appearance variants from scene text.
 *
 * Generic vector aliases only answer "which animal"; they cannot distinguish a
 * white snail from a striped one, or an extended snail from one protected inside
 * its shell. Keep those variants deterministic and local so clean deployments do
 * not depend on a generated asset cache.
 */
export function inferAnimalVariant(
  source: string,
  animalId?: string,
): AnimalVisualVariant {
  if (animalId !== 'snail') return 'generic';
  const text = String(source || '');
  if (/缩(?:进|到|入)壳|躲(?:进|在)壳|只露(?:出)?壳|保护起来|收起(?:身体|触角)|retract(?:ed|s|ing)?\b/i.test(text)) {
    return 'retracted';
  }
  if (/白玉蜗牛|白色蜗牛|白白净净|雪白|white\s+(?:garden\s+)?snail/i.test(text)) {
    return 'white';
  }
  if (
    /花蜗牛|条纹蜗牛|深色条纹|花斑|彩色条纹|深浅不同的条纹|棕色.{0,12}黄色|striped\s+snail|colorful\s+bands|brown.{0,30}(?:yellow|cream).{0,30}stripes?/i.test(
      text,
    )
  ) {
    return 'striped';
  }
  return 'generic';
}

export function animalVariantAssetPath(
  animalId?: string,
  variant: AnimalVisualVariant = 'generic',
): string | null {
  return animalId === 'snail' ? SNAIL_VARIANT_ASSETS[variant] : null;
}

/** Accent colors for animals not in ANIMAL_SUBJECTS */
const ANIMAL_ACCENT_COLORS: Record<string, string> = {
  dolphin: '#4da6ff',
  elephant: '#8a8a8a',
  lion: '#d4a017',
  panda: '#2d2d2d',
  cat: '#f5a623',
  dog: '#c67b30',
  fish: '#36b5c0',
  bird: '#5cb85c',
  snake: '#6b8e23',
  turtle: '#3a7d44',
  frog: '#4caf50',
  butterfly: '#e91e90',
  snail: '#8d6e63',
  bee: '#f9a825',
  ant: '#5d4037',
  penguin: '#37474f',
  giraffe: '#e8a628',
  deer: '#8d6e63',
  zebra: '#424242',
  hippo: '#78909c',
  crocodile: '#558b2f',
  kangaroo: '#a1887f',
  koala: '#607d8b',
  sloth: '#795548',
  squirrel: '#8d6e63',
  fox: '#e65100',
  wolf: '#546e7a',
  'polar-bear': '#b0bec5',
  bear: '#6d4c41',
  shark: '#455a64',
  whale: '#1a237e',
  octopus: '#7b1fa2',
  crab: '#d32f2f',
  starfish: '#ff7043',
  jellyfish: '#ce93d8',
  peacock: '#1a73e8',
  parrot: '#00c853',
  owl: '#795548',
  eagle: '#5d4037',
};

/** Generate a synthetic config for animals not in ANIMAL_SUBJECTS */
export function getOrCreateAnimalConfig(animalId: string): AnimalSubjectConfig {
  const existing = ANIMAL_SUBJECTS.find((s) => s.id === animalId);
  if (existing) return existing;

  const terms = ANIMAL_VISUAL_TERMS[animalId] || [animalId, 'animal'];
  const color = ANIMAL_ACCENT_COLORS[animalId] || stableColorForId(animalId);

  return {
    id: animalId,
    keywords: [],
    actionRoles: {
      run: `${animalId}-running`,
      swim: `${animalId}-swimming`,
      eat: `${animalId}-eating`,
      jump: `${animalId}-jumping`,
    },
    defaultRole: `${animalId}-standing`,
    accentColor: color,
    visualTerms: terms,
    hasInlineSvg: false,
  };
}

function stableColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}
