# 部署指南 - AI Growth Companion

## 架构

```
用户 → 前端 (GitHub Pages, 免费) → 后端 (Docker/服务器)
```

## 方式一：前端 → GitHub Pages（免费，已配置 ✅）

前端已配置为部署到 GitHub Pages，**零成本**托管。

### 部署方式

推送到 `main` 分支时自动触发，或手动触发：
```
GitHub → Actions → Deploy to GitHub Pages → Run workflow
```

### 首次设置

1. 进入仓库 **Settings → Pages**
2. Source 选择 **GitHub Actions**
3. 等待首次部署完成
4. 访问地址：`https://zengxiaoqi.github.io/ai-growth-companion/`

### SPA 路由支持

已配置 `404.html` 重定向机制，React Router 的路由在 GitHub Pages 上也能正常工作。

### 环境变量

在 **Settings → Secrets and variables → Actions → Variables** 添加：

| Variable | 说明 | 示例 |
|---|---|---|
| `VITE_API_BASE_URL` | 后端 API 地址 | `https://api.yourdomain.com/api` |

## 方式二：后端 Docker 镜像（可选）

后端构建为 Docker 镜像推送到 GHCR，用于自部署。

### 触发方式

- 打 Tag：`git tag v1.0.0 && git push origin v1.0.0`
- 手动触发：Actions → Deploy (Docker) → Run workflow

### 自部署到服务器

配置 Secrets 后选择 `deploy_server: true` 手动触发。

| Secret | 说明 |
|---|---|
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PATH` | 部署目录 |

## 方式三：本地 Docker Compose 运行

```bash
docker compose up -d
# 前端: http://localhost:80
# 后端: http://localhost:3000
```

## 常用命令

```bash
# 更新前端（推送即部署）
git push origin main

# 手动触发部署
gh workflow run deploy-pages.yml

# 查看部署状态
gh run list --workflow=deploy-pages.yml
```
