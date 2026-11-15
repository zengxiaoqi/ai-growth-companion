#!/usr/bin/env node
/**
 * bench-authoring-models.ts — 创作模型对比 + vision 质检通道验收
 *
 * 背景：生产管道要达到 "Claude Code + skills" 的水平，先决问题是"用哪个模型创作、
 * 用哪个模型当眼睛"。网关候选模型有限，必须实测而不是猜。
 *
 * 两个模式：
 *   --qa-smoke   用已知坏帧（out/before/Fig4.png：白底白图/细线/标签压图）与
 *                已知好帧（out/figures/Fig4.png）验收 VisualQaService 的判别力。
 *                走真实 LlmClientService(pi-ai) + VisualQaService，即生产 vision 链路。
 *   默认         创作对比：每个模型 × 主题 现写 Remotion TSX（注入 remotion-video-creation
 *                技能子集）→ 语法/契约门禁 → remotion still 抽帧 → VisualQa 打分。
 *                产出 storage/bench-authoring-report.json + storage/bench-gallery/ 供人工逐帧看。
 *
 * 用法：
 *   npx ts-node -T scripts/bench-authoring-models.ts --qa-smoke
 *   npx ts-node -T scripts/bench-authoring-models.ts [--models a,b] [--topics 彩虹,大树] [--limit N]
 *
 * 创作调用用 raw OpenAI SDK（与 measure-figure-channel.ts 同precedent：显式指定模型，
 * 不依赖 client 的 entry 注册）；QA 走生产 VisualQaService，rubric 不复制。
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import * as ts from 'typescript';
import { ConfigService } from '@nestjs/config';
import { LlmClientService } from '../src/agent-framework/llm/llm-client.service';
import { VisualQaService } from '../src/modules/learning/visual-qa.service';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const REMOTION_DIR = path.join(REPO_ROOT, 'src', 'video-remotion');
const SKILL_DIR = path.join(REPO_ROOT, 'skills', 'remotion-video-creation');

const DEFAULT_MODELS = ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash'];
const DEFAULT_TOPICS = [
  { topic: '彩虹是怎么形成的', domain: 'science', ageGroup: '5-6' },
  { topic: '大树的样子', domain: 'science', ageGroup: '3-4' },
  { topic: '认识汉字"山"', domain: 'language', ageGroup: '5-6' },
];

/** 技能子集：动效/编排/节奏/转场/文字测量/字幕/组合，约 8k token，够创作不爆预算。 */
const RULE_SUBSET = [
  'animations.md',
  'sequencing.md',
  'timing.md',
  'transitions.md',
  'measuring-text.md',
  'display-captions.md',
  'compositions.md',
];

function readEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env');
  const out: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function loadSkillContext(): string {
  const parts = [fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8')];
  for (const rule of RULE_SUBSET) {
    const p = path.join(SKILL_DIR, 'rules', rule);
    if (fs.existsSync(p)) parts.push(`\n## rule: ${rule}\n${fs.readFileSync(p, 'utf8')}`);
  }
  return parts.join('\n');
}

function authoringSystemPrompt(skill: string): string {
  return [
    '你是儿童教学视频的 Remotion 创作者（3-6 岁）。你为给定主题现写一个专属动画组合，',
    '而不是填模板。以下是 remotion-video-creation 技能规则，严格遵守：',
    '',
    skill,
    '',
    '## 输出契约（违反即废稿）',
    '只输出两个代码块：先 ```json props ```，再 ```tsx 组件 ```。不要其他文字。',
    'props 格式：{"title":"中文标题","topic":"主题","domain":"...","ageGroup":"3-4|5-6",',
    '  "scenes":[{"id":"scene-1","title":"场景标题","narration":"40-80字中文旁白，含具体知识",',
    '  "onScreenText":"≤12字屏幕文字","durationSec":6}]}（4-6 个场景）',
    '组件契约：文件只导出 `export const GeneratedLesson: React.FC<any> = (props) => ...`；',
    '- 只从 "remotion" 导入（AbsoluteFill/Sequence/interpolate/useCurrentFrame/useVideoConfig/spring 等）；',
    '- 禁止 fs/network/eval/require/CSS 动画；一切动画帧驱动（useCurrentFrame + interpolate/spring）；',
    '- 视觉用内联 SVG 现画（主题专属：彩虹画七色弧、大树画树干树冠树叶、汉字画笔画），禁止纯文字卡片；',
    '- 每个场景一个 <Sequence from={累计帧} durationInFrames={durationSec*fps}>；',
    '- 旁白主体必须是画面焦点：被讲到的部件用描边圈/放大/高亮强调，焦点随旁白句子转移；',
    '- 字幕条固定底部，深色圆角底 + 白字，不压图形；标签加白色描边垫底；',
    '- 线宽≥6、圆半径≥12（1600×900 画布）；白底上禁止纯白图元（补轮廓）；',
    '- 年龄适配：3-4 岁节奏慢（每拍≥2.5s）、单焦点、动作幅度大；5-6 岁可稍快、允许叠置揭示；',
    '- 动效要有弹性与先后（spring/stagger/anticipation），不要所有元素同时淡入。',
  ].join('\n');
}

type AuthorResult = {
  props: any | null;
  tsx: string | null;
  syntaxErrors: string[];
  contractErrors: string[];
  latencyMs: number;
  completionTokens?: number;
  raw: string;
  finishReason: string;
};

/** fence 信息串不一定是裸 "json"/"tsx"：实测模型会写 ```json props、```tsx 组件。
 *  正则必须吞掉整行信息串，否则捕获组带着 "props" 前缀，JSON.parse 必炸。 */
function extractFence(text: string, langs: string[]): string | null {
  for (const lang of langs) {
    const m = text.match(new RegExp('```' + lang + '[^\\n]*\\n([\\s\\S]*?)```', 'i'));
    if (m) return m[1].trim();
  }
  return null;
}

function extractPropsJson(text: string): any | null {
  const fenced = extractFence(text, ['json']);
  const candidates = [fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter(
    (c): c is string => !!c && c.includes('{'),
  );
  for (const c of candidates) {
    try {
      let parsed = JSON.parse(c);
      // 实测 v4-pro 会多包一层 {"props":{...}}：契约要的是里层，剥掉而不是判废
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed.scenes) && parsed.props && typeof parsed.props === 'object') {
        parsed = parsed.props;
      }
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* next */
    }
  }
  return null;
}

function extractTsx(text: string): string | null {
  const fenced = extractFence(text, ['tsx', 'typescript', 'jsx']);
  if (fenced) return fenced;
  // 无语言标注的裸 ``` 块：取含契约导出的那个
  const bare = text.match(/```\s*\n([\s\S]*?)```/g) || [];
  for (const b of bare) {
    const body = b.replace(/^```\s*\n/, '').replace(/```$/, '');
    if (/export const GeneratedLesson/.test(body)) return body.trim();
  }
  return null;
}

async function authorOnce(
  client: OpenAI,
  model: string,
  system: string,
  t: { topic: string; domain: string; ageGroup: string },
): Promise<AuthorResult> {
  const started = Date.now();
  // 网关在长生成后会掐掉 keep-alive 连接，下一发复用旧 socket 立刻 Connection error
  // （实测 latency=0s）。退避重试换新连接即可，不是模型不可用。
  let resp: any;
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      resp = await client.chat.completions.create({
        model,
        max_tokens: 32768,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `主题：${t.topic}\ndomain：${t.domain}\n年龄：${t.ageGroup} 岁\n请创作 5 个场景的教学动画组合。`,
          },
        ],
      });
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  if (!resp) {
    const cause = lastErr?.cause ? ` (${String(lastErr.cause).slice(0, 160)})` : '';
    throw new Error(`${lastErr?.message || lastErr}${cause}`);
  }
  const text = resp.choices[0]?.message?.content ?? '';
  const finishReason = resp.choices[0]?.finish_reason ?? '';
  const latencyMs = Date.now() - started;

  const props = extractPropsJson(text);
  const tsx = extractTsx(text);

  const syntaxErrors: string[] = [];
  const contractErrors: string[] = [];
  if (tsx) {
    const diag = ts.transpileModule(tsx, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
      fileName: 'GeneratedLesson.tsx',
    }).diagnostics;
    for (const d of diag || []) {
      syntaxErrors.push(ts.flattenDiagnosticMessageText(d.messageText, ' '));
    }
    if (!/export const GeneratedLesson/.test(tsx)) contractErrors.push('missing export GeneratedLesson');
    if (!/useCurrentFrame/.test(tsx)) contractErrors.push('not frame-driven (no useCurrentFrame)');
    if (/(require\(|from ['"]fs['"]|from ['"]node:|fetch\(|\beval\()/.test(tsx)) {
      contractErrors.push('forbidden fs/network/eval/require');
    }
  } else {
    contractErrors.push('no tsx code block');
  }
  if (!props || !Array.isArray(props.scenes) || props.scenes.length < 3) {
    contractErrors.push('props.scenes missing or <3');
  }
  return {
    props,
    tsx,
    syntaxErrors,
    contractErrors,
    latencyMs,
    completionTokens: resp.usage?.completion_tokens,
    raw: text,
    finishReason,
  };
}

function writeBenchComposition(workDir: string, props: any, tsx: string): void {
  fs.mkdirSync(workDir, { recursive: true });
  const durationFrames = Math.max(
    180,
    (props.scenes || []).reduce((s: number, sc: any) => s + Math.max(3, Number(sc.durationSec) || 6), 0) * 30,
  );
  const fullProps = { ...props, durationFrames };
  fs.writeFileSync(path.join(workDir, 'props.json'), JSON.stringify(fullProps, null, 2));
  fs.writeFileSync(path.join(workDir, 'GeneratedLesson.tsx'), tsx);
  fs.writeFileSync(
    path.join(workDir, 'Root.tsx'),
    [
      'import { Composition } from "remotion";',
      'import { GeneratedLesson } from "./GeneratedLesson";',
      'import props from "./props.json";',
      '',
      'export const RemotionRoot = () => (',
      '  <Composition',
      '    id="BenchLesson"',
      '    component={GeneratedLesson}',
      '    durationInFrames={props.durationFrames}',
      '    fps={30}',
      '    width={1600}',
      '    height={900}',
      '    defaultProps={props}',
      '  />',
      ');',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(workDir, 'index.ts'),
    'import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\nregisterRoot(RemotionRoot);\n',
  );
}

/** 逐帧容错：一帧渲炸不废掉整题，错误连同 stderr 落报告——
 *  渲染失败是模型代码质量的真实信号，必须看得见原因而不是只有一句 Command failed。 */
async function renderStills(
  workDir: string,
  props: any,
  outDir: string,
): Promise<{ perScene: string[][]; errors: string[] }> {
  fs.mkdirSync(outDir, { recursive: true });
  const perScene: string[][] = [];
  const errors: string[] = [];
  let cursor = 0;
  for (let i = 0; i < props.scenes.length; i += 1) {
    const dur = Math.max(3, Number(props.scenes[i].durationSec) || 6) * 30;
    const frames: string[] = [];
    for (const frac of [0.35, 0.75]) {
      const frame = Math.round(cursor + dur * frac);
      const out = path.join(outDir, `scene-${i + 1}-${frac === 0.35 ? 'a' : 'b'}.png`);
      try {
        await execFileAsync(
          'npx',
          [
            'remotion',
            'still',
            path.join(workDir, 'index.ts'),
            'BenchLesson',
            out,
            `--props=${path.join(workDir, 'props.json')}`,
            `--frame=${frame}`,
          ],
          { cwd: REMOTION_DIR, timeout: 180_000, windowsHide: true, shell: true },
        );
        frames.push(out);
      } catch (e: any) {
        const detail = String(e.stderr || e.message || e).slice(-1200);
        errors.push(`scene-${i + 1}@${frame}: ${detail}`);
      }
    }
    perScene.push(frames);
    cursor += dur;
  }
  return { perScene, errors };
}

async function runQaSmoke(env: Record<string, string>): Promise<number> {
  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;
  const client = new LlmClientService(new ConfigService());
  await client.onModuleInit();
  const qa = new VisualQaService(client);
  if (!qa.isConfigured) {
    console.error('LLM_VISION_MODEL not configured');
    return 1;
  }
  const narration = '小朋友，太阳系里有一颗大大的太阳，八颗行星绕着它转圈圈，水星离太阳最近。';
  const verdict = await qa.reviewVideo({
    topic: '太阳系有哪几颗行星',
    domain: 'science',
    ageGroup: '5-6',
    scenes: [
      {
        sceneId: 'bad',
        title: '修复前问题帧',
        narration,
        frames: [path.join(REMOTION_DIR, 'out', 'before', 'Fig4.png')],
      },
      {
        sceneId: 'good',
        title: '修复后好帧',
        narration,
        frames: [path.join(REMOTION_DIR, 'out', 'figures', 'Fig4.png')],
      },
    ],
    persistDir: path.join(REPO_ROOT, 'storage', 'qa', 'smoke'),
  });
  const bad = verdict.perScene.find((s) => s.sceneId === 'bad');
  const good = verdict.perScene.find((s) => s.sceneId === 'good');
  console.log(`bad  score=${bad?.score} issues=${bad?.issues.length}`);
  for (const i of bad?.issues || []) console.log(`  [${i.severity}/${i.fixTarget}] ${i.issue}`);
  console.log(`good score=${good?.score} issues=${good?.issues.length}`);
  const discriminated = (bad?.score ?? 100) < (good?.score ?? 0) && (bad?.issues.length ?? 0) > 0;
  console.log(discriminated ? 'QA_SMOKE_PASS' : 'QA_SMOKE_FAIL');
  return discriminated ? 0 : 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const env = readEnv();
  if (argv.includes('--qa-smoke')) return runQaSmoke(env);

  const modelsArg = argv.find((a) => a.startsWith('--models='));
  const models = modelsArg ? modelsArg.slice(9).split(',') : DEFAULT_MODELS;
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
  const topicsArg = argv.find((a) => a.startsWith('--topics='));
  const topics = topicsArg
    ? DEFAULT_TOPICS.filter((t) => topicsArg.slice(9).split(',').some((k) => t.topic.includes(k)))
    : DEFAULT_TOPICS;

  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;
  const openai = new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  const llm = new LlmClientService(new ConfigService());
  await llm.onModuleInit();
  const qa = new VisualQaService(llm);
  if (!qa.isConfigured) {
    console.error('LLM_VISION_MODEL not configured; QA impossible');
    return 1;
  }
  const system = authoringSystemPrompt(loadSkillContext());

  // 增量合并：重跑失败组合时保留已有结果行（同 model+topic 覆盖）
  const reportPath = path.join(REPO_ROOT, 'storage', 'bench-authoring-report.json');
  let report: any[] = [];
  if (fs.existsSync(reportPath)) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (!Array.isArray(report)) report = [];
    } catch {
      report = [];
    }
  }
  const upsert = (row: any) => {
    const i = report.findIndex((r) => r.model === row.model && r.topic === row.topic);
    if (i >= 0) report[i] = row;
    else report.push(row);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  };
  let done = 0;
  for (const model of models) {
    for (const t of topics) {
      if (done >= limit) break;
      done += 1;
      const slug = `${model}__${t.topic.replace(/[^\w一-龥]+/g, '-')}`;
      const workDir = path.join(REMOTION_DIR, '.generated', 'bench', slug);
      const galleryDir = path.join(REPO_ROOT, 'storage', 'bench-gallery', slug);
      const row: any = { model, topic: t.topic, ageGroup: t.ageGroup };
      console.log(`\n=== ${model} × ${t.topic} ===`);
      try {
        const authored = await authorOnce(openai, model, system, t);
        row.latencyMs = authored.latencyMs;
        row.completionTokens = authored.completionTokens;
        row.finishReason = authored.finishReason;
        row.syntaxErrors = authored.syntaxErrors;
        row.contractErrors = authored.contractErrors;
        // 原始输出一律落盘：gate 失败时没有 raw 就没法诊断是格式问题还是截断
        const rawDir = path.join(REPO_ROOT, 'storage', 'bench-raw');
        fs.mkdirSync(rawDir, { recursive: true });
        fs.writeFileSync(path.join(rawDir, `${slug}.txt`), authored.raw);
        if (authored.syntaxErrors.length || authored.contractErrors.length || !authored.props || !authored.tsx) {
          row.stage = 'author-gate';
          console.log(`  GATE FAIL: ${[...authored.syntaxErrors, ...authored.contractErrors].join('; ')}`);
          continue;
        }
        writeBenchComposition(workDir, authored.props, authored.tsx);
        const { perScene, errors: renderErrors } = await renderStills(workDir, authored.props, galleryDir);
        row.renderErrors = renderErrors;
        if (renderErrors.length) console.log(`  RENDER ERRORS: ${renderErrors.length}（详见报告）`);
        const qaScenes = authored.props.scenes
          .map((sc: any, i: number) => ({
            sceneId: sc.id || `scene-${i + 1}`,
            title: sc.title,
            narration: sc.narration,
            onScreenText: sc.onScreenText,
            frames: perScene[i],
          }))
          .filter((sc: any) => sc.frames.length > 0);
        if (!qaScenes.length) {
          row.stage = 'render-fail';
          console.log('  RENDER FAIL: 没有任何一帧渲染成功');
          continue;
        }
        row.stage = 'qa';
        const verdict = await qa.reviewVideo({
          topic: t.topic,
          domain: t.domain,
          ageGroup: t.ageGroup,
          scenes: qaScenes,
          persistDir: path.join(REPO_ROOT, 'storage', 'qa', `bench-${slug}`),
        });
        row.qaScore = verdict.score;
        row.qaPassed = verdict.passed;
        row.blockers = verdict.issues.filter((i) => i.severity === 'blocker').length;
        row.issues = verdict.issues.length;
        row.stage = 'done';
        console.log(`  qaScore=${verdict.score} passed=${verdict.passed} blockers=${row.blockers}`);
      } catch (e: any) {
        row.stage = row.stage || 'error';
        row.error = String(e.stderr || e.message || e).slice(-800);
        console.log(`  ERROR: ${row.error}`);
      } finally {
        upsert(row);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const r of report) {
    console.log(
      `${r.model} × ${r.topic}: stage=${r.stage} qa=${r.qaScore ?? '-'} blockers=${r.blockers ?? '-'} tokens=${r.completionTokens ?? '-'} latency=${Math.round((r.latencyMs || 0) / 1000)}s`,
    );
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });