---
name: 课程包生成流程
description: 完整课程包生成工作流，包含听说读写和游戏视频模块
triggers:
  - 课程包
  - 学习包
  - 完整课程
  - 生成课程
  - course pack
variables:
  - name: topic
    type: string
    required: true
    description: 课程主题
  - name: ageGroup
    type: string
    required: true
    description: 年龄组
  - name: durationMinutes
    type: number
    required: false
    defaultValue: 20
    description: 课程时长(分钟)
  - name: focus
    type: string
    required: false
    defaultValue: mixed
    description: 重点领域
requiredTools:
  - generateCoursePack
chainTo: activity-validation
ageGroups:
  - "3-4"
  - "5-6"
---

# 课程包生成流程

为{{ageGroup}}岁的孩子生成关于{{topic}}的完整课程包。

## 配置

- 包含听说读写四个模块和互动游戏
- 总时长{{durationMinutes}}分钟
- 重点领域{{focus}}
