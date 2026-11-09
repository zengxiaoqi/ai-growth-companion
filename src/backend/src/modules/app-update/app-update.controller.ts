import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';
import { Response } from 'express';
import { AppUpdateService } from './app-update.service';

/**
 * App 内自升级接口（契约与 senior-anti-fraud-guard 的 /api/app-update 一致）：
 *
 *   GET /api/app-update/latest?versionCode=<当前版本号>
 *     → { hasUpdate, force, latest: { versionCode, versionName, sizeBytes,
 *         sha256, changelog, force, downloadUrl } }
 *
 *   GET /api/app-update/download?versionCode=<目标版本号>
 *     → 本地有缓存直接 sendFile（不走 GitHub，国内速度快）；
 *       没有缓存则 302 到 GitHub Release 原始地址兜底。
 *
 * 事实源是 GitHub 最新 Release 里的 latest.json（由 build-apk.yml 生成），
 * 本服务只做代理与缓存，也可以用 APP_UPDATE_MANIFEST 环境变量指到本地文件完全接管。
 */
@Controller('app-update')
export class AppUpdateController {
  constructor(
    private readonly service: AppUpdateService,
    private readonly config: ConfigService,
  ) {}

  @Get('latest')
  async latest(@Query('versionCode') versionCode: string, @Res() res: Response) {
    const code = Number.parseInt(versionCode ?? '', 10);
    const result = await this.service.check(Number.isFinite(code) && code > 0 ? code : 0);
    // 清单彻底不可用（GitHub 拉取失败且无缓存/本地覆盖）→ 503，
    // 让客户端走 GitHub 直连兜底，而不是误判"已是最新"
    if (result.latest === null && (await this.service.getManifest()) === null) {
      res.status(503).json({ message: '发布清单不可用' });
      return;
    }
    res.json(result);
  }

  @Get('manifest')
  async manifest() {
    const manifest = await this.service.getManifest();
    if (!manifest) {
      return { message: '发布清单不可用（GitHub 拉取失败且无缓存/本地覆盖）' };
    }
    return manifest;
  }

  @Get('refresh')
  refresh() {
    this.service.refresh();
    return { status: 'ok', message: '发布清单缓存已清除，下次查询将重新拉取' };
  }

  @Get('download')
  async download(@Query('versionCode') versionCode: string, @Res() res: Response) {
    const manifest = await this.service.getManifest();
    if (!manifest) {
      res.status(404).json({ message: '没有可用的发布版本' });
      return;
    }

    // 防止清单指向了不同版本时缓存目录串包：只认 fileName
    const cached = await this.service.resolveApk(manifest);
    if (cached) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${basename(cached)}"`);
      res.setHeader('Content-Length', statSync(cached).size);
      createReadStream(cached).pipe(res);
      return;
    }

    // 缓存失败/不可用 → 302 让客户端直连 GitHub（可能慢，但至少能下）
    res.redirect(302, await this.fallbackUrl(manifest));
  }

  private async fallbackUrl(manifest: { downloadUrl: string }): Promise<string> {
    if (/^https?:\/\//i.test(manifest.downloadUrl)) return manifest.downloadUrl;
    // 本地清单里的相对路径：拼上配置的公网地址（GitHub 清单总是绝对地址，一般走不到这）
    const base = (this.config.get<string>('APP_UPDATE_PUBLIC_URL') || '').replace(/\/+$/, '');
    return `${base}${manifest.downloadUrl.startsWith('/') ? '' : '/'}${manifest.downloadUrl}`;
  }
}
