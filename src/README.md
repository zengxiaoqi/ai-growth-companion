# 源代码目录

## 目录说明

```
src/
├── frontend/           # Flutter 前端代码
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/    # 页面
│   │   ├── widgets/    # 组件
│   │   ├── models/     # 数据模型
│   │   ├── services/   # 服务层
│   │   └── utils/      # 工具类
│   ├── test/           # 测试代码
│   └── pubspec.yaml    # 依赖配置
│
├── backend/            # NestJS 后端代码
│   ├── src/
│   │   ├── modules/    # 功能模块
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── entities/   # 数据库实体
│   │   └── utils/
│   ├── test/
│   └── package.json
│
└── content/            # 学习内容
    ├── 3-4-years/      # 3-4 岁内容
    ├── 5-6-years/      # 5-6 岁内容
    └── shared/         # 通用内容
```

## 开发规范

### 前端 (Flutter)
- 状态管理：Provider / Riverpod
- 代码风格：遵循 Dart 官方规范
- 命名规范：小驼峰 (变量/函数)，大驼峰 (类)

### 后端 (NestJS)
- 语言：TypeScript
- 代码风格：遵循 NestJS 官方规范
- API 规范：RESTful + Swagger 文档

### 内容格式
```yaml
theme:
  id: theme_001
  name: 颜色宝宝
  age: 3-4
  domain: language
  duration: 5
  objectives:
    - 认识基础颜色
    - 颜色分类
  content:
    - type: story
      text: ...
    - type: quiz
      questions:
        - ...
```

## 环境配置

### 前端环境
```bash
cd frontend
flutter pub get
flutter run
```

### 后端环境
```bash
cd backend
npm install
npm run dev
```

## 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

示例：
```bash
git commit -m "feat: 实现用户登录功能"
git commit -m "fix: 修复颜色识别 bug"
```

---

*最后更新：2026-03-11*
