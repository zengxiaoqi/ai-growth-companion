import { repairSceneSubjectCoverage } from '../../src/modules/learning/video/scene-subject-coverage';

describe('repairSceneSubjectCoverage', () => {
  it('upgrades the pointed shell prop to one complete snail and keeps its leaf', () => {
    const result = repairSceneSubjectCoverage({
      narration: '小兔发现一只小蜗牛，蜗牛背壳慢慢向前爬。',
      visualDescription: '小兔指向叶子上背壳爬行的小蜗牛',
      props: [
        { name: '蜗牛壳', place: 'floor', heightRatio: 0.12 },
        { name: '小黄花', place: 'floor', heightRatio: 0.1 },
      ],
      performance: {
        actors: [{ id: 'rabbit', label: '小兔' }],
        actions: [
          { verb: 'walk' },
          { verb: 'point', propId: '蜗牛壳' },
        ],
      },
    });

    expect(result.repairs.map((repair) => repair.label)).toEqual(['蜗牛', '树叶']);
    const propNames = result.scene.props.map((prop: any) => prop.name);
    expect(propNames).toEqual(['树叶', '蜗牛', '小黄花']);
    expect(propNames.filter((name) => name === '蜗牛')).toHaveLength(1);
    expect(result.scene.props.find((prop: any) => prop.name === '蜗牛').heightRatio).toBe(0.34);
    expect(result.scene.performance.actions[1].propId).toBe('蜗牛');
    expect(result.unresolved).toEqual([]);
  });

  it('upgrades a shell-only action node to the complete retracted snail', () => {
    const result = repairSceneSubjectCoverage({
      narration: '遇到危险时，蜗牛会把身体缩进壳里。硬硬的壳能挡住小鸟。',
      visualDescription: '蜗牛缩进壳里，小鸟在旁边',
      sceneGraph: {
        relation: 'compare',
        caption: '壳里的蜗牛更安全',
        nodes: [
          { id: 'n1', label: '缩进壳里', subject: '蜗牛壳', role: 'place' },
          { id: 'n2', label: '外面危险', subject: '小鸟', role: 'subject' },
        ],
      },
    });

    expect(result.scene.sceneGraph.nodes).toHaveLength(2);
    expect(result.scene.sceneGraph.nodes[0]).toMatchObject({
      id: 'n1',
      label: '缩进壳里',
      subject: '缩进壳里蜗牛',
      role: 'subject',
    });
    expect(result.repairs).toEqual([
      expect.objectContaining({ kind: 'graph-subject', label: '蜗牛' }),
    ]);
  });

  it('adds a missing acting animal to a graph that still has capacity', () => {
    const result = repairSceneSubjectCoverage({
      narration: '小兔跑过去，发现小熊在吃蜂蜜。',
      visualDescription: '小兔跑向正在吃蜂蜜的小熊',
      sceneGraph: {
        relation: 'chain',
        nodes: [
          { id: 'n1', label: '小兔', subject: '小兔', role: 'subject' },
          { id: 'n2', label: '蜂蜜', subject: '蜂蜜', role: 'object' },
        ],
      },
    });

    expect(result.scene.sceneGraph.nodes).toHaveLength(3);
    expect(result.scene.sceneGraph.nodes[2]).toMatchObject({
      subject: '小熊',
      role: 'subject',
    });
  });

  it('does not duplicate an animal that already has a structured actor or icon', () => {
    const scene = {
      narration: '蜗牛背着壳慢慢爬。',
      visualDescription: '一只蜗牛在树叶上爬',
      performance: {
        actors: [{ id: 'snail', label: '蜗牛' }],
        actions: [{ verb: 'walk' }],
      },
    };
    expect(repairSceneSubjectCoverage(scene)).toEqual({
      scene,
      repairs: [],
      unresolved: [],
    });
  });

  it('never replaces a dedicated shell teaching stage', () => {
    const scene = {
      narration: '蜗牛壳是从壳口这里长大的，新壳长在壳口边缘。',
      visualDescription: '蜗牛壳口边缘长出新壳',
      sceneGraph: {
        relation: 'growth',
        nodes: [
          { id: 'n1', label: '壳口', subject: '蜗牛壳' },
          { id: 'n2', label: '壳口', subject: '蜗牛壳' },
          { id: 'n3', label: '壳口', subject: '蜗牛壳' },
        ],
      },
    };
    expect(repairSceneSubjectCoverage(scene, { preserveSpecializedStage: true }).scene).toBe(
      scene,
    );
  });

  it('does not invent subjects from a passing animal mention without an action cue', () => {
    const scene = {
      narration: '蜗牛壳上有螺旋花纹，就像棒棒糖。',
      visualDescription: '蜗牛壳螺旋特写',
      props: [{ name: '蜗牛壳', place: 'floor' }],
    };
    expect(repairSceneSubjectCoverage(scene).scene).toBe(scene);
  });

  it('upgrades a pointed shell prop that uses id instead of name', () => {
    const result = repairSceneSubjectCoverage({
      narration: '蜗牛背着壳慢慢爬。',
      visualDescription: '蜗牛在树叶上爬',
      props: [{ id: '蜗牛壳', place: 'floor', heightRatio: 0.12 }],
      performance: {
        actions: [{ verb: 'point', propId: '蜗牛壳' }],
      },
    });

    expect(result.scene.props).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '蜗牛', name: '蜗牛' })]),
    );
    expect(result.scene.performance.actions[0].propId).toBe('蜗牛');
    expect(result.unresolved).toEqual([]);
  });

  it('upgrades the shell node whose action matches the narration, not the first shell node', () => {
    const result = repairSceneSubjectCoverage({
      narration: '蜗牛缩进壳里躲起来，壳口也会慢慢长大。',
      visualDescription: '蜗牛缩进壳里，旁边展示壳口长大',
      sceneGraph: {
        relation: 'group',
        nodes: [
          { id: 'grow', label: '壳口长大', subject: '蜗牛壳', role: 'object' },
          { id: 'rest', label: '缩进壳里', subject: '蜗牛壳', role: 'place' },
        ],
      },
    });

    expect(result.scene.sceneGraph.nodes[0]).toMatchObject({
      id: 'grow',
      label: '壳口长大',
      subject: '蜗牛壳',
    });
    expect(result.scene.sceneGraph.nodes[1]).toMatchObject({
      id: 'rest',
      subject: '缩进壳里蜗牛',
      role: 'subject',
    });
  });
});
