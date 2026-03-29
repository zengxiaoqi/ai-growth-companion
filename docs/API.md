# 灵犀伴学 API 文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: JWT Bearer Token

---

## 认证模块

### 注册
```
POST /auth/register
Body: { "username": "string", "password": "string", "email": "string", "role": "parent|child" }
```

### 登录
```
POST /auth/login
Body: { "username": "string", "password": "string" }
Response: { "access_token": "string" }
```

---

## 用户模块

### 获取用户信息
```
GET /users/:id
Headers: Authorization: Bearer <token>
```

### 更新用户
```
PATCH /users/:id
Headers: Authorization: Bearer <token>
Body: { "nickname": "string", "avatar": "string" }
```

---

## 内容模块

### 获取内容列表
```
GET /contents?ageRange=3-4&domain=language&page=1&limit=20
```

### 获取内容详情
```
GET /contents/:id
```

---

## 学习模块

### 开始学习
```
POST /learning/start
Headers: Authorization: Bearer <token>
Body: { "contentId": number }
```

### 完成学习
```
POST /learning/complete
Headers: Authorization: Bearer <token>
Body: { "recordId": number, "score": number }
```

---

## 能力评估

### 获取能力报告
```
GET /abilities/:userId
Headers: Authorization: Bearer <token>
```

---

## 成就模块

### 获取用户成就
```
GET /achievements/user/:userId
Headers: Authorization: Bearer <token>
```

---

## AI 对话

### 发送消息
```
POST /ai/chat
Headers: Authorization: Bearer <token>
Body: { "message": "string", "context": {} }
Response: { "reply": "string", "suggestions": [] }
```

---

## 家长控制

### 获取控制设置
```
GET /parent/controls/:parentId
Headers: Authorization: Bearer <token>
```

### 更新控制设置
```
PATCH /parent/controls/:parentId
Headers: Authorization: Bearer <token>
Body: { "dailyLimit": number, "allowedContent": [] }
```