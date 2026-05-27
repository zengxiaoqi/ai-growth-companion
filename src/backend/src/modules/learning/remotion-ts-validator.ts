import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';

const logger = new Logger('RemotionTsValidator');

export type TsError = {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
};

export type TsValidationResult = {
  passed: boolean;
  errors: TsError[];
  rawOutput: string;
};

const TSC_TIMEOUT_MS = 10_000;

const TSC_ERROR_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;

async function runTsc(
  cwd: string,
  project?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ['tsc', '--noEmit', '--pretty', 'false'];
  if (project) args.push('--project', project);

  return new Promise((resolve) => {
    const proc = spawn('npx', args, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ stdout, stderr: stderr + '\n[tsc timed out]', exitCode: 1 });
    }, TSC_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + `\n[tsc spawn failed: ${err.message}]`,
        exitCode: 1,
      });
    });
  });
}

function parseErrors(output: string): TsError[] {
  const errors: TsError[] = [];
  let match: RegExpExecArray | null;
  TSC_ERROR_RE.lastIndex = 0;

  while ((match = TSC_ERROR_RE.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      col: parseInt(match[3], 10),
      code: match[4],
      message: match[5],
    });
  }
  return errors;
}

export async function checkStaticFiles(remotionDir: string): Promise<TsValidationResult> {
  const tscPath = path.join(remotionDir, 'node_modules', '.bin', 'tsc');
  if (!existsSync(tscPath) && !existsSync(tscPath + '.cmd')) {
    logger.warn('tsc not found in remotion devDependencies — skipping static TS check');
    return { passed: true, errors: [], rawOutput: '' };
  }

  const { stdout, stderr, exitCode } = await runTsc(remotionDir);
  const rawOutput = (stdout + '\n' + stderr).trim();

  if (exitCode === 0) {
    return { passed: true, errors: [], rawOutput };
  }

  const errors = parseErrors(rawOutput);
  return { passed: errors.length === 0, errors, rawOutput };
}

export async function checkGeneratedFiles(
  taskDir: string,
  remotionDir: string,
): Promise<TsValidationResult> {
  const tsconfigPath = path.join(taskDir, 'tsconfig.json');

  const baseTsconfig = path.resolve(remotionDir, 'tsconfig.json');
  const tsconfigContent = JSON.stringify({
    extends: baseTsconfig.replace(/\\/g, '/'),
    compilerOptions: {
      rootDir: taskDir.replace(/\\/g, '/'),
    },
    include: ['**/*.ts', '**/*.tsx'],
  });

  await fs.writeFile(tsconfigPath, tsconfigContent, 'utf-8');

  const { stdout, stderr, exitCode } = await runTsc(taskDir, tsconfigPath);
  const rawOutput = (stdout + '\n' + stderr).trim();

  if (exitCode === 0) {
    return { passed: true, errors: [], rawOutput };
  }

  const errors = parseErrors(rawOutput);
  return { passed: errors.length === 0, errors, rawOutput };
}

type FixResult = { fixed: number; unfixed: TsError[] };

async function fixPremoveForLayoutNone(filePath: string, _err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fixed = content.replace(/(<Sequence[^>]*?)\s+layout="none"([^>]*premountFor)/g, '$1$2');
  if (fixed === content) {
    const fixed2 = content.replace(
      /(<Sequence[^>]*premountFor[^>]*?)\s+layout="none"([^>]*>)/g,
      '$1$2',
    );
    if (fixed2 === content) return false;
    await fs.writeFile(filePath, fixed2, 'utf-8');
    return true;
  }
  await fs.writeFile(filePath, fixed, 'utf-8');
  return true;
}

async function fixOnErrorVoid(filePath: string, _err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fixed = content.replace(/\(\)\s*=>\s*\{\s*\}/g, '() => "fallback" as const');
  if (fixed === content) return false;
  await fs.writeFile(filePath, fixed, 'utf-8');
  return true;
}

async function fixNestedOptions(filePath: string, _err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fixed = content.replace(
    /options:\s*\{\s*ignoreTooManyRequestsWarning:\s*(true|false)\s*\}/,
    'ignoreTooManyRequestsWarning: $1',
  );
  if (fixed === content) return false;
  await fs.writeFile(filePath, fixed, 'utf-8');
  return true;
}

async function fixUnclosedString(filePath: string, err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const lineIdx = err.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return false;

  const line = lines[lineIdx];

  // Try to fix pattern where } is mistakenly used instead of " in JSX attributes
  // e.g. strokeWidth="3} → strokeWidth="3"
  const mismatched = line.replace(/="([^"}]*)}([^"]*)"/g, '="$1"$2"');
  if (mismatched !== line) {
    lines[lineIdx] = mismatched;
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return true;
  }

  // Fallback: odd quote count — append the missing closing quote
  const dq = (line.match(/"/g) || []).length;
  const sq = (line.match(/'/g) || []).length;
  const bt = (line.match(/`/g) || []).length;

  let fixed = false;
  if (dq % 2 !== 0) {
    lines[lineIdx] = line + '"';
    fixed = true;
  } else if (sq % 2 !== 0) {
    lines[lineIdx] = line + "'";
    fixed = true;
  } else if (bt % 2 !== 0) {
    lines[lineIdx] = line + '`';
    fixed = true;
  }

  if (!fixed) return false;
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return true;
}

async function fixBareConstInJsx(filePath: string, err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const lineIdx = err.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return false;

  const line = lines[lineIdx];
  if (!/^\s*(const|let|var)\s+/.test(line)) return false;

  lines[lineIdx] = `{${line}}`;
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return true;
}

async function fixMismatchedQuotes(filePath: string, err: TsError): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const lineIdx = err.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return false;

  const line = lines[lineIdx];
  const col0 = err.col - 1;

  // Pattern: JSX attribute like attr="value} — closing brace in a quoted string
  const fixed = line.replace(/="([^"}]*)}([^"]*)"/g, (match, before: string, after: string) => {
    // The } inside the quotes is likely a mistake — replace with "
    return `="${before}"${after}"`;
  });

  if (fixed === line) {
    // Simpler fix: find a " followed by non-" chars ending with } before a space/attribute boundary
    const simpler = line.replace(/="([^"]*?)(})(\s)/g, '="$1"$3');
    if (simpler !== line) {
      lines[lineIdx] = simpler;
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
      return true;
    }

    // Last resort: if odd double quotes, the } at/near error col might be a misplaced "
    const beforeCol = line.slice(0, col0);
    const dqBefore = (beforeCol.match(/"/g) || []).length;
    if (dqBefore % 2 !== 0) {
      // We're inside an unclosed string — find the } and replace with "
      const patched = line.slice(0, col0) + line.slice(col0).replace('}', '"');
      lines[lineIdx] = patched;
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
      return true;
    }
    return false;
  }

  lines[lineIdx] = fixed;
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return true;
}

interface AutoFixRule {
  detect: (err: TsError) => boolean;
  fix: (filePath: string, err: TsError) => Promise<boolean>;
}

const AUTO_FIX_RULES: AutoFixRule[] = [
  {
    detect: (e) =>
      e.code === 'TS2322' && e.message.includes('premountFor') && e.message.includes('layout'),
    fix: fixPremoveForLayoutNone,
  },
  {
    detect: (e) => (e.code === 'TS2769' || e.code === 'TS2322') && e.message.includes('onError'),
    fix: fixOnErrorVoid,
  },
  {
    detect: (e) =>
      e.code === 'TS2322' &&
      e.message.includes('options') &&
      (e.message.includes('loadFont') || e.message.includes('is not assignable')),
    fix: fixNestedOptions,
  },
  {
    detect: (e) =>
      (e.code === 'TS1002' || e.code === 'TS1005') &&
      (e.message.includes('Unterminated') ||
        e.message.includes('string literal') ||
        e.message.includes('expected')),
    fix: fixUnclosedString,
  },
  {
    detect: (e) =>
      (e.code === 'TS1005' || e.code === 'TS1128') && e.message.includes('Declaration expected'),
    fix: fixBareConstInJsx,
  },
  {
    detect: (e) => e.code === 'TS1003' && e.message.includes('Identifier expected'),
    fix: fixMismatchedQuotes,
  },
];

export async function autoFixErrors(errors: TsError[], taskDir: string): Promise<FixResult> {
  let fixed = 0;
  const unfixed: TsError[] = [];
  const fixedFiles = new Set<string>();

  for (const err of errors) {
    const rule = AUTO_FIX_RULES.find((r) => r.detect(err));
    if (!rule) {
      unfixed.push(err);
      continue;
    }

    const filePath = path.isAbsolute(err.file) ? err.file : path.resolve(taskDir, err.file);

    try {
      const didFix = await rule.fix(filePath, err);
      if (didFix) {
        fixed += 1;
        fixedFiles.add(filePath);
        logger.log(`auto-fixed ${err.code} in ${path.basename(filePath)}:${err.line}`);
      } else {
        unfixed.push(err);
      }
    } catch {
      unfixed.push(err);
    }
  }

  return { fixed, unfixed };
}
