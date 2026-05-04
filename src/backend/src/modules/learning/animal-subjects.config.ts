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
    if (id) return { id, config: null };
  }

  // 3. Try "learn about X" / "all about X" pattern (English)
  const enMatch = source.match(
    /(?:learn\s+about|all\s+about|discover)\s+(\w+)/i,
  );
  if (enMatch) {
    return { id: enMatch[1].toLowerCase(), config: null };
  }

  // 4. Use assetKey if it looks like an animal name (not "topic")
  if (assetKey && assetKey !== "topic" && /^[a-z]+$/.test(assetKey)) {
    return { id: assetKey, config: null };
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
