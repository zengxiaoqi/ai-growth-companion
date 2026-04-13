# 🚀 AI Growth Companion - 完整部署手册

> **灵犀伴学** — AI 驱动的儿童成长与学习陪伴平台
> 
> 版本：v1.0 | 更新时间：2026-04-13

---

## 📋 目录

- [1. 项目架构](#1-项目架构)
- [2. 部署方案总览](#2-部署方案总览)
- [3. 前端部署 - GitHub Pages](#3-前端部署---github-pages)
- [4. 后端部署 - Railway](#4-后端部署---railway)
- [5. 前后端联调](#5-前后端联调)
- [6. CI/CD 自动化部署](#6-cicd-自动化部署)
- [7. 本地开发环境](#7-本地开发环境)
- [8. 生产环境 Docker 部署](#8-生产环境-docker-部署)
- [9. 环境变量清单](#9-环境变量清单)
- [10. 运维与监控](#10-运维与监控)
- [11. 常见问题排查](#11-常见问题排查)
- [12. 安全建议](#12-安全建议)

---

## 1. 项目架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户浏览器 / 手机                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  前端 (React + Vite + TypeScript)                        │
│  部署：GitHub Pages (免费)                                │
│  地址：https://zengxiaoqi.github.io/ai-growth-companion/  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/JSON API
                         ▼
┌─────────────────────────────────────────────────────────┐
│  后端 (NestJS + Node.js)                                 │
│  部署：Railway (免费额度 $5/月)                           │
│  地址：https://xxx.up.railway.app/api                     │
└────────┬───────────────────────┬────────────────────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐   ┌──────────────────────────────────┐
│ PostgreSQL       │   │ OpenAI / DashScope LLM API       │
│ (Railway 数据库)  │   │ (AI 对话、内容生成)               │
└──────────────────┘   └──────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| **前端框架** | React 19 + TypeScript + Vite | 现代化 SPA |
| **前端样式** | Tailwind CSS v4 + Radix UI | 响应式设计 |
| **前端动画** | P5.js / Three.js 动画模板 | 教学内容可视化 |
| **后端框架** | NestJS 10 + TypeScript | 企业级 Node.js 框架 |
| **数据库** | SQLite (开发) / PostgreSQL (生产) | TypeORM ORM |
| **AI 集成** | OpenAI 兼容 API | 支持 DashScope / GPT |
| **认证** | JWT + Passport | 用户认证授权 |
| **文档** | Swagger / OpenAPI | API 文档自动生成 |

### 项目结构

```
ai-growth-companion/
├── src/
│   ├── frontend-web/        # React 前端 (部署到 GitHub Pages)
│   ├── backend/             # NestJS 后端 (部署到 Railway)
│   ├── content/             # 课程内容 JSON (3-6岁)
│   └── video-remotion/      # Remotion 视频生成
├── .github/workflows/       # CI/CD 部署脚本
│   ├── ci.yml               # 持续集成 (lint + test + build)
│   ├── deploy-pages.yml     # 前端 → GitHub Pages
│   ├── deploy-railway.yml   # 后端 → Railway
│   └── deploy.yml           # Docker 镜像构建 (可选)
├── railway.json             # Railway 部署配置
├── docker-compose.yml       # 本地开发 Docker
├── docker-compose.prod.yml  # 生产环境 Docker
└── docs/                    # 项目文档
```

---

## 2. 部署方案总览

| 方案 | 前端 | 后端 | 成本 | 适用场景 |
|---|---|---|---|---|
| **A. 推荐方案** | GitHub Pages | Railway | 前端免费，后端 ~$0-5/月 | 开发/测试/小规模使用 |
| **B. Docker 自部署** | Docker Nginx | Docker Node.js | 自有服务器费用 | 生产环境/数据可控 |
| **C. 本地开发** | npm dev | npm dev:prod | 免费 | 开发调试 |

### 本手册覆盖

- ✅ **方案 A**（第 3-5 节）：前端 GitHub Pages + 后端 Railway（推荐）
- ✅ **方案 B**（第 8 节）：Docker Compose 一键部署
- ✅ **方案 C**（第 7 节）：本地开发环境

---

## 3. 前端部署 - GitHub Pages

### 3.1 前置条件

- [x] GitHub 仓库已推送代码
- [x] 仓库已启用 GitHub Actions（默认启用）

### 3.2 启用 GitHub Pages

1. 打开仓库页面：https://github.com/zengxiaoqi/ai-growth-companion
2. 点击 **Settings**（右上角齿轮图标）
3. 左侧菜单找到 **Pages**
4. 在 **Source** 下选择 **GitHub Actions**
5. 保存（无需选择分支）

### 3.3 自动部署流程

推送代码到 `main` 分支时，如果修改了 `src/frontend-web/` 下的文件，会自动触发部署：

```bash
git add -A
git commit -m "feat: update frontend"
git push origin main
# → 自动触发 Deploy to GitHub Pages 工作流
```

### 3.4 手动触发部署

1. 进入 **Actions** 标签页
2. 点击 **Deploy to GitHub Pages**
3. 点击 **Run workflow** → **Run workflow**

### 3.5 访问地址

部署完成后，前端访问地址：

```
https://zengxiaoqi.github.io/ai-growth-companion/
```

### 3.6 前端部署配置详解

#### Vite 配置 (`src/frontend-web/vite.config.ts`)

```typescript
export default defineConfig({
  // GitHub Pages 使用仓库名作为基础路径
  base: process.env.BASE_URL || '/',
  // ... 其他配置
});
```

#### SPA 路由支持

GitHub Pages 不支持 SPA 的 History API 路由，通过以下机制解决：

1. **`public/404.html`**：任何不存在的路径都会被重定向到首页
2. **`index.html`**：从 sessionStorage 恢复原始 URL，React Router 根据路径渲染对应页面

#### 构建产物

```
src/frontend-web/dist/
├── index.html           # 入口
├── 404.html             # SPA 路由兼容
├── assets/
│   ├── index-xxx.css
│   ├── index-xxx.js
│   ├── vendor-xxx.js    # 第三方库
│   └── ...              # 代码分割产物
└── public/              # 静态资源
```

---

## 4. 后端部署 - Railway

### 4.1 创建 Railway 账号

1. 访问 [railway.com](https://railway.com)
2. 点击 **Login** → 使用 **GitHub** 账号授权登录
3. 免费额度：$5/月（学生可申请更多）

### 4.2 创建项目

**方式一：从 GitHub 仓库创建（推荐，支持自动部署）**

1. 登录后点击 **New Project**
2. 选择 **Deploy from GitHub repo**
3. 搜索并选择 `zengxiaoqi/ai-growth-companion`
4. Railway 会自动读取 `railway.json` 配置

**方式二：使用 Railway CLI 创建**

```bash
# 安装 CLI
npm i -g @railway/cli

# 登录
railway login

# 创建项目
railway init

# 连接代码库
railway link
```

### 4.3 添加 PostgreSQL 数据库

1. 进入 Railway 项目页面
2. 点击 **+ New** → **Database** → **Add PostgreSQL**
3. Railway 会自动创建数据库并注入 `DATABASE_URL` 环境变量

> ⚠️ **重要**：后端已配置自动检测 `DATABASE_URL`，如果存在则使用 PostgreSQL，否则使用 SQLite。

### 4.4 配置环境变量

在 Railway Dashboard 中，点击你的 Backend 服务 → **Variables** 标签页，添加以下变量：

#### 必需变量

| 变量名 | 说明 | 示例值 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥，用于用户认证 | `my-super-secret-key-2026-very-long` |
| `LLM_BASE_URL` | LLM API 基础地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_API_KEY` | LLM API 密钥 | `sk-xxxxxxxxxxxxxxxxxxxxxxxx` |
| `LLM_MODEL` | 使用的模型名称 | `qwen-plus` |

#### 可选变量

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `NODE_ENV` | 运行环境 | `production` |
| `LLM_MAX_TOKENS` | 最大 Token 数 | `1024` |
| `LLM_TEMPERATURE` | 生成温度 | `0.7` |
| `VIDEO_PROVIDER_MODE` | 视频生成模式 | `hybrid` |
| `VIDEO_PROVIDER_BASE_URL` | 视频生成 API 地址 | *(空)* |
| `VIDEO_PROVIDER_API_KEY` | 视频生成 API 密钥 | *(空)* |

#### 自动注入变量（无需手动添加）

| 变量名 | 来源 |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL 服务 |
| `PORT` | Railway 自动分配 |
| `RAILWAY_PUBLIC_DOMAIN` | Railway 自动分配 |

### 4.5 部署

#### 自动部署（GitHub 集成）

如果通过 GitHub 创建的项目，推送代码到 `main` 分支会自动触发部署。

#### 手动部署（CLI）

```bash
cd src/backend
railway up --detach
```

### 4.6 获取后端地址

1. 进入 Railway 项目页面
2. 点击 Backend 服务 → **Settings** → **Networking**
3. 点击 **Generate Domain** 获取公网域名

格式：`https://你的项目名.up.railway.app`

### 4.7 验证部署

部署完成后，访问以下地址验证：

```bash
# API 健康检查（应返回 JSON 数据）
curl https://xxx.up.railway.app/api/contents

# Swagger API 文档（应显示交互式文档页面）
open https://xxx.up.railway.app/api/docs
```

### 4.8 数据库配置说明

后端已配置**双数据库支持**：

```typescript
// app.module.ts
const databaseUrl = configService.get('DATABASE_URL');

if (databaseUrl) {
  // 生产环境：PostgreSQL (Railway)
  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: { rejectUnauthorized: false },
    synchronize: true,  // 自动建表
  };
} else {
  // 本地开发：SQLite
  return {
    type: 'better-sqlite3',
    database: 'lingxi.db',
    synchronize: true,
  };
}
```

### 4.9 GitHub Actions 自动部署（可选）

如果想让 `git push` 自动部署到 Railway：

1. **生成 Railway Token**：
   - Railway Dashboard → 头像 → **Account Settings** → **Tokens**
   - 点击 **Generate Token**，复制

2. **添加 GitHub Secret**：
   - GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
   - 点击 **New repository secret**
   - Name: `RAILWAY_TOKEN`
   - Value: 粘贴上一步生成的 Token

3. 推送到 `main` 分支时，`deploy-railway.yml` 会自动运行

---

## 5. 前后端联调

### 5.1 连接前端和后端

前端需要知道后端的 API 地址，配置方式：

1. **获取后端地址**：从 Railway 复制（如 `https://xxx.up.railway.app`）

2. **配置 GitHub Variable**：
   - GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
   - 切换到 **Variables** 标签页
   - 点击 **New repository variable**
   - Name: `VITE_API_BASE_URL`
   - Value: `https://xxx.up.railway.app/api`

3. **触发前端重新构建**：
   - 推送任意前端代码变更，或手动触发 `Deploy to GitHub Pages` 工作流

### 5.2 验证连接

打开前端页面，检查浏览器控制台：

```
打开浏览器 DevTools → Network 标签页
刷新页面，确认 API 请求发送到正确的后端地址
```

### 5.3 CORS 配置

后端已默认开启 CORS（`origin: '*'`），开发阶段无需额外配置。
生产环境建议限制允许的域名：

```typescript
// src/backend/src/main.ts
app.enableCors({
  origin: 'https://zengxiaoqi.github.io',  // 限制前端域名
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
});
```

---

## 6. CI/CD 自动化部署

### 6.1 工作流概览

| 工作流 | 触发条件 | 功能 |
|---|---|---|
| `ci.yml` | 推送到 main / PR | 代码检查 + 测试 + 构建验证 |
| `deploy-pages.yml` | 前端代码变更 | 前端部署到 GitHub Pages |
| `deploy-railway.yml` | 后端代码变更 | 后端部署到 Railway |
| `deploy.yml` | 打 Tag (v*) | Docker 镜像构建 (可选) |

### 6.2 部署流程图

```
git push origin main
    │
    ├─ 修改了 src/frontend-web/**
    │   └─→ deploy-pages.yml 触发
    │        ├─ npm ci → typecheck → build
    │        ├─ 上传构建产物
    │        └─ 部署到 GitHub Pages ✅
    │
    ├─ 修改了 src/backend/**
    │   └─→ deploy-railway.yml 触发
    │        ├─ railway up --detach
    │        └─ 部署到 Railway ✅
    │
    └─ 修改了其他文件
        └─→ ci.yml 触发
             ├─ backend: lint + test + build
             ├─ frontend: typecheck + build
             └─ docker: build test ✅
```

### 6.3 查看部署状态

```bash
# 查看所有工作流运行记录
gh run list --repo zengxiaoqi/ai-growth-companion

# 查看特定工作流
gh run list --workflow=deploy-pages.yml

# 查看日志
gh run view <run-id> --log
```

---

## 7. 本地开发环境

### 7.1 环境要求

| 软件 | 最低版本 | 推荐版本 |
|---|---|---|
| Node.js | 20.x | 22.x LTS |
| npm | 10.x | 10.x+ |
| Git | 2.x | 2.40+ |

### 7.2 克隆项目

```bash
git clone https://github.com/zengxiaoqi/ai-growth-companion.git
cd ai-growth-companion
```

### 7.3 启动后端

```bash
cd src/backend

# 安装依赖
npm ci

# 复制环境变量（可选）
cp .env.example .env

# 启动开发服务器（热重载）
npm run start:dev
```

后端启动后访问：
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs

### 7.4 启动前端

```bash
cd src/frontend-web

# 安装依赖
npm ci

# 启动开发服务器（热重载）
npm run dev
```

前端启动后访问：http://localhost:5173

### 7.5 开发时环境变量

创建 `src/frontend-web/.env.local`：

```env
# 指向本地后端
VITE_API_BASE_URL=http://localhost:3000/api
```

### 7.6 完整启动脚本

```bash
# 终端 1 - 后端
cd src/backend && npm run start:dev

# 终端 2 - 前端
cd src/frontend-web && npm run dev
```

---

## 8. 生产环境 Docker 部署

### 8.1 适用场景

- 自有服务器（VPS / 物理机）
- 需要完全控制部署环境
- 不想依赖第三方平台

### 8.2 服务器准备

```bash
# 安装 Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 验证安装
docker --version
docker compose version
```

### 8.3 部署步骤

```bash
# 1. 创建部署目录
sudo mkdir -p /opt/lingxi-companion
sudo chown $USER:$USER /opt/lingxi-companion
cd /opt/lingxi-companion

# 2. 克隆项目
git clone https://github.com/zengxiaoqi/ai-growth-companion.git .

# 3. 配置环境变量
cp docker-compose.prod.yml docker-compose.yml

# 创建 .env 文件
cat > .env << 'EOF'
JWT_SECRET=your-super-secret-key
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=your-api-key
LLM_MODEL=qwen-plus
NODE_ENV=production
EOF

# 4. 启动服务
docker compose up -d --build

# 5. 查看状态
docker compose ps
docker compose logs -f
```

### 8.4 使用预构建镜像

如果已配置 Docker CI/CD（`deploy.yml`），可以直接拉取镜像：

```bash
# 登录 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin

# 拉取并启动
docker compose pull
docker compose up -d
```

### 8.5 Nginx 反向代理（可选）

如果需要 HTTPS 和自定义域名：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

配合 Certbot 启用 HTTPS：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 9. 环境变量清单

### 9.1 后端环境变量

| 变量 | 必需 | 默认值 | 说明 |
|---|---|---|---|
| `PORT` | 否 | `3000` | 服务端口 |
| `NODE_ENV` | 否 | `development` | `development` / `production` |
| `DATABASE_URL` | 生产必需 | *(空)* | PostgreSQL 连接串 |
| `DB_PATH` | 否 | `lingxi.db` | SQLite 数据库路径 |
| `JWT_SECRET` | 是 | *(空)* | JWT 签名密钥 |
| `LLM_BASE_URL` | 是 | *(空)* | LLM API 地址 |
| `LLM_API_KEY` | 是 | *(空)* | LLM API 密钥 |
| `LLM_MODEL` | 否 | `qwen2.5:7b` | 模型名称 |
| `LLM_MAX_TOKENS` | 否 | `1024` | 最大输出 Token |
| `LLM_TEMPERATURE` | 否 | `0.7` | 生成温度 (0-1) |
| `REDIS_HOST` | 否 | *(空)* | Redis 主机 |
| `REDIS_PORT` | 否 | `6379` | Redis 端口 |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 否 | *(空)* | 阿里云 AK（紧急呼叫） |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 否 | *(空)* | 阿里云 SK |
| `VIDEO_PROVIDER_MODE` | 否 | `hybrid` | 视频生成模式 |
| `VIDEO_PROVIDER_BASE_URL` | 否 | *(空)* | 视频 API 地址 |
| `VIDEO_PROVIDER_API_KEY` | 否 | *(空)* | 视频 API 密钥 |

### 9.2 前端环境变量

| 变量 | 必需 | 默认值 | 说明 |
|---|---|---|---|
| `VITE_API_BASE_URL` | 是 | `http://localhost:3000/api` | 后端 API 地址 |
| `BASE_URL` | GitHub Pages 必需 | `/` | 基础路径 |

### 9.3 CI/CD Secrets

| Secret | 用途 | 获取方式 |
|---|---|---|
| `RAILWAY_TOKEN` | Railway CLI 认证 | Railway Account → Tokens |
| `DEPLOY_HOST` | SSH 部署目标 | 自有服务器 IP |
| `DEPLOY_USER` | SSH 用户名 | 服务器配置 |
| `DEPLOY_SSH_KEY` | SSH 私钥 | `cat ~/.ssh/id_ed25519` |
| `DEPLOY_PORT` | SSH 端口 | 服务器配置（默认 22） |
| `DEPLOY_PATH` | 部署目录 | 服务器上创建 |

---

## 10. 运维与监控

### 10.1 健康检查

```bash
# 后端健康检查
curl -f https://xxx.up.railway.app/api/contents || echo "后端异常"

# 前端可访问性
curl -f https://zengxiaoqi.github.io/ai-growth-companion/ || echo "前端异常"
```

### 10.2 日志查看

#### Railway

```bash
# 查看实时日志
railway logs

# 查看最近 100 行
railway logs --lines 100
```

#### Docker

```bash
# 查看后端日志
docker compose logs -f backend

# 查看前端日志
docker compose logs -f frontend

# 查看最近 100 行
docker compose logs --tail=100 backend
```

### 10.3 数据库备份

```bash
# Railway PostgreSQL
railway connect -- -c "pg_dump -Fc" > backup.dump

# Docker (如果使用外部 PostgreSQL)
docker exec postgres pg_dump -U postgres lingxi > backup.sql

# Docker SQLite
docker exec lingxi-backend cat /app/data/lingxi.db > lingxi.db.bak
```

### 10.4 数据库恢复

```bash
# Railway PostgreSQL
railway connect -- -c "DROP DATABASE lingxi; CREATE DATABASE lingxi;"
railway connect -- < backup.dump

# Docker
docker exec -i postgres psql -U postgres lingxi < backup.sql
```

### 10.5 资源监控

#### Railway Dashboard

- CPU / 内存使用率
- 网络流量
- 数据库存储使用量
- 部署历史

#### Docker 监控

```bash
# 容器资源使用
docker stats

# 磁盘使用
docker system df

# 清理无用资源
docker system prune -af
```

---

## 11. 常见问题排查

### 11.1 前端问题

#### Q: GitHub Pages 部署失败

**排查步骤**：
```bash
# 1. 检查 Actions 日志
gh run view --log-failed

# 2. 本地验证构建
cd src/frontend-web
npm ci
npm run typecheck
npm run build
```

**常见原因**：
- TypeScript 类型错误 → 运行 `npm run typecheck` 检查
- 依赖安装失败 → 删除 `node_modules` 和 `package-lock.json` 后重试
- 路径配置错误 → 确认 `vite.config.ts` 中的 `base` 配置

#### Q: 前端白屏

**排查步骤**：
1. 打开浏览器 DevTools → Console，查看错误
2. 检查 Network 标签页，确认 API 请求地址正确
3. 确认 `VITE_API_BASE_URL` 变量已配置

#### Q: 路由 404

**解决**：确认 `public/404.html` 和 `index.html` 中的 SPA 重定向脚本存在。

### 11.2 后端问题

#### Q: Railway 部署失败

**排查步骤**：
```bash
# 查看构建日志
railway logs

# 本地验证构建
cd src/backend
npm ci
npm run build
```

**常见原因**：
- Node.js 版本不兼容 → Railway 使用 Nixpacks，自动检测 Node 20+
- 依赖安装失败 → 确认 `package-lock.json` 存在
- 构建命令路径错误 → 确认 `railway.json` 中的路径

#### Q: 后端 500 错误

**排查步骤**：
```bash
# 1. 检查日志
railway logs

# 2. 检查环境变量是否配置完整
railway variables
```

**常见原因**：
- 缺少 `JWT_SECRET` → 添加环境变量
- 数据库连接失败 → 确认已添加 PostgreSQL 且 `DATABASE_URL` 存在
- LLM API 配置错误 → 检查 `LLM_BASE_URL` 和 `LLM_API_KEY`

#### Q: 数据库连接失败

**排查步骤**：
```bash
# 1. 确认 PostgreSQL 服务正在运行
# Railway Dashboard → 查看数据库状态

# 2. 确认 DATABASE_URL 环境变量存在
railway variables

# 3. 测试连接
railway connect
```

### 11.3 CI/CD 问题

#### Q: Actions 工作流未触发

**排查**：
1. 确认工作流文件存在于 `.github/workflows/` 目录
2. 确认推送的文件路径匹配 `paths` 过滤规则
3. 检查 **Settings → Actions → General** 中是否启用了 Actions

#### Q: 部署成功但页面未更新

**解决**：
1. 清除浏览器缓存（Ctrl+Shift+R 强制刷新）
2. 确认 Actions 工作流确实完成（绿色 ✓）
3. 检查 GitHub Pages 设置是否使用 GitHub Actions 作为 Source

---

## 12. 安全建议

### 12.1 密钥管理

- ✅ **永远不要**将 `.env` 文件提交到 Git（已在 `.gitignore` 中）
- ✅ 使用 GitHub Secrets 存储敏感信息
- ✅ 定期轮换 JWT_SECRET 和 API 密钥
- ✅ Railway 变量使用加密存储

### 12.2 生产环境配置

```typescript
// 1. 限制 CORS 来源
app.enableCors({
  origin: ['https://zengxiaoqi.github.io'],
  credentials: true,
});

// 2. 关闭 Swagger 文档（生产环境）
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}

// 3. 使用强 JWT 密钥
// JWT_SECRET 至少 32 位随机字符

// 4. 启用 HTTPS
// Railway 自动提供 HTTPS
// 自部署使用 Let's Encrypt
```

### 12.3 数据库安全

- 定期备份数据库
- 不要在日志中输出 SQL 查询（生产环境）
- 使用最小权限原则配置数据库用户

### 12.4 API 安全

- 所有敏感操作都需要 JWT 认证
- 输入验证已启用（`ValidationPipe`）
- 建议添加速率限制（Rate Limiting）

---

## 附录

### A. 快速部署检查清单

```
□ 代码已推送到 GitHub main 分支
□ GitHub Pages 已启用（Source = GitHub Actions）
□ Railway 项目已创建
□ PostgreSQL 数据库已添加
□ 后端环境变量已配置（JWT_SECRET, LLM_*）
□ 前端 VITE_API_BASE_URL 已配置
□ 首次部署工作流已成功完成
□ 前端可正常访问
□ 后端 API 可正常调用
□ Swagger 文档可访问
□ 数据库已初始化
```

### B. 有用的链接

| 资源 | 链接 |
|---|---|
| 项目仓库 | https://github.com/zengxiaoqi/ai-growth-companion |
| 前端地址 | https://zengxiaoqi.github.io/ai-growth-companion/ |
| Railway Dashboard | https://railway.com |
| GitHub Actions | https://github.com/zengxiaoqi/ai-growth-companion/actions |
| Vite 文档 | https://vitejs.dev |
| NestJS 文档 | https://docs.nestjs.com |
| Railway 文档 | https://docs.railway.com |

### C. 版本历史

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-04-13 | v1.0 | 初始部署配置，前端 GitHub Pages + 后端 Railway |

---

*本手册由小爪 🐾 整理，如有疑问请联系项目维护者。*
