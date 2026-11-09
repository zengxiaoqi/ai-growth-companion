import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, join, resolve } from 'path';

/**
 * GitHub Release 里的 `latest.json` 发布清单（由 .github/workflows/build-apk.yml 生成）。
 * versionCode 是"要不要升级"的唯一判据，绝不比较 versionName 字符串：
 * 1.10.0 < 1.9.0 在字符串比较下成立，按它判断会永远不提示升级。
 */
export interface ReleaseManifest {
  versionCode: number;
  versionName: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  changelog: string;
  minSupportedCode?: number;
  publishedAt?: string;
  tag?: string;
  downloadUrl: string;
}

export interface LatestResult {
  hasUpdate: boolean;
  force: boolean;
  latest: {
    versionCode: number;
    versionName: string;
    sizeBytes: number;
    sha256: string;
    changelog: string;
    force: boolean;
    downloadUrl: string;
  } | null;
}

const DEFAULT_REPO = 'zengxiaoqi/ai-growth-companion';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;
/** 允许从哪些域名代理下载 APK，避免清单被篡改后打内网（SSRF） */
const DOWNLOAD_HOST_ALLOWLIST = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

@Injectable()
export class AppUpdateService {
  private readonly logger = new Logger(AppUpdateService.name);
  private cache: { manifest: ReleaseManifest; at: number } | null = null;
  /** 同一个下载并发只做一次，避免多个客户端同时拉 40MB */
  private downloading: Promise<string | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get repo(): string {
    return this.config.get<string>('APP_UPDATE_GITHUB_REPO') || DEFAULT_REPO;
  }

  private get manifestUrl(): string {
    return (
      this.config.get<string>('APP_UPDATE_MANIFEST_URL') ||
      `https://github.com/${this.repo}/releases/latest/download/latest.json`
    );
  }

  /** 本地清单覆盖（运维可手工放一个文件，断开 GitHub 也能分发） */
  private get localManifestPath(): string | null {
    const value = this.config.get<string>('APP_UPDATE_MANIFEST');
    if (!value) return null;
    const path = resolve(value);
    return existsSync(path) ? path : null;
  }

  private get cacheDir(): string {
    return resolve(
      this.config.get<string>('APP_UPDATE_CACHE_DIR') || join(process.cwd(), 'data', 'app-updates'),
    );
  }

  /** 清掉内存缓存，供 /app-update/refresh 手动刷新 */
  refresh(): void {
    this.cache = null;
  }

  /**
   * 读取发布清单。优先级：本地文件 > 内存缓存（5 分钟）> GitHub Release。
   * 拉取失败时返回上一次成功的清单（stale-while-error）——升级功能不能把 App 卡住。
   */
  async getManifest(): Promise<ReleaseManifest | null> {
    const local = this.localManifestPath;
    if (local) {
      try {
        return this.validateManifest(JSON.parse(readFileSync(local, 'utf8')));
      } catch (err) {
        this.logger.warn(`读取本地发布清单失败: ${(err as Error).message}`);
      }
    }

    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.manifest;
    }

    try {
      const response = await this.fetchWithTimeout(this.manifestUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'lingxi-app-update' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const manifest = this.validateManifest(await response.json());
      this.cache = { manifest, at: Date.now() };
      return manifest;
    } catch (err) {
      this.logger.warn(`拉取发布清单失败 (${this.manifestUrl}): ${(err as Error).message}`);
      return this.cache?.manifest ?? null;
    }
  }

  /** 契约与客户端 app_update_service.dart 一致，也与 /api/app-update/latest 的返回一致 */
  async check(versionCode: number): Promise<LatestResult> {
    const manifest = await this.getManifest();
    if (!manifest || manifest.versionCode <= versionCode) {
      return { hasUpdate: false, force: false, latest: null };
    }
    const force = (manifest.minSupportedCode || 0) > versionCode;
    return {
      hasUpdate: true,
      force,
      latest: {
        versionCode: manifest.versionCode,
        versionName: manifest.versionName,
        sizeBytes: manifest.sizeBytes,
        sha256: manifest.sha256,
        changelog: manifest.changelog || '优化体验与修复已知问题',
        force,
        // 走本服务代理下载：国内直连 GitHub 常常只有几十 KB/s，代理能落盘缓存
        downloadUrl: `/api/app-update/download?versionCode=${manifest.versionCode}`,
      },
    };
  }

  /**
   * 返回可直接发送给客户端的 APK 本地路径。
   * 命中缓存直接复用；未命中则代理下载到 data/app-updates/ 并校验 SHA-256。
   * 返回 null 时由 Controller 302 回退到 GitHub 原始地址（至少让客户端自己试）。
   */
  async resolveApk(manifest: ReleaseManifest): Promise<string | null> {
    const dir = this.cacheDir;
    const target = join(dir, basename(manifest.fileName));
    if (this.isValidApk(target, manifest)) return target;
    if (this.downloading) return this.downloading;

    this.downloading = this.downloadAndCache(manifest, dir, target).finally(() => {
      this.downloading = null;
    });
    return this.downloading;
  }

  private async downloadAndCache(
    manifest: ReleaseManifest,
    dir: string,
    target: string,
  ): Promise<string | null> {
    try {
      if (!/^https?:\/\//i.test(manifest.downloadUrl)) {
        this.logger.warn('清单里的 downloadUrl 不是绝对地址，跳过本地缓存');
        return null;
      }
      const url = new URL(manifest.downloadUrl);
      const extraHosts = (this.config.get<string>('APP_UPDATE_DOWNLOAD_HOST_ALLOWLIST') || '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      const allowed = [...DOWNLOAD_HOST_ALLOWLIST, ...extraHosts];
      if (
        url.protocol !== 'https:' ||
        !allowed.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
      ) {
        this.logger.warn(`downloadUrl 域名不在允许列表，拒绝代理: ${url.hostname}`);
        return null;
      }

      const response = await this.fetchWithTimeout(manifest.downloadUrl, {}, 5 * 60 * 1000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (manifest.sizeBytes > 0 && buffer.length !== manifest.sizeBytes) {
        throw new Error(`大小不符: ${buffer.length} != ${manifest.sizeBytes}`);
      }
      if (manifest.sha256) {
        const digest = createHash('sha256').update(buffer).digest('hex');
        if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) {
          throw new Error('SHA-256 校验失败');
        }
      }

      mkdirSync(dir, { recursive: true });
      const part = `${target}.part`;
      writeFileSync(part, buffer);
      renameSync(part, target);
      this.logger.log(`APK 已缓存: ${target} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
      // 只保留当前版本的包，几十 MB 一个，堆几个就是几百 MB 的沉默占用
      this.cleanup(dir, target);
      return target;
    } catch (err) {
      this.logger.warn(`代理下载 APK 失败，将回退到原始地址: ${(err as Error).message}`);
      return null;
    }
  }

  private isValidApk(path: string, manifest: ReleaseManifest): boolean {
    if (!existsSync(path)) return false;
    try {
      if (manifest.sizeBytes > 0 && statSync(path).size !== manifest.sizeBytes) return false;
      if (!manifest.sha256) return true;
      const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
      return digest.toLowerCase() === manifest.sha256.toLowerCase();
    } catch {
      return false;
    }
  }

  private cleanup(dir: string, keep: string): void {
    try {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (path !== keep && name.endsWith('.apk')) rmSync(path, { force: true });
      }
    } catch (err) {
      this.logger.warn(`清理旧安装包失败（不影响升级）: ${(err as Error).message}`);
    }
  }

  private validateManifest(raw: any): ReleaseManifest {
    if (!raw || typeof raw !== 'object') throw new Error('清单不是 JSON 对象');
    const code = Number(raw.versionCode);
    const fileName = String(raw.fileName || '').replace(/[/\\]/g, '');
    const downloadUrl = String(raw.downloadUrl || '');
    if (!Number.isFinite(code) || code <= 0) throw new Error('versionCode 无效');
    if (!fileName.endsWith('.apk')) throw new Error('fileName 无效');
    if (!downloadUrl) throw new Error('downloadUrl 缺失');
    return {
      versionCode: Math.floor(code),
      versionName: String(raw.versionName || ''),
      fileName,
      sizeBytes: Number(raw.sizeBytes) || 0,
      sha256: String(raw.sha256 || ''),
      changelog: String(raw.changelog || ''),
      minSupportedCode: Number(raw.minSupportedCode) || 0,
      publishedAt: raw.publishedAt ? String(raw.publishedAt) : undefined,
      tag: raw.tag ? String(raw.tag) : undefined,
      downloadUrl,
    };
  }

  /** Node 18+ 的全局 fetch；用 any 兼容不同 @types/node 版本 */
  private async fetchWithTimeout(
    url: string,
    init: Record<string, unknown>,
    timeout = FETCH_TIMEOUT_MS,
  ): Promise<any> {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('当前 Node 版本不支持 fetch（需要 Node 18+）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
