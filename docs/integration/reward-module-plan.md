# 积分奖惩模块整合方案

> 版本: v0.1
> 日期: 2026-06-24
> 状态: 实施中

---

## 1. 整合概述

将 `kids-reward-system` 的积分奖惩功能作为独立模块整合进 `ai-growth-companion`（灵犀伴学）。

### 整合策略：模块化整合

```
ai-growth-companion/
├── src/
│   ├── backend/
│   │   └── src/modules/
│   │       ├── ... (现有模块)
│   │       └── reward/          # 🆕 积分奖惩模块
│   │           ├── reward.module.ts
│   │           ├── reward.controller.ts
│   │           ├── reward.service.ts
│   │           ├── entities/
│   │           │   ├── behavior-template.entity.ts
│   │           │   ├── point-record.entity.ts
│   │           │   ├── gift.entity.ts
│   │           │   └── redemption-record.entity.ts
│   │           └── dto/
│   ├── frontend/
│   │   └── lib/
│   │       ├── screens/
│   │       │   ├── ... (现有页面)
│   │       │   └── reward/      # 🆕 积分奖惩页面
│   │       │       ├── reward_home_screen.dart
│   │       │       ├── points_detail_screen.dart
│   │       │       ├── gift_shop_screen.dart
│   │       │       └── growth_report_screen.dart
│   │       ├── providers/
│   │       │   ├── ... (现有 providers)
│   │       │   └── reward_provider.dart
│   │       └── models/
│   │           ├── ... (现有 models)
│   │           └── reward_models.dart
│   └── frontend-web/
│       └── src/
│           └── components/
│               └── reward/      # 🆕 Web 端积分页面（Phase 2）
```

---

## 2. 数据库设计

### 新增 4 张表

#### 2.1 behavior_templates (行为模板表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 所属家长（外键） |
| name | string | 行为名称 |
| emoji | string | 图标 Emoji |
| points | int | 积分值（正=加分，负=扣分） |
| category | string | 分类：daily/habit/extra/negative |
| is_default | boolean | 是否系统预设 |
| is_enabled | boolean | 是否启用 |
| sort_order | int | 排序 |
| created_at | datetime | 创建时间 |

#### 2.2 point_records (积分记录表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| child_id | int | 孩子 ID（外键） |
| template_id | int | 行为模板 ID（可空） |
| behavior_name | string | 行为名称（快照） |
| points | int | 积分变化 |
| note | string | 备注 |
| recorded_by | int | 记录人（家长 ID） |
| recorded_at | datetime | 记录时间 |
| created_at | datetime | 创建时间 |

#### 2.3 gifts (礼品表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 所属家长 |
| name | string | 礼品名称 |
| emoji | string | 图标 |
| description | string | 描述 |
| points_cost | int | 所需积分 |
| category | string | 分类 |
| is_enabled | boolean | 是否可兑换 |
| stock | int | 库存（-1=无限） |
| created_at | datetime | 创建时间 |

#### 2.4 redemption_records (兑换记录表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| child_id | int | 孩子 ID |
| gift_id | int | 礼品 ID |
| gift_name | string | 礼品名称（快照） |
| points_cost | int | 消耗积分 |
| status | string | pending/approved/completed/cancelled |
| approved_by | int | 审批人 |
| redeemed_at | datetime | 兑换时间 |
| completed_at | datetime | 完成时间 |
| note | string | 备注 |

---

## 3. API 设计

### 3.1 行为管理

```
GET    /api/reward/behaviors          # 获取行为列表
POST   /api/reward/behaviors          # 创建行为
PUT    /api/reward/behaviors/:id      # 更新行为
DELETE /api/reward/behaviors/:id      # 删除行为
PATCH  /api/reward/behaviors/:id/toggle  # 启用/禁用
```

### 3.2 积分记录

```
GET    /api/reward/points             # 获取积分记录（分页）
POST   /api/reward/points             # 记录积分变化
GET    /api/reward/points/summary     # 获取积分汇总
GET    /api/reward/points/children/:childId  # 获取孩子积分
```

### 3.3 礼品管理

```
GET    /api/reward/gifts              # 获取礼品列表
POST   /api/reward/gifts              # 创建礼品
PUT    /api/reward/gifts/:id          # 更新礼品
DELETE /api/reward/gifts/:id          # 删除礼品
```

### 3.4 兑换管理

```
GET    /api/reward/redemptions        # 获取兑换记录
POST   /api/reward/redemptions        # 申请兑换
PATCH  /api/reward/redemptions/:id    # 更新兑换状态
```

### 3.5 统计报告

```
GET    /api/reward/stats/daily        # 每日统计
GET    /api/reward/stats/weekly       # 每周统计
GET    /api/reward/stats/child/:childId  # 孩子统计
```

---

## 4. 实施计划

### Phase 1: 后端模块（1-2 周）

- [ ] 创建 reward 模块骨架
- [ ] 实现 4 个实体类
- [ ] 实现行为管理 API
- [ ] 实现积分记录 API
- [ ] 实现礼品管理 API
- [ ] 实现兑换管理 API
- [ ] 数据库迁移/种子数据
- [ ] 单元测试

### Phase 2: Flutter 前端（2-3 周）

- [ ] 创建 reward 页面目录
- [ ] 实现积分首页（打卡面板）
- [ ] 实现积分明细页
- [ ] 实现礼品商城页
- [ ] 实现成长报告页
- [ ] 接入 API
- [ ] 状态管理（Provider）

### Phase 3: AI 整合（1 周）

- [ ] 接入现有 AI Agent
- [ ] 行为分析 prompt
- [ ] 建议生成 prompt
- [ ] 每日报告生成

### Phase 4: 飞书/微信整合（1 周）

- [ ] 在现有 Bot 中增加积分指令
- [ ] 自然语言意图识别
- [ ] 消息推送

### Phase 5: Web 前端（可选）

- [ ] React 组件开发
- [ ] 家长管理页面

---

## 5. 复用清单

| 现有组件 | 复用方式 |
|----------|----------|
| JWT Auth | 直接使用，无需修改 |
| User Entity | 外键关联 |
| AI Agent | 调用现有 agent 服务 |
| 飞书 Bot | 在现有 Bot 中增加指令 |
| Cloudflare Tunnel | 无需修改 |
| SQLite DB | 新增表 |
| Flutter 主题 | 复用 AppTheme |
| Flutter 组件 | 复用 EmptyState, AppCard 等 |

---

## 6. 风险与应对

| 风险 | 应对 |
|------|------|
| 数据库迁移冲突 | 使用 TypeORM 迁移，先备份 |
| 现有功能回归 | 模块完全独立，不影响现有代码 |
| AI prompt 冲突 | 使用独立的 prompt 文件 |

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-24 | v0.1 | 初始整合方案 |
