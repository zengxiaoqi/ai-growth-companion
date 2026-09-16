# 积分模块数据隔离与模板管理修复计划

## 问题概述

| # | 问题 | 严重性 |
|---|------|--------|
| 1 | 新账号绑定孩子后进入积分管理页面显示"暂无行为模板" | 🔴 高 |
| 2 | 刷新后显示不属于该用户的积分信息 | 🔴 严重 |
| 3 | 缺少打卡模板管理功能（增删改） | 🟡 中 |
| 4 | 家长端可操作其他账号的积分 | 🔴 严重 |

## 根因分析

### 问题1：新账号无默认模板
- **根因**：`AuthService.register()` 不调用 `seedDefaultBehaviors()`。种子接口 `POST /api/reward/seed/behaviors/:userId` 存在但从未自动触发。
- **影响**：所有新注册家长都看不到打卡模板，除非手动调种子接口。

### 问题2：刷新后显示他人积分
- **根因A（后端）**：`RewardController` **完全没有 `@UseGuards(JwtAuthGuard)`**。所有接口无认证，userId/childId 从 URL 参数取，任何人可访问任何人的数据。
- **根因B（前端）**：childId 解析逻辑 `activeChildId ?? currentUser['id'] ?? 1`。当 `activeChildId` 为 null 时 fallback 到家长自己的 ID 或硬编码 `1`（测试数据）。
- **根因C（后端）**：无 parent-child 关系校验。`UsersService.canAccessChild()` 存在但 `RewardService` 从未调用。

### 问题3：缺少模板管理 UI
- **现状**：后端已有 CRUD API（POST/PUT/DELETE behaviors），前端 `RewardProvider` 也有对应方法（`createBehavior`、`toggleBehavior`、`deleteBehavior`），但 **前端没有管理界面**。

### 问题4：可操作他人积分
- 同问题2根因A+C：无认证 + 无归属校验。

---

## 修复方案

### Phase 1: 后端安全与数据隔离（优先）

#### 1.1 RewardController 加 JWT 认证
- 添加 `@UseGuards(JwtAuthGuard)` 到 `RewardController` 类级别
- 所有接口从 `@Req() req` 中取 `req.user.sub` 作为认证用户 ID
- 移除 URL 中的 `:userId` 参数，改用 `req.user.sub`

#### 1.2 Parent-Child 关系校验
- 在所有涉及 `childId` 的接口中，注入 `UsersService`，调用 `canAccessChild(authenticatedUserId, 'parent', childId)`
- 校验失败返回 `403 Forbidden`
- 模板/礼品的 userId 必须等于 `req.user.sub`

#### 1.3 模板/礼品归属校验
- `updateBehavior(id)`、`deleteBehavior(id)`、`toggleBehavior(id)`：先查模板，验证 `template.userId === req.user.sub`
- 同理应用于 gift 的 update/delete

#### 1.4 自动种子默认模板
- 方案：在 `getBehaviors(userId)` 中，如果返回空列表，自动调用 `seedDefaultBehaviors(userId)` 并返回新创建的模板
- 优点：无需改注册流程，兼容已有用户
- 同理应用于 `getGifts(userId)` → 空时自动种子

### Phase 2: 前端修复

#### 2.1 移除 `?? 1` 硬编码 fallback
- `reward_home_screen.dart`：`childId` 解析改为 `activeChildId ?? (auto-fetch first child)`
- 如果没有孩子，显示"请先添加孩子"提示，不加载数据

#### 2.2 修复 bare ApiService() 实例化
- `_handleCheckIn` 中的 `final api = ApiService()` 改为 `context.read<ApiService>()`

#### 2.3 添加孩子选择器
- 在积分管理首页 TopBar 区域添加孩子选择下拉
- 切换孩子时重新加载该孩子的积分数据

#### 2.4 添加行为模板管理 UI
- 在打卡面板添加"管理模板"入口（齿轮图标）
- 弹出模板管理页面：列表展示所有模板，支持新增/编辑/删除/启用禁用
- 新增模板表单：名称、emoji、积分值（正/负）、分类

### Phase 3: 构建部署验证

#### 3.1 后端构建重启
- `cd src/backend && npm run build`
- 重启后端服务

#### 3.2 前端构建部署
- `flutter clean && flutter build web --release`
- 版本号重命名部署

#### 3.3 端到端验证
- 测试1：新注册家长 → 进入积分管理 → 应自动看到18个默认模板
- 测试2：家长A 登录 → 积分数据只显示自己孩子的 → 切换孩子后数据正确切换
- 测试3：模板管理 → 新增/编辑/删除模板 → 打卡面板反映变化
- 测试4：直接 curl 其他用户 childId → 返回 403

---

## 文件清单

### 后端修改
| 文件 | 修改内容 |
|------|---------|
| `src/backend/src/modules/reward/reward.controller.ts` | 加 JwtAuthGuard，改用 req.user.sub，移除 :userId URL 参数 |
| `src/backend/src/modules/reward/reward.service.ts` | getBehaviors 空时自动种子；update/delete 加归属校验；加 canAccessChild 校验 |
| `src/backend/src/modules/reward/reward.module.ts` | 注入 UsersModule/UsersService |

### 前端修改
| 文件 | 修改内容 |
|------|---------|
| `src/frontend/lib/screens/reward/reward_home_screen.dart` | 移除 ??1 fallback，修复 bare ApiService()，加孩子选择器 |
| `src/frontend/lib/screens/reward/behavior_template_management_screen.dart` | 新建：模板管理 CRUD 页面 |
| `src/frontend/lib/providers/reward_provider.dart` | API 调用改用 req.user.sub（移除 URL 中的 userId 参数） |

### API 变更对照
| 旧接口 | 新接口 |
|--------|--------|
| `GET /reward/behaviors/:userId` | `GET /reward/behaviors` (userId from JWT) |
| `POST /reward/behaviors` (body has userId) | `POST /reward/behaviors` (userId from JWT) |
| `GET /reward/points/:childId` | `GET /reward/points/:childId` (加 parent-child 校验) |
| `POST /reward/seed/behaviors/:userId` | `POST /reward/seed/behaviors` (userId from JWT) |
