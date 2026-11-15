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

// 模板里只有一处 JS 插值：ANIMAL_EMOJI_MAP 的 JSON
const template = raw.replace('${JSON.stringify(ANIMAL_EMOJI_MAP)}', '{}');

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
  'stageScale * breath * 1.4',
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
  'local >= 0.5',
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
];

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
const missing = mustHave.filter((token) => !template.includes(token) && !source.includes(token));
console.log('missing_tokens=' + (missing.length ? missing.join(',') : 'none'));
console.log('missing_relations=' + (missingRelations.length ? missingRelations.join(',') : 'none'));
console.log('missing_signs=' + (missingSigns.length ? missingSigns.join(',') : 'none'));

process.exit(
  diagnostics.length === 0 && missing.length === 0 && missingRelations.length === 0 && missingSigns.length === 0
    ? 0
    : 1,
);
