/**
 * 遗留词表的守卫测试（`video/prop-lexicon.ts`）。
 *
 * 这份词表**不该再长大**，所以这里测的不是"认得多少词"，而是三件更要紧的事：
 *
 *  1. **不误判**：`includes` 时代的三个错（书包→book、地球仪→ball、start→star）
 *     都是"把修饰语当成中心语"。它们不影响出片，只让画面多一个不相干的道具，
 *     谁也不会为此报 bug——所以必须由测试盯着。
 *  2. **不重复**：同一段文字不该同时产出"皮球"和"球"。旧实现里
 *     `ball: ['皮球','足球','球']` 三个别名全部命中，只是后面被 slice(0,3) 掩盖了。
 *  3. **顺序稳定**：老课按词表顺序取前 3 个名额，换顺序就是换道具。
 *
 * 最后一条是"开放"的证明：新道具不靠改这份表，靠分镜声明 `props[]`。
 * 所以这里额外断言"未登记的词一个都不产生"，防止有人出于好心又往里加别名。
 */
import {
  PROP_KEYWORDS,
  PROP_LABELS,
  matchLegacyProps,
} from '../../src/modules/learning/video/prop-lexicon';

const ids = (text: string) => matchLegacyProps(text).map((p) => p.id);

describe('误判：修好的与留下的（都写下来，免得反复"修"）', () => {
  it('英文别名必须有词边界："let us start" 不再产出 star', () => {
    expect(ids('let us start the game')).toEqual([]);
    // 同样的字母序列在独立成词时仍然成立
    expect(ids('a star in the sky')).toEqual(['star']);
  });

  it('已知局限（刻意不修）：书包 → book、地球仪 → ball', () => {
    // 这两条是 `includes` 时代就有的错，现在**仍然存在**，不是遗漏。
    // 想修只能靠分词：右邻字既可能是中心语（书+包）也可能是谓语（球+踢），
    // 任何启发式都会在另一侧误杀（实测："把球踢远了"被误杀）。
    // 一条"复合词后缀表"能修好这两句，但它又是枚举，且必然两头错。
    // 新分镜由模型声明 props[]，根本不经过这里；老分镜的画面里多一个不相干的
    // 小图标，比引入一个新的不确定组件划算。
    expect(ids('孩子背着书包去上学')).toEqual(['book']);
    expect(ids('它抬起头看着地球仪')).toEqual(['ball']);
  });

  it('单字别名独立成词时照常命中', () => {
    expect(ids('小熊在看书')).toEqual(['book']);
    expect(ids('把球踢远了')).toEqual(['ball']);
    expect(ids('坐到桌子旁边')).toEqual(['table']);
  });

  it('双字别名不套单字规则："苹果树"仍然是苹果', () => {
    expect(ids('苹果树下的苹果')).toEqual(['apple']);
  });
});

describe('重复：同一段文字只产出一次', () => {
  it('"皮球"不会同时产出 ball 两次（别名互相占用区间）', () => {
    const props = matchLegacyProps('小熊拍皮球，把足球踢走');
    expect(props.filter((p) => p.id === 'ball')).toHaveLength(1);
  });

  it('长别名优先："桌子"先命中，"桌"不再单独命中', () => {
    expect(ids('桌子')).toEqual(['table']);
  });
});

describe('顺序与上限：老课的名额不能被重排', () => {
  it('输出顺序是词表顺序，不是命中顺序', () => {
    // 文本里 table 在前、ball 在后；词表里 ball 在前 → 输出仍以 ball 开头
    expect(ids('桌子旁边有一个皮球')).toEqual(['ball', 'table']);
  });

  it('每条结果都带中文标签', () => {
    for (const prop of matchLegacyProps('苹果和皮球还有绘本')) {
      expect(prop.label).toBe(PROP_LABELS[prop.id]);
      expect(prop.label).toBeTruthy();
    }
  });
});

describe('不再扩表：未登记的物件不会凭空出现', () => {
  it('水桶/洒水壶/风筝不在遗留词表里（它们走分镜声明 + 现画）', () => {
    expect(ids('小熊把水倒进水桶里')).toEqual([]);
    expect(ids('给向日葵浇水的洒水壶')).toEqual([]);
    expect(ids('拿着风筝跑')).toEqual([]);
  });

  it('词表里每个 id 都有标签（加别名时忘加标签会在这里红）', () => {
    for (const id of Object.keys(PROP_KEYWORDS)) {
      expect(PROP_LABELS[id]).toBeTruthy();
    }
  });
});
