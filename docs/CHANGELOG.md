# Changelog

本项目所有重要变更记录于此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 📋 规划与文档
- **公共 API 集成方案** — 完成 public-apis 项目分析，输出集成方案文档 (`docs/public-apis-integration-plan.md`)
  - 筛选 8 个高优先级 API（Open-Meteo 天气、REST Countries 国家地理、Free Dictionary 词典、Numbers API 数字趣闻、Bored API 活动推荐、Open Notify ISS 太空、Sunrise/Sunset 日出日落、USGS 地震）
  - 筛选 10 个中优先级 API（Wiktionary、Chinese Text Project、LibreTranslate、Fun Fact、Coinlore、Random Facts、Ocean Facts、OpenAQ、World Bank、Sport Data）
  - 设计统一公共 API 管理层架构（后端代理 + 缓存策略 + 离线降级）
  - 制定内容安全过滤策略（白名单 + 黑名单 + 年龄分级 + 家长可控）
  - 规划 5 阶段实施路线图（天气/国家 → 词典/数字 → 游戏素材 → 科学探索 → 语言阅读）

### 🎨 界面与交互
- 新增 404 兜底页面 (`not_found_screen.dart`)，处理无效路由
- 学习首页新增"古诗"和"汉字"入口 (`learning_home_screen.dart`)
- 家长端新增"视频管理"入口 (`parent_home_screen.dart`)

### 📚 课程内容
- 新增 10 首古诗内容（`content/courses/poetry/`），含完整知识卡片、互动题目、动画场景
- 新增 10 个汉字课程（`content/courses/hanzi/`），覆盖自然/数字/家庭/动物等主题
- 新增 2 个知识卡片模块：太空探索 + 动物世界（`content/knowledge/`）
- 新增 2 个动画场景：太空漫游 + 海底世界（`content/animations/`）

### ⚙️ 后端
- 新增古诗内容 API (`/api/content/poetry`)
- 新增知识卡片 API (`/api/content/knowledge`)
- 新增动画场景 API (`/api/content/animations`)
- 修复内容加载 API 路由及 CORS 配置

### 🧪 测试
- 新增 18 项 E2E 测试覆盖 404 页面、古诗/汉字入口、视频管理入口

### 📦 依赖
- 升级 `flutter_oss_aliyun` 至 12.1.0
- 升级 `dio` 至 5.8.1
- 新增 `flutter_svg` 用于 SVG 渲染
- 新增 `html` 依赖
