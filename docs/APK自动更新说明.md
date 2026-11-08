# APK 内自升级（自动检测更新 + 手动检查）与 GitHub Release 发布

> 对齐 senior-anti-fraud-guard 的 App 内自升级链路：**查版本 → 下载（断点续传 +
> SHA-256 校验）→ 拉起系统安装器**，同时 GitHub Release 就是 APK 的分发与归档渠道。

## 一、整体链路

```
CI（build-apk.yml）                    客户端（Flutter）                     后端（NestJS，可选）
────────────────────                   ─────────────────                    ────────────────────
bump pubspec version                   启动 3s 后静默检查 / 设置页手动检查
  → tag v* 触发构建                     GET /api/app-update/latest  ───────→ 代理 GitHub latest.json
  → flutter build apk --release        （失败自动回退 GitHub 直连）          （5 分钟缓存 + APK 磁盘缓存）
  → 生成 latest.json 清单                  ↓ hasUpdate && versionCode 更大
  → softprops/action-gh-release           弹窗（版本/体积/更新说明）
     上传 APK + latest.json             「立即升级」→ Dio 流式下载（.part 断点续传）
                                          → SHA-256 校验（原生通道计算）
                                          → FileProvider → 系统安装器
```

## 二、为什么这样设计

| 决策 | 理由 |
|---|---|
| 事实源是 GitHub Release 里的 `latest.json` | 不需要单独的发布后台；Release 页面本身就是分发/归档渠道 |
| 后端 `/api/app-update/*` 只做代理与缓存 | 国内直连 GitHub 下载 40MB 常常只有几十 KB/s；后端缓存后局域网级速度。**后端没部署新接口也没关系**，客户端自动回退 GitHub 直连 |
| versionCode（pubspec 的 buildNumber）是唯一判据 | `1.10.0 < 1.9.0` 在字符串比较下成立，按 versionName 判断会永远不提示升级 |
| 下载后先 SHA-256 校验再安装 | 弱网下几十 MB 的包极易被掐断，截断文件仍是合法 ZIP 头，装到一半才报"解析包错误" |
| versionCode 从 PackageManager 读 | AGP 8 起 BuildConfig.VERSION_CODE 不再自动生成 |
| 未配置签名 secrets 时沿用 debug 签名 | Android 默认 debug keystore 全平台一致，覆盖安装不受影响；但正式分发建议配置固定 keystore |

## 三、发布一个新版本（唯一正确顺序）

```bash
# 1. bump 版本号：src/frontend/pubspec.yaml
#    version: 1.1.0+2026110801     # "+后面的数字"就是 versionCode，必须严格递增

# 2. 提交并打 tag 推送（tag 注解会作为 Release 正文）
git add -A && git commit -m "release: v1.1.0"
git tag -a v1.1.0-2026110801 -m "新增 App 内自升级"
git push origin main --follow-tags
```

CI 会自动：构建 release APK → 生成 `latest.json`（含 versionCode / 大小 /
SHA-256 / 更新说明 / 下载地址）→ 创建 GitHub Release 并挂上两个文件。

也可以不打 tag：在 **Actions → Build Android APK → Run workflow** 勾选
「构建后创建 GitHub Release」，tag 名自动按 pubspec 版本生成（`v1.1.0-2026110801`）。

推送后用户端：启动 3 秒后自动弹更新提示（同一版本一天最多一次，点「稍后再说」
当天不再打扰）；或在 **设置 → 关于 → 检查更新** 手动触发（无节流，一定有反馈）。

### 强制升级（慎用）

清单里 `minSupportedCode` 大于客户端 versionCode 时弹窗不给「稍后再说」。
当前 CI 生成的清单固定为 0（不强制）；需要时在 Release 上手工改 `latest.json`
的 `minSupportedCode` 字段，或改 `generate-update-manifest.mjs` 的 `--min-code` 传参。

## 四、接口契约（与 senior-anti-fraud-guard 一致）

```
GET /api/app-update/latest?versionCode=2026072601
→ 200 { hasUpdate, force, latest: { versionCode, versionName, sizeBytes,
        sha256, changelog, force, downloadUrl } }      # downloadUrl 为本服务相对路径
→ 503 { message }                                      # 清单不可用，客户端转 GitHub 直连

GET /api/app-update/download?versionCode=2026072601
→ 200 application/vnd.android.package-archive          # 命中磁盘缓存直出
→ 302 → GitHub Release 原始地址                         # 无缓存时兜底

GET /api/app-update/manifest                           # 调试：当前生效的清单
GET /api/app-update/refresh                            # 清除清单缓存
```

后端环境变量（见 `src/backend/.env.example` 的 APP_UPDATE_* 段，全部可留空）：
`APP_UPDATE_GITHUB_REPO`、`APP_UPDATE_MANIFEST_URL`、`APP_UPDATE_MANIFEST`
（本地清单覆盖，断网分发用）、`APP_UPDATE_CACHE_DIR`。

## 五、客户端实现地图

| 文件 | 作用 |
|---|---|
| `lib/services/app_update_service.dart` | 双通道检查、提示节流（同版本一天一次）、URL 解析 |
| `lib/services/app_update_downloader*.dart` | 条件导出：Dio 流式下载 + `.part` 断点续传 + 校验；Web 为 stub |
| `lib/components/app_update_prompt.dart` | 更新弹窗、进度、授权引导、设置页返回自动续装 |
| `lib/screens/settings/settings_screen.dart` | 「关于 → 检查更新」入口 + 动态版本号 |
| `lib/main.dart` | 启动 3 秒后静默检查 |
| `android/.../MainActivity.kt` | 原生通道：读版本、安装、未知来源设置页、SHA-256 |
| `android/.../res/xml/file_paths.xml` | FileProvider 路径映射 |
| `.github/workflows/build-apk.yml` | 构建 + 生成清单 + 发 Release |
| `scripts/generate-update-manifest.mjs` | 生成 `latest.json`（版本号只信 pubspec） |

## 六、首次升级与已知限制

- **Android 8.0+ 需要一次系统授权**：「允许来自此来源的应用」。App 会引导去设置页，
  授权返回后自动续装；国产 ROM（小米/华为/OPPO）安装前还会额外弹一次风险确认，系统行为。
- **不能静默安装**：商店外的无感升级需要设备管理器/系统签名，本应用不做。
- **安装会杀掉进程**：覆盖安装时 App 进程被系统终止是正常的，装完重新打开即是新版本。
- **当前用 debug 签名**：只要一直是 debug 签名就能覆盖安装；一旦切到正式 keystore，
  老用户（debug 签名）需要卸载重装一次。签名切换要在用户少的时候一次性完成。
- Flutter Web 不受影响：`isSupported == false`，所有更新入口自动跳过。

## 七、验证建议

1. 本地：`cd src/backend && npm run build`（已验证通过）；`flutter analyze`（CI 会跑）。
2. 发布一个高于当前 `2026072601` 的 versionCode，打 tag 推送，确认 Release 出现
   APK + `latest.json`。
3. 真机装旧版 → 启动等弹窗 / 设置页手动检查 → 升级 → 确认 versionCode 变化。
