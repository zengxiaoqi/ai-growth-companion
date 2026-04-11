# generateActivity 函数分析

## 📍 文件位置

**主要实现文件：**  
`src/backend/src/modules/ai/agent/tools/generate-activity.ts`

**相关调用位置：**  
- `src/backend/src/modules/assignment/assignment.service.ts` - L51 和 L144（创建作业时调用）
- `src/backend/test/unit/generate-activity.tool.spec.ts` - 单元测试

---

## 1️⃣ 函数实现流程

### 主入口：`execute()` 方法

```typescript
async execute(args: {
  type: ActivityType;           // 'quiz' | 'true_false' | 'fill_blank' | 'matching' | 'connection' | 'sequencing' | 'puzzle'
  topic: string;                 // 学习主题，例如 "认识动物特征"
  difficulty: number;            // 1=简单, 2=中等, 3=有挑战
  ageGroup: string;              // '3-4' 或 '5-6'
  domain?: string;               // 可选：'science', 'math', 'language' 等
}): Promise<string>             // 返回 JSON 字符串
```

**执行流程：** 
```
execute()
  ├── buildPrompt() → 构建 LLM 提示词
  ├── llmClient.generate() → 调用 LLM
  ├── extractJsonObject() → 提取 JSON 响应
  ├── sanitizeActivity() → 验证和清理数据
  │   └── sanitizeMatching()、sanitizeFillBlank() 等
  └── getFallback() → LLM 失败时的回退值
```

---

## 2️⃣ 参数处理详解

### `type` 参数
决定了生成内容的格式和返回的 JSON schema：

| type | 描述 | JSON 结构 |
|------|------|----------|
| `quiz` | 选择题 | `{ title, questions: [{question, options, correctIndex, explanation}] }` |
| `true_false` | 判断题 | `{ title, statements: [{statement, isCorrect, explanation}] }` |
| `fill_blank` | 填空题 | `{ title, sentences: [{text, answer, hint, options}] }` |
| `matching` | **配对游戏** | `{ title, pairs: [{left, right, id}] }` |
| `connection` | 连线游戏 | `{ title, leftItems, rightItems, connections }` |
| `sequencing` | 排序游戏 | `{ title, items: [{label, order}] }` |
| `puzzle` | 拼图游戏 | `{ title, pieces, gridSize }` |

### `topic` 参数
- 用于构建 LLM 提示词的关键部分
- 影响 `pickTopicEmoji()` 方法选择合适的 emoji
- 例如 topic="认识动物特征" 会在 emoji 映射中查找 `['动物', 'animal']` 关键词

**emoji 映射表：** (第 450-461 行)
```typescript
const map = [
  { keys: ['苹果', '水果', 'fruit', 'apple'], emoji: '🍎' },
  { keys: ['香蕉', 'banana'], emoji: '🍌' },
  { keys: ['动物', 'animal'], emoji: '🐶' },      // ← 会匹配 "认识动物特征"
  { keys: ['花', 'flower'], emoji: '🌸' },
  // ...
]
```

### `difficulty` 参数
- 生成提示词时转换为文字描述：
  - `1` → "简单"
  - `2` → "中等"
  - `3` → "有挑战"
- 在 `assignment.service.ts` 中用于推断 ageGroup（difficulty ≤ 1 → '3-4', > 1 → '5-6'）

### `ageGroup` 参数
- 和 topic 一起构建 LLM 提示词
- 提示词示例：
  ```
  请为5-6岁的孩子生成一个关于"认识动物特征"的配对游戏。
  要求：
  - 难度：中等
  - 内容适合5-6岁儿童
  - ...
  ```

### `domain` 参数 (可选)
- 目前在提示词构建中**未被使用**
- 在 `assignment.service.ts` 中作为作业的元数据保存

---

## 3️⃣ 🐛 问题根源：为什么返回颜色配对而非动物配对？

### 问题现象
请求参数：
```json
{
  "ageGroup": "5-6",
  "difficulty": 2,
  "domain": "science",
  "topic": "认识动物特征",
  "type": "matching"
}
```

**预期结果：** 动物相关的配对（如 🐶↔小狗, 🐱↔小猫)  
**实际结果：** 颜色配对（🔴↔红色, 🔵↔蓝色）

### 根本原因

在 `sanitizeMatching()` 方法（第 257-275 行）中：
```typescript
private sanitizeMatching(args: { topic: string; ageGroup: string }, raw: any) {
  const pairs = Array.isArray(raw?.pairs)
    ? raw.pairs.map(...).filter((p: any) => p.left && p.right)
    : [];

  // ❌ 当 pairs 少于 2 个时，返回回退值
  if (pairs.length < 2) 
    return this.getFallback({ 
      type: 'matching', 
      topic: args.topic, 
      ageGroup: args.ageGroup 
    } as any);
  
  return { type: 'matching', title, topic: args.topic, ageGroup: args.ageGroup, pairs };
}
```

在 `getFallback()` 方法（第 521-530 行）中硬编码了回退值：
```typescript
case 'matching':
  return {
    ...base,
    type: 'matching',
    pairs: [
      { left: '🔴', right: '红色', id: 'p1' },  // ❌ 硬编码的颜色配对
      { left: '🔵', right: '蓝色', id: 'p2' },
      { left: '⭐', right: '星星', id: 'p3' },
      { left: '🌙', right: '月亮', id: 'p4' },
    ],
  };
```

### 触发回退的场景

1. **LLM 生成失败** - `llmClient.generate()` 抛出异常
2. **LLM 返回无效 JSON** - `extractJsonObject()` 无法解析
3. **LLM 返回的 pairs 不足** - 少于 2 个有效的配对

---

## 4️⃣ 数据验证流程

### `extractJsonObject()` 方法（第 491-506 行）
尝试以下顺序解析 JSON：
1. 直接 `JSON.parse()`
2. 从 ` ```json ... ``` ` 代码块中提取
3. 从响应中找到第一个 `{` 和最后一个 `}` 并尝试解析

### `sanitizeActivity()` 方法（第 150-165 行）
根据 type 调用对应的 sanitize 方法：
- `sanitizeQuiz()` - 验证 questions 结构
- `sanitizeMatching()` - **验证 pairs 结构** ← 这里出现问题
- 其他 sanitize 方法...

---

## 5️⃣ 完整调用流程示例

以测试日志为例：

```
请求：
{
  "ageGroup": "5-6",
  "difficulty": 2,
  "domain": "science",
  "topic": "认识动物特征",
  "type": "matching"
}

↓ buildPrompt() 构建提示词 ↓
"请为5-6岁的孩子生成一个关于"认识动物特征"的配对游戏。
要求：
- 难度：中等
- ...
- 生成4对配对
- ..."

↓ llmClient.generate() ↓
假设 LLM 返回成功，但只返回了 1 对...

↓ extractJsonObject() 解析 ↓
{
  "title": "认识动物特征练习",
  "pairs": [
    { "left": "🦁", "right": "狮子" }  // 只有 1 对！
  ]
}

↓ sanitizeMatching() ↓
检查 pairs.length < 2 → 是！

↓ getFallback() ← 进入回退 ↓
返回硬编码的颜色配对！

结果：
{
  "title": "认识动物特征练习",
  "topic": "认识动物特征",
  "pairs": [
    { "left": "🔴", "right": "红色", "id": "p1" },
    { "left": "🔵", "right": "蓝色", "id": "p2" },
    { "left": "⭐", "right": "星星", "id": "p3" },
    { "left": "🌙", "right": "月亮", "id": "p4" }
  ]
}
```

---

## 6️⃣ 代码位置速查表

| 功能 | 文件 | 行号 |
|------|------|------|
| **execute() 主方法** | generate-activity.ts | 16-33 |
| buildPrompt() LLM 提示词 | generate-activity.ts | 35-110 |
| sanitizeActivity() 分发 | generate-activity.ts | 150-165 |
| sanitizeMatching() 验证 | generate-activity.ts | 257-275 |
| **getFallback() 回退值** | generate-activity.ts | 515-638 |
| pickTopicEmoji() emoji 选择 | generate-activity.ts | 448-462 |
| extractJsonObject() JSON 解析 | generate-activity.ts | 491-506 |
| LLM 调用点 | assignment.service.ts | 51, 144 |

---

## 🔧 改进建议

### 问题1：getFallback() 的硬编码回退
**现状：** matching 类型总是返回颜色配对，无视 topic 参数  
**建议：** 根据 topic 生成相关的回退数据

```typescript
// 示例：基于 topic-specific 的回退生成
private getFallbackMatchingPairs(topic: string): any[] {
  if (topic.includes('动物')) return [
    { left: '🐶', right: '小狗', id: 'p1' },
    { left: '🐱', right: '小猫', id: 'p2' },
    // ...
  ];
  if (topic.includes('颜色')) return [
    { left: '🔴', right: '红色', id: 'p1' },
    // ... 现有回退
  ];
  // 其他 topic 映射...
}
```

### 问题2：domain 参数未被使用
**现状：** domain 在执行中输入但从未被 LLM 提示词使用  
**建议：** 将 domain 信息融入 LLM 提示词

```typescript
const schemaInfo = schemas[args.type];
const domainDesc = args.domain ? `（领域：${args.domain}）` : '';
return `请为${ageDesc}的孩子生成一个关于"${args.topic}"的${schemaInfo.desc}${domainDesc}。...`;
```

### 问题3：缺乏 pairs 不足时的日志或警告
**建议：** 在 sanitizeMatching() 中，当进入 getFallback 前记录警告

```typescript
if (pairs.length < 2) {
  this.logger.warn(
    `generateActivity: matching returned ${pairs.length} pairs for topic="${args.topic}", using fallback`
  );
  return this.getFallback(...);
}
```

---

## 📚 相关文件与模块依赖图

```
generate-activity.ts (AI 工具)
  ├── depends on: LlmClient (AI module)
  └── used by: AssignmentService (点赞 → 创建作业时)
       └── used by: AIChat (前端) → /api/assignment/* 端点

assignment.service.ts
  ├── imports: GenerateActivityTool
  ├── methods: create() 在 L51 调用 generateActivityTool.execute()
  │   └── 当 activityData 为空或只有 topic 时触发自动生成
  └── 作业创建时，如果没有提供 activityData，自动生成完整的游戏内容

AIChat.tsx (前端)
  └── 调用 /api/assignment 端点
      └── AssignmentService.create() 
          └── GenerateActivityTool.execute()
```

---

## 🧪 测试覆盖情况

**单元测试文件：** `src/backend/test/unit/generate-activity.tool.spec.ts`

当前测试用例（仅 quiz 类型）：
- ✅ 筛选依赖外部图片的题目
- ✅ 使用 correctAnswer 文本映射修复 correctIndex
- ✅ LLM 输出非 JSON 时的回退处理

**缺失的测试：**
❌ matching 回退值的 topic-aware 生成  
❌ matching 回退时是否应该生成与 topic 相关的配对  
❌ domain 参数是否应该被传递到 LLM 提示词

---

## 📋 总结

| 项目 | 答案 |
|------|------|
| **generateActivity 实现位置** | `src/backend/src/modules/ai/agent/tools/generate-activity.ts` |
| **参数处理方式** | 1. buildPrompt() 将参数转为 LLM 提示词<br>2. sanitizeActivity() 验证 LLM 输出<br>3. getFallback() 提供硬编码默认值 |
| **动物特征返回颜色的原因** | getFallback() 中 matching 类型硬编码了颜色配对，无视 topic 参数。当 LLM 生成的 pairs 不足 2 个时触发回退。 |
| **主要问题** | 回退值不考虑 topic 内容，domain 参数未被使用 |
