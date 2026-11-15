/**
 * 视觉语法层的契约测试。
 *
 * 这一层是整个"任意主题都能出片"方案的地基：LLM 只负责选关系、填节点，
 * 坐标和动画全部由确定性代码算。所以必须钉住两件事——
 * 1) 脏输入要么被收敛成合法图、要么直接返回 null（绝不带着半截数据进渲染器）；
 * 2) 语法说明里列出的每一种关系/符号，渲染器都必须实现（另一侧由
 *    scripts/check-generated-lesson-tsx.js 对模板做静态断言）。
 */

import {
  GRAPH_RELATIONS,
  GRAPH_SIGNS,
  GRAPH_SWELLS,
  describeGraphGrammar,
  inferRelationFromText,
  normalizeSceneGraph,
} from '../../src/modules/learning/video/scene-graph';

const node = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  id,
  label,
  subject: label,
  role: 'object',
  ...extra,
});

describe('normalizeSceneGraph', () => {
  it('保留合法图并把节点顺序当作语义', () => {
    const graph = normalizeSceneGraph({
      relation: 'chain',
      caption: '一环扣一环',
      nodes: [node('n1', '青草'), node('n2', '兔子'), node('n3', '狐狸')],
    });

    expect(graph).not.toBeNull();
    expect(graph!.relation).toBe('chain');
    expect(graph!.caption).toBe('一环扣一环');
    expect(graph!.nodes.map((item) => item.label)).toEqual(['青草', '兔子', '狐狸']);
  });

  it('未知关系直接拒绝，让上层退回单主体路径', () => {
    expect(
      normalizeSceneGraph({ relation: 'timeline', nodes: [node('n1', 'A'), node('n2', 'B')] }),
    ).toBeNull();
    expect(normalizeSceneGraph({ nodes: [node('n1', 'A'), node('n2', 'B')] })).toBeNull();
    expect(normalizeSceneGraph(null)).toBeNull();
  });

  it('节点数不足下限时拒绝，compare 多给的节点被截断', () => {
    expect(
      normalizeSceneGraph({ relation: 'cycle', nodes: [node('n1', 'A'), node('n2', 'B')] }),
    ).toBeNull();
    expect(
      normalizeSceneGraph({ relation: 'group', nodes: [node('n1', 'A'), node('n2', 'B')] }),
    ).toBeNull();

    const compare = normalizeSceneGraph({
      relation: 'compare',
      nodes: [node('n1', '石头'), node('n2', '皮球'), node('n3', '木头')],
    });
    expect(compare!.nodes).toHaveLength(2);
  });

  it('重复或空的 id 会被改写，保证渲染时 key 唯一', () => {
    const graph = normalizeSceneGraph({
      relation: 'chain',
      nodes: [node('same', 'A'), node('same', 'B'), { label: 'C', role: 'object' }],
    });

    const ids = graph!.nodes.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('缺 label 时用 subject 兜底，role 不合法时退成 object', () => {
    const graph = normalizeSceneGraph({
      relation: 'chain',
      nodes: [
        { id: 'n1', subject: '小水滴', role: 'gadget' },
        { id: 'n2', subject: '云朵' },
      ],
    });

    expect(graph!.nodes[0].label).toBe('小水滴');
    expect(graph!.nodes[0].role).toBe('object');
    expect(graph!.nodes[1].subject).toBe('云朵');
  });

  it('抽象节点默认带示意符号，非抽象节点上的 sign 被丢弃', () => {
    const graph = normalizeSceneGraph({
      relation: 'chain',
      nodes: [
        node('n1', '水汽', { role: 'abstract' }),
        node('n2', '时间', { role: 'abstract', sign: 'time' }),
        node('n3', '苹果', { role: 'object', sign: 'count' }),
        node('n4', '热量', { role: 'abstract', sign: 'unknown-sign' }),
      ],
    });

    expect(graph!.nodes[0].sign).toBe('orb');
    expect(graph!.nodes[1].sign).toBe('time');
    expect(graph!.nodes[2].sign).toBeUndefined();
    expect(graph!.nodes[3].sign).toBe('orb');
  });

  it('体量变化只认 grow/shrink 与中文同义词，其他值丢弃', () => {
    const graph = normalizeSceneGraph({
      relation: 'cycle',
      nodes: [
        node('n1', '太阳'),
        node('n2', '白云', { swell: 'grow' }),
        node('n3', '冰块', { swell: '变小' }),
        node('n4', '雨滴', { swell: 'huge' }),
      ],
    });

    expect(graph!.nodes[0].swell).toBeUndefined();
    expect(graph!.nodes[1].swell).toBe('grow');
    expect(graph!.nodes[2].swell).toBe('shrink');
    // 认不出的值不能原样带进渲染器，否则体量会按 NaN 缩放
    expect(graph!.nodes[3].swell).toBeUndefined();
  });

  it('caption 与 label 做长度收敛，超长文本不会撑破版式', () => {
    const graph = normalizeSceneGraph({
      relation: 'chain',
      caption: '这是一句非常非常长的关系说明文字',
      nodes: [node('n1', '一二三四五六七八九十'), node('n2', 'B')],
    });

    expect(graph!.caption!.length).toBeLessThanOrEqual(14);
    expect(graph!.nodes[0].label.length).toBeLessThanOrEqual(8);
  });
});

describe('describeGraphGrammar', () => {
  const grammar = describeGraphGrammar();

  it('语法说明覆盖全部关系与符号，否则 LLM 会选出渲染器没实现的类型', () => {
    for (const relation of GRAPH_RELATIONS) {
      expect(grammar).toContain(relation);
    }
    for (const sign of GRAPH_SIGNS) {
      expect(grammar).toContain(sign);
    }
    for (const swell of GRAPH_SWELLS) {
      expect(grammar).toContain(swell);
    }
  });

  it('说明里交代了动画由关系决定，避免 LLM 在分镜里重复描述动画', () => {
    expect(grammar).toContain('动画由 relation 决定');
  });
});

describe('inferRelationFromText', () => {
  it('只作为 LLM 未给图时的兜底，关键词命中即给出关系', () => {
    expect(inferRelationFromText('水蒸发又凝结，转了一圈')).toBe('cycle');
    expect(inferRelationFromText('石头沉下去，皮球浮起来，有什么不同')).toBe('compare');
    expect(inferRelationFromText('小树慢慢长大，越长越高')).toBe('growth');
    expect(inferRelationFromText('大树由树根、树干、树叶组成')).toBe('split');
    expect(inferRelationFromText('苹果和香蕉属于哪一类')).toBe('group');
    expect(inferRelationFromText('先把水烧开，再放凉')).toBe('chain');
  });
});
