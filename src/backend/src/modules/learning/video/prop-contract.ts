/**
 * 道具契约：分镜怎么**声明**道具，以及声明的边界在哪。
 *
 * 为什么要换掉旧做法：道具曾经由一张 10 项词表从旁白里"猜"出来
 * （`video/prop-lexicon.ts`，现已退为只读兼容层）。猜的问题不是不准，是
 * **封闭**——词表不认的词，分镜就不敢写（写了也白写），于是语料里只剩
 * 苹果和皮球。等于让一张 10 行的表决定了课程内容能说什么。
 *
 * 现在反过来：写分镜的模型直接声明这一幕有哪些实物（`props[].name` 是自由
 * 字符串），我们只约束**空间关系**与**数量**——那是契约该管的事，不是内容。
 *
 * 这里刻意不做的事：
 *  - 不给"允许的道具名"清单（那又是枚举）；
 *  - 不按词猜 place（模型说"手里拿着"就是 hand，我们不去解析中文）；
 *  - 不替模型补道具（声明的画不出来 → 占位件 + warn，见 prop-resolver）。
 */

/** `place` 是空间关系，不是内容：只允许这三档 */
export const PROP_PLACES = ['hand', 'floor', 'worn'] as const;
export type PropPlace = (typeof PROP_PLACES)[number];

/** 每幕最多几个道具：再多画面就成杂货铺，而且生成预算会被一节课吃光 */
export const MAX_PROPS_PER_SCENE = 3;
/** 名字上限：超过这个长度的多半不是名词，而是半句话 */
export const MAX_PROP_NAME_LENGTH = 12;
/** 缺省高度比：约等于一个"能看清但不抢戏"的小物件 */
export const DEFAULT_PROP_HEIGHT_RATIO = 0.35;
export const MIN_PROP_HEIGHT_RATIO = 0.08;
export const MAX_PROP_HEIGHT_RATIO = 0.9;

export interface DeclaredProp {
  /** 规范化后的名字，同课去重用 */
  id: string;
  /** 展示用名字（保留原样，只去首尾空白与多余空格） */
  label: string;
  heightRatio: number;
  place: PropPlace;
  holder?: string;
}

/**
 * 道具声明总开关。
 *
 * 默认**关**：老分镜没有 `props` 字段，开了也读不到东西；而一旦开了，
 * 新分镜就会走"生成"这条新链路，出片时延 +10~20s、画面会有新物件。
 * 这种"会改变成片"的能力不该靠发版开关，回滚要能是改一行配置。
 *
 * 灰度顺序（见 docs/lesson-video-prop-protocol.md §9）：先开一节课看 gallery，
 * 再全量。关掉它等于回到词表兜底，老课逐像素不变。
 */
export function isPropDeclarationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.PROP_GEN || '').toLowerCase() === 'on';
}

/** 名字规范化：这道闸门只挡"明显不是名词"的输入，不判断词义 */
export function normalizePropName(raw: unknown): string {
  const text = String(raw ?? '')
    // 控制字符与零宽字符会让"同一个名字"在去重时变成两个
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length > MAX_PROP_NAME_LENGTH) return '';
  // 纯标点/纯数字不能当道具名（"3""!!"），但"7 号球"这种是合法的
  if (!/[\u4e00-\u9fa5a-zA-Z]/.test(text)) return '';
  return text;
}

/** id 只用于去重与查找：英文小写，中文原样 */
export function propIdOf(name: string): string {
  return name.trim().toLowerCase();
}

function clampRatio(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROP_HEIGHT_RATIO;
  return Math.min(MAX_PROP_HEIGHT_RATIO, Math.max(MIN_PROP_HEIGHT_RATIO, n));
}

function normalizePlace(value: unknown, holder?: string): PropPlace {
  const raw = String(value ?? '').toLowerCase();
  if ((PROP_PLACES as readonly string[]).includes(raw)) return raw as PropPlace;
  // 没写 place 时按"有没有指定拿在谁手里"推：这是元数据，不是词义理解
  return holder ? 'hand' : 'floor';
}

/**
 * 把模型写的 `props` 变成可渲染的声明。
 *
 * 宽容读、严格出：接受字符串、对象、单值或数组（模型三种都写过），
 * 出去的一定是去重、限长、限量的列表。**不可解析的项直接丢**，
 * 不猜、不补——猜出来的道具比没有道具更让人困惑。
 */
export function normalizeDeclaredProps(raw: unknown): DeclaredProp[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: DeclaredProp[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (out.length >= MAX_PROPS_PER_SCENE) break;
    const source = typeof item === 'string' ? { name: item } : (item as Record<string, any>) || {};
    const label = normalizePropName(source.name ?? source.label ?? source.subject ?? source.id);
    if (!label) continue;
    const id = propIdOf(label);
    if (seen.has(id)) continue;
    seen.add(id);
    const holderRaw = source.holder ?? source.actorId ?? source.by;
    const holder = typeof holderRaw === 'string' && holderRaw.trim() ? holderRaw.trim().toLowerCase() : undefined;
    out.push({
      id,
      label,
      heightRatio: clampRatio(source.heightRatio ?? source.height ?? source.size),
      place: normalizePlace(source.place ?? source.at, holder),
      ...(holder ? { holder } : {}),
    });
  }

  return out;
}
