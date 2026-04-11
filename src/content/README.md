# 学习内容说明

## 目录结构

```
content/
├── 3-4-years/          # 3-4岁内容
│   ├── 01-colors.json  # 颜色宝宝
│   ├── 02-counting.json # 数数1-5
│   └── ...
│
├── 5-6-years/          # 5-6岁内容
│   ├── 01-chinese-char.json # 认识汉字
│   ├── 02-addition.json     # 10以内加法
│   └── ...
│
└── shared/             # 通用内容
    └── ...
```

## 内容格式 (JSON)

```json
{
  "id": "唯一标识",
  "name": "主题名称",
  "ageRange": "3-4" | "5-6",
  "domain": "language | math | science | art | social",
  "duration": 5,
  "difficulty": 1-5,
  "objectives": ["学习目标1", "学习目标2"],
  "content": [
    {
      "type": "story | lesson | game | quiz | practice",
      "title": "内容标题",
      "text": "内容正文",
      "questions": [...],
      ...
    }
  ],
  "media": {
    "images": [],
    "audios": [],
    "videos": []
  }
}
```

## 内容类型

| 类型 | 说明 |
|------|------|
| story | 故事形式 |
| lesson | 知识点讲解 |
| game | 互动游戏 |
| quiz | 测试题 |
| practice | 练习题 |

## 学科分类

- **language** - 语言（识字、阅读、表达）
- **math** - 数学（数感、计算、逻辑）
- **science** - 科学（认知、探索、实验）
- **art** - 艺术（绘画、音乐、手工）
- **social** - 社会情感（情绪、社交、品格）