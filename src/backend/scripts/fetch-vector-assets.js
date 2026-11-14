/**
 * 拉取本地矢量素材库（Microsoft Fluent Emoji · Flat 风格 · MIT 许可）。
 *
 * 为什么用它：一套作者、一套配色、一套线条，1595 个具象主体（动物/食物/植物/天气/物品/数字），
 * MIT 许可无署名义务、无 ShareAlike 传染，可商用。相比每次让模型现写 SVG，
 * 它保证「同一个主题每次画出来都是同一个东西」。
 *
 * 用法：node scripts/fetch-vector-assets.js [--force]
 * 产物：src/video-remotion/public/assets/vector/{category}/{id}.svg
 *       src/video-remotion/public/assets/vector/manifest.json
 *       src/video-remotion/public/assets/vector/CREDITS.md
 */
const fs = require('fs');
const path = require('path');

const MIRRORS = [
  'https://fastly.jsdelivr.net/gh/microsoft/fluentui-emoji@main',
  'https://gcore.jsdelivr.net/gh/microsoft/fluentui-emoji@main',
  'https://testingcf.jsdelivr.net/gh/microsoft/fluentui-emoji@main',
];
const TREE_URL =
  'https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1';

const outputRoot = path.join(__dirname, '..', '..', 'video-remotion', 'public', 'assets', 'vector');
const FORCE = process.argv.includes('--force');

/**
 * role: character = 可以当画面主体站着讲；prop = 只能当示意元素/叠加物
 * cn/en 都是检索别名，命中即视为该主体
 */
const CATALOG = [
  // ── 动物 ──────────────────────────────────────────────
  { id: 'tiger', up: 'Tiger', cat: 'animals', role: 'character', cn: ['老虎', '虎', '大老虎'], en: ['tiger'] },
  { id: 'rabbit', up: 'Rabbit', cat: 'animals', role: 'character', cn: ['兔子', '小兔', '兔'], en: ['rabbit', 'bunny'] },
  { id: 'monkey', up: 'Monkey', cat: 'animals', role: 'character', cn: ['猴子', '小猴', '猴'], en: ['monkey'] },
  { id: 'elephant', up: 'Elephant', cat: 'animals', role: 'character', cn: ['大象', '象'], en: ['elephant'] },
  { id: 'lion', up: 'Lion', cat: 'animals', role: 'character', cn: ['狮子', '狮'], en: ['lion'] },
  { id: 'panda', up: 'Panda', cat: 'animals', role: 'character', cn: ['熊猫', '大熊猫'], en: ['panda'] },
  { id: 'cat', up: 'Cat', cat: 'animals', role: 'character', cn: ['猫', '小猫', '猫咪'], en: ['cat', 'kitten'] },
  { id: 'dog', up: 'Dog', cat: 'animals', role: 'character', cn: ['狗', '小狗', '狗狗'], en: ['dog', 'puppy'] },
  { id: 'fish', up: 'Fish', cat: 'animals', role: 'character', cn: ['鱼', '小鱼'], en: ['fish'] },
  { id: 'bird', up: 'Bird', cat: 'animals', role: 'character', cn: ['鸟', '小鸟'], en: ['bird'] },
  { id: 'snake', up: 'Snake', cat: 'animals', role: 'character', cn: ['蛇', '小蛇'], en: ['snake'] },
  { id: 'turtle', up: 'Turtle', cat: 'animals', role: 'character', cn: ['乌龟', '龟'], en: ['turtle'] },
  { id: 'frog', up: 'Frog', cat: 'animals', role: 'character', cn: ['青蛙', '蛙', '小青蛙'], en: ['frog'] },
  { id: 'butterfly', up: 'Butterfly', cat: 'animals', role: 'character', cn: ['蝴蝶'], en: ['butterfly'] },
  { id: 'bee', up: 'Honeybee', cat: 'animals', role: 'character', cn: ['蜜蜂', '蜂'], en: ['bee', 'honeybee'] },
  { id: 'ant', up: 'Ant', cat: 'animals', role: 'character', cn: ['蚂蚁', '蚁'], en: ['ant'] },
  { id: 'penguin', up: 'Penguin', cat: 'animals', role: 'character', cn: ['企鹅'], en: ['penguin'] },
  { id: 'giraffe', up: 'Giraffe', cat: 'animals', role: 'character', cn: ['长颈鹿'], en: ['giraffe'] },
  { id: 'deer', up: 'Deer', cat: 'animals', role: 'character', cn: ['鹿', '小鹿', '梅花鹿'], en: ['deer'] },
  { id: 'zebra', up: 'Zebra', cat: 'animals', role: 'character', cn: ['斑马'], en: ['zebra'] },
  { id: 'hippo', up: 'Hippopotamus', cat: 'animals', role: 'character', cn: ['河马'], en: ['hippo', 'hippopotamus'] },
  { id: 'crocodile', up: 'Crocodile', cat: 'animals', role: 'character', cn: ['鳄鱼'], en: ['crocodile', 'alligator'] },
  { id: 'kangaroo', up: 'Kangaroo', cat: 'animals', role: 'character', cn: ['袋鼠'], en: ['kangaroo'] },
  { id: 'bear', up: 'Bear', cat: 'animals', role: 'character', cn: ['熊', '小熊'], en: ['bear'] },
  { id: 'fox', up: 'Fox', cat: 'animals', role: 'character', cn: ['狐狸', '小狐狸'], en: ['fox'] },
  { id: 'owl', up: 'Owl', cat: 'animals', role: 'character', cn: ['猫头鹰'], en: ['owl'] },
  { id: 'cow', up: 'Cow', cat: 'animals', role: 'character', cn: ['牛', '奶牛', '小牛'], en: ['cow', 'cattle'] },
  { id: 'duck', up: 'Duck', cat: 'animals', role: 'character', cn: ['鸭子', '小鸭', '鸭'], en: ['duck'] },
  { id: 'pig', up: 'Pig', cat: 'animals', role: 'character', cn: ['猪', '小猪'], en: ['pig'] },
  { id: 'horse', up: 'Horse', cat: 'animals', role: 'character', cn: ['马', '小马'], en: ['horse'] },
  { id: 'sheep', up: 'Ewe', cat: 'animals', role: 'character', cn: ['羊', '绵羊', '小羊'], en: ['sheep', 'ewe', 'lamb'] },
  { id: 'chicken', up: 'Chicken', cat: 'animals', role: 'character', cn: ['鸡', '母鸡', '小鸡'], en: ['chicken', 'hen'] },
  { id: 'rooster', up: 'Rooster', cat: 'animals', role: 'character', cn: ['公鸡'], en: ['rooster'] },
  { id: 'chick', up: 'Baby chick', cat: 'animals', role: 'character', cn: ['小鸡仔', '雏鸡'], en: ['chick'] },
  { id: 'mouse', up: 'Mouse', cat: 'animals', role: 'character', cn: ['老鼠', '小老鼠'], en: ['mouse'] },
  { id: 'goat', up: 'Goat', cat: 'animals', role: 'character', cn: ['山羊'], en: ['goat'] },
  { id: 'camel', up: 'Two-hump camel', cat: 'animals', role: 'character', cn: ['骆驼'], en: ['camel'] },
  { id: 'wolf', up: 'Wolf', cat: 'animals', role: 'character', cn: ['狼', '大灰狼'], en: ['wolf'] },
  { id: 'dolphin', up: 'Dolphin', cat: 'animals', role: 'character', cn: ['海豚'], en: ['dolphin'] },
  { id: 'whale', up: 'Spouting whale', cat: 'animals', role: 'character', cn: ['鲸鱼', '鲸'], en: ['whale'] },
  { id: 'octopus', up: 'Octopus', cat: 'animals', role: 'character', cn: ['章鱼'], en: ['octopus'] },
  { id: 'crab', up: 'Crab', cat: 'animals', role: 'character', cn: ['螃蟹', '蟹'], en: ['crab'] },
  { id: 'shrimp', up: 'Shrimp', cat: 'animals', role: 'character', cn: ['虾', '小虾'], en: ['shrimp'] },
  { id: 'snail', up: 'Snail', cat: 'animals', role: 'character', cn: ['蜗牛'], en: ['snail'] },
  { id: 'squirrel', up: 'Chipmunk', cat: 'animals', role: 'character', cn: ['松鼠'], en: ['squirrel', 'chipmunk'] },
  { id: 'ladybug', up: 'Lady beetle', cat: 'animals', role: 'character', cn: ['瓢虫'], en: ['ladybug', 'lady beetle'] },
  { id: 'peacock', up: 'Peacock', cat: 'animals', role: 'character', cn: ['孔雀'], en: ['peacock'] },
  { id: 'parrot', up: 'Parrot', cat: 'animals', role: 'character', cn: ['鹦鹉'], en: ['parrot'] },
  { id: 'bat', up: 'Bat', cat: 'animals', role: 'character', cn: ['蝙蝠'], en: ['bat'] },
  { id: 'dragon', up: 'Dragon', cat: 'animals', role: 'character', cn: ['龙', '恐龙'], en: ['dragon', 'dinosaur'] },
  { id: 'unicorn', up: 'Unicorn', cat: 'animals', role: 'character', cn: ['独角兽'], en: ['unicorn'] },

  // ── 食物 / 植物 ───────────────────────────────────────
  { id: 'apple', up: 'Red apple', cat: 'food', role: 'character', cn: ['苹果'], en: ['apple'] },
  { id: 'green-apple', up: 'Green apple', cat: 'food', role: 'character', cn: ['青苹果'], en: ['green apple'] },
  { id: 'banana', up: 'Banana', cat: 'food', role: 'character', cn: ['香蕉'], en: ['banana'] },
  { id: 'grapes', up: 'Grapes', cat: 'food', role: 'character', cn: ['葡萄'], en: ['grapes'] },
  { id: 'strawberry', up: 'Strawberry', cat: 'food', role: 'character', cn: ['草莓'], en: ['strawberry'] },
  { id: 'watermelon', up: 'Watermelon', cat: 'food', role: 'character', cn: ['西瓜'], en: ['watermelon'] },
  { id: 'carrot', up: 'Carrot', cat: 'food', role: 'character', cn: ['胡萝卜', '萝卜'], en: ['carrot'] },
  { id: 'corn', up: 'Ear of corn', cat: 'food', role: 'character', cn: ['玉米'], en: ['corn'] },
  { id: 'broccoli', up: 'Broccoli', cat: 'food', role: 'character', cn: ['西兰花'], en: ['broccoli'] },
  { id: 'tomato', up: 'Tomato', cat: 'food', role: 'character', cn: ['西红柿', '番茄'], en: ['tomato'] },
  { id: 'bread', up: 'Bread', cat: 'food', role: 'character', cn: ['面包'], en: ['bread'] },
  { id: 'milk', up: 'Glass of milk', cat: 'food', role: 'character', cn: ['牛奶'], en: ['milk'] },
  { id: 'cookie', up: 'Cookie', cat: 'food', role: 'character', cn: ['饼干'], en: ['cookie'] },
  { id: 'egg', up: 'Egg', cat: 'food', role: 'character', cn: ['鸡蛋', '蛋'], en: ['egg'] },
  { id: 'honey', up: 'Honey pot', cat: 'food', role: 'character', cn: ['蜂蜜'], en: ['honey'] },
  { id: 'mushroom', up: 'Mushroom', cat: 'food', role: 'character', cn: ['蘑菇'], en: ['mushroom'] },
  { id: 'seedling', up: 'Seedling', cat: 'nature', role: 'character', cn: ['幼苗', '发芽', '种子发芽'], en: ['seedling', 'sprout'] },
  { id: 'tree', up: 'Deciduous tree', cat: 'nature', role: 'character', cn: ['树', '大树'], en: ['tree'] },
  { id: 'palm', up: 'Palm tree', cat: 'nature', role: 'character', cn: ['椰子树', '棕榈树'], en: ['palm'] },
  { id: 'flower', up: 'Blossom', cat: 'nature', role: 'character', cn: ['花', '花朵', '小花'], en: ['flower', 'blossom'] },
  { id: 'leaf', up: 'Leaf fluttering in wind', cat: 'nature', role: 'character', cn: ['树叶', '叶子', '落叶'], en: ['leaf'] },
  { id: 'maple', up: 'Maple leaf', cat: 'nature', role: 'character', cn: ['枫叶'], en: ['maple'] },
  { id: 'rice', up: 'Sheaf of rice', cat: 'nature', role: 'character', cn: ['水稻', '稻子', '麦子'], en: ['rice', 'wheat'] },
  { id: 'cactus', up: 'Cactus', cat: 'nature', role: 'character', cn: ['仙人掌'], en: ['cactus'] },

  // ── 自然 / 天气（多用示意元素）────────────────────────
  { id: 'sun', up: 'Sun', cat: 'weather', role: 'prop', cn: ['太阳', '阳光', '日'], en: ['sun'] },
  { id: 'cloud', up: 'Cloud', cat: 'weather', role: 'prop', cn: ['云', '白云', '云朵'], en: ['cloud'] },
  { id: 'rain', up: 'Cloud with rain', cat: 'weather', role: 'prop', cn: ['下雨', '雨', '降雨'], en: ['rain'] },
  { id: 'snow', up: 'Snowflake', cat: 'weather', role: 'prop', cn: ['雪花', '雪', '下雪'], en: ['snow'] },
  { id: 'rainbow', up: 'Rainbow', cat: 'weather', role: 'prop', cn: ['彩虹'], en: ['rainbow'] },
  { id: 'moon', up: 'Crescent moon', cat: 'weather', role: 'prop', cn: ['月亮', '月亮弯弯', '月'], en: ['moon'] },
  { id: 'star', up: 'Star', cat: 'weather', role: 'prop', cn: ['星星', '星'], en: ['star'] },
  { id: 'drop', up: 'Droplet', cat: 'weather', role: 'prop', cn: ['水滴', '水珠', '水'], en: ['droplet', 'water drop'] },
  { id: 'fire', up: 'Fire', cat: 'weather', role: 'prop', cn: ['火', '火焰'], en: ['fire'] },
  { id: 'umbrella', up: 'Umbrella', cat: 'objects', role: 'character', cn: ['雨伞', '伞'], en: ['umbrella'] },

  // ── 物品 / 学习 ───────────────────────────────────────
  { id: 'book', up: 'Blue book', cat: 'objects', role: 'character', cn: ['书', '书本', '绘本'], en: ['book'] },
  { id: 'books', up: 'Books', cat: 'objects', role: 'character', cn: ['一摞书'], en: ['books'] },
  { id: 'pencil', up: 'Pencil', cat: 'objects', role: 'character', cn: ['铅笔', '笔'], en: ['pencil'] },
  { id: 'ruler', up: 'Straight ruler', cat: 'objects', role: 'character', cn: ['尺子', '直尺'], en: ['ruler'] },
  { id: 'clock', up: 'Alarm clock', cat: 'objects', role: 'character', cn: ['时钟', '钟表', '闹钟', '时间'], en: ['clock'] },
  { id: 'ball', up: 'Soccer ball', cat: 'objects', role: 'character', cn: ['球', '足球', '皮球'], en: ['ball', 'soccer'] },
  { id: 'balloon', up: 'Balloon', cat: 'objects', role: 'character', cn: ['气球'], en: ['balloon'] },
  { id: 'kite', up: 'Kite', cat: 'objects', role: 'character', cn: ['风筝'], en: ['kite'] },
  { id: 'car', up: 'Automobile', cat: 'objects', role: 'character', cn: ['汽车', '小汽车', '车'], en: ['car', 'automobile'] },
  { id: 'bus', up: 'Bus', cat: 'objects', role: 'character', cn: ['公交车', '巴士'], en: ['bus'] },
  { id: 'train', up: 'Train', cat: 'objects', role: 'character', cn: ['火车', '小火车', '列车'], en: ['train'] },
  { id: 'plane', up: 'Airplane', cat: 'objects', role: 'character', cn: ['飞机'], en: ['airplane', 'plane'] },
  { id: 'ship', up: 'Ship', cat: 'objects', role: 'character', cn: ['轮船', '船'], en: ['ship', 'boat'] },
  { id: 'rocket', up: 'Rocket', cat: 'objects', role: 'character', cn: ['火箭'], en: ['rocket'] },
  { id: 'house', up: 'House', cat: 'objects', role: 'character', cn: ['房子', '家'], en: ['house', 'home'] },
  { id: 'school', up: 'School', cat: 'objects', role: 'character', cn: ['学校', '幼儿园'], en: ['school'] },
  { id: 'backpack', up: 'Backpack', cat: 'objects', role: 'character', cn: ['书包'], en: ['backpack'] },
  { id: 'paintbrush', up: 'Paintbrush', cat: 'objects', role: 'character', cn: ['画笔', '刷子'], en: ['paintbrush', 'brush'] },
  { id: 'crayon', up: 'Crayon', cat: 'objects', role: 'character', cn: ['蜡笔'], en: ['crayon'] },
  { id: 'abacus', up: 'Abacus', cat: 'objects', role: 'character', cn: ['算盘', '计算'], en: ['abacus'] },

  // ── 数字 / 人物 ───────────────────────────────────────
  { id: 'n1', up: 'Keycap 1', cat: 'numbers', role: 'prop', cn: ['数字一', '一'], en: ['one', '1'] },
  { id: 'n2', up: 'Keycap 2', cat: 'numbers', role: 'prop', cn: ['数字二', '二'], en: ['two', '2'] },
  { id: 'n3', up: 'Keycap 3', cat: 'numbers', role: 'prop', cn: ['数字三', '三'], en: ['three', '3'] },
  { id: 'n4', up: 'Keycap 4', cat: 'numbers', role: 'prop', cn: ['数字四', '四'], en: ['four', '4'] },
  { id: 'n5', up: 'Keycap 5', cat: 'numbers', role: 'prop', cn: ['数字五', '五'], en: ['five', '5'] },
  { id: 'n10', up: 'Keycap 10', cat: 'numbers', role: 'prop', cn: ['数字十', '十'], en: ['ten', '10'] },
  { id: 'baby', up: 'Baby', cat: 'people', role: 'character', cn: ['宝宝', '小朋友', '婴儿'], en: ['baby', 'kid'] },
  { id: 'heart', up: 'Red heart', cat: 'people', role: 'prop', cn: ['爱心', '喜欢', '心'], en: ['heart', 'love'] },
];

async function fetchText(url, { timeout = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTree() {
  const raw = await fetchText(TREE_URL, { timeout: 90000 });
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const node of parsed.tree || []) {
    if (!/\/Flat\/[^/]+\.svg$/i.test(node.path)) continue;
    const folder = node.path.split('/')[1];
    map.set(folder.toLowerCase(), node.path);
  }
  return map;
}

async function download(svgPath) {
  const encoded = svgPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  let lastError;
  for (const mirror of MIRRORS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const svg = await fetchText(mirror + '/' + encoded, { timeout: 30000 });
        if (!svg.includes('<svg')) throw new Error('not svg');
        return svg;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error('download failed');
}

async function main() {
  console.log('fetching file tree …');
  const tree = await fetchTree();
  console.log('flat variants indexed: ' + tree.size);

  const missing = [];
  const entries = [];
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const item of CATALOG) {
    const upstream = tree.get(item.up.toLowerCase());
    if (!upstream) {
      missing.push(item.up);
      continue;
    }
    const target = path.join(outputRoot, item.cat, item.id + '.svg');
    if (!FORCE && fs.existsSync(target) && fs.statSync(target).size > 300) {
      entries.push({ item, staticPath: `assets/vector/${item.cat}/${item.id}.svg` });
      continue;
    }
    try {
      const svg = await download(upstream);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, svg, 'utf8');
      entries.push({ item, staticPath: `assets/vector/${item.cat}/${item.id}.svg` });
      process.stdout.write('.');
    } catch (error) {
      missing.push(item.up + ' (' + error.message + ')');
      process.stdout.write('x');
    }
  }
  console.log('');

  const manifest = {
    version: 1,
    source: 'microsoft/fluentui-emoji (Flat)',
    license: {
      license: 'mit',
      licenseUrl: 'https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE',
      creator: 'Microsoft Corporation',
      sourceUrl: 'https://github.com/microsoft/fluentui-emoji',
    },
    assets: entries.map(({ item, staticPath }) => ({
      id: 'vector-' + item.id,
      kind: item.role === 'character' ? 'character' : 'overlay',
      role: item.id,
      category: item.cat,
      staticPath,
      provider: 'vector',
      license: 'mit',
      creator: 'Microsoft Fluent Emoji',
      aliases: item.cn.concat(item.en || []),
      tags: [item.id, item.cat, item.role].concat(item.cn),
      width: 1024,
      height: 1024,
      qualityScore: item.role === 'character' ? 92 : 80,
    })),
  };
  fs.writeFileSync(
    path.join(outputRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputRoot, 'CREDITS.md'),
    [
      '# 矢量素材来源',
      '',
      '本目录所有 SVG 来自 [microsoft/fluentui-emoji](https://github.com/microsoft/fluentui-emoji) 的 Flat 风格，',
      '采用 MIT 许可（Copyright (c) Microsoft Corporation）。',
      '',
      'MIT 许可允许商用、修改、再分发，不要求署名，也不要求衍生作品沿用同一许可。',
      '此处保留来源说明仅为可追溯性。',
      '',
      '重新拉取：`node scripts/fetch-vector-assets.js --force`',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log('assets written: ' + entries.length + ' → ' + outputRoot);
  if (missing.length) console.log('missing(' + missing.length + '): ' + missing.join(', '));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
