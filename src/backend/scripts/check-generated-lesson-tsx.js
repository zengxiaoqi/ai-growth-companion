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
];
const missing = mustHave.filter((token) => !template.includes(token) && !source.includes(token));
console.log('missing_tokens=' + (missing.length ? missing.join(',') : 'none'));

process.exit(diagnostics.length === 0 && missing.length === 0 ? 0 : 1);
