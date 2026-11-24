/**
 * 道具词表（遗留适配器）。
 *
 * **这份词表不再扩，也不再是"道具的全集"。** 新分镜由模型直接声明 `props[]`
 * （自由字符串，见 docs/lesson-video-prop-protocol.md），道具的几何在装配期
 * 按名字现画。这里存在的唯一理由：历史分镜没有 `props` 字段，直接删掉词表会让
 * 老课的"苹果""皮球"从画面里消失。
 *
 * 所以它的定位是**只读的兼容层**：认识的就认识，不认识的不猜、不新增别名，
 * 随老任务自然淘汰。
 *
 * 顺手修掉的是**机械性**的错，不是"再多认几个词"：
 *
 *  | 文本 | 旧结果 | 现在 | 原因 |
 *  |---|---|---|---|
 *  | 拍**皮球**，把足球踢走 | ball（三个别名都命中，被 slice 掩住） | ball ×1 | 长别名优先 + 区间占用 |
 *  | let us **start** the game | star ❌ | 无 | 英文必须有词边界 |
 *  | 小熊在**看书** | book | book | 不变 |
 *
 * **刻意没修的一条**：`书包` 仍会产出 book、`地球仪` 仍会产出 ball。
 * 试过两个启发式，都不成立：
 *
 *  - "单字名词右侧紧跟汉字就算复合词" → `把球踢远了` 的 `球` 后面是动词 `踢`，
 *    被误杀。汉语没有空格，右邻字既可能是中心语（书包）也可能是谓语（球踢）。
 *  - 维护一张"复合词后缀表"（包/架/场/拍/仪…）→ 又变成枚举，且必然两头错。
 *
 * 真正能分开这两种情况的只有分词，而这条路径正在被"分镜声明 props[]"取代
 * （见 docs/lesson-video-prop-protocol.md §4）。为一个即将退役的兼容层引入
 * 分词器，收益是"少一个多余的小图标"，成本是一个新的不确定组件——不划算。
 * 所以这里选择**如实保留这个已知误差**，并让测试把它钉住（见 prop-lexicon.spec）。
 */

/** 道具 id → 中文名。渲染层的标签、占位件的首字都用它。 */
export const PROP_LABELS: Record<string, string> = {
  ball: '皮球',
  cookie: '饼干',
  apple: '苹果',
  banana: '香蕉',
  book: '书',
  block: '积木',
  table: '桌子',
  slide: '滑梯',
  star: '星星',
  heart: '爱心',
};

/** 道具 id → 别名。**不再新增**：新道具请走分镜声明的 `props[]`。 */
export const PROP_KEYWORDS: Record<string, string[]> = {
  ball: ['皮球', '足球', '球', 'ball'],
  cookie: ['饼干', 'cookie', '小饼干'],
  apple: ['苹果', 'apple'],
  banana: ['香蕉', 'banana'],
  book: ['书', '绘本', 'book'],
  block: ['积木', 'block'],
  table: ['桌子', '桌', 'table'],
  slide: ['滑梯', 'slide'],
  star: ['星星', 'star'],
  heart: ['爱心', 'heart'],
};

/** 汉字区间：区分"中文别名"与"英文别名"（英文要查词边界） */
const HAN = /[\u4e00-\u9fa5]/;
/** 英文别名的词边界：两侧不能紧贴字母/数字 */
const ASCII_WORD = /[a-z0-9]/i;

interface Alias {
  id: string;
  alias: string;
  ascii: boolean;
}

/**
 * 展平成别名表，按**长度降序**。
 *
 * 长度优先是为了让"皮球"先于"球"、"桌子"先于"桌"命中：短别名在长别名内部
 * 再匹配一次，是 `includes` 时代最典型的重复与误判来源。
 * 长度相同时保持表内顺序，让输出顺序与旧实现一致（老课的 3 个名额不会被重新排序）。
 */
const ALIASES: Alias[] = Object.entries(PROP_KEYWORDS)
  .flatMap(([id, list]) => list.map((alias) => ({ id, alias: alias.toLowerCase(), ascii: !HAN.test(alias) })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * 从一段文本里推出道具 id（老分镜兜底）。
 *
 * 返回顺序是**词表顺序**，不是命中顺序：旧实现按 `Object.entries` 遍历，
 * 三个名额的取舍依赖这个顺序，换顺序会让老课画面换道具。
 */
export function matchLegacyProps(source: string): Array<{ id: string; label: string }> {
  const text = String(source || '').toLowerCase();
  if (!text) return [];

  // 已被更长的别名占用的区间：同一段文字不该同时产出"皮球"和"球"
  const claimed: Array<[number, number]> = [];
  const hit = new Set<string>();

  for (const { id, alias, ascii } of ALIASES) {
    if (!alias) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(alias, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + alias.length;

      if (claimed.some(([s, e]) => at < e && end > s)) continue;

      if (ascii) {
        // start 里的 star、book 里的 boo：英文必须有完整词边界
        const before = at > 0 ? text[at - 1] : '';
        const after = end < text.length ? text[end] : '';
        if ((before && ASCII_WORD.test(before)) || (after && ASCII_WORD.test(after))) continue;
      }

      claimed.push([at, end]);
      hit.add(id);
    }
  }

  return Object.keys(PROP_KEYWORDS)
    .filter((id) => hit.has(id))
    .map((id) => ({ id, label: PROP_LABELS[id] || id }));
}
