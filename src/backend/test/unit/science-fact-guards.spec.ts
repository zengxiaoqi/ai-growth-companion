import {
  assertTopicSpecificScienceFacts,
  findTopicSpecificScienceIssues,
  ScienceFactGateError,
} from '../../src/modules/learning/science-fact-guards';

describe('science fact guards', () => {
  it('checks normalized lesson shots and storyboard scenes with the same rules', () => {
    const claim = '蜗牛长一岁多一圈，壳上的圈圈越多，说明它越老。';

    expect(
      findTopicSpecificScienceIssues({ videoLesson: { shots: [{ narration: claim }] } }, '蜗牛壳'),
    ).toEqual(
      expect.arrayContaining([
        'scene 1: 把长大描述成固定增加一圈',
        'scene 1: 用花纹数量推断年龄或大小',
      ]),
    );
    expect(findTopicSpecificScienceIssues({ scenes: [{ narration: claim }] }, '蜗牛壳')).toEqual(
      expect.arrayContaining(['scene 1: 把长大描述成固定增加一圈']),
    );
  });

  it('checks graph labels, figure labels and visual prompts', () => {
    expect(
      findTopicSpecificScienceIssues(
        {
          scenes: [
            {
              sceneGraph: { nodes: [{ label: '年轮', subject: '越老' }] },
              visualPrompt: '蜗牛壳从里向外生长',
            },
            { figure: { labels: [{ text: '不怕被小鸟啄' }] } },
            {
              performance: {
                actions: [{ speech: '蜗牛长一岁多一圈。', caption: '圈越多越老' }],
              },
            },
            { sceneGraph: { caption: '花纹越多说明年龄越大', nodes: [] } },
          ],
        },
        '蜗牛',
      ),
    ).toEqual(
      expect.arrayContaining([
        'scene 1: 把蜗牛壳当年轮推断年龄',
        'scene 1: 蜗牛壳从里向外长',
        'scene 2: 把有壳说成绝对不怕天敌',
        'scene 3: 把长大描述成固定增加一圈',
        'scene 4: 用花纹数量推断年龄或大小',
      ]),
    );
  });

  it('allows explicit corrections rather than rejecting factual negations', () => {
    expect(() =>
      assertTopicSpecificScienceFacts(
        {
          scenes: [
            {
              narration: '蜗牛壳不是年轮，不能根据花纹越多判断它越老。长一岁多一圈的说法不对。',
            },
          ],
        },
        '蜗牛',
      ),
    ).not.toThrow();
  });

  it('does not apply snail-specific rules to unrelated topics', () => {
    expect(() =>
      assertTopicSpecificScienceFacts(
        { scenes: [{ narration: '树的年轮越多，说明树越老。' }] },
        '树木年轮',
      ),
    ).not.toThrow();
  });

  it('throws a typed gate error with scene evidence', () => {
    expect(() =>
      assertTopicSpecificScienceFacts(
        { scenes: [{ narration: '蜗牛长大后每长大多一圈。' }] },
        '蜗牛',
      ),
    ).toThrow(ScienceFactGateError);
  });
});
