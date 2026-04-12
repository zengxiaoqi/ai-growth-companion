---
name: 测验生成
description: 根据主题生成适合年龄的选择题测验
triggers:
  - 测验
  - 测试
  - 考考我
  - 出题
  - quiz
variables:
  - name: topic
    type: string
    required: true
    description: 测验主题
  - name: count
    type: number
    required: false
    defaultValue: 3
    description: 题目数量
  - name: difficulty
    type: number
    required: false
    defaultValue: 1
    description: 难度1-3
  - name: ageGroup
    type: string
    required: true
    description: 年龄组
requiredTools:
  - generateQuiz
ageGroups:
  - "3-4"
  - "5-6"
---

# 测验生成

为{{ageGroup}}岁的孩子生成关于{{topic}}的测验题目，共{{count}}道选择题。

## 要求

- 难度级别：{{difficulty}}
- 每道题3-4个选项
- 标注正确答案和解释
- 返回JSON格式
