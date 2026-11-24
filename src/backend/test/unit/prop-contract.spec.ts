/**
 * 道具契约的守卫测试。
 *
 * 这一层是"开放道具"的入口，也是最容易被写松的一层：宽松一点，LLM 写的
 * 半句话、纯标点、重复项都会进画面。所以这里的用例都是**真实见过的坏输入**，
 * 不是假想的。
 *
 * 三组：
 *  1. 规范化：名字、数量、比例、位置；
 *  2. 宽容读：模型写过字符串/对象/数组三种形态；
 *  3. 开关：默认关——这是"回滚是改配置，不是发版"的落点。
 */
import {
  DEFAULT_PROP_HEIGHT_RATIO,
  MAX_PROPS_PER_SCENE,
  isPropDeclarationEnabled,
  normalizeDeclaredProps,
  normalizePropName,
  propIdOf,
} from '../../src/modules/learning/video/prop-contract';

describe('名字规范化：只挡"明显不是名词"，不判断词义', () => {
  it('去首尾空白、折叠内部空格、去零宽字符', () => {
    expect(normalizePropName('  洒水壶 ')).toBe('洒水壶');
    expect(normalizePropName('红  苹果')).toBe('红 苹果');
    expect(normalizePropName('\u200b水桶\u200b')).toBe('水桶');
  });

  it('空、超长、纯标点、纯数字一律不认', () => {
    expect(normalizePropName('')).toBe('');
    expect(normalizePropName('   ')).toBe('');
    // 12 字以上多半不是名词，而是半句话
    expect(normalizePropName('小熊手里拿着的那个红色的苹果')).toBe('');
    expect(normalizePropName('！！！')).toBe('');
    expect(normalizePropName('3')).toBe('');
  });

  it('带数字的名词合法："7 号球"不是数字', () => {
    expect(normalizePropName('7 号球')).toBe('7 号球');
  });

  it('id 只做大小写归一，中文原样', () => {
    expect(propIdOf('  苹果 ')).toBe('苹果');
    expect(propIdOf('Ball')).toBe('ball');
  });
});

describe('规范化：限量、去重、补默认值', () => {
  it('每幕最多 3 个，多的直接丢', () => {
    const props = normalizeDeclaredProps(['水桶', '洒水壶', '向日葵', '风筝']);
    expect(props).toHaveLength(MAX_PROPS_PER_SCENE);
    expect(props.map((p) => p.label)).toEqual(['水桶', '洒水壶', '向日葵']);
  });

  it('同名（含大小写差异）只留一个', () => {
    const props = normalizeDeclaredProps([{ name: 'apple' }, { name: 'Apple' }, { name: '苹果' }]);
    expect(props.map((p) => p.id)).toEqual(['apple', '苹果']);
  });

  it('heightRatio 缺省 0.35，越界 clamp 到 [0.08, 0.9]', () => {
    const [a, b, c] = normalizeDeclaredProps([
      { name: '苹果' },
      { name: '大象', heightRatio: 9 },
      { name: '蚂蚁', heightRatio: 0.001 },
    ]);
    expect(a.heightRatio).toBe(DEFAULT_PROP_HEIGHT_RATIO);
    expect(b.heightRatio).toBe(0.9);
    expect(c.heightRatio).toBe(0.08);
  });

  it('place 缺省按"有没有指定 holder"推，非法值也走这条', () => {
    const [a, b, c] = normalizeDeclaredProps([
      { name: '苹果' },
      { name: '水壶', holder: 'bear' },
      { name: '风筝', place: '天上了' },
    ]);
    expect(a.place).toBe('floor');
    expect(b.place).toBe('hand');
    expect(c.place).toBe('floor');
  });

  it('place 写成 hand/floor/worn 时照写', () => {
    const props = normalizeDeclaredProps([
      { name: '苹果', place: 'hand' },
      { name: '桌子', place: 'floor' },
      { name: '帽子', place: 'worn' },
    ]);
    expect(props.map((p) => p.place)).toEqual(['hand', 'floor', 'worn']);
  });
});

describe('宽容读：模型写什么都收得住', () => {
  it('字符串数组', () => {
    expect(normalizeDeclaredProps(['水桶'])[0].label).toBe('水桶');
  });

  it('单个字符串（模型偶尔不写数组）', () => {
    expect(normalizeDeclaredProps('水桶').map((p) => p.label)).toEqual(['水桶']);
  });

  it('对象用 label / subject / id 代替 name', () => {
    const props = normalizeDeclaredProps([{ label: '水桶' }, { subject: '水壶' }, { id: '苹果' }]);
    expect(props.map((p) => p.label)).toEqual(['水桶', '水壶', '苹果']);
  });

  it('undefined / null / 乱结构 → 空数组，不抛', () => {
    expect(normalizeDeclaredProps(undefined)).toEqual([]);
    expect(normalizeDeclaredProps(null)).toEqual([]);
    expect(normalizeDeclaredProps(42)).toEqual([]);
    expect(normalizeDeclaredProps([{}, { name: '' }])).toEqual([]);
  });
});

describe('开关：默认关，回滚是改配置', () => {
  it('未设置 / 非 on 一律关闭', () => {
    expect(isPropDeclarationEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isPropDeclarationEnabled({ PROP_GEN: 'off' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPropDeclarationEnabled({ PROP_GEN: '1' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('只有显式 on 才开（大小写不敏感）', () => {
    expect(isPropDeclarationEnabled({ PROP_GEN: 'on' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isPropDeclarationEnabled({ PROP_GEN: 'ON' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
