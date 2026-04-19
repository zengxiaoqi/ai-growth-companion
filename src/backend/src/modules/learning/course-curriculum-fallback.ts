import { readdirSync, readFileSync } from "fs";
import * as path from "path";

export interface CurriculumQuizItem {
  question: string;
  options: string[];
  answer: string;
}

export interface CourseCurriculumSeed {
  summary: string;
  outcomes: string[];
  teachingUnits: string[];
  unitFacts: Record<string, string>;
  readingText: string;
  readingKeywords: string[];
  listeningQuestions: string[];
  tracingItems: string[];
  practiceTasks: string[];
  matchingPairs: Array<{ left: string; right: string }>;
  quizItems: CurriculumQuizItem[];
}

type AgeGroup = "3-4" | "5-6";
type CourseDomain = "language" | "math" | "science" | "art" | "social";

type CurriculumRecord = {
  name?: string;
  title?: string;
  domain?: string;
  objectives?: unknown[];
  content?: unknown[];
};

const RECORD_CACHE = new Map<string, CurriculumRecord[]>();
const GENERIC_TERMS = [
  "认识",
  "学习",
  "课程",
  "主题",
  "内容",
  "朋友",
  "世界",
  "变化",
  "基础",
  "启蒙",
];

/** Alias mapping: user-input topic terms → curriculum record terms */
const TOPIC_ALIASES: Record<string, string[]> = {
  动物: ["小动物", "农场动物", "动物朋友", "宠物", "野生动物"],
  颜色: ["色彩", "颜色宝宝", "彩色", "赤橙黄绿青蓝紫", "三原色"],
  数字: ["数数", "计数", "认识数字", "数学启蒙"],
  形状: ["图形", "几何", "圆形", "三角形", "方形"],
  四季: ["季节", "春夏秋冬", "天气变化"],
  植物: ["花草", "树木", "种子", "发芽", "开花"],
  水果: ["苹果", "香蕉", "西瓜", "葡萄"],
  家庭: ["家人", "爸爸妈妈", "亲人"],
  情绪: ["表情", "开心", "生气", "难过", "害怕"],
  习惯: ["作息", "日常", "时间安排", "好习惯"],
  身体: ["五官", "手脚", "眼睛耳朵", "身体部位"],
  礼貌: ["礼仪", "谢谢", "对不起", "打招呼"],
  安全: ["交通安全", "家庭安全", "自我保护"],
};

export function getCoursePackCurriculumSeed(input: {
  topic: string;
  ageGroup: AgeGroup;
  domain?: CourseDomain;
}): CourseCurriculumSeed | null {
  const topic = toText(input.topic);
  if (!topic) return null;

  const records = loadCurriculumRecords(input.ageGroup);
  if (records.length === 0) return null;

  const best = records
    .map((record) => ({
      record,
      score: scoreRecord(record, topic, input.domain),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 2) return null;
  return buildSeed(best.record, topic);
}

function loadCurriculumRecords(ageGroup: AgeGroup): CurriculumRecord[] {
  const cacheKey = ageGroup;
  const cached = RECORD_CACHE.get(cacheKey);
  if (cached) return cached;

  const dir = path.resolve(
    __dirname,
    "../../../../content",
    ageGroup === "3-4" ? "3-4-years" : "5-6-years",
  );

  try {
    const records = readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        try {
          const raw = readFileSync(path.join(dir, file), "utf-8");
          return JSON.parse(raw) as CurriculumRecord;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as CurriculumRecord[];

    RECORD_CACHE.set(cacheKey, records);
    return records;
  } catch {
    return [];
  }
}

function buildHaystack(record: CurriculumRecord): string {
  return [
    toText(record.name),
    toText(record.title),
    toText(record.domain),
    ...toTextArray(record.objectives),
    ...toTextArray(record.content).map((item) => toText(item)),
  ]
    .join(" ")
    .toLowerCase();
}

function scoreRecord(
  record: CurriculumRecord,
  topic: string,
  domain?: CourseDomain,
): number {
  const haystack = buildHaystack(record);
  const compactTopic = topic.replace(/\s+/g, "");
  const terms = extractTopicTerms(topic);

  // Expand terms with aliases
  const expandedTerms = new Set(terms);
  for (const term of terms) {
    const aliases = TOPIC_ALIASES[term];
    if (aliases) {
      for (const alias of aliases) expandedTerms.add(alias);
    }
    // Reverse lookup: if user typed an alias, add the canonical term
    for (const [canonical, aliasList] of Object.entries(TOPIC_ALIASES)) {
      if (aliasList.includes(term)) expandedTerms.add(canonical);
    }
  }

  let score = 0;
  if (compactTopic && haystack.includes(compactTopic)) score += 8;
  for (const term of expandedTerms) {
    if (haystack.includes(term)) score += 4;
  }
  if (domain && toText(record.domain) === domain) score += 2;
  return score;
}

function buildSeed(
  record: CurriculumRecord,
  topic: string,
): CourseCurriculumSeed {
  const objectives = toTextArray(record.objectives).slice(0, 4);
  const blocks = Array.isArray(record.content)
    ? (record.content.filter(Boolean) as Record<string, any>[])
    : [];
  const lessonTexts = blocks
    .filter((block) => ["lesson", "story"].includes(toText(block.type)))
    .map((block) => toText(block.text))
    .filter(Boolean);

  const exampleFacts = extractExampleFacts(blocks);
  const textFacts = extractInlineFacts(lessonTexts.join("\n"));
  const unitFacts = { ...textFacts, ...exampleFacts };
  const teachingUnits = unique([
    ...Object.keys(unitFacts),
    ...extractUnitsFromQuestions(blocks),
    ...extractTopicTerms(topic),
  ]).slice(0, 6);

  const quizItems = extractQuizItems(blocks);
  const matchingPairs = buildMatchingPairs(teachingUnits, unitFacts, quizItems);
  const readingKeywords = unique([
    ...teachingUnits,
    ...objectives.flatMap((item) => extractTopicTerms(item)),
  ]).slice(0, 5);
  const practiceTasks = unique([
    ...extractPracticeTasks(blocks),
    ...matchingPairs
      .slice(0, 2)
      .map((pair) => `说一说${pair.left}${pair.right}`),
  ]).slice(0, 4);

  return {
    summary: objectives.join("；") || `围绕${topic}进行更具体的启蒙学习。`,
    outcomes:
      objectives.length > 0
        ? objectives
        : teachingUnits.slice(0, 3).map((unit) => `认识${unit}的特点`),
    teachingUnits: teachingUnits.slice(0, 4),
    unitFacts,
    readingText:
      lessonTexts.join("\n\n").slice(0, 320) || `今天我们一起学习${topic}。`,
    readingKeywords: readingKeywords.length > 0 ? readingKeywords : [topic],
    listeningQuestions: unique(quizItems.map((item) => item.question)).slice(
      0,
      3,
    ),
    tracingItems: teachingUnits.slice(0, 2),
    practiceTasks,
    matchingPairs,
    quizItems,
  };
}

function extractExampleFacts(
  blocks: Record<string, any>[],
): Record<string, string> {
  const pairs = blocks.flatMap((block) => {
    const examples = Array.isArray(block.examples) ? block.examples : [];
    return examples.flatMap((entry: any) => {
      if (!entry || typeof entry !== "object") return [];
      return Object.entries(entry).map(([key, value]) => ({
        unit: normalizeUnit(key),
        fact: simplifyFact(value),
      }));
    });
  });

  return Object.fromEntries(
    pairs
      .filter((entry) => entry.unit && entry.fact)
      .map((entry) => [entry.unit, entry.fact]),
  );
}

function extractInlineFacts(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const matches = text.matchAll(
    /(?:^|\n)\s*[🌸☀️🍂❄️🐱🐶🐰🐦🐟]?\s*([\u4e00-\u9fff]{1,6})[:：]\s*([^\n]+)/g,
  );
  for (const match of matches) {
    const unit = normalizeUnit(match[1]);
    const fact = simplifyFact(match[2]);
    if (unit && fact && !result[unit]) {
      result[unit] = fact;
    }
  }
  return result;
}

function extractUnitsFromQuestions(blocks: Record<string, any>[]): string[] {
  return blocks.flatMap((block) => {
    const questions = Array.isArray(block.questions) ? block.questions : [];
    return questions.flatMap((item: any) => {
      const text = toText(item?.q || item?.question);
      return extractTopicTerms(text);
    });
  });
}

function extractQuizItems(blocks: Record<string, any>[]): CurriculumQuizItem[] {
  return blocks
    .flatMap((block) => {
      const questions = Array.isArray(block.questions) ? block.questions : [];
      return questions
        .map((item: any) => {
          const question = toText(item?.q || item?.question);
          const options = Array.isArray(item?.options)
            ? item.options.map((value: any) => toText(value)).filter(Boolean)
            : [];
          const answer =
            typeof item?.answer === "number"
              ? options[item.answer] || ""
              : toText(item?.answer);
          if (!question || options.length < 2 || !answer) return null;
          return { question, options: unique(options).slice(0, 4), answer };
        })
        .filter(Boolean) as CurriculumQuizItem[];
    })
    .slice(0, 4);
}

function extractPracticeTasks(blocks: Record<string, any>[]): string[] {
  const prompts = blocks.flatMap((block) => {
    const source = [
      ...(Array.isArray(block.prompts) ? block.prompts : []),
      ...(Array.isArray(block.categories) ? block.categories : []),
      toText(block.description),
      toText(block.title),
    ];
    return source.map((item: any) => toText(item)).filter(Boolean);
  });

  return unique(prompts).slice(0, 4);
}

function buildMatchingPairs(
  units: string[],
  facts: Record<string, string>,
  quizItems: CurriculumQuizItem[],
): Array<{ left: string; right: string }> {
  const fromFacts = units
    .map((unit) => ({ left: unit, right: simplifyFact(facts[unit]) }))
    .filter((item) => item.left && item.right)
    .slice(0, 4);

  if (fromFacts.length >= 3) return fromFacts;

  const fromQuiz = quizItems
    .map((item, index) => ({
      left:
        normalizeUnit(item.question.replace(/[？?].*$/, "")) ||
        `知识点${index + 1}`,
      right: simplifyFact(item.answer),
    }))
    .filter((item) => item.left && item.right)
    .slice(0, 4);

  return fromFacts.length > 0
    ? uniquePairs([...fromFacts, ...fromQuiz]).slice(0, 4)
    : fromQuiz;
}

function extractTopicTerms(source: string): string[] {
  const rawTerms = toText(source).match(/[\u4e00-\u9fff]{1,6}/g) || [];

  const filtered = rawTerms
    .map((term) => normalizeUnit(term))
    .filter(Boolean)
    .filter((term) => !GENERIC_TERMS.includes(term));

  return unique(filtered);
}

function normalizeUnit(value: unknown): string {
  const text = toText(value)
    .replace(/[🌸☀️🍂❄️🐱🐶🐰🐦🐟🧠📘✨⭐️\s]/g, "")
    .replace(/^(什么|哪个|谁会|谁住在|说说|现在|这个|关于)/, "")
    .replace(/(是什么季节|住在哪里|吃什么|怎么叫|有什么特点).*$/, "")
    .replace(/[：:，,。！？?]/g, "")
    .trim();

  if (!text || text.length > 8) return "";
  return text;
}

function simplifyFact(value: unknown): string {
  return toText(value)
    .replace(/[\n]/g, "，")
    .split(/[。；;]/)[0]
    .replace(/^是/, "")
    .trim()
    .slice(0, 24);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniquePairs(
  values: Array<{ left: string; right: string }>,
): Array<{ left: string; right: string }> {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.left}=>${item.right}`;
    if (!item.left || !item.right || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toText(item)).filter(Boolean)
    : [];
}

function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}
