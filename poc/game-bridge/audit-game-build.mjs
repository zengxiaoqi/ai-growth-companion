/**
 * Static audit for a game build directory.
 * P0 prototype of scripts/audit-game-build.mjs described in docs/ohmygame-integration-plan.md.
 * Zero dependencies. Usage: node audit-game-build.mjs <dir> [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
const URL_ALLOWLIST = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
]);

const URL_RE = /https?:\/\/[^\s"'()<>]+/g;

const DENY_RULES = [
  {
    name: 'external-url',
    re: URL_RE,
    allow(match) {
      return [...URL_ALLOWLIST].some((prefix) => match.startsWith(prefix));
    },
    note: 'External network reference',
  },
  {
    name: 'remote-script',
    re: /<script[^>]+src\s*=\s*["'](?:https?:)?\/\//gi,
    note: 'Script loaded from another host',
  },
  {
    name: 'external-style',
    re: /<link[^>]+href\s*=\s*["'](?:https?:)?\/\//gi,
    note: 'Stylesheet or font loaded from another host',
  },
  {
    name: 'network-api',
    re: /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|EventSource)/g,
    note: 'Runtime network capability',
  },
  {
    name: 'sensitive-api',
    re: /navigator\.mediaDevices|navigator\.geolocation|new\s+Notification|document\.cookie/g,
    note: 'Device capability or cookie access',
  },
  {
    name: 'client-storage',
    re: /\b(?:localStorage|sessionStorage|indexedDB)\b/g,
    note: 'Client-side persistence',
  },
  {
    name: 'dynamic-code',
    re: /\beval\s*\(|new\s+Function\s*\(/g,
    note: 'Dynamic code execution',
  },
  {
    name: 'nested-frame',
    re: /<iframe\b/gi,
    note: 'Nested frame',
  },
  {
    name: 'form-input',
    re: /<form\b|<input\b|contenteditable/gi,
    note: 'User input surface',
  },
];

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function auditDirectory(dir, options = {}) {
  const bridgeName = options.bridgeFile || 'lingxi-bridge.js';
  const root = path.resolve(dir);
  const result = {
    dir: root,
    pass: false,
    denied: [],
    checks: [],
    files: [],
    totalBytes: 0,
    bridgeFile: null,
    bridgeHash: null,
  };

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    result.checks.push({ name: 'directory-exists', ok: false, detail: 'Not a directory' });
    return result;
  }

  const files = walk(root);
  result.files = files;

  const entry = files.find((f) => path.posix.basename(f) === 'index.html' && !f.includes('/'));
  result.checks.push({
    name: 'entry-index-html',
    ok: Boolean(entry),
    detail: entry || 'Missing root index.html',
  });

  for (const rel of files) {
    const full = path.join(root, rel);
    const stat = fs.statSync(full);
    result.totalBytes += stat.size;
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) continue;
    if (stat.size > MAX_FILE_BYTES) {
      result.denied.push({ file: rel, line: 0, rule: 'file-too-large', snippet: `${stat.size} bytes` });
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of DENY_RULES) {
        rule.re.lastIndex = 0;
        let match;
        while ((match = rule.re.exec(line)) !== null) {
          if (rule.allow && rule.allow(match[0])) continue;
          result.denied.push({
            file: rel,
            line: index + 1,
            rule: rule.name,
            snippet: line.trim().slice(0, 160),
          });
          if (rule.re.global === false) break;
        }
      }
    });
  }

  result.checks.push({
    name: 'bundle-size',
    ok: result.totalBytes <= MAX_BUNDLE_BYTES,
    detail: `${result.totalBytes} / ${MAX_BUNDLE_BYTES} bytes`,
  });

  const bridgeRel = files.find((f) => path.posix.basename(f) === bridgeName);
  result.checks.push({
    name: 'bridge-present',
    ok: Boolean(bridgeRel),
    detail: bridgeRel || `Missing ${bridgeName}`,
  });
  if (bridgeRel) {
    result.bridgeFile = bridgeRel;
    result.bridgeHash = sha256(path.join(root, bridgeRel));
  }

  result.checks.push({
    name: 'no-deny-hits',
    ok: result.denied.length === 0,
    detail: `${result.denied.length} denied hits`,
  });

  result.pass = result.checks.every((c) => c.ok) && result.denied.length === 0;
  return result;
}

export { sha256 };

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node audit-game-build.mjs <dir> [--json]');
    process.exit(2);
  }
  const report = auditDirectory(target);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Audit: ${report.dir}`);
    console.log(`Result: ${report.pass ? 'PASS' : 'DENY'}`);
    console.log(`Files: ${report.files.length}, bytes: ${report.totalBytes}`);
    for (const c of report.checks) console.log(`  [${c.ok ? 'ok' : 'FAIL'}] ${c.name}: ${c.detail}`);
    for (const d of report.denied.slice(0, 40)) {
      console.log(`  DENY ${d.rule} ${d.file}:${d.line} ${d.snippet}`);
    }
    if (report.denied.length > 40) console.log(`  ... ${report.denied.length - 40} more`);
  }
  process.exit(report.pass ? 0 : 1);
}
