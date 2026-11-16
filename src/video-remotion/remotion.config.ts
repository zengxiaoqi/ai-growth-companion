import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

/**
 * 预览专用入口：`src/__preview/index.ts`（preview-prepare.js 生成，注册的是
 * 单屏 LessonPreview composition）。只有显式设了环境变量才切换——正常渲染
 * （TopicVideo 那套）的入口是 `src/index.ts`，不能动。
 *
 * 为什么不用 CLI `--entry-point`：4.0.446 的这个 flag 不生效（CLI 只把模块
 * require 进来，没有写入 Config），传了也照样 bundle 默认入口。实测
 * `npx remotion compositions --entry-point=src/__preview/index.ts` 仍然列出
 * TopicVideo 那一套，只有走 Config.setEntryPoint 才会真正换入口。
 */
if (process.env.REMOTION_ENTRY) {
  Config.setEntryPoint(process.env.REMOTION_ENTRY);
}
