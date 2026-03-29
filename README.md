# 灵犀伴学 (AI Growth Companion)

> AI 驱动的儿童教育陪伴应用

## 📖 开发指南

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
| AI | AI 对话服务 |
| Parent | 家长控制 |
| **Recommend** | **智能推荐** |
| **Report** | **成长报告** |

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

## 🚀 快速开始

### 后端启动
```bash
cd src/backend
npm install
cp .env.example .env
npm run start:dev
```

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