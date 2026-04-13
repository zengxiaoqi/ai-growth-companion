# 部署指南 - AI Growth Companion

## 架构

```
用户 → 前端 (Nginx, 80) → 后端 (NestJS, 3000) → SQLite
```

## 方式一：GitHub Actions 自动部署（推荐）

### 1. 配置 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions**，添加：

| Secret | 说明 | 示例 |
|---|---|---|
| `DEPLOY_HOST` | 服务器 IP/域名 | `123.45.67.89` |
| `DEPLOY_USER` | SSH 用户名 | `root` |
| `DEPLOY_SSH_KEY` | SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DEPLOY_PORT` | SSH 端口（可选） | `22` |
| `DEPLOY_PATH` | 部署目录 | `/opt/lingxi-companion` |

Variables（可选）：
| Variable | 说明 | 示例 |
|---|---|---|
| `VITE_API_BASE_URL` | 前端 API 地址 | `https://api.yourdomain.com/api` |

### 2. 触发部署

- **手动触发**：Actions → Deploy → Run workflow
- **打 Tag 自动部署**：`git tag v1.0.0 && git push origin v1.0.0`

## 方式二：Docker Compose 手动部署

### 服务器准备

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 创建部署目录
sudo mkdir -p /opt/lingxi-companion
cd /opt/lingxi-companion
```

### 上传配置文件

将 `docker-compose.prod.yml` 和 `.env` 上传到服务器：

```bash
# 本地执行
scp docker-compose.prod.yml user@host:/opt/lingxi-companion/docker-compose.yml
scp deploy/.env user@host:/opt/lingxi-companion/.env
```

### 部署

```bash
cd /opt/lingxi-companion

# 登录 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin

# 拉取并启动
docker compose pull
docker compose up -d

# 查看状态
docker compose ps
docker compose logs -f
```

## 方式三：从源码构建部署

```bash
# 克隆项目
git clone https://github.com/zengxiaoqi/ai-growth-companion.git
cd ai-growth-companion

# 构建并启动
docker compose -f docker-compose.yml up -d --build
```

## 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `JWT_SECRET` | 是 | JWT 签名密钥 |
| `OPENAI_API_KEY` | 是 | OpenAI API 密钥 |
| `DASHSCOPE_API_KEY` | 否 | 阿里灵犀 API 密钥 |
| `VITE_API_BASE_URL` | 否 | 前端 API 地址（构建时） |

## 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend

# 重启服务
docker compose restart backend

# 更新（拉取最新镜像）
docker compose pull && docker compose up -d

# 备份数据库
docker exec lingxi-backend cp /app/data/lingxi.db /tmp/backup.db
docker cp lingxi-backend:/tmp/backup.db ./lingxi-backup-$(date +%Y%m%d).db

# 清理旧镜像
docker image prune -f
```
