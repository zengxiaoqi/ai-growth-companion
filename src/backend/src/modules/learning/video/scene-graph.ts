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

export type GraphNode = {
  id: string;
  label: string;
  /** 素材检索用的名词，可以比 label 更长、更具体（如 label「水」subject「小水滴」） */
  subject: string;
  role: GraphNodeRole;
};

export type SceneGraph = {
  relation: GraphRelationType;
  caption?: string;
  nodes: GraphNode[];
};

const ROLE_SET = new Set<string>(GRAPH_NODE_ROLES);
const RELATION_SET = new Set<string>(GRAPH_RELATIONS);

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

    const label = cleanText(entry.label || entry.name || subject).slice(0, 8) || subject.slice(0, 8);
    nodes.push({ id, label, subject, role: normalizeRole(entry.role) });
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
    '- 每个节点 { "id": "n1", "label": "屏幕上显示的字(≤6字)", "subject": "用于检索图标的具体名词", "role": "subject|object|place|abstract" }',
    '- subject 必须具体到能检索到图：写「小水滴」而不是「东西」，写「苹果」而不是「食物」。',
    '- role：subject=角色/动物/人，object=具体物品，place=场所环境，abstract=抽象概念(时间/温度/数量)。',
    '- 节点顺序有意义：cycle/chain/growth 按发生顺序，group/split 第一个是整体，compare 前两个就是左右两项。',
    '- caption 可选，一句关系说明，≤10 字，如「水变成水蒸气」。',
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
