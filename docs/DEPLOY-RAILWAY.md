# Railway 后端部署指南

## 一键部署（推荐）

点击下方按钮，直接将项目部署到 Railway：

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template)

## 手动部署

### 1. 创建 Railway 项目

```bash
# 安装 Railway CLI
npm i -g @railway/cli

# 登录
railway login

# 在 backend 目录初始化
cd src/backend
railway init
```

### 2. 添加 PostgreSQL 数据库

```bash
# 在 Railway Dashboard 或 CLI 中添加
railway add postgresql
```

Railway 会自动注入 `DATABASE_URL` 环境变量，后端会自动使用 PostgreSQL。

### 3. 配置环境变量

在 Railway Dashboard → Variables 中添加：

| 变量 | 说明 | 示例 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥 | `your-super-secret-key` |
| `LLM_BASE_URL` | LLM API 地址 | `https://api.openai.com/v1` |
| `LLM_API_KEY` | LLM API 密钥 | `sk-xxx` |
| `LLM_MODEL` | LLM 模型 | `gpt-4o-mini` |
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 端口（Railway 自动注入） | 无需手动设置 |

> ⚠️ `DATABASE_URL` 由 Railway PostgreSQL 服务自动注入，无需手动添加。

### 4. 部署

```bash
# 方式一：CLI 推送部署
railway up --detach

# 方式二：连接 GitHub 仓库（推荐，自动部署）
# Railway Dashboard → Connect Repo → 选择 ai-growth-companion
# Railway 会自动检测到 railway.json 并构建 src/backend
```

## GitHub Actions 自动部署

1. 在 Railway Dashboard 生成 Token：
   - Account Settings → Tokens → Generate Token
   - Scope 选择 `Read/Write`

2. 在 GitHub 仓库添加 Secret：
   - Settings → Secrets and variables → Actions
   - 添加 `RAILWAY_TOKEN`

3. 推送到 main 分支时自动部署

## 前端连接后端

前端 GitHub Pages 部署后，需要配置后端 API 地址：

1. 在 Railway Dashboard 复制后端域名（如 `your-project.up.railway.app`）
2. 在 GitHub 仓库 Settings → Variables 添加：
   - `VITE_API_BASE_URL` = `https://your-project.up.railway.app/api`
3. 重新触发前端部署

## 数据库迁移

Railway 使用 PostgreSQL，后端 `synchronize: true` 会自动建表。
如需手动迁移：

```bash
# 连接 Railway PostgreSQL
railway connect

# 在本地执行迁移（如果有 migration 脚本）
npm run typeorm migration:run
```

## 健康检查

部署完成后，访问以下地址验证：

- **API**: `https://your-project.up.railway.app/api/contents`
- **Swagger 文档**: `https://your-project.up.railway.app/api/docs`

## 常见问题

### Q: 数据会丢失吗？
A: Railway PostgreSQL 提供持久化存储，数据不会丢失。

### Q: 免费额度够用吗？
A: Railway 每月 $5 免费额度（学生可获取更多），足够开发测试使用。

### Q: 能否使用 SQLite？
A: 不建议。Railway 文件系统是临时的，SQLite 数据会在重启后丢失。已配置自动使用 PostgreSQL。
