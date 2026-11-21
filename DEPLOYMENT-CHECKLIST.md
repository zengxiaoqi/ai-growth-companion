# 灵犀伴学 — 部署检验清单 (Deployment Checklist)

> 可复用到其他 Linux 环境的完整依赖检验清单。按顺序逐项检查，全部通过后系统可正常运行。

> ⚠️ **先完成 [§0 安全前置检查](#security-preflight) 再往下走** —— 未完成会导致后端拒绝启动。

---

<a id="security-preflight"></a>

## 0. 安全前置检查（必做，先于第 1 节）

> 本仓库为**公开仓库**。以下项目来自 2026-11-09 的安全加固，属于**破坏性变更**：
> 未配置 `JWT_SECRET` 时 compose 与后端都会拒绝启动；轮换密钥会使所有已签发 token 立即失效。
> 请在部署窗口内按顺序执行，并预留用户重新登录的通知。
> 摘要版见 [README §🔐 部署前必做](../README.md#pre-deploy-security)。

### 0.1 检查清单

| # | 项目 | 验证判据 | 状态 |
|---|------|---------|------|
| 0.1 | `JWT_SECRET` 为 ≥32 位随机串且非占位值 | `echo -n "$JWT_SECRET" \| wc -c` ≥ 32 | ☐ |
| 0.2 | 生产库无演示账号 | `SELECT count(*) FROM users WHERE phone LIKE '1380000000%';` = 0 | ☐ |
| 0.3 | `CORS_ORIGINS` 已配置为自有域名 | 环境变量非空，启动日志无兼容模式警告 | ☐ |
| 0.4 | `SWAGGER_ENABLED` 未设为 `true` | `/api/docs` 返回 404 | ☐ |
| 0.5 | 无密钥 / 数据库 / 签名文件被提交 | 见 0.5 命令，输出为空 | ☐ |
| 0.6 | 历史泄露凭证已轮换 | 见 0.7 | ☐ |

### 0.2 生成并配置 JWT_SECRET

```bash
# 生成（64 位十六进制，约 256 bit 熵）
openssl rand -hex 32

# 按部署方式写入：
#   systemd  → ~/.config/systemd/user/lingxi-backend.service 的 Environment= / EnvironmentFile=
#   Docker   → 根目录 .env（已被 .gitignore 忽略）
#   Railway  → Dashboard → Variables
#   CI/CD    → 仓库 Settings → Secrets and variables → Actions
```

**约束**（由 `src/backend/src/common/jwt-secret.ts` 强制）：

- 生产模式（`NODE_ENV=production`）下，`JWT_SECRET` 缺失、少于 32 位、或等于 `.env.example` 中的占位值（如 `change-me-in-production`、`lingxi-secret-key-change-in-production`）都会**抛错并拒绝启动**。
- `docker-compose.yml` / `docker-compose.prod.yml` 使用 `${JWT_SECRET:?...}`，漏配时 compose 层即报错。
- 开发 / 测试模式未配置时使用**进程级随机密钥**：可正常启动，但每次重启旧 token 失效。

```bash
# 仓库根目录执行：启动前自检，应无输出、退出码 0
docker compose -f docker-compose.prod.yml config --quiet

# src/backend 目录执行：验证 fail-fast（应抛错，而不是静默使用默认密钥）
cd src/backend
NODE_ENV=production JWT_SECRET= node -e "require('./dist/common/jwt-secret').resolveJwtSecret()"
```

> ⚠️ **影响**：更换 `JWT_SECRET` 会让所有已签发 token 失效（签发有效期 7 天），全部用户需重新登录。请在低峰期执行。

### 0.3 删除生产库中的演示账号

`DatabaseSeederService` 已加生产守卫，**只阻止新建**，不会移除历史遗留账号。历史部署可能已写入
`13800000001 / password123`（家长）与 `13800000002 / password123`（儿童）。口令在公开仓库的文档中可查，等同于公开后台入口。

```bash
# 1) 备份（务必先做）
cp /path/to/lingxi.db /path/to/lingxi.db.bak-$(date +%Y%m%d%H%M)

# 2) 先确认，避免误删真实用户
sqlite3 /path/to/lingxi.db "SELECT id, phone, name, type FROM users WHERE phone LIKE '1380000000%';"

# 3) 删除（TypeORM 实体表名为 users）
sqlite3 /path/to/lingxi.db "DELETE FROM users WHERE phone IN ('13800000001','13800000002');"

# 4) 验证：期望 0
sqlite3 /path/to/lingxi.db "SELECT count(*) FROM users WHERE phone LIKE '1380000000%';"
```

服务器没有 `sqlite3` CLI 时可用 Node 替代：

```bash
node -e "const db=require('better-sqlite3')('/path/to/lingxi.db'); console.log(db.prepare('DELETE FROM users WHERE phone IN (?,?)').run('13800000001','13800000002'))"
```

删除后通过 `POST /api/auth/register` 创建正式家长账号，再在家长端绑定孩子。

### 0.4 CORS 与 Swagger

| 变量 | 生产建议值 | 说明 |
|------|-----------|------|
| `CORS_ORIGINS` | `https://<Flutter Web 域名>,https://<React Web 域名>` | 逗号分隔白名单；留空时生产为兼容模式（反射任意 Origin）并在启动日志打印警告 |
| `SWAGGER_ENABLED` | 不设置 / `false` | 设为 `true` 会在生产暴露 `/api/docs` 完整 API 手册 |

> 本项目两个前端域名各自通过 nginx 反代 `/api/`，属同源请求，不受 CORS 限制；配置白名单不会影响正常访问。

### 0.5 密钥不入库自检

```bash
# 应无输出（.env.example 是模板，允许被跟踪）
git ls-files | grep -E '(^|/)\.env($|\.(local|production|prod|staging))$|\.(pem|jks|keystore|apk|aab|db)$|key\.properties$'

# 逐个确认敏感路径被忽略
git check-ignore -v .env src/backend/.env src/backend/lingxi.db app-release.apk
```

`.gitignore` 已覆盖 `.env.*`、`*.log`、`*.apk` / `*.aab` / `*.jks` / `*.keystore` / `*.pem`、`key.properties` 等。
注意：**对已跟踪文件追加忽略规则无效**，需 `git rm --cached <file>` 解除跟踪（本地文件保留）。

### 0.6 部署后验证

```bash
# 后端启动日志无 fail-fast 错误、无 CORS 兼容模式警告
journalctl --user -u lingxi-backend.service -n 100 --no-pager

# Swagger 应不可访问（404）
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/docs

# 用公开口令登录应失败（401）
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000001","password":"password123"}'
```

### 0.7 历史泄露凭证的轮换

公开仓库的历史提交中曾出现以下标识。**删除文件不会撤销它们**，需在对应平台轮换：

- 飞书云盘 Folder Token，以及 App ID / Secret（若曾写入日志或截图）
- Cloudflare Tunnel ID 与 `~/.cloudflared/<tunnel-id>.json` 凭证
- 代理 / 运维后台口令（部署文档中曾出现明文示例）
- 早期提交中的 `src/backend/.env`（内容为占位值、无真实密钥，仍建议确认）

### 0.8 常见故障

| 现象 | 原因 | 处理 |
|------|------|------|
| `JWT_SECRET is missing or too weak for production` | 未配置 / 弱密钥 / 占位值 | 按 0.2 生成并写入，重启服务 |
| `required variable JWT_SECRET is missing a value` | compose 环境变量为空 | 在 `.env` 或 CI Secrets 中补齐 |
| 所有用户被登出 | 正常：密钥已轮换 | 通知用户重新登录 |
| 启动日志出现 `CORS_ORIGINS 未配置` 警告 | 运行在兼容模式 | 按 0.4 配置白名单 |
| `/api/docs` 仍可访问 | `SWAGGER_ENABLED=true` | 置为 `false` 并重启 |

---

## 1. 系统级依赖 (System Packages)

```bash
# Ubuntu/Debian — 一次性安装所有系统依赖
sudo apt-get update
sudo apt-get install -y \
  git curl wget build-essential \
  nginx \
  ffmpeg \
  fonts-noto-cjk fonts-wqy-zenhei \
  python3 python3-dev
```

| # | 依赖 | 检验命令 | 期望输出 | 用途 |
|---|------|---------|---------|------|
| 1.1 | git | `git --version` | `git version 2.43+` | 代码拉取 |
| 1.2 | curl | `curl --version` | `curl 8.x` | API测试/健康检查 |
| 1.3 | nginx | `nginx -v` | `nginx/1.24+` | 反向代理+静态文件 |
| 1.4 | ffmpeg | `ffmpeg -version` | `6.1+` | 视频渲染后备引擎 |
| 1.5 | CJK字体 | `fc-list :lang=zh family` | 包含 `Noto Sans CJK SC` | 中文字幕渲染(防豆腐块) |
| 1.6 | 字体文件 | `ls /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` | 文件存在 | ffmpeg字幕直接引用 |
| 1.7 | Python3 | `python3 --version` | `3.11+` | 脚本工具 |
| 1.8 | build-essential | `dpkg -l build-essential` | `installed` | 编译 native 模块(better-sqlite3) |

---

## 2. Node.js 环境

```bash
# 安装 nvm + Node.js 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22
nvm alias default 22
```

| # | 依赖 | 检验命令 | 期望输出 | 备注 |
|---|------|---------|---------|------|
| 2.1 | nvm | `nvm --version` | `0.40+` | Node版本管理 |
| 2.2 | Node.js | `node --version` | `v22.22.0` | 后端运行时(**必须v22**) |
| 2.3 | npm | `npm --version` | `10.9+` | 包管理 |
| 2.4 | nvm alias | `nvm ls default` | `-> v22` | 确保systemd用正确版本 |

> ⚠️ **关键**: systemd 服务中 ExecStart 必须使用 nvm 管理的 node 路径:  
> `/home/<user>/.nvm/versions/node/v22.22.0/bin/node`  
> **不能**用 `/usr/bin/node`（可能版本不对或不存在）

---

## 3. 项目代码 & npm 依赖

```bash
# 克隆代码
git clone git@github.com:zengxiaoqi/ai-growth-companion.git
cd ai-growth-companion

# 后端依赖
cd src/backend
npm install                    # 会编译 better-sqlite3 native 模块
npm run build                  # NestJS 编译 → dist/

# Remotion 视频渲染依赖
cd ../video-remotion
npm install

# React Web 前端依赖
cd ../frontend-web
npm install
```

| # | 依赖 | 检验命令 | 期望输出 | 备注 |
|---|------|---------|---------|------|
| 3.1 | 后端 node_modules | `ls src/backend/node_modules/` | 目录存在 | `npm install` |
| 3.2 | better-sqlite3 native | `ls src/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node` | `.node`文件存在 | **必须nvm use 22后再install** |
| 3.3 | 后端构建产物 | `ls src/backend/dist/main.js` | 文件存在 | `npm run build` |
| 3.4 | Remotion CLI | `ls src/video-remotion/node_modules/.bin/remotion` | 文件存在 | 视频渲染引擎 |
| 3.5 | Remotion 入口 | `ls src/video-remotion/node_modules/@remotion/cli/dist/remotion-cli.js` | 文件存在 | **不是** `dist/index.js`(只导出不执行) |
| 3.6 | Remotion 浏览器 | `ls src/video-remotion/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell` | 二进制文件(~200MB) | `npx remotion browser ensure` |
| 3.7 | React Web 依赖 | `ls src/frontend-web/node_modules/` | 目录存在 | `npm install` |

> ⚠️ **better-sqlite3 陷阱**: 如果 Node 版本切换过，native 模块需要重编译:  
> `cd src/backend && npm rebuild better-sqlite3`  
> 排查502/登录失败: ① `systemctl --user status lingxi-backend` ② `journalctl` 查 better-sqlite3 fallback

---

## 4. Flutter SDK (仅移动端/Flutter Web)

```bash
# 安装 Flutter SDK
git clone https://github.com/flutter/flutter.git ~/flutter
export PATH="$HOME/flutter/bin:$PATH"
# 永久写入 ~/.bashrc

# 中国镜像 (必须)
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn

# 构建 Flutter Web
cd src/frontend
flutter pub get
flutter build web
```

| # | 依赖 | 检验命令 | 期望输出 | 备注 |
|---|------|---------|---------|------|
| 4.1 | Flutter SDK | `~/flutter/bin/flutter --version` | `3.41+` | |
| 4.2 | Flutter Web构建 | `ls src/frontend/build/web/index.html` | 文件存在 | `flutter build web` |
| 4.3 | JDK 17 | `ls /usr/lib/jvm/java-17-openjdk-amd64` | 目录存在 | Android构建需要 |
| 4.4 | Android SDK | `ls ~/android-sdk/` | 目录存在 | 仅APK构建需要 |
| 4.5 | Flutter镜像变量 | `echo $PUB_HOSTED_URL` | `https://pub.flutter-io.cn` | 中国网络必须 |

> **Flutter Web CDN缓存破坏**: 构建后须双重版本化:  
> 1. 重命名 `main.dart.js` → `main.dart.v{timestamp}.js`  
> 2. 更新 `flutter_bootstrap.js` 引用版本化文件名  
> 3. 删除旧 `main.dart.v*.js`  
> 只加 `?v=` 查询参数不可靠（Cloudflare可能忽略）

---

## 5. 环境变量配置 (.env)

```bash
cp src/backend/.env.example src/backend/.env
# 编辑 .env 填入实际值
```

### 必须配置的变量

| # | 变量名 | 说明 | 示例/默认值 |
|---|--------|------|------------|
| 5.1 | `PORT` | 后端端口 | `3001` |
| 5.2 | `NODE_ENV` | 环境标识 | `production` |
| 5.3 | `DB_PATH` | SQLite数据库路径 | `lingxi.db` |
| 5.4 | `JWT_SECRET` | JWT签名密钥 | **必填，≥32 位随机串**（见 [§0.2](#02-生成并配置-jwt_secret)） |
| 5.5 | `LLM_BASE_URL` | LLM API地址 | `http://openclaw.sany.com.cn/v1` |
| 5.6 | `LLM_API_KEY` | LLM API密钥 | |
| 5.7 | `LLM_MODEL` | LLM模型名 | `deepseek-v4-flash` |
| 5.8 | `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云AK | 短信/TTS用 |
| 5.9 | `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云SK | 短信/TTS用 |
| 5.10 | `ALIBABA_CLOUD_SMS_SIGN_NAME` | 短信签名 | `灵犀伴学` |
| 5.11 | `ALIBABA_CLOUD_SMS_TEMPLATE_CODE` | 短信模板 | |
| 5.12 | `ALIBABA_CLOUD_VOICE_TTS_CODE` | 语音TTS模板 | |
| 5.13 | `VIDEO_PROVIDER_MODE` | 视频提供商模式 | `hybrid` |
| 5.14 | `VIDEO_PROVIDER_NAME` | 视频提供商 | `vibemotion` |
| 5.15 | `VIDEO_PROVIDER_BASE_URL` | 视频API地址 | |
| 5.16 | `VIDEO_PROVIDER_API_KEY` | 视频API密钥 | |
| 5.17 | `SKILLS_DIR` | 技能目录 | `../../skills` |
| 5.18 | `CORS_ORIGINS` | 允许跨域的来源白名单，逗号分隔 | **生产建议必填**（见 §0.4） |
| 5.19 | `SWAGGER_ENABLED` | 生产是否开放 `/api/docs` | `false`（默认关闭） |

> ⚠️ **JWT_SECRET**：生产环境缺失、少于 32 位或使用占位值都会让后端**拒绝启动**。
> 先用 `openssl rand -hex 32` 生成，详见 [§0.2](#02-生成并配置-jwt_secret)。
> ⚠️ 上线前请先完成 [§0 安全前置检查](#security-preflight)：删除演示账号、配置 `CORS_ORIGINS`、验证 Swagger 已关闭。

---

## 6. nginx 配置

```bash
# 复制配置
sudo cp nginx/lingxi /etc/nginx/sites-available/lingxi
sudo ln -sf /etc/nginx/sites-available/lingxi /etc/nginx/sites-enabled/lingxi
sudo nginx -t
sudo systemctl reload nginx
```

| # | 配置项 | 检验命令 | 期望输出 | 备注 |
|---|--------|---------|---------|------|
| 6.1 | 配置文件 | `sudo nginx -t` | `syntax is ok` | |
| 6.2 | Flutter Web root | 配置中 `root` 指向 `src/frontend/build/web` | | 端口 `8080` |
| 6.3 | React Web root | 配置中 `root` 指向 `src/frontend-web/dist` | | 端口 `8081` |
| 6.4 | /api/ 代理 | `curl localhost:8080/api/contents` | JSON响应 | proxy_pass → `localhost:3001` |
| 6.5 | /uploads/ 代理 | `location ^~ /uploads/` | **必须用 `^~`** | 否则文件扩展名regex先匹配→404 |
| 6.6 | SPA回退 | `try_files $uri $uri/ /index.html` | | Flutter/React SPA路由 |
| 6.7 | index.html不缓存 | `Cache-Control: no-cache` | | 确保部署后用户获取最新版 |
| 6.8 | 版本化JS永久缓存 | `~* /main\.dart\.v[0-9]+\.js$` → `max-age=31536000` | | CDN缓存优化 |

> ⚠️ **nginx /uploads/ 陷阱**: 必须用 `location ^~ /uploads/`（带 `^~` 前缀），否则 `.png/.jpg` 等文件扩展名 regex 规则会先匹配，导致 uploads 代理到后端时 404。

---

## 7. Cloudflare Tunnel

```bash
# 安装 cloudflared (勿升级 past 2026.3.0)
# https://github.com/cloudflare/cloudflared/releases
# 配置
mkdir -p ~/.cloudflared
# 1. 登录获取凭证: cloudflared tunnel login
# 2. 创建隧道: cloudflared tunnel create lingxi
# 3. 写 config.yml
# 4. DNS: cloudflared tunnel route dns lingxi lingxi.chataifree.eu.org
```

### config.yml 模板
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: lingxi.chataifree.eu.org       # Flutter Web
    service: http://localhost:8080
  - hostname: lingxi-web.chataifree.eu.org   # React Web
    service: http://localhost:8081
  # - hostname: lingxi-api.chataifree.eu.org # (可选,未使用)
  #   service: http://localhost:3000
  - service: http_status:404                 # 默认404
```

| # | 配置项 | 检验命令 | 期望输出 | 备注 |
|---|--------|---------|---------|------|
| 7.1 | cloudflared | `cloudflared --version` | `2026.3.0` | **勿升级**(QUIC在新版损坏) |
| 7.2 | 隧道凭证 | `ls ~/.cloudflared/*.json` | `.json`文件存在 | |
| 7.3 | 协议 | config或命令行含 `--protocol http2` | | **必须http2**, QUIC损坏 |
| 7.4 | DNS路由 | `cloudflared tunnel route dns lingxi <域名>` | CNAME记录已创建 | |
| 7.5 | 隧道运行 | `systemctl --user status lingxi-tunnel` | `active (running)` | |

---

## 8. systemd 服务

```bash
# 启用 linger (让用户服务在未登录时也运行)
sudo loginctl enable-linger $(whoami)
```

### lingxi-backend.service
```ini
[Unit]
Description=灵犀伴学 - NestJS Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/ai-growth-companion/src/backend
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/home/<user>/.nvm/versions/node/v22.22.0/bin/node dist/main
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

### lingxi-tunnel.service
```ini
[Unit]
Description=灵犀伴学 - Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>
ExecStart=/home/<user>/.local/bin/cloudflared --no-autoupdate tunnel --protocol http2 run lingxi
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

| # | 服务 | 检验命令 | 期望输出 |
|---|------|---------|---------|
| 8.1 | linger | `loginctl show-user $(whoami) \| grep Linger` | `Linger=yes` |
| 8.2 | backend | `systemctl --user status lingxi-backend` | `active (running)` |
| 8.3 | backend端口 | `curl localhost:3001/api/contents` | JSON响应 |
| 8.4 | tunnel | `systemctl --user status lingxi-tunnel` | `active (running)` |
| 8.5 | 自启动 | `systemctl --user is-enabled lingxi-backend lingxi-tunnel` | `enabled` |

---

## 9. 网络 & 代理 (可选 — 中国网络环境)

```bash
# v2rayA 或其他代理 (如需)
# Web UI: localhost:2017 (凭据请查本机密码管理器，切勿写入仓库/文档)
# SOCKS5: localhost:20170
# HTTP:   localhost:20171

# Flutter 镜像 (必须写入 ~/.bashrc)
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
```

| # | 配置 | 检验命令 | 备注 |
|---|------|---------|------|
| 9.1 | HTTP代理 | `curl -x http://localhost:20171 https://www.google.com` | 如需翻墙 |
| 9.2 | Flutter镜像 | `echo $PUB_HOSTED_URL` | 中国网络必须 |
| 9.3 | GitHub SSH | `ssh -T git@github.com` | 代码拉取(SSH key) |

---

## 10. 端口清单

| 端口 | 用途 | 监听 |
|------|------|------|
| `3001` | NestJS 后端 | `0.0.0.0:3001` (node) |
| `8080` | nginx Flutter Web | `0.0.0.0:8080` (nginx) |
| `8081` | nginx React Web | `0.0.0.0:8081` (nginx) |
| `18789` | OpenClaw Gateway (Bot) | `127.0.0.1:18789` (可选) |
| `2017` | v2rayA Web UI (可选) | 代理管理 |
| `20170` | SOCKS5 代理 (可选) | |
| `20171` | HTTP 代理 (可选) | |

> ⚠️ 后端实际用 `3001`（`.env` 中 `PORT=3001`）。`docker-compose.yml` 中的 `3000` 是 Docker 模式端口，裸机部署不用。

---

## 11. 端到端验证

```bash
# 1. 后端健康检查
curl -s http://localhost:3001/api/contents | head -c 200
# 期望: JSON 响应

# 2. nginx → 后端代理
curl -s http://localhost:8080/api/contents | head -c 200
# 期望: JSON 响应 (同上)

# 3. Cloudflare 外部访问
curl -s -o /dev/null -w "%{http_code}" https://lingxi.chataifree.eu.org/
# 期望: 200

# 4. API 外部访问
curl -s https://lingxi.chataifree.eu.org/api/contents | head -c 200
# 期望: JSON 响应

# 5. 中文字体渲染 (视频字幕)
ffmpeg -y -f lavfi -i color=c=blue:s=640x360:d=3 \
  -vf "drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc:text='中文测试':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
  /tmp/font-test.mp4 2>&1 | tail -1
# 期望: 无错误, 生成视频

# 6. Remotion 渲染测试
cd src/video-remotion
node_modules/.bin/remotion render TopicVideo /tmp/test-remotion.mp4 --codec=h264 --concurrency=1
# 期望: 生成 MP4 文件

# 7. 数据库
cd src/backend && node -e "const db=require('better-sqlite3')('./lingxi.db', {readonly:true}); console.log(db.prepare('SELECT COUNT(*) as c FROM users').get())"
# 期望: { c: <N> } (有用户数据)
```

---

## 12. 部署后常见问题排查

| 症状 | 检查 | 解决 |
|------|------|------|
| 502 Bad Gateway | `systemctl --user status lingxi-backend` | 后端未运行/崩溃 |
| 502 + better-sqlite3错误 | `journalctl --user -u lingxi-backend` | `npm rebuild better-sqlite3` (用nvm v22) |
| 视频字幕豆腐块 | `fc-list :lang=zh` | `sudo apt install fonts-noto-cjk` |
| Remotion ENOENT | `ls src/video-remotion/node_modules/@remotion/cli/dist/remotion-cli.js` | 确认路径是 `remotion-cli.js` 不是 `dist/index.js` |
| Flutter Web旧版本 | Cloudflare缓存 | 双重版本化: 重命名 `main.dart.js`→`main.dart.vN.js`+更新bootstrap |
| /uploads/ 404 | nginx配置 | 用 `location ^~ /uploads/` (带`^~`前缀) |
| Cloudflare Tunnel断连 | `systemctl --user status lingxi-tunnel` | 确认 `--protocol http2` (非QUIC) |
| 部署后白屏 | `try_files $uri $uri/ /index.html` | SPA回退配置 |
| 登录403 | JWT payload `sub` 字段 | 确认token含 `{sub:userId, type:'parent'}` |
| 旁白重复(场景1-6=7-12) | `collectNarrationScriptSegments` | Set去重(已修复) |

---

## 13. 一键安装脚本 (新环境)

```bash
#!/bin/bash
set -e

# 1. 系统依赖
sudo apt-get update
sudo apt-get install -y git curl wget build-essential nginx ffmpeg \
  fonts-noto-cjk fonts-wqy-zenhei python3

# 2. Node.js 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22 && nvm alias default 22

# 3. 项目
git clone git@github.com:zengxiaoqi/ai-growth-companion.git ~/ai-growth-companion
cd ~/ai-growth-companion/src/backend && npm install && npm run build
cd ../video-remotion && npm install
cd ../frontend-web && npm install && npm run build

# 4. Flutter (如需)
# git clone https://github.com/flutter/flutter.git ~/flutter
# export PATH="$HOME/flutter/bin:$PATH"
# export PUB_HOSTED_URL=https://pub.flutter-io.cn
# export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
# cd ~/ai-growth-companion/src/frontend && flutter build web

# 5. 配置
cp ~/ai-growth-companion/src/backend/.env.example ~/ai-growth-companion/src/backend/.env
# 编辑 .env 填入实际值

# 6. 启用 linger
sudo loginctl enable-linger $(whoami)

# 7. systemd 服务 (手动创建)
mkdir -p ~/.config/systemd/user
# 参见第8节配置文件

# 8. Cloudflare Tunnel
# 参见第7节

echo "✅ 安装完成 — 编辑 .env 后启动服务"
```

---

## 14. 文件路径速查

| 路径 | 说明 |
|------|------|
| `/home/<user>/ai-growth-companion/` | 项目根目录 |
| `src/backend/` | NestJS 后端 |
| `src/backend/.env` | 环境变量(**必须配置**) |
| `src/backend/lingxi.db` | SQLite 数据库 |
| `src/backend/dist/main.js` | 编译产物(systemd执行) |
| `src/video-remotion/` | Remotion 视频渲染项目 |
| `src/frontend/build/web/` | Flutter Web 构建产物(nginx root) |
| `src/frontend-web/dist/` | React Web 构建产物(nginx root) |
| `~/.config/systemd/user/lingxi-backend.service` | 后端服务 |
| `~/.config/systemd/user/lingxi-tunnel.service` | Cloudflare隧道服务 |
| `~/.cloudflared/config.yml` | Cloudflare隧道配置 |
| `/etc/nginx/sites-available/lingxi` | nginx配置 |
| `~/.nvm/versions/node/v22.22.0/bin/node` | Node.js路径(systemd引用) |
| `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` | CJK字体(ffmpeg引用) |
| `src/video-remotion/node_modules/.remotion/` | Remotion内置浏览器(~200MB) |

---

*生成时间: 2026-07-02 | 基于实际部署环境整理*
