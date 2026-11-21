# 灵犀伴学 (AI Growth Companion)

> AI 驱动的儿童教育陪伴应用

## 📖 开发指南

- **[🔐 部署前必做（安全配置）](#pre-deploy-security)** - 公开仓库上线前检查清单（必读）
- **[前端开发](./docs/FLUTTER.md)** - Flutter 构建指南 (Android → iOS)
- **[API 文档](./docs/API.md)** - 接口文档
- **[任务看板](./docs/TASK-BOARD.md)** - 开发进度

## 📱 项目简介

灵犀伴学是一款专为 3-6 岁学龄前儿童设计的 AI 教育陪伴应用，通过个性化学习路径和互动内容，帮助孩子在游戏中学习成长。

## 🎯 核心功能

### 1. 智能学习系统
- 📚 **内容推荐** - 根据年龄和能力智能推荐学习内容
- 🎯 **个性化路径** - 为每个孩子定制学习计划
- 📊 **成长报告** - 每日/每周/每月学习报告

### 2. AI 互动功能
- 🤖 **AI 对话** - 智能问答和故事生成
- 💬 **成长陪伴** - AI 助手陪伴学习

### 3. 家长管理
- 👨‍👩‍👧 **家长控制** - 设置学习时间和内容限制
- 📈 **进度查看** - 实时了解孩子学习情况
- 🏆 **成就系统** - 追踪孩子的成就和进步

## 🏗️ 技术架构

### 后端 (NestJS)
| 模块 | 功能 |
|------|------|
| Auth | 用户认证 (JWT) |
| Users | 用户管理 |
| Contents | 学习内容管理 |
| Learning | 学习记录 |
| Abilities | 能力评估 |
| Achievements | 成就系统 |
| AI | AI 对话服务 (含 Agent Framework + pi-ai 多 Provider) |
| Parent | 家长控制 |
| **Recommend** | **智能推荐** |
| **Report** | **成长报告** |

### AI Agent 框架 (NestJS)
| 模块 | 功能 |
|------|------|
| llm (pi-ai) | 多 Provider 切换 (OpenAI/DeepSeek/Ollama)、自动 Fallback、Token/Cost 追踪 |
| agents | Agent Executor、Orchestrator、Base Agent |
| tools | 工具系统 (Assign Activity、Generate Activity 等) |
| prompts | 提示词模板 (按年龄分) |

### 前端 (Flutter)
| 页面 | 功能 |
|------|------|
| splash_screen | 启动页 |
| child_home | 孩子端首页 |
| parent_home | 家长端首页 |
| ai_chat | AI 对话 |
| learning_home | 学习中心 |
| achievement | 成就展示 |
| profile | 个人资料 |

## 📚 学习内容

### 3-4 岁内容 (18个主题)
- 语言：颜色、形状、动物、礼貌用语
- 数学：数数、比大小、分类
- 科学：身体、宠物、自然、水
- 艺术：手指画、节奏、儿歌
- 社会：情绪、分享、排队

### 5-6 岁内容 (20个主题)
- 语言：汉字、绘本、看图说话、古诗
- 数学：减法、时间、找规律
- 科学：动物分类、植物生长、四季、小实验
- 艺术：绘画、音乐欣赏、手工
- 社会：情绪管理、合作、诚实

## 🔌 API 接口

### 认证
```
POST /api/auth/register - 注册
POST /api/auth/login    - 登录
```

### 用户
```
GET  /api/users/:id      - 获取用户信息
PATCH /api/users/:id     - 更新用户
```

### 内容
```
GET /api/contents        - 获取内容列表
GET /api/contents/:id    - 内容详情
```

### 学习
```
POST /api/learning/start     - 开始学习
POST /api/learning/complete  - 完成学习
```

### 能力评估
```
GET /api/abilities/:userId   - 获取能力评估
```

### 成就
```
GET /api/achievements/user/:userId - 获取成就
```

### AI 对话
```
POST /api/ai/chat - 发送消息
```

### 智能推荐
```
GET /api/recommend?userId=1&ageRange=3-4 - 智能推荐
```

### 成长报告
```
GET /api/report?userId=1&period=weekly - 学习报告
```

### 家长控制
```
GET    /api/parent/controls/:parentId  - 获取设置
PATCH  /api/parent/controls/:parentId  - 更新设置
```

<a id="pre-deploy-security"></a>

## 🔐 部署前必做（安全配置）

> ⚠️ **本仓库是公开仓库**。安全加固已移除硬编码 JWT 密钥、禁止生产自动创建演示账号、默认关闭生产 Swagger。
> **这些是破坏性变更**：未完成下列配置就部署，后端会**拒绝启动**；轮换密钥会使所有已登录用户退出。
> 完整可执行步骤见 [部署检验清单 §0](./DEPLOYMENT-CHECKLIST.md#security-preflight)。

| ✅ | 必做项 | 不做的后果 |
|---|--------|-----------|
| ☐ | 生成并配置强 `JWT_SECRET`（≥32 位随机串） | 缺失 / 占位值 / 弱密钥 → 后端 fail-fast 拒绝启动 |
| ☐ | 删除生产库中已有的演示账号 `13800000001` / `13800000002` | 口令 `password123` 在公开仓库可查，等于敞开家长后台 |
| ☐ | 配置 `CORS_ORIGINS` 为自有域名白名单 | 未配置时生产运行在「反射任意来源」兼容模式 |
| ☐ | 生产不要设置 `SWAGGER_ENABLED=true` | `/api/docs` 会公开全部家长 / 儿童相关 API |
| ☐ | 密钥只放环境变量 / GitHub Secrets，不写进仓库 | 公开仓库的历史提交无法真正删除 |
| ☐ | 轮换曾出现在仓库中的飞书 Folder Token、Cloudflare Tunnel 及代理后台口令 | 删除文件不等于撤销凭证，历史提交仍可查 |

**最小配置**

```bash
# 1) 生成密钥（不要提交、不要贴进日志或 issue）
openssl rand -hex 32

# 2) 写入生产环境变量 / .env
NODE_ENV=production
JWT_SECRET=<上一步输出，≥32 位>
CORS_ORIGINS=https://app.example.com,https://parent.example.com
# SWAGGER_ENABLED 保持未设置或 false

# 3) 启动前自检：缺密钥会直接报错
docker compose -f docker-compose.prod.yml config --quiet
```

**清理演示账号**（SQLite，操作前先备份）

```bash
cp /path/to/lingxi.db /path/to/lingxi.db.bak
sqlite3 /path/to/lingxi.db "DELETE FROM users WHERE phone IN ('13800000001','13800000002');"
sqlite3 /path/to/lingxi.db "SELECT count(*) FROM users WHERE phone LIKE '1380000000%';"  # 期望 0
```

删除后用 `POST /api/auth/register` 创建正式账号。seeder 的生产守卫只阻止**新建**演示账号，不会删除已存在的。

> 本地开发不受阻断：未配置 `JWT_SECRET` 时使用进程级随机密钥，重启后旧 token 失效属正常现象。

---

## 🚀 快速开始

### 后端启动
```bash
cd src/backend
npm install
cp .env.example .env        # 编辑 LLM 配置
npm run start:dev
```

### 环境变量说明 (LLM)
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | 主 Provider 名称 (openai / deepseek / openai-compat) | `openai` |
| `LLM_BASE_URL` | API 地址 | `http://localhost:11434/v1` |
| `LLM_API_KEY` | API Key | — |
| `LLM_MODEL` | 模型名称 | `qwen2.5:7b` |
| `LLM_MAX_TOKENS` | 最大 Token 数 | `4096` |
| `LLM_TEMPERATURE` | 温度参数 | `0.7` |
| `LLM_FALLBACK_*` | 备用 Provider 配置 (可选，自动 Fallback) | — |

### 前端启动
```bash
cd src/frontend
flutter pub get
flutter run
```

## 📁 项目结构

```
ai-growth-companion/
├── docs/               # 项目文档
│   ├── 00-PROJECT-CHARTER.md
│   ├── 01-CONTENT-OUTLINE.md
│   ├── API.md
│   └── tech/
├── src/
│   ├── backend/        # NestJS 后端
│   │   ├── src/
│   │   │   ├── agent-framework/  # AI Agent 框架
│   │   │   │   ├── llm/          # pi-ai 多 Provider LLM 客户端
│   │   │   │   ├── agents/       # Agent Executor / Orchestrator
│   │   │   │   ├── tools/        # 工具系统
│   │   │   │   └── prompts/      # 提示词模板
│   │   │   ├── modules/
│   │   │   └── database/
│   │   └── database/
│   ├── frontend/       # Flutter 前端
│   │   └── lib/
│   │       ├── screens/
│   │       ├── services/
│   │       └── providers/
│   └── content/        # 学习内容
│       ├── 3-4-years/
│       └── 5-6-years/
└── team/               # 团队文档
```

## 📊 开发进度

| 模块 | 完成度 |
|------|--------|
| 后端核心 API | ✅ 100% |
| 智能推荐 | ✅ 100% |
| 成长报告 | ✅ 100% |
| 学习内容 | ✅ 95% |
| 前端界面 | ✅ 85% |
| Flutter SDK | 🔄 下载中 |

## 👥 团队

- 产品经理：灵犀
- 技术负责人：(招募中)
- 前端开发：(招募中)
- 后端开发：(招募中)
- UI 设计：(招募中)
- 内容编辑：(招募中)

## 📄 许可证

MIT License