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
    id: "tiger",
    keywords: ["tiger", "老虎", "虎"],
    actionRoles: {
      run: "tiger-running",
      swim: "tiger-swimming",
      roar: "tiger-roaring",
    },
    defaultRole: "tiger-standing",
    accentColor: "#f08c00",
    visualTerms: ["tiger", "stripe", "claw", "forest"],
    hasInlineSvg: true,
  },
  {
    id: "rabbit",
    keywords: ["rabbit", "bunny", "兔子", "小兔", "兔"],
    actionRoles: {
      eat: "rabbit-eating",
      run: "rabbit-jumping",
      jump: "rabbit-jumping",
      listen: "rabbit-listening",
      showFeatures: "rabbit-listening",
    },
    defaultRole: "rabbit-standing",
    accentColor: "#e76f8a",
    visualTerms: ["rabbit", "long-ears", "grassland"],
    hasInlineSvg: true,
  },
  {
    id: "monkey",
    keywords: ["monkey", "猴子", "小猴", "猴"],
    actionRoles: {
      run: "monkey-running",
      jump: "monkey-jumping",
      eat: "monkey-eating",
      climb: "monkey-climbing",
      showFeatures: "monkey-sitting",
    },
    defaultRole: "monkey-sitting",
    accentColor: "#a0522d",
    visualTerms: ["monkey", "tail", "tree", "banana"],
    hasInlineSvg: true,
  },
];

export function findAnimalSubject(
  source: string,
  assetKey?: string,
): AnimalSubjectConfig | null {
  const lowered = source.toLowerCase();
  for (const subject of ANIMAL_SUBJECTS) {
    if (assetKey === subject.id) return subject;
    if (subject.keywords.some((kw) => lowered.includes(kw.toLowerCase()))) {
      return subject;
    }
  }
  return null;
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
  const enMatch = source.match(
    /(?:learn\s+about|all\s+about|discover)\s+(\w+)/i,
  );
  if (enMatch) {
    const id = enMatch[1].toLowerCase();
    return { id, config: getOrCreateAnimalConfig(id) };
  }

  // 4. Use assetKey if it looks like an animal name (not "topic")
  if (assetKey && assetKey !== "topic" && /^[a-z]+$/.test(assetKey)) {
    return { id: assetKey, config: getOrCreateAnimalConfig(assetKey) };
  }

  return null;
}

function cnToAnimalId(name: string): string | null {
  const CN_ANIMAL_MAP: Record<string, string> = {
    虎: "tiger",
    老虎: "tiger",
    兔: "rabbit",
    兔子: "rabbit",
    小兔: "rabbit",
    猴: "monkey",
    猴子: "monkey",
    小猴: "monkey",
    海豚: "dolphin",
    大象: "elephant",
    象: "elephant",
    狮子: "lion",
    狮: "lion",
    熊猫: "panda",
    大熊猫: "panda",
    猫: "cat",
    小猫: "cat",
    狗: "dog",
    小狗: "dog",
    鱼: "fish",
    小鱼: "fish",
    鸟: "bird",
    小鸟: "bird",
    蛇: "snake",
    乌龟: "turtle",
    龟: "turtle",
    青蛙: "frog",
    蛙: "frog",
    蝴蝶: "butterfly",
    蜜蜂: "bee",
    蚂蚁: "ant",
    企鹅: "penguin",
    长颈鹿: "giraffe",
    鹿: "deer",
    斑马: "zebra",
    河马: "hippo",
    鳄鱼: "crocodile",
    袋鼠: "kangaroo",
    考拉: "koala",
    树懒: "sloth",
    松鼠: "squirrel",
    狐狸: "fox",
    狼: "wolf",
    北极熊: "polar-bear",
    熊: "bear",
    鲨鱼: "shark",
    鲸鱼: "whale",
    鲸: "whale",
    章鱼: "octopus",
    螃蟹: "crab",
    海星: "starfish",
    水母: "jellyfish",
    孔雀: "peacock",
    鹦鹉: "parrot",
    猫头鹰: "owl",
    老鹰: "eagle",
    鹰: "eagle",
  };
  return CN_ANIMAL_MAP[name] || null;
}

export function getInlineSvgAssetKeys(): Set<string> {
  return new Set(
    ANIMAL_SUBJECTS.filter((s) => s.hasInlineSvg).map((s) => s.id),
  );
}

/** Visual search terms for animals not in ANIMAL_SUBJECTS */
const ANIMAL_VISUAL_TERMS: Record<string, string[]> = {
  dolphin: ["dolphin", "ocean", "jump", "swim"],
  elephant: ["elephant", "trunk", "tusks", "savanna"],
  lion: ["lion", "mane", "roar", "savanna"],
  panda: ["panda", "bamboo", "black-white", "forest"],
  cat: ["cat", "whiskers", "tail", "indoor"],
  dog: ["dog", "wag", "tail", "pet"],
  fish: ["fish", "fins", "scales", "underwater"],
  bird: ["bird", "feathers", "wings", "sky"],
  snake: ["snake", "slither", "scales", "grass"],
  turtle: ["turtle", "shell", "slow", "pond"],
  frog: ["frog", "jump", "lily-pad", "pond"],
  butterfly: ["butterfly", "wings", "colorful", "garden"],
  bee: ["bee", "hive", "honey", "flowers"],
  ant: ["ant", "colony", "antenna", "ground"],
  penguin: ["penguin", "ice", "waddle", "snow"],
  giraffe: ["giraffe", "long-neck", "spots", "savanna"],
  deer: ["deer", "antlers", "graceful", "forest"],
  zebra: ["zebra", "stripes", "savanna", "run"],
  hippo: ["hippo", "river", "big", "water"],
  crocodile: ["crocodile", "teeth", "river", "reptile"],
  kangaroo: ["kangaroo", "pouch", "hop", "outback"],
  koala: ["koala", "eucalyptus", "cuddly", "tree"],
  sloth: ["sloth", "slow", "tree", "hang"],
  squirrel: ["squirrel", "acorn", "bushy-tail", "tree"],
  fox: ["fox", "clever", "bushy-tail", "forest"],
  wolf: ["wolf", "howl", "pack", "forest"],
  "polar-bear": ["polar-bear", "arctic", "ice", "white"],
  bear: ["bear", "fur", "strong", "forest"],
  shark: ["shark", "fins", "teeth", "ocean"],
  whale: ["whale", "blowhole", "ocean", "massive"],
  octopus: ["octopus", "tentacles", "underwater", "ink"],
  crab: ["crab", "claws", "beach", "shell"],
  starfish: ["starfish", "arms", "beach", "ocean"],
  jellyfish: ["jellyfish", "tentacles", "translucent", "ocean"],
  peacock: ["peacock", "feathers", "tail", "colorful", "bird"],
  parrot: ["parrot", "colorful", "beak", "tropical"],
  owl: ["owl", "eyes", "night", "wise"],
  eagle: ["eagle", "soar", "beak", "mountains"],
};

/** Unicode emoji for animals */
export const ANIMAL_EMOJI_MAP: Record<string, string> = {
  tiger: "\u{1F42F}",
  rabbit: "\u{1F430}",
  monkey: "\u{1F412}",
  dolphin: "\u{1F42C}",
  elephant: "\u{1F418}",
  lion: "\u{1F981}",
  panda: "\u{1F43C}",
  cat: "\u{1F431}",
  dog: "\u{1F436}",
  fish: "\u{1F41F}",
  bird: "\u{1F426}",
  snake: "\u{1F40D}",
  turtle: "\u{1F422}",
  frog: "\u{1F438}",
  butterfly: "\u{1F98B}",
  bee: "\u{1F41D}",
  ant: "\u{1F41C}",
  penguin: "\u{1F427}",
  giraffe: "\u{1F992}",
  deer: "\u{1F98C}",
  zebra: "\u{1F993}",
  hippo: "\u{1F99B}",
  crocodile: "\u{1F40A}",
  kangaroo: "\u{1F998}",
  koala: "\u{1F428}",
  sloth: "\u{1F9A5}",
  squirrel: "\u{1F43F}",
  fox: "\u{1F98A}",
  wolf: "\u{1F43A}",
  "polar-bear": "\u{1F43B}",
  bear: "\u{1F43B}",
  shark: "\u{1F988}",
  whale: "\u{1F40B}",
  octopus: "\u{1F419}",
  crab: "\u{1F980}",
  starfish: "\u{1FAB1}",
  jellyfish: "\u{1FAB9}",
  peacock: "\u{1F99A}",
  parrot: "\u{1F99C}",
  owl: "\u{1F989}",
  eagle: "\u{1F985}",
};

/** Accent colors for animals not in ANIMAL_SUBJECTS */
const ANIMAL_ACCENT_COLORS: Record<string, string> = {
  dolphin: "#4da6ff",
  elephant: "#8a8a8a",
  lion: "#d4a017",
  panda: "#2d2d2d",
  cat: "#f5a623",
  dog: "#c67b30",
  fish: "#36b5c0",
  bird: "#5cb85c",
  snake: "#6b8e23",
  turtle: "#3a7d44",
  frog: "#4caf50",
  butterfly: "#e91e90",
  bee: "#f9a825",
  ant: "#5d4037",
  penguin: "#37474f",
  giraffe: "#e8a628",
  deer: "#8d6e63",
  zebra: "#424242",
  hippo: "#78909c",
  crocodile: "#558b2f",
  kangaroo: "#a1887f",
  koala: "#607d8b",
  sloth: "#795548",
  squirrel: "#8d6e63",
  fox: "#e65100",
  wolf: "#546e7a",
  "polar-bear": "#b0bec5",
  bear: "#6d4c41",
  shark: "#455a64",
  whale: "#1a237e",
  octopus: "#7b1fa2",
  crab: "#d32f2f",
  starfish: "#ff7043",
  jellyfish: "#ce93d8",
  peacock: "#1a73e8",
  parrot: "#00c853",
  owl: "#795548",
  eagle: "#5d4037",
};

/** Generate a synthetic config for animals not in ANIMAL_SUBJECTS */
export function getOrCreateAnimalConfig(animalId: string): AnimalSubjectConfig {
  const existing = ANIMAL_SUBJECTS.find((s) => s.id === animalId);
  if (existing) return existing;

  const terms = ANIMAL_VISUAL_TERMS[animalId] || [animalId, "animal"];
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
