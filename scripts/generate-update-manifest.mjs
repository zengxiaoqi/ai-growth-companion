#!/usr/bin/env node
/**
 * 生成 App 更新发布清单 latest.json（由 .github/workflows/build-apk.yml 调用）。
 *
 *   node scripts/generate-update-manifest.mjs \
 *     --apk dist/lingxi-companion-v1.0.0-2026072601.apk \
 *     --version-name 1.0.0 --version-code 2026072601 \
 *     --tag v1.0.0-2026072601 \
 *     --repo zengxiaoqi/ai-growth-companion \
 *     --changelog-file release-body.md \
 *     --out dist/latest.json
 *
 * 客户端（app_update_service.dart）与后端（/api/app-update/*）都以这份清单为
 * 唯一事实源。versionCode 是"要不要升级"的唯一判据 —— 绝不用 versionName
 * 字符串比较（1.10.0 < 1.9.0 在字符串比较下成立，会永远不提示升级），
 * 所以 versionCode 必须来自 pubspec.yaml 的 buildNumber，人手写迟早写错。
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apk') out.apk = argv[++i];
    else if (a === '--version-name') out.versionName = argv[++i];
    else if (a === '--version-code') out.versionCode = argv[++i];
    else if (a === '--tag') out.tag = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--note') out.note = argv[++i];
    else if (a === '--changelog-file') out.changelogFile = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--min-code') out.minCode = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function sha256Of(file) {
  const h = createHash('sha256');
  h.update(readFileSync(file));
  return h.digest('hex');
}

const args = parseArgs(process.argv);
if (args.help || !args.apk || !args.versionName || !args.versionCode || !args.tag || !args.repo) {
  console.log(
    '用法: node scripts/generate-update-manifest.mjs --apk <file> --version-name <name> ' +
      '--version-code <code> --tag <tag> --repo <owner/name> [--note "..."] ' +
      '[--changelog-file <file>] [--out dist/latest.json] [--min-code N]',
  );
  process.exit(args.help ? 0 : 1);
}

const apkPath = resolve(args.apk);
if (!statSync(apkPath, { throwIfNoEntry: false })) {
  console.error(`[错误] APK 不存在: ${apkPath}`);
  process.exit(1);
}

// 文件名必须与上传到 Release 的 asset 名一致，客户端按它落盘与去重
const fileName = basename(apkPath);
const sizeBytes = statSync(apkPath).size;
const sha256 = sha256Of(apkPath);

let changelog = args.note || '';
if (!changelog && args.changelogFile) {
  try {
    changelog = readFileSync(args.changelogFile, 'utf8').trim();
  } catch {
    /* 没有 release body 就用默认文案 */
  }
}
if (!changelog) changelog = '优化体验与修复已知问题';
// GitHub Release 正文会被截到 125KB，清单是给客户端弹窗显示的，裁掉多余部分
if (changelog.length > 4000) changelog = `${changelog.slice(0, 4000)}…`;

const manifest = {
  versionCode: parseInt(args.versionCode, 10),
  versionName: args.versionName,
  fileName,
  sizeBytes,
  sha256,
  changelog,
  minSupportedCode: parseInt(args.minCode || '0', 10) || 0,
  publishedAt: new Date().toISOString(),
  tag: args.tag,
  downloadUrl: `https://github.com/${args.repo}/releases/download/${args.tag}/${fileName}`,
};

if (!Number.isFinite(manifest.versionCode) || manifest.versionCode <= 0) {
  console.error('[错误] versionCode 无效，必须是 pubspec.yaml 的 buildNumber');
  process.exit(1);
}

const outPath = resolve(args.out || 'dist/latest.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`已生成 ${outPath}`);
console.log(`  版本:    v${manifest.versionName} (versionCode ${manifest.versionCode})`);
console.log(`  文件:    ${fileName}  ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  sha256:  ${sha256}`);
console.log(`  说明:    ${manifest.changelog.slice(0, 60)}${manifest.changelog.length > 60 ? '…' : ''}`);
