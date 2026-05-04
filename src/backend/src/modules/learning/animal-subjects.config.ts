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

export function getInlineSvgAssetKeys(): Set<string> {
  return new Set(
    ANIMAL_SUBJECTS.filter((s) => s.hasInlineSvg).map((s) => s.id),
  );
}
