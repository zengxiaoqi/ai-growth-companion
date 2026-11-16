/**
 * 视觉语法层（Visual Grammar）
 *
 * 为什么需要这一层：
 * 教学画面看起来"千变万化"，但拆开看，任何一句讲解都是「若干概念 + 一种关系」。
 * 概念是开放的（用户输入任意主题），关系是封闭的——儿童教学里翻来覆去就是
 * 循环、因果链、生长、对比、归类、拆解这六种。把开放的留给数据（节点素材），
 * 把封闭的做成确定性布局算法，就能做到"任意主题都能出片，且画面不崩"。
 *
 * 与"专用组件库"的区别：组件库枚举的是主题（水循环、昼夜、植物），主题是无穷的；
 * 这里枚举的是关系，关系是有限的。前者加一个主题就要写一个组件，后者加任何主题
 * 只是换一组节点数据。
 *
 * LLM 只负责"选关系 + 填节点"，不决定坐标、不决定画法。坐标由布局算法算，
 * 因此同一份输入每次渲染结果完全一致，不会出现"这次生成歪了"。
 */

export const GRAPH_RELATIONS = ['cycle', 'chain', 'growth', 'compare', 'group', 'split'] as const;

export type GraphRelationType = (typeof GRAPH_RELATIONS)[number];

/**
 * subject 画面主体（角色/动物/人），object 具体物品，place 场所环境，abstract 抽象概念。
 * role 只影响渲染时的占位形状（圆形/圆角方/地平线/虚线圆），不参与语义。
 */
export const GRAPH_NODE_ROLES = ['subject', 'object', 'place', 'abstract'] as const;

export type GraphNodeRole = (typeof GRAPH_NODE_ROLES)[number];

/**
 * 抽象概念画不出来（水蒸气、力气、时间没有实体形状），但也只有有限的几种"不可见"：
 * 能数的、会往上升的、有高低的、在流动的、跟时间有关的、以及说不清的其他。
 * 这六种是**画法**的封闭集合，不是主题的枚举——任何主题落到这六种画法上，
 * 都不会出现"这个主题没做过所以是空白占位"的情况。
 */
export const GRAPH_SIGNS = ['count', 'rise', 'level', 'flow', 'time', 'orb'] as const;

export type GraphSign = (typeof GRAPH_SIGNS)[number];

/**
 * 体量变化。有些概念不变，有些会"变得更多/更大"（云越积越厚、气球越吹越大），
 * 有些会"变得少/小"（冰化掉、糖溶掉）。刻意只留这三个取值：
 * 一旦允许自由填数值，LLM 就会给出 0.37 这类任意数字，画面随即失控。
 */
export const GRAPH_SWELLS = ['grow', 'shrink'] as const;

export type GraphSwell = (typeof GRAPH_SWELLS)[number];

export type GraphNode = {
  id: string;
  label: string;
  /** 素材检索用的名词，可以比 label 更长、更具体（如 label「水」subject「小水滴」） */
  subject: string;
  role: GraphNodeRole;
  /** 仅 abstract 节点有意义：用哪种示意符号代替实物图标 */
  sign?: GraphSign;
  /** 随讲解推进变大/变小；不填则体量不变 */
  swell?: GraphSwell;
};

export type SceneGraph = {
  relation: GraphRelationType;
  caption?: string;
  nodes: GraphNode[];
};

const ROLE_SET = new Set<string>(GRAPH_NODE_ROLES);
const RELATION_SET = new Set<string>(GRAPH_RELATIONS);
const SIGN_SET = new Set<string>(GRAPH_SIGNS);
const SWELL_SET = new Set<string>(GRAPH_SWELLS);

/** 每类关系的最少/最多节点数，渲染布局按这个区间设计，超出会导致重叠 */
const NODE_BOUNDS: Record<GraphRelationType, { min: number; max: number }> = {
  cycle: { min: 3, max: 6 },
  chain: { min: 2, max: 5 },
  growth: { min: 3, max: 5 },
  compare: { min: 2, max: 2 },
  group: { min: 3, max: 6 },
  split: { min: 3, max: 5 },
};

function cleanText(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRole(input: unknown): GraphNodeRole {
  const value = cleanText(input).toLowerCase();
  return ROLE_SET.has(value) ? (value as GraphNodeRole) : 'object';
}

function normalizeSign(input: unknown, role: GraphNodeRole): GraphSign | undefined {
  // 只有抽象节点需要示意符号；实物节点由素材库出图，带着 sign 说明 LLM 填错了
  if (role !== 'abstract') return undefined;
  const value = cleanText(input).toLowerCase();
  if (SIGN_SET.has(value)) return value as GraphSign;
  // 抽象节点没给符号时给一个中性符号，而不是留白
  return 'orb';
}

function normalizeSwell(input: unknown): GraphSwell | undefined {
  const value = cleanText(input).toLowerCase();
  // 中文直填也认，省得 LLM 把 "变大" 原样塞进来后被静默丢掉
  if (value === '变大' || value === '增大') return 'grow';
  if (value === '变小' || value === '减少') return 'shrink';
  return SWELL_SET.has(value) ? (value as GraphSwell) : undefined;
}

/**
 * 把 LLM 的自由输出收敛成合法 SceneGraph。
 * 任何一项不合法就返回 null，让上层退回"单主体 + 讲解高亮"路径，
 * 而不是带着半截数据进渲染器——渲染器只接受已校验的图。
 */
export function normalizeSceneGraph(raw: unknown): SceneGraph | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const relation = cleanText(source.relation).toLowerCase();
  if (!RELATION_SET.has(relation)) return null;
  const type = relation as GraphRelationType;
  const bounds = NODE_BOUNDS[type];

  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const nodes: GraphNode[] = [];
  const usedIds = new Set<string>();

  for (const item of rawNodes) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const subject = cleanText(entry.subject || entry.label || entry.name).slice(0, 20);
    if (!subject) continue;

    let id = cleanText(entry.id).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || usedIds.has(id)) id = `n${nodes.length + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `n${nodes.length + 1}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const label =
      cleanText(entry.label || entry.name || subject).slice(0, 8) || subject.slice(0, 8);
    const role = normalizeRole(entry.role);
    const sign = normalizeSign(entry.sign || entry.symbol, role);
    const swell = normalizeSwell(entry.swell);
    nodes.push({ id, label, subject, role, ...(sign ? { sign } : {}), ...(swell ? { swell } : {}) });
    if (nodes.length >= bounds.max) break;
  }

  if (nodes.length < bounds.min) return null;

  const caption = cleanText(source.caption).slice(0, 14);
  return {
    relation: type,
    nodes,
    ...(caption ? { caption } : {}),
  };
}

/**
 * 画面节点 ↔ 旁白的对齐审计。
 *
 * 为什么需要：sceneGraph 的节点是画面上的一张大卡片，narration 是孩子听到的话。
 * 两者是同一次 LLM 调用产出的，但提示词从没要求 label 出现在旁白里，于是会出现
 * 「画面上有"白云"卡，旁白从头到尾没说过"云"」——孩子看见一个没被讲过的概念。
 * 实测 8 个场景 27 个节点里有 6 个（22%）属于这种，且集中在云/雨/幼苗/花/根/彩虹
 * 这些最需要画面解释的抽象概念上（见 scripts/probe-cue-anchors.ts）。
 *
 * 判定口径刻意从严：label 或 subject 必须**逐字**出现在旁白里。
 * 不做同义/单字兜底——「树根」靠单字「树」命中「大树」是静默错配，比不命中更糟。
 */
export type NarrationCoverageMiss = {
  label: string;
  subject: string;
};

export type NarrationCoverage = {
  total: number;
  matched: number;
  missing: NarrationCoverageMiss[];
};

/** 剥标点与空白：旁白里「苹果、香蕉」和标签「苹果」应当算命中 */
function spokenForm(input: string): string {
  return String(input ?? '').replace(/[\s\p{P}\p{S}]/gu, '');
}

export function auditGraphNarration(
  graph: Pick<SceneGraph, 'nodes'> | null | undefined,
  narration: string,
): NarrationCoverage {
  const nodes = Array.isArray(graph?.nodes) ? graph!.nodes : [];
  const spoken = spokenForm(narration);
  const missing: NarrationCoverageMiss[] = [];
  let matched = 0;

  for (const node of nodes) {
    const label = spokenForm(node.label);
    const subject = spokenForm(node.subject);
    const hit = (label && spoken.includes(label)) || (subject && spoken.includes(subject));
    if (hit) matched += 1;
    else missing.push({ label: node.label, subject: node.subject });
  }

  return { total: nodes.length, matched, missing };
}

/**
 * 把审计结果写成能直接回喂给 LLM 的一句话。
 * 要说清三件事：哪个场景、哪些节点没被念到、怎么改（换词或删节点），
 * 否则模型只会原样再交一遍。
 */
export function formatCoverageFeedback(
  sceneTitle: string,
  narration: string,
  coverage: NarrationCoverage,
): string {
  const names = coverage.missing.map((n) => `「${n.label}」`).join('');
  return (
    `场景「${sceneTitle}」的画面节点 ${names} 在旁白里没有出现。` +
    `旁白原文：${narration}${/[。！？；!?;]$/.test(narration) ? '' : '。'}` +
    `修法：把 label 换成旁白里确实说过的词（图上写的字孩子必须听到），` +
    `或者删掉这些节点换一个旁白提到的概念；不要靠改 narration 迁就画面。`
  );
}

/** 提供给 prompt 的语法说明，和上面的实现必须同步——改一处要改两处 */
export function describeGraphGrammar(): string {
  return [
    '## sceneGraph（画面关系图，必填）',
    '一句讲解 = 若干概念 + 一种关系。你只需选关系、列节点，坐标和动画由渲染器决定。',
    'relation 只能取以下六种之一：',
    '- cycle：闭环循环，3-6 个节点，节点绕圈排列，首尾相连。用于水循环、昼夜、四季、生命周期。',
    '- chain：因果或步骤链，2-5 个节点，横向依次推进。用于"先…再…最后…"、食物链、操作步骤。',
    '- growth：从小到大，3-5 个节点，节点依次变大。用于生长、年龄、数量增加。',
    '- compare：两两对照，必须正好 2 个节点，左右分栏。用于大小、冷热、沉浮、快慢、对错。',
    '- group：分类归组，3-6 个节点，第一个是类别名，其余是被归入的成员。用于"哪些是水果"、动物分类。',
    '- split：整体拆成部分，3-5 个节点，第一个是整体，其余是部件。用于人体、植物结构、形状构成。',
    'nodes 规则：',
    '- 每个节点 { "id": "n1", "label": "屏幕上显示的字(≤6字)", "subject": "用于检索图标的具体名词", "role": "subject|object|place|abstract", "swell": "grow|shrink(可选)" }',
    '- subject 必须具体到能检索到图：写「小水滴」而不是「东西」，写「苹果」而不是「食物」。',
    '- role：subject=角色/动物/人，object=具体物品，place=场所环境，abstract=抽象概念(时间/力气/数量/温度)。',
    '- swell 只在"这个概念的体量会随讲解变化"时才填：云越积越厚=grow，气球越吹越大=grow，冰块化掉=shrink。保持不变就不填。',
    '- abstract 节点必须给 sign，说明这个看不见的东西该画成什么样（六选一）：',
    '  count=能数出来的(3个/5片) rise=会往上跑的(水蒸气/热气/力气变大) level=有高低的(温度/水位/饱腹)',
    '  flow=在流动的(风/电流/水流) time=跟时间有关(快慢/多久) orb=说不清的其他概念',
    '- 节点顺序有意义：cycle/chain/growth 按发生顺序，group/split 第一个是整体，compare 前两个就是左右两项。',
    '- label 必须逐字出现在本场景 narration 里。图上的字是给孩子看的，旁白没提到的概念不要放节点：',
    '  宁可 3 个节点都讲过，也不要 4 个节点里有一个从没被念到（实测这种"图上有、话里没有"占 22%）。',
    '- 写完 narration 再回头对一遍：每个 label 都能在 narration 里原样找到吗？找不到就换词或删节点，',
    '  不要为了凑节点去改 narration 的叙事，也不要用近义词糊过去（旁白说「小水珠」就把 label 写成「小水珠」）。',
    '- subject 取旁白里的说法（旁白说「小水珠」就不要写「雨」）：图标检索和后续对齐都依赖它。',
    '- caption 可选，一句关系说明，≤10 字，如「水变成水蒸气」。',
    '旁白的节奏要求（和画面同步直接相关）：',
    '- 一屏里并列列出 3 个以上概念时（归类、拆解、列举），每个概念后面跟半句以上的描述，',
    '  不要写成「苹果、香蕉和葡萄」这种纯名单：纯名单三个词的间隔只有 16-23 帧（0.5-0.8 秒），',
    '  而成员卡片从被念到到卡面落位要 36 帧，中间那个词只会闪一下。',
    '  写成「苹果红红的，香蕉弯弯的，葡萄一串一串的」间隔就有 30-36 帧，每项各带一句则有 70 帧以上。',
    '- 一屏旁白 3-5 句，不要为了拉开间隔把一句话硬拆成三段，也不要一屏连报四五个名词。',
    '动画由 relation 决定，不用你描述动画：',
    'cycle 有一颗光点沿环一直转，转到哪个概念哪个亮起来；chain 的光点从左走到右；',
    'growth 除光点外，节点还从小到大现场长大；split 从整体里散开成部件；group 从散落聚拢到类别下；',
    'compare 左右轮流亮起做对照。所以节点顺序 = 事情发生的顺序，画面才讲得通。',
  ].join('\n');
}

/** 从主题文本里粗略判断该给什么关系——仅用于 LLM 未给 sceneGraph 时的兜底 */
export function inferRelationFromText(text: string): GraphRelationType {
  const source = String(text || '');
  if (/循环|蒸发|凝结|四季|昼夜|交替|一圈|轮回|生命周期/.test(source)) return 'cycle';
  if (/比较|更|最|大小|冷热|沉浮|快慢|区别|不同/.test(source)) return 'compare';
  if (/长大|生长|变大|越来越多|越来越高|年龄/.test(source)) return 'growth';
  if (/分成|组成|包括|分为|有哪些部分|结构|部位/.test(source)) return 'split';
  if (/种类|哪几种|归类|属于|都是/.test(source)) return 'group';
  return 'chain';
}
