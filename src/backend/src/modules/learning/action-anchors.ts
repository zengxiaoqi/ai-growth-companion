/**
 * 语义动作锚点：把"图形动起来"的时间窗，从整屏均摊改成"旁白念到它那一段"。
 *
 * 背景：关系图上的语义动作（水汽上升、云越积越厚、数到第几个）此前都挂在
 * storyProgress 上——从入场结束线性推到本屏结束。它与旁白是两条互不相干的时间轴：
 * 实测 s1「水转了一圈」，旁白第 154 帧说"落下来"时，水汽珠子还在 68% 高度往上爬，
 * 升到顶是第 219 帧，比"落下来"晚 2.0 秒。孩子听到的和看到的不是同一件事。
 *
 * 做法：一个节点的动作窗口 = 它被念到的那一帧 → 它所在那句话的收尾帧。
 * 窗口内 0→1 单调推进，窗口外保持终态。
 *
 * 三条边界：
 * 1. 找不到词就返回 null，由调用方回退 storyProgress。不做单字兜底——「树根」被
 *    「一棵大树」的「树」命中会把动作挂到全错的位置，比不挂更糟。
 * 2. 窗口太短（词在句尾才出现）时把起点前移，保证动作至少有 MIN_WINDOW 帧可看。
 * 3. 依赖 subtitlePages（真实 TTS 词边界）。没有配音的旧任务拿不到锚点，行为不变。
 */

/** 一屏字幕：与 subtitle-timing.ts 的 SubtitlePageCue 同构 */
type PageCue = { tokens: string[]; starts: number[] };

/** 参与锚定的节点：只要有 id/label/subject 三项，不关心图上的其他字段 */
export type AnchorNode = { id: string; label?: string; subject?: string };

export type ActionAnchor = {
  /** 动作开始帧（场景内相对帧） */
  start: number;
  /** 动作收尾帧：所在那句话说完的时候 */
  end: number;
  /** 命中的是哪个词（label 或 subject），便于日志与排错 */
  matched: string;
  /** 命中在第几屏字幕里 */
  page: number;
};

export type ActionAnchorTable = Record<string, ActionAnchor>;

export type BuildActionAnchorOptions = {
  /** 场景总帧数：最后一屏的收尾帧 */
  durationFrames: number;
  /** 动作最短可看时长（帧）。词出现在句尾时把起点前移，避免"一闪就完" */
  minWindow?: number;
};

const NON_SPEECH = /[\s\p{P}\p{S}]/u;

type SpokenChar = { ch: string; frame: number };
type SpokenPage = { index: number; start: number; end: number; chars: SpokenChar[]; text: string };

/**
 * 把字幕页摊成"能念的字 + 它的发音帧"。
 * 标点跟在前一个字后面成为 token（见 subtitleTokens），所以取 token 首字、
 * 并丢掉非发音字符，得到的下标才和 text 一一对应。
 */
function toSpokenPages(pages: PageCue[], durationFrames: number): SpokenPage[] {
  const out: SpokenPage[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    if (!Array.isArray(page?.tokens) || page.tokens.length === 0) continue;
    if (!Array.isArray(page?.starts) || page.starts.length !== page.tokens.length) continue;
    const chars: SpokenChar[] = [];
    for (let k = 0; k < page.tokens.length; k += 1) {
      const raw = String(page.tokens[k] || '');
      const ch = Array.from(raw)[0];
      if (!ch || NON_SPEECH.test(ch)) continue;
      const frame = Number(page.starts[k]);
      if (!Number.isFinite(frame)) continue;
      chars.push({ ch, frame });
    }
    if (chars.length === 0) continue;
    out.push({
      index: i,
      start: chars[0].frame,
      end: 0, // 由下方按"下一屏的第一帧"回填
      chars,
      text: chars.map((c) => c.ch).join(''),
    });
  }
  for (let i = 0; i < out.length; i += 1) {
    out[i].end = i + 1 < out.length ? out[i + 1].start : Math.max(out[i].start + 1, durationFrames);
  }
  return out;
}

/** 去掉标点空白后的说法；短于两字的不参与匹配（单字误配是静默的，宁可不锚） */
function normalizeTerm(value: string | undefined): string | null {
  const cleaned = Array.from(String(value || ''))
    .filter((ch) => !NON_SPEECH.test(ch))
    .join('');
  return cleaned.length >= 2 ? cleaned : null;
}

/** 全篇里出现了几次（只用于单字标签的歧义判断） */
function countOccurrences(text: string, term: string): number {
  let count = 0;
  let at = text.indexOf(term);
  while (at >= 0) {
    count += 1;
    at = text.indexOf(term, at + 1);
  }
  return count;
}

/**
 * 给每个节点算动作窗口。返回表里只有"能锚定"的节点，其余由调用方回退。
 */
export function buildActionAnchors(
  nodes: AnchorNode[],
  pages: PageCue[] | undefined,
  options: BuildActionAnchorOptions,
): ActionAnchorTable {
  const durationFrames = Math.max(1, Math.floor(options.durationFrames || 0));
  const minWindow = Math.max(4, Math.floor(options.minWindow ?? 24));
  const table: ActionAnchorTable = {};
  if (!Array.isArray(pages) || pages.length === 0 || !Array.isArray(nodes)) return table;

  const spoken = toSpokenPages(pages, durationFrames);
  if (spoken.length === 0) return table;

  const wholeText = spoken.map((page) => page.text).join('');

  for (const node of nodes) {
    const id = String(node?.id || '');
    if (!id) continue;
    // label 优先：屏幕上写的字就是孩子听到的那个词；其次才是 subject（可检索名词）
    const terms = [normalizeTerm(node.label), normalizeTerm(node.subject)].filter(
      (term, i, arr): term is string => Boolean(term) && arr.indexOf(term) === i,
    );
    // 单字标签（云、雨、风这类中文里极常见）另开一档：只有当标签本身就是一个字、
    // 且这个字在全篇旁白里恰好出现一次时才锚。双字标签绝不退化成单字匹配——
    // 「树根」被「大树」的「树」命中会静默把动作挂到错的地方，比不挂更糟。
    const singleLabel = Array.from(String(node.label || '')).filter((ch) => !NON_SPEECH.test(ch));
    if (singleLabel.length === 1 && countOccurrences(wholeText, singleLabel[0]) === 1) {
      terms.push(singleLabel[0]);
    }
    for (const term of terms) {
      let hit: ActionAnchor | null = null;
      for (const page of spoken) {
        const at = page.text.indexOf(term);
        if (at < 0) continue;
        const spokenFrame = page.chars[at].frame;
        // 词出现在句尾时窗口会短到看不见动作，把起点前移但不越过本句开头
        const start = Math.max(page.start, Math.min(spokenFrame, page.end - minWindow));
        // 连前移都凑不出可看时长（本句只剩几帧）就换下一屏找，别硬塞一个一闪而过的动作
        if (page.end - start < Math.max(4, Math.floor(minWindow / 2))) continue;
        hit = { start, end: page.end, matched: term, page: page.index };
        break;
      }
      if (hit) {
        table[id] = hit;
        break;
      }
    }
  }
  return table;
}

/** 覆盖率：能锚定的节点占多少，供日志与验收 */
export function summarizeActionAnchors(
  nodes: AnchorNode[],
  table: ActionAnchorTable,
): { total: number; anchored: number; ratio: number; missed: string[] } {
  const total = Array.isArray(nodes) ? nodes.length : 0;
  const anchors = table || {};
  const missed: string[] = [];
  for (const node of nodes || []) {
    if (!anchors[String(node?.id || '')]) missed.push(String(node?.label || node?.id || ''));
  }
  const anchored = total - missed.length;
  return { total, anchored, ratio: total > 0 ? anchored / total : 0, missed };
}

/**
 * 光点挂词的前置条件：节点在图上的顺序必须与旁白念到它们的顺序一致。
 *
 * 原因：一条边的起止帧是从"相邻两个词的发音帧"推出来的（见模板 flowStops）。
 * 图上的顺序若与旁白顺序不同（旁白先说云、后说小水珠，图上却是 小水珠 → 云），
 * 光点会朝反方向走或者干脆算不出窗口，整条路径回退时钟。
 *
 * 这条约束只对"一条路径串起所有节点"的拓扑成立（chain / cycle / growth）：
 * 段与段必须按旁白顺序接上。星形拓扑（split / group）不走这条规则——
 * 一屏是 N 条互不相交的路径，每条只认自己那一个词，顺序不一致也不影响；
 * 尤其 group 的类别本来就在旁白最后才点名（"苹果、香蕉和葡萄，它们都是水果"），
 * 把它判成"顺序漂移"只是在报一个永远不会修的假警。
 *
 * 回退本身不报错、画面也正常，所以必须在渲染日志里把它说出来——静默降级
 * 比明确报错难查得多：看起来一切正常，只是"怎么又跟旁白对不上了"。
 */
export function auditFlowOrder(
  nodes: AnchorNode[],
  table: ActionAnchorTable,
  options: { relation?: string } = {},
): { order: string[]; spokenOrder: string[]; drift: string[]; skipped: boolean } {
  const anchors = table || {};
  const grounded = (nodes || [])
    .map((node) => {
      const anchor = anchors[String(node?.id || '')];
      return anchor
        ? { id: String(node.id), label: String(node.label || node.id), at: anchor.start }
        : null;
    })
    .filter((item): item is { id: string; label: string; at: number } => item !== null);

  const order = grounded.map((item) => item.id);
  const spokenOrder = grounded
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((item) => item.id);
  const star = options.relation === 'split' || options.relation === 'group';
  if (star) return { order, spokenOrder, drift: [], skipped: true };
  const drift: string[] = [];
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== spokenOrder[i]) {
      const item = grounded.find((entry) => entry.id === order[i]);
      drift.push(`${item ? item.label : order[i]}@${item ? item.at : -1}f`);
    }
  }
  return { order, spokenOrder, drift, skipped: false };
}
