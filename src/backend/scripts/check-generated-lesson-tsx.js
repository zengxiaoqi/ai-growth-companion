const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const servicePath = path.join(
  __dirname,
  '..',
  'src',
  'modules',
  'learning',
  'video-generation-agent.service.ts',
);

const source = fs.readFileSync(servicePath, 'utf8');

/**
 * 渲染层源码（character/*、three/*）也是"模板"的一部分：它是被 sync:three-stage
 * 打包成字符串常量一起下发的。有些契约只落在那一侧（比如"围栏按场地给"
 * 在 WorldLayer 里），只查 lesson 模板就会误报缺失。
 */
const stagePath = path.join(
  __dirname,
  '..',
  'src',
  'modules',
  'learning',
  'video',
  'stage-template.ts',
);
const stageSource = fs.existsSync(stagePath) ? fs.readFileSync(stagePath, 'utf8') : '';

const anchor = 'return String.raw`';
const start = source.indexOf(anchor);
if (start < 0) {
  console.error('anchor not found');
  process.exit(1);
}
const bodyStart = start + anchor.length;
const end = source.indexOf('`;', bodyStart);
if (end < 0) {
  console.error('template end not found');
  process.exit(1);
}
const raw = source.slice(bodyStart, end);

// 模板里的 JS 插值（ANIMAL_EMOJI_MAP / VECTOR_ANIMAL_IDS / SCENE_PROP_LABELS …）
// 都是把后端常量 JSON 化后塞进 TSX。这里统一换成 [] 再转译——脚本只检查语法，
// 不检查数值；以前只替换第一处，剩下两处会让检查恒报 8 个假错误，等于没在守门。
const template = raw.replace(/\$\{[^}]*\}/g, '[]');

const result = ts.transpileModule(template, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
  fileName: 'GeneratedLesson.tsx',
});

const diagnostics = result.diagnostics || [];
console.log('template_chars=' + template.length);
console.log('syntax_errors=' + diagnostics.length);

for (const d of diagnostics) {
  const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
  const where = pos ? 'L' + (pos.line + 1) + ':C' + (pos.character + 1) : '?';
  console.log(where + ' TS' + d.code + ' ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

const mustHave = [
  'const SubtitleTrack',
  'const GroundShadow',
  'const splitNarration',
  'spring({ frame, fps',
  // 头像分支的取景必须来自景别层，不能再写死 top/scale
  'portrait.scale',
  'portrait.top',
  'assetProvider === "vector"',
  'built-in template is authoritative',
  'const SceneGraphStage',
  'const layoutGraph',
  'const GraphConnector',
  'relation === "cycle"',
  'relation === "compare"',
  'relation === "group" || graph.relation === "split"',
  'const hasGraph',
  'normalizeSceneGraph',
  'const AbstractSign',
  'const flowPoint',
  'const FLOW_PERIOD',
  'item.enterFrom',
  'const activeIds',
  // 状态插值：这一屏讲到哪儿，画面就跟到哪儿。少了这几项就退回"排好版就静止"
  'const storyProgress',
  'growWindow',
  'swellK',
  // 高亮交接：时钟驱动走半段就交给下一个节点，挂词驱动必须"到达才点亮"
  'const handoff = token.anchored ? 0.999 : 0.5',
  // 光点挂词：一条边 = 从 A 说到 B 的那段话。缺了这三项光点会退回整屏时钟
  'const flowStops',
  'const tAtStops',
  'FLOW_MIN_SEG',
  // 星形拓扑：group 的箭头是"成员→类别"，三条路径全部落在类别上，
  // 用 target 决定谁亮会让成员一次都不亮、类别从入场就霸屏。缺了这三项
  // 高亮又回到"光点落在哪就亮谁"，group 的成员等于没被讲过
  'const starSpoken',
  'token.anchored && token.flow.focus ? token.flow.focus : token.flow.target',
  'flow.focus[0] !== targets[0]',
  // 成员卡片按词入场：卡片落地晚于点名时，那个词等于没讲（香蕉 0 次亮起）
  'const cueEnterAt',
  'enterAt !== undefined',
  // 连报合并：旁白一口气念几个名字时（间隔 <26 帧），逐个交棒每个只亮半秒，
  // 看起来只是闪了一下。缺了这两项又退回"逐个闪"，提示词压不住这种写法
  'const STAR_MERGE_GAP',
  'prev.lastAt',
  'starGroups[spokenGroup].ids.forEach',
  // 受控画板：图形本身就是知识时必须走这条，缺了它彩虹只能画成一个小图标
  'const FigureStage',
  'const FigureShapePart',
  'const figureArcPath',
  'const figurePointAt',
  'const hasFigure',
  'FIGURE_W',
  'shapeProgress',
  // 背景分档：抽象内容不能套森林底，否则所有课程共用同一条样板街
  'const SceneBackground',
  'style === "neutral"',
  'backgroundStyle === "environment" ? <GroundShadow',
  // 整圈弧必须走 <circle>：0→360 的 path 起点终点重合，A 命令退化成点，
  // 实测太阳系的轨道整条消失。删掉这个分支 = 太阳系又变回空白
  '>= 355',
  // 标签白描边：标签压到图形上也读得出
  'paintOrder="stroke"',
  // 轮廓兜底：纯白雨珠/月亮/牙齿在白底上等于没画，校验层会给它们补一圈描边。
  // 模板少了这个透传，补了也白补——成片仍是"两颗眼睛浮在背景上"
  'strokeWidth={glyph.strokeWidth}',
  // beats 解释器：句级编排驱动焦点/揭示/入场/相机。缺了这些，带 beats 的分镜
  // 会静默退回整屏匀速——编排数据白给，画面又变回"排好版就静止"
  'const beatStateAt',
  'const resolveFocusId',
  // 统一焦点公式：amp=1 时必须与旧式 1.16+sin*0.05 逐像素等价（回归边界）
  '1 + 0.16 * amp',
  'beat.motion === "spring-pop"',
  'beat.motion === "swell"',
  'beat.delayOverride',
  'const beatDelays',
  'b.motion === "stagger"',
  'cur.motion === "orbit"',
  'cur.motion === "camera-push"',
  // 画板按拍生长：第几拍画到第几笔，而不是整屏固定斜率
  'bs.idx + bs.beatProgress',
  'const labelBeat',
  // 字幕逐字跟读必须两档并存：有 TTS 词边界走真实时间轴（scene.subtitlePages），
  // 没有则回退按屏长估算。少了前者，字幕永远偏中位 0.56s；少了后者，
  // 拿不到时间戳的场景（TTS 挂了/老任务重渲）整轨字幕会消失
  'scene.subtitlePages',
  'SUB_PRE_ROLL',
  'splitNarration(scene.narration || "", 15, 2)',
  // 场地背景必须覆盖**所有画人物的舞台**。只给全身木偶与三维舞台画世界时，
  // 双人徽章幕和巨图特写幕还是旧 habitat 屏保，同一节课出现两种背景。
  // 少了这个组件，后面再有新舞台也会静默漏掉背景，而且不会有任何报错。
  'const SceneBackdrop',
  'cameraForWorld(world, "wide")',
  // 围栏是游乐园/牧场的语汇：无条件画一条横贯全画面的木栅栏，
  // "森林里的小松鼠"就成了"一个有围栏的空地"。
  // 判定已从 `venueHasFence(world.venue)` 改由配方派生（配方里有没有 fence 层），
  // 所以钉的是"渲染器按 world.venue 取配方"这件事本身：少了它，场地退化成
  // 一个写死的背景，加多少配方都不会生效。
  'venueRecipe(world.venue)',
  'VENUE_RECIPES',
  // 幕级场地：后端逐幕下发 venue，但基准缩放必须整课一档，否则同一只熊在
  // 森林幕与室内幕高矮不同。`scaleSlide` 就是那条"整课统一"的携带者——
  // 少了它，室内幕会按自己的档取景，熊立刻放大。
  'world.scaleSlide',
  // 双人幕必须交给"两个木偶"，而不是徽章分支。这三个 token 分别钉住
  // 路由（partner）、道具归属（carryBy）、以及渲染层的接口（coStar）：
  // 少了任何一个，双人幕会静默退回"两个圆形头像 + 一条写死的抛物线"，
  // 而画面照样出得来，不会报错。
  'puppet.partner',
  'puppet.carryBy',
  'coStar:',
];

// 有专属渲染分支的动效预设：少了分支，LLM 选到该动效会静默退化成 focus-ring
const motionPresets = ['focus-ring', 'spring-pop', 'stagger', 'swell', 'orbit', 'camera-push'];
const missingMotions = motionPresets.filter((m) => !template.includes('"' + m + '"'));
console.log('missing_motions=' + (missingMotions.length ? missingMotions.join(',') : 'none'));

// 六种图元都必须有渲染分支，否则 LLM 交来的图元会被静默画不出来（画面缺一块）
const figureKinds = ['arc', 'line', 'curve', 'circle', 'rect', 'polygon'];
const missingKinds = figureKinds.filter((kind) => {
  if (kind === 'polygon') return !template.includes('points={glyph.points}');
  return !template.includes(`glyph.kind === "${kind}"`);
});
console.log('missing_figure_kinds=' + (missingKinds.length ? missingKinds.join(',') : 'none'));

// 每种关系都必须有布局分支，否则 LLM 选到未实现的关系会渲染成空画面
const graphRelations = ['cycle', 'chain', 'growth', 'compare', 'group', 'split'];
const missingRelations = graphRelations.filter(
  (relation) => !template.includes(`graph.relation === "${relation}"`) &&
    !(relation === 'chain' && template.includes('// chain：横向依次推进')),
);

// 同理：语法层能产出的示意符号，模板里必须都有画法，否则抽象概念会退化成空白
const graphSigns = ['count', 'rise', 'level', 'flow', 'time'];
const missingSigns = graphSigns.filter((sign) => !template.includes(`sign === "${sign}"`));
const missing = mustHave.filter(
  (token) => !template.includes(token) && !source.includes(token) && !stageSource.includes(token),
);
console.log('missing_tokens=' + (missing.length ? missing.join(',') : 'none'));
console.log('missing_relations=' + (missingRelations.length ? missingRelations.join(',') : 'none'));
console.log('missing_signs=' + (missingSigns.length ? missingSigns.join(',') : 'none'));

process.exit(
  diagnostics.length === 0 && missing.length === 0 && missingRelations.length === 0 && missingSigns.length === 0 && missingMotions.length === 0
    ? 0
    : 1,
);
