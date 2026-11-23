/**
 * 场地配方（venue recipes）：**场景是数据，不是代码**。
 *
 * 这里回答"这个场地长什么样"，`WorldLayer.tsx` 只回答"每一层怎么画"。
 * 两者分开之后，加一处场地 = 加一份配方；只有加一种**新的渲染原语**
 * （比如水面）才需要动渲染器，而原语是有限的。
 *
 * 为什么要这么分：
 *   以前 `WorldLayer` 里同时写着"层"（天空/地面/装饰）和"具体场地"
 *   （摩天轮只在 playground、沙坑在 playground 和 riverside），于是每加一处
 *   场地都要改 4 个文件（类型 / 配色 / 装饰 / JSX），而且没有任何东西会提醒
 *   你"漏了一层"。场地内容会无限增长，不该由代码枚举。
 *
 * 配方的两条硬规则（`normalizeRecipe` 会检查）：
 *   1. 必须有 `ground` 层——没有地面，角色就悬在半空，这是唯一"缺了必然出
 *      画面事故"的层；
 *   2. `world` 坐标层禁止出现像素值。一旦允许像素坐标，背景就又变回"贴在
 *      后面的屏保"，和角色不在同一个空间——那正是上一次修掉的问题。
 *
 * 坐标空间只有两种：
 *   `screen` —— 天空、太阳、云。它们不随镜头平移（那是"天"）。
 *   `world`  —— 其余全部。由 camera 的 ppu / originX 投影，跟角色同一把尺。
 */

/* ------------------------------------------------------------------ *
 * 配色
 * ------------------------------------------------------------------ */

export type VenueTheme = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  cloud: string;
  hillFar: string;
  hillNear: string;
  ground: string;
  groundTop: string;
  path: string;
  wood: string;
  woodDark: string;
  metal: string;
  leaf: string;
  leafDark: string;
  /** 水面颜色。没有水的场地不写，`water` 层会退回 hillNear */
  water?: string;
};

/**
 * 配色仍按场地给，但**不再是白名单**：配方自带 `theme`，没登记的场地也放得进。
 * 键是开放字符串，理由同 `VENUE_RECIPES`。
 */
export const VENUE_THEMES: Record<string, VenueTheme> = {
  playground: {
    skyTop: '#a9e4ff',
    skyBottom: '#e8f7ff',
    sun: '#ffd76a',
    cloud: '#ffffff',
    hillFar: '#b7e3c6',
    hillNear: '#96d6ae',
    ground: '#8ed47a',
    groundTop: '#a6df8e',
    path: '#e9d3a8',
    wood: '#c98a5a',
    woodDark: '#8d5524',
    metal: '#9fb3c8',
    leaf: '#57b96a',
    leafDark: '#3e8f52',
  },
  meadow: {
    skyTop: '#bfeaff',
    skyBottom: '#f0f9ff',
    sun: '#ffe08a',
    cloud: '#ffffff',
    hillFar: '#c6e8c9',
    hillNear: '#a4d9ab',
    ground: '#8ed47a',
    groundTop: '#a9e094',
    path: '#e6d2ac',
    wood: '#c08b5c',
    woodDark: '#8a5a2f',
    metal: '#a8b8c6',
    leaf: '#5bbb6c',
    leafDark: '#41904f',
  },
  riverside: {
    skyTop: '#a7e8ff',
    skyBottom: '#eaf9ff',
    sun: '#ffdf85',
    cloud: '#ffffff',
    hillFar: '#a9dcc2',
    hillNear: '#8ecfae',
    ground: '#7fc97a',
    groundTop: '#95d78c',
    path: '#d9c39b',
    wood: '#bb8a5e',
    woodDark: '#84562f',
    metal: '#9fb3c8',
    leaf: '#55b46a',
    leafDark: '#3d8a4e',
    /** 河水。其他场地不写，`water` 层会退回 hillNear */
    water: '#4fb8d9',
  },
  forest: {
    skyTop: '#bfe6ff',
    skyBottom: '#eef9ff',
    sun: '#ffe08a',
    cloud: '#ffffff',
    hillFar: '#a8d6bd',
    hillNear: '#87c4a1',
    ground: '#79c073',
    groundTop: '#8ed083',
    path: '#cdb894',
    wood: '#b98456',
    woodDark: '#7d5029',
    metal: '#9aa9b8',
    leaf: '#4faf63',
    leafDark: '#357a46',
  },
  /**
   * 室内：暖木墙 + 米色地板。
   * `skyTop` 同时是"纯色背景"的填充色（室内没有天空），所以它取墙的颜色。
   */
  classroom: {
    skyTop: '#f3e6d0',
    skyBottom: '#f3e6d0',
    sun: '#ffe6b0',
    cloud: '#fffdf8',
    hillFar: '#efe0c8',
    hillNear: '#e3d3b8',
    ground: '#e8dcc6',
    groundTop: '#d6c5a8',
    path: '#d9c5a4',
    wood: '#c9a06a',
    woodDark: '#8b6a42',
    metal: '#9aa3ac',
    leaf: '#7fb069',
    leafDark: '#5c8f4e',
  },
  night: {
    skyTop: '#13233f',
    skyBottom: '#29456f',
    sun: '#f2f0d8',
    cloud: '#3a5170',
    hillFar: '#22384f',
    hillNear: '#1b2d40',
    ground: '#2c4636',
    groundTop: '#35533f',
    path: '#3d4a3f',
    wood: '#6f523c',
    woodDark: '#4a3527',
    metal: '#7d8b99',
    leaf: '#2f5c41',
    leafDark: '#234631',
  },
};

/* ------------------------------------------------------------------ *
 * 图层
 * ------------------------------------------------------------------ */

/**
 * 渲染原语。**这是唯一可以枚举的东西**，而且它不会随题材增长：
 * 户外与室内都能用这 6 种描述完（室内 = 纯色 backdrop + 地板 + 墙/家具装饰）。
 */
export type LayerKind = 'sky' | 'horizon' | 'ground' | 'water' | 'fence' | 'decor';

/** 装饰资产 id。开放字符串：加资产只写组件 + 注册一行 */
export type DecorAssetId = string;

export type DecorItem = {
  asset: DecorAssetId;
  /** 世界坐标 x（不是像素） */
  x: number;
  /** 整体透明度，缺省 1 */
  opacity?: number;
  /**
   * 资产私有参数（墙高、水宽、灯高……），由资产自己解释。
   * 例如 `{ asset: 'wall', x: 0, params: { height: 3.2, from: -12, to: 12 } }`
   */
  params?: Record<string, number | string>;
};

export type SkyLayer = {
  kind: 'sky';
  /**
   * `gradient`（户外天空）或 `solid`（室内：用 theme.skyTop 铺满）。
   * 室内没有"天空"，所以太阳与云必须是可选的——缺了太阳云，这一层就是一块
   * 纯色背景，不叫 sky 也不影响它工作。
   */
  fill?: 'gradient' | 'solid';
  sun?: { x: number; y: number; r: number; glowR: number };
  clouds?: { x: number; y: number; s: number }[];
};

export type HorizonLayer = {
  kind: 'horizon';
  hills: { x: number; r: number; tone: 'far' | 'near' }[];
};

export type GroundPatch =
  /** 滑梯脚下的土地。`when: 'slide'` ⇒ 只有这一幕有滑梯时才画 */
  | { asset: 'dirtPatch'; when: 'slide'; rx: number; ry: number; opacity: number }
  /** 草簇：确定性按索引摆（不用随机），重渲逐像素一致 */
  | { asset: 'tuft'; from: number; count: number; step: number };

export type GroundLayer = {
  kind: 'ground';
  /** 地面材质语义（渲染只看 theme，这个字段给未来区分草地/地板/沙地留口） */
  asset: 'grass' | 'floor' | 'sand';
  /** 上沿那条把"地面"和"空气"分开的浅色边，室内一般给 0 */
  topBand: number;
  /** 贴在地面上的附加元素，**数组顺序 = 绘制顺序**：先沙地椭圆，再草簇 */
  patches?: GroundPatch[];
};

export type WaterLayer = {
  kind: 'water';
  from: number;
  to: number;
  /** 水面上沿的世界 y（略高于 0 才是"远处的水"，等于 0 就成了脚边水坑） */
  surfaceY: number;
  /** 水带高度（世界单位） */
  depth: number;
  opacity?: number;
};

export type FenceLayer = {
  kind: 'fence';
  from: number;
  posts: number;
  spacing: number;
  /** 横杆跨度（不等于 posts 覆盖范围，历史上就是 20） */
  railSpan: number;
  railYs: number[];
  postHeight: number;
  postWidth: number;
  railHeight: number;
};

export type DecorLayer = { kind: 'decor'; items: DecorItem[] };

export type LayerSpec =
  | SkyLayer
  | HorizonLayer
  | GroundLayer
  | WaterLayer
  | FenceLayer
  | DecorLayer;

export type VenueRecipe = {
  /** 配方 id。**开放字符串**，不是字面量联合 */
  id: string;
  theme: VenueTheme;
  /** 数组顺序 = 绘制顺序 = 遮挡顺序。同一 kind 可以出现多次（见 playground 的 wheel 与 fence） */
  layers: LayerSpec[];
};

/* ------------------------------------------------------------------ *
 * 配方
 * ------------------------------------------------------------------ */

/**
 * 内置场地。**这不是类型来源**，只是"回归基线清单"：测试要求这里每一个都
 * 有配方，反过来不要求——加新场地不需要动这个数组。
 */
export const BUILTIN_VENUES: readonly string[] = [
  'playground',
  'meadow',
  'riverside',
  'forest',
  'night',
];

/** 兜底场地：未知 id 落到这里，宁可画面普通，也不要空白 */
export const DEFAULT_VENUE = 'meadow';

/**
 * 户外共用的天空与远山。
 *
 * 抽成常量不是为了省字节，而是为了让"这一处场地和那一处看起来是同一片天"
 * 变成结构性的：改天空只改一处，所有户外场地一起变。
 */
const OUTDOOR_SKY: SkyLayer = {
  kind: 'sky',
  fill: 'gradient',
  sun: { x: 1560, y: 230, r: 78, glowR: 210 },
  clouds: [
    { x: 320, y: 200, s: 1 },
    { x: 980, y: 150, s: 0.75 },
    { x: 1420, y: 300, s: 0.55 },
  ],
};

const OUTDOOR_HILLS: HorizonLayer = {
  kind: 'horizon',
  hills: [
    { x: -1.5, r: 6.2, tone: 'far' },
    { x: 6.5, r: 5.4, tone: 'far' },
    { x: 2.4, r: 4.4, tone: 'near' },
  ],
};

/** 草地 + 草簇。滑梯脚下的沙地在有滑梯时由渲染器补 x（它属于滑梯，不属于场地） */
const GRASS_GROUND: GroundLayer = {
  kind: 'ground',
  asset: 'grass',
  topBand: 0.055,
  patches: [
    { asset: 'dirtPatch', when: 'slide', rx: 2.9, ry: 0.3, opacity: 0.55 },
    { asset: 'tuft', from: -3.4, count: 34, step: 0.42 },
  ],
};

/** 游乐园/牧场那种横贯全画面的木栅栏 */
const PADDOCK_FENCE: FenceLayer = {
  kind: 'fence',
  from: -9,
  posts: 34,
  spacing: 0.62,
  railSpan: 20,
  railYs: [0.24, 0.46],
  postHeight: 0.58,
  postWidth: 0.09,
  railHeight: 0.07,
};

export const VENUE_RECIPES: Record<string, VenueRecipe> = {
  /**
   * 游乐园。
   *
   * 两个顺序细节来自旧实现，不能"整理"：
   *  - 摩天轮画在**围栏之前**：围栏要挡住轮子的斜撑，否则两根斜柱横在草地上
   *    像脚手架，把"远景"读成"前景障碍物"；
   *  - 树先于长椅、长椅先于沙坑：它们之间的遮挡关系写在这个数组里。
   *
   * 这也是为什么 `layers` 允许 `decor` 出现两次——摩天轮必须在 fence 之前，
   * 其余装饰在之后。按 kind 分组的写法表达不了这件事。
   */
  playground: {
    id: 'playground',
    theme: VENUE_THEMES.playground,
    layers: [
      OUTDOOR_SKY,
      OUTDOOR_HILLS,
      GRASS_GROUND,
      { kind: 'decor', items: [{ asset: 'wheel', x: 3.4, opacity: 0.42 }] },
      PADDOCK_FENCE,
      {
        kind: 'decor',
        items: [
          { asset: 'tree', x: -3.2 },
          { asset: 'tree', x: 6.6 },
          { asset: 'tree', x: 8.2 },
          { asset: 'bench', x: 5.6 },
          { asset: 'sandbox', x: -2.6 },
        ],
      },
    ],
  },

  meadow: {
    id: 'meadow',
    theme: VENUE_THEMES.meadow,
    layers: [
      OUTDOOR_SKY,
      OUTDOOR_HILLS,
      GRASS_GROUND,
      PADDOCK_FENCE,
      {
        kind: 'decor',
        items: [
          { asset: 'tree', x: -3.2 },
          { asset: 'tree', x: 6.6 },
          { asset: 'tree', x: 8.2 },
          { asset: 'bench', x: 5.6 },
        ],
      },
    ],
  },

  /**
   * 河边。现在**还没有水**（旧实现的 riverside 只是"带沙坑的草地"），
   * 水面是独立一步加进来的：它是新原语，配方里加一行 `water` 即可。
   */
  riverside: {
    id: 'riverside',
    theme: VENUE_THEMES.riverside,
    layers: [
      OUTDOOR_SKY,
      OUTDOOR_HILLS,
      GRASS_GROUND,
      /**
       * 水面。放在地面之后、围栏之前：水是"近处的岸"，围栏在它后面更远。
       *
       * 参数是量出来的，不是估的：侧视图里"远处的地面"只被压成地平线附近一条
       * 窄带，所以河必须**贴着地平线很薄**（0.22 个世界单位 ≈ 50px）。
       * 给 0.5 深就会变成"脚边的护城河"，还被字幕压住——第一版就是这么错的。
       * 这一层是**新原语**，不是新场地：湖、水池、海边都复用它。
       */
      { kind: 'water', from: -14, to: 14, surfaceY: 0, depth: 0.2, opacity: 0.95 },
      PADDOCK_FENCE,
      {
        kind: 'decor',
        items: [
          { asset: 'tree', x: -3.2 },
          { asset: 'tree', x: 6.6 },
          { asset: 'tree', x: 8.2 },
          { asset: 'bench', x: 5.6 },
          { asset: 'sandbox', x: -2.6 },
        ],
      },
    ],
  },

  /**
   * 森林/夜晚：没有围栏。围栏是游乐园/牧场的语汇，森林里画一条横贯全画面的
   * 木栅栏就变成"一个有围栏的空地"。两侧改由树与灌木填住，否则镜头一平移
   * 就是一块空地。
   */
  forest: {
    id: 'forest',
    theme: VENUE_THEMES.forest,
    layers: [
      OUTDOOR_SKY,
      OUTDOOR_HILLS,
      GRASS_GROUND,
      {
        kind: 'decor',
        items: [
          { asset: 'bush', x: -1.6 },
          { asset: 'bush', x: 4.4 },
          { asset: 'bush', x: 9.4 },
          { asset: 'tree', x: -3.2 },
          { asset: 'tree', x: 6.6 },
          { asset: 'tree', x: 8.2 },
          { asset: 'tree', x: -5.4 },
          { asset: 'tree', x: -7.2 },
          { asset: 'tree', x: 10.4 },
          { asset: 'bench', x: 5.6 },
        ],
      },
    ],
  },

  /**
   * 室内：教室。
   *
   * 这套配方存在的意义不是"再加一处场地"，而是证明**户外与室内用的是同一组
   * 原语**：没有天空就用 `fill: 'solid'` 的背景层，没有草地就用 `floor` 地面，
   * 墙与课桌只是装饰资产。渲染器一行没动。
   *
   * 室内不需要地平线与远山：有墙就没有远处。
   */
  classroom: {
    id: 'classroom',
    theme: VENUE_THEMES.classroom,
    layers: [
      { kind: 'sky', fill: 'solid' },
      { kind: 'ground', asset: 'floor', topBand: 0.06 },
      {
        kind: 'decor',
        items: [
          /**
           * 墙先画，后面的家具才站在它前面。
           *
           * 家具位置受一条硬约束：wide 镜头下可见的世界 x 只有约 ±2（ppu 由
           * "角色 + 一点余量"算出，不是"装下整间屋子"）。摆在 ±3 之外的书架、
           * 第二张桌子都只会露一角——第一版就是这么错的，画面看着像"空房间"。
           * 所以室内只摆三件、都压在 ±2 内：窗、一张课桌、一盏灯。
           */
          { asset: 'wall', x: 0, params: { from: -14, to: 14, height: 2.6 } },
          { asset: 'window', x: -1.55, params: { width: 1.2, height: 1.2, sill: 0.95 } },
          { asset: 'desk', x: 1.1 },
          { asset: 'lamp', x: 1.85, params: { height: 2.0 } },
        ],
      },
    ],
  },

  night: {
    id: 'night',
    theme: VENUE_THEMES.night,
    layers: [
      OUTDOOR_SKY,
      OUTDOOR_HILLS,
      GRASS_GROUND,
      {
        kind: 'decor',
        items: [
          { asset: 'bush', x: -1.6 },
          { asset: 'bush', x: 4.4 },
          { asset: 'bush', x: 9.4 },
          { asset: 'tree', x: -3.2 },
          { asset: 'tree', x: 6.6 },
          { asset: 'tree', x: 8.2 },
          { asset: 'tree', x: -5.4 },
          { asset: 'tree', x: -7.2 },
          { asset: 'tree', x: 10.4 },
          { asset: 'bench', x: 5.6 },
        ],
      },
    ],
  },
};

/**
 * 已知装饰资产清单。
 *
 * 与 `venue-assets.tsx` 的注册表是两处，但测试会断言"注册表覆盖这张表"，
 * 所以漏注册会红。放在数据文件里是因为配方校验（`normalizeRecipe`）需要它，
 * 而数据文件不能 import tsx。
 */
export const DECOR_ASSET_IDS: readonly string[] = [
  'tree',
  'bush',
  'bench',
  'sandbox',
  'wheel',
  'wall',
  'window',
  'desk',
  'lamp',
  'shelf',
];

/* ------------------------------------------------------------------ *
 * 取用与校验
 * ------------------------------------------------------------------ */

const warned = new Set<string>();

/**
 * 取配方。未知 id 回落 `meadow` 并**警告一次**。
 *
 * 静默回落是"场地悄悄缩水"的来源：少画一层，画面照样出得来，没人会发现，
 * 直到某一节课看起来莫名其妙地空。拼错的 id 必须留一条日志。
 */
export function venueRecipe(venue: string): VenueRecipe {
  const recipe = VENUE_RECIPES[venue];
  if (recipe) return recipe;
  if (!warned.has(venue)) {
    warned.add(venue);
    // eslint-disable-next-line no-console
    console.warn(`[venue] 未登记的场地 "${venue}"，回落到 ${DEFAULT_VENUE}`);
  }
  return VENUE_RECIPES[DEFAULT_VENUE];
}

/** 像素坐标字段名。世界层出现这些，说明有人又把背景写回了屏幕空间 */
const PIXEL_KEYS = new Set(['px', 'py', 'left', 'top', 'widthPx', 'heightPx']);

export type RecipeIssue =
  | { kind: 'missing-ground' }
  | { kind: 'pixel-coordinate'; path: string }
  | { kind: 'unknown-asset'; path: string; asset: string }
  | { kind: 'bad-layer'; path: string };

/**
 * 配方校验。
 *
 * 三条规则对应三种真实事故：
 *  - 没有 ground：角色悬空；
 *  - 世界层出现像素坐标：背景变回"贴在后面的屏保"，比例对不上；
 *  - 未知 asset：静默跳过 ⇒ 某一侧空掉。
 *
 * 返回问题清单而不是直接抛，是为了让调用方决定"开发期抛 / 运行期降级 + warn"。
 */
export function normalizeRecipe(raw: unknown, path = 'recipe'): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  if (!raw || typeof raw !== 'object') return [{ kind: 'bad-layer', path }];

  const recipe = raw as Partial<VenueRecipe>;
  const layers = Array.isArray(recipe.layers) ? recipe.layers : [];
  if (!layers.some((layer) => layer && layer.kind === 'ground')) {
    issues.push({ kind: 'missing-ground' });
  }

  layers.forEach((layer, i) => {
    const at = `${path}.layers[${i}]`;
    if (!layer || typeof layer !== 'object' || typeof layer.kind !== 'string') {
      issues.push({ kind: 'bad-layer', path: at });
      return;
    }
    scanPixels(layer, at, issues);
    if (layer.kind === 'decor') {
      const items = (layer as DecorLayer).items;
      if (!Array.isArray(items)) {
        issues.push({ kind: 'bad-layer', path: `${at}.items` });
        return;
      }
      items.forEach((item, j) => {
        if (!item || typeof item.asset !== 'string') {
          issues.push({ kind: 'bad-layer', path: `${at}.items[${j}]` });
          return;
        }
        if (!DECOR_ASSET_IDS.includes(item.asset)) {
          issues.push({ kind: 'unknown-asset', path: `${at}.items[${j}]`, asset: item.asset });
        }
      });
    }
  });

  return issues;
}

function scanPixels(value: unknown, path: string, issues: RecipeIssue[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, i) => scanPixels(child, `${path}[${i}]`, issues));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PIXEL_KEYS.has(key)) issues.push({ kind: 'pixel-coordinate', path: `${path}.${key}` });
    if (child && typeof child === 'object') scanPixels(child, `${path}.${key}`, issues);
  }
}
