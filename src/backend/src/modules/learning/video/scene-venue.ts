/**
 * 幕级场地解析。
 *
 * 一节课可以有多个"地方"：小熊在林子里捡到苹果、走回家、把苹果放在桌上。
 * 但"场地随幕变"不能变成"每一幕自己猜"——那会让没有场地线索的幕（"他把苹果
 * 擦干净"）落到默认草地，于是孩子在两帧之间从森林瞬移到草地，再瞬移回来。
 * 这不是转场，是穿帮。
 *
 * 规则只有一条，但它决定整套机制成不成立：
 *
 *   有明确线索 → 用线索；没有线索 → **继承上一幕**；第一幕就没有 → 用全篇兜底。
 *
 * 连续性因此来自"相邻幕指向同一个地方"，而不是像上一版那样来自"整课只许
 * 有一个地方"。两条不变量取代原来那一条：
 *
 *   1. 相邻两幕 venue 相同 ⇒ 世界必须完全一致（同配方、同滑梯、同基准缩放）；
 *   2. 滑梯属于 "playground 这个场地"，不属于"某一幕"——只要本课有滑梯，
 *      所有 playground 幕都带同一份几何。按"这一幕用到才给"会出现同一座公园里
 *      第 2 幕滑梯凭空消失，比没有滑梯更穿帮。
 *
 * 这个文件是纯函数，不碰 service、不碰渲染层，所以"场地乱跳"可以用测试钉死。
 */
import { HABITAT_KEYWORDS } from '../visual-keywords.config';

/** 滑梯几何（与渲染层 WorldSlide 结构兼容，故意不跨工程 import 类型） */
export type SlideGeometry = {
  start: [number, number, number];
  end: [number, number, number];
};

export type SceneVenueInput = {
  /** 这一幕的全部文本：标题 + 画面描述 + 旁白 + 屏幕文字 */
  text: string;
  /** 这一幕是否在"用"滑梯（滑下去 / 爬上去 / 指着它） */
  usesSlide: boolean;
};

/** 场地是怎么定下来的。落进 props 便于排查"为什么这一幕是森林" */
export type VenueSource = 'slide' | 'indoor' | 'habitat' | 'inherit' | 'lesson';

export type SceneWorld = {
  venue: string;
  venueFrom: VenueSource;
  /** 这一幕场地的装置（只有 playground 幕有） */
  slide?: SlideGeometry;
  /**
   * 整课的滑梯几何：所有幕都有（只要本课有滑梯），**只用于算基准缩放**。
   * 渲染层不会因为它画滑梯——画不画看 `slide`。这样"室内幕沿用滑梯档缩放"
   * 不需要后端知道 ppu 怎么算。
   */
  scaleSlide?: SlideGeometry;
};

/**
 * habitat 关键词 → 配方 id。
 *
 * 两套词表本来就不一样：后端 `HABITAT_KEYWORDS` 产出 river / grassland，
 * 渲染层配方叫 riverside / meadow。缺了这张表，`river` 会静默落到草地，
 * 于是"河边"这个场地在线上永远出不来。
 */
export const HABITAT_TO_VENUE: Record<string, string> = {
  river: 'riverside',
  grassland: 'meadow',
  forest: 'forest',
  night: 'night',
};

/**
 * 室内线索。
 *
 * 必须是**具体名词**，不能放"家"这种会撞上"大家 / 国家 / 全家"的单字；
 * "回家 / 家里 / 在家"用词组。误判成室内的代价比漏判大：一个讲森林的课
 * 突然在教室里，孩子会以为看错了。
 */
export const INDOOR_KEYWORDS: readonly string[] = [
  '教室',
  '课桌',
  '黑板',
  '书包',
  '幼儿园',
  '房间',
  '卧室',
  '厨房',
  '客厅',
  '餐桌',
  '刷牙',
  '洗手',
  '回家',
  '家里',
  '在家',
  '床上',
  '被子',
  '衣柜',
  'classroom',
  'bedroom',
  'kitchen',
];

/**
 * 口语词补充表。
 *
 * `HABITAT_KEYWORDS` 是给"整课大概在什么环境"用的，词偏书面（森林/草地/河）。
 * 分镜旁白更像童书口语："林子里""河岸""田埂"。这些词不补，幕级判定就会大量
 * 落空、退回继承——继承本身没错，但该切场地的一幕切不出来。
 */
const SPOKEN_HABITAT: ReadonlyArray<{ venue: string; keywords: readonly string[] }> = [
  { venue: 'forest', keywords: ['林子', '林间', '树丛', '灌木丛'] },
  { venue: 'riverside', keywords: ['河岸', '河边', '溪边', '湖边', '海边', '池边'] },
  { venue: 'meadow', keywords: ['草坪', '田野', '牧场', '空地'] },
  { venue: 'night', keywords: ['夜晚', '月光', '星空', '天黑'] },
];

/**
 * habitat 的优先级。
 *
 * 不能"先命中先赢"：`HABITAT_KEYWORDS` 里 grassland 排在 forest 前面，而分镜
 * 常写"森林的草地上"——同一句里两个都命中，先命中的成了草地，整幕从森林掉到草地。
 * 森林比草地具体（草地可以是森林的一部分），所以按这个顺序挑：
 * 夜 > 河 > 森林 > 草地。
 */
const HABITAT_PRIORITY = ['night', 'river', 'forest', 'grassland'];

const habitatRank = (value: string): number => {
  const index = HABITAT_PRIORITY.indexOf(value);
  return index < 0 ? HABITAT_PRIORITY.length : index;
};

/** 同一段文本里的多个 habitat 命中，按具体程度取一个 */
function detectHabitat(text: string): string | null {
  const hits = HABITAT_KEYWORDS.filter((mapping) =>
    mapping.keywords.some((kw) => text.includes(String(kw).toLowerCase())),
  ).map((mapping) => mapping.value);
  if (!hits.length) return null;
  return hits.sort((a, b) => habitatRank(a) - habitatRank(b))[0];
}

/**
 * 单幕判定。返回 null 表示"这一幕没有场地线索"——**不是**默认草地，
 * 调用方必须去继承上一幕。
 */
export function detectSceneVenue(input: SceneVenueInput): {
  venue: string;
  source: VenueSource;
} | null {
  // 滑梯优先：一说"滑下去"，这一幕就在游乐园，哪怕文本里还写着"树"
  if (input.usesSlide) return { venue: 'playground', source: 'slide' };

  const text = String(input.text || '').toLowerCase();
  // 室内优先于 habitat："小熊在房间里刷牙"里可能同时出现"树""水"之类的词，
  // 落到森林就错了。这条顺序是 §5 里写明的优先级。
  if (INDOOR_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))) {
    return { venue: 'classroom', source: 'indoor' };
  }

  const habitat = detectHabitat(text);
  if (habitat) return { venue: HABITAT_TO_VENUE[habitat] ?? habitat, source: 'habitat' };

  const spoken = SPOKEN_HABITAT.find((entry) => entry.keywords.some((kw) => text.includes(kw)));
  if (spoken) return { venue: spoken.venue, source: 'habitat' };

  return null;
}

/**
 * 逐幕解析。
 *
 * @param lessonHint 全篇兜底（旧 `resolveLessonWorld` 的结果）：第一幕没有任何
 *        线索时用它；它的 `slide` 决定"本课有没有滑梯"、所有 playground 幕共用。
 */
export function resolveSceneVenues(
  inputs: SceneVenueInput[],
  lessonHint: { venue: string; slide?: SlideGeometry },
): SceneWorld[] {
  const worlds: SceneWorld[] = [];
  for (const input of inputs) {
    const hit = detectSceneVenue(input);
    const prev = worlds[worlds.length - 1];

    let venue: string;
    let venueFrom: VenueSource;

    if (hit?.source === 'slide') {
      venue = 'playground';
      venueFrom = 'slide';
    } else if (hit?.source === 'indoor') {
      venue = 'classroom';
      venueFrom = 'indoor';
    } else if (lessonHint.slide && (!hit || hit.venue === 'meadow' || hit.venue === 'riverside')) {
      /**
       * 本课有滑梯 ⇒ 这一幕也在游乐园，哪怕文本写着"草地"。
       *
       * 滑梯只存在于游乐园，所以"整课有滑梯"是一条比单幕关键词更强的约束；
       * 公园里本来就有草地和沙坑，把"他坐在草地上"判成草原，会让一节滑梯课
       * 一半在公园、一半在野外。但"森林/夜晚"是另一个地方，仍然尊重文本。
       */
      venue = 'playground';
      venueFrom = prev ? 'inherit' : 'lesson';
    } else if (hit) {
      venue = hit.venue;
      venueFrom = 'habitat';
    } else if (prev) {
      venue = prev.venue;
      venueFrom = 'inherit';
    } else {
      venue = lessonHint.venue;
      venueFrom = 'lesson';
    }

    const world: SceneWorld = { venue, venueFrom };
    // 滑梯属于场地而不是幕：本课有滑梯，所有 playground 幕都带同一份
    if (lessonHint.slide && venue === 'playground') world.slide = lessonHint.slide;
    // 整课有滑梯时，每一幕都要知道"按滑梯档缩放"，否则室内幕会把熊放大
    if (lessonHint.slide) world.scaleSlide = lessonHint.slide;
    worlds.push(world);
  }
  return worlds;
}
