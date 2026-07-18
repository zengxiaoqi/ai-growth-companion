# 公共 API 集成方案 — 灵犀伴学

> 基于 [public-apis/public-apis](https://github.com/public-apis/public-apis) 项目筛选，聚焦对 3-12 岁儿童教育有实际价值的免费 / 低门槛 API。

---

## 一、为什么引入公共 API

灵犀伴学当前的内容主要由后端 AI 生成 + 本地课程包构成。引入精选公共 API 可以：

1. **丰富知识广度** — 实时天气、真实动物数据、国家地理信息，让学习内容不局限于静态课程包
2. **增强互动趣味** — 每日趣闻、数字事实、随机挑战等"轻内容"提升孩子打开率
3. **支撑游戏化题库** — 为 7 种互动游戏（Quiz / TrueFalse / Matching 等）提供源源不断的素材
4. **辅助语言学习** — 词典、翻译 API 帮助孩子理解生词，与古诗填字等模块天然契合
5. **低成本试错** — 优先选择免费无需认证的 API，零成本验证效果后再考虑付费方案

**原则：不为集成而集成。每个 API 必须对应明确的教育场景，且通过内容安全审查。**

---

## 二、API 价值评估总览

| 优先级 | 数量 | 标准 |
|--------|------|------|
| 🔴 高  | 12   | 免费无认证、CORS 友好、内容安全、直接可嵌入现有模块 |
| 🟡 中  | 14   | 需少量适配（API Key / 后端代理 / 内容过滤） |
| 🟢 低  | 12   | 未来扩展，需较多开发或依赖外部条件 |

---

## 三、🔴 高优先级集成（立即可做）

### 3.1 Open-Meteo — 天气知识窗口

| 项目 | 说明 |
|------|------|
| **API** | [Open-Meteo](https://open-meteo.com/) |
| **用途** | 获取实时天气数据，在 child home 页面展示"今日天气小课堂"，结合天气科普知识 |
| **认证** | 无需认证，免费 10,000 req/day |
| **CORS** | ✅ 支持 |
| **教育价值** | 科学启蒙 — 温度/湿度/风速/天气现象，培养孩子观察自然的习惯 |

**Flutter 实现思路：**
```dart
// 新建 services/weather_service.dart
class WeatherService {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: 'https://api.open-meteo.com/v1',
  ));

  /// 获取当前天气 + 科普文案
  Future<WeatherKnowledge> getWeatherKnowledge(double lat, double lng) async {
    final resp = await _dio.get('/forecast', queryParameters: {
      'latitude': lat,
      'longitude': lng,
      'current': 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      'timezone': 'Asia/Shanghai',
    });
    // 将 weather_code 映射为儿童友好的描述 + 科普小知识
    return _mapToKnowledge(resp.data);
  }
}
```

**集成位置：** `child_home_screen.dart` 顶部天气卡片，点击展开"你知道吗？"科普弹窗

**注意事项：**
- 需要获取用户位置权限（或让家长手动设置城市）
- weather_code → 儿童友好文案需要自建映射表（WMO Code 有 99 种）
- 建议后端缓存 30 分钟，避免频繁请求

---

### 3.2 REST Countries — 地理探索

| 项目 | 说明 |
|------|------|
| **API** | [REST Countries](https://restcountries.com) |
| **用途** | "每日一国"知识卡片：国旗、首都、人口、语言、货币、地图 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **教育价值** | 地理启蒙 — 认识世界各国，配合 Matching 游戏（国旗配对）|

**Flutter 实现思路：**
```dart
// 新建 services/country_service.dart
class CountryService {
  final Dio _dio = Dio(BaseOptions(baseUrl: 'https://restcountries.com/v3.1'));

  /// 随机获取一个国家
  Future<CountryKnowledge> getRandomCountry() async {
    final resp = await _dio.get('/all?fields=name,flags,capital,population,languages,currencies,region,map');
    final countries = (resp.data as List);
    final country = countries[Random().nextInt(countries.length)];
    return CountryKnowledge.fromJson(country);
  }

  /// 获取所有国旗用于 Matching 游戏
  Future<List<FlagPair>> getAllFlags() async {
    final resp = await _dio.get('/all?fields=name,flags');
    return (resp.data as List).map((c) => FlagPair(
      name: c['name']['common'],
      flagUrl: c['flags']['png'],
    )).toList();
  }
}
```

**集成位置：**
- `learning_home_screen.dart` → "每日一国" 卡片
- `games/matching_game.dart` → 国旗-国名配对模式
- `games/quiz_game.dart` → 地理知识问答

---

### 3.3 Free Dictionary API — 词典查询

| 项目 | 说明 |
|------|------|
| **API** | [Free Dictionary API](https://dictionaryapi.dev/) |
| **用途** | 英文单词释义、音标、发音、例句、同义词 |
| **认证** | 无需认证 |
| **CORS** | 未知（建议后端代理） |
| **教育价值** | 英语学习核心工具 — 查词、跟读发音、拓展词汇量 |

**Flutter 实现思路：**
```dart
// 新建 services/dictionary_service.dart
class DictionaryService {
  final Dio _dio = Dio(BaseOptions(baseUrl: 'https://api.dictionaryapi.dev/api/v2'));

  /// 查询单词
  Future<WordEntry?> lookup(String word) async {
    try {
      final resp = await _dio.get('/entries/en/$word');
      final data = (resp.data as List).first;
      return WordEntry.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null; // 单词不存在
      rethrow;
    }
  }
}

// models/word_entry.dart
class WordEntry {
  final String word;
  final List<Phonetic> phonetics; // 音标 + 音频 URL
  final List<Meaning> meanings;   // 词性 + 释义 + 例句
  // ...
}
```

**集成位置：**
- 学习页面长按单词 → 弹出释义卡片
- AI 聊天中遇到生词 → 一键查词
- 游戏 FillBlank → 英文填词模式

**注意事项：**
- CORS 状态未知，**强烈建议通过后端 `/api/dictionary/:word` 代理**
- 音频 URL 可直接用 `audioplayers` 播放，实现发音跟读
- 可做离线缓存（Hive），常用词不需要重复请求

---

### 3.4 Numbers API — 数字趣闻

| 项目 | 说明 |
|------|------|
| **API** | [Numbers API](http://numbersapi.com) |
| **用途** | 数学/日期/年份趣味事实，"每日数字"挑战 |
| **认证** | 无需认证 |
| **CORS** | ❌ 不支持（需后端代理） |
| **教育价值** | 数学兴趣培养 — "你知道吗？100! 后面有 24 个零！" |

**Flutter 实现思路：**
```dart
// 通过后端代理访问
// GET /api/fun-facts/number/42 → 后端转发到 numbersapi.com/42
Future<String> getNumberFact(int number) async {
  final resp = await _dio.get('/api/fun-facts/number/$number');
  return resp.data['fact'];
}
```

**集成位置：**
- `child_home_screen.dart` → "今日数字" 小卡片
- `games/quiz_game.dart` → 数学趣味题素材
- 学习模块数字认知部分

**注意事项：**
- 无 CORS，必须后端代理
- 内容为英文，需要翻译或仅用于英语启蒙场景
- 无 HTTPS（numbersapi.com），**后端代理同时解决 HTTPS 问题**

---

### 3.5 Bored API — 活动推荐

| 项目 | 说明 |
|------|------|
| **API** | [Bored API](https://www.boredapi.com/) |
| **用途** | 推荐有趣的线下活动，鼓励孩子离开屏幕 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **教育价值** | 创造力 + 亲子互动 — "今天试试用纸板做一个城堡！" |

**集成位置：** 家长端 `parent_home_screen.dart` → "今日亲子活动推荐"

---

### 3.6 Open Notify (ISS) — 太空探索

| 项目 | 说明 |
|------|------|
| **API** | [Open Notify](http://open-notify.org/Open-Notify-API/) |
| **用途** | 国际空间站实时位置、当前宇航员数量 |
| **认证** | 无需认证 |
| **CORS** | ❌ 不支持（需后端代理） |
| **教育价值** | 太空科学启蒙 — "现在国际空间站上有 6 位宇航员！" |

**集成位置：** `learning_home_screen.dart` → "太空探索" 知识卡片，配合地图展示 ISS 实时位置

---

### 3.7 Sunrise & Sunset API — 自然节律

| 项目 | 说明 |
|------|------|
| **API** | [Sunrise and Sunset](https://sunrise-sunset.org/api) |
| **用途** | 获取日出日落时间，结合季节教育 |
| **认证** | 无需认证 |
| **CORS** | ❌ 不支持（需后端代理） |
| **教育价值** | 自然观察 — "今天太阳 6:15 就起床了，比昨天早了 2 分钟哦" |

**集成位置：** 与天气模块合并，在天气卡片中展示日出日落时间

---

### 3.8 USGS Earthquake API — 地球科学

| 项目 | 说明 |
|------|------|
| **API** | [USGS Earthquake](https://earthquake.usgs.gov/fdsnws/event/1/) |
| **用途** | 实时地震数据，地球科学教育 |
| **认证** | 无需认证 |
| **CORS** | ❌ 不支持（需后端代理） |
| **教育价值** | 地球科学 — 了解地震、板块运动，配合地理学习 |

**集成位置：** 学习模块 → "地球科学" 主题，展示最近 24 小时全球地震分布图

---

### 3.9 Open Trivia DB — 问答题库

| 项目 | 说明 |
|------|------|
| **API** | [Open Trivia Database](https://opentdb.com/api_config.php) |
| **用途** | 多类别问答题库（科学、历史、地理、动物等），支持难度分级 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **教育价值** | 题库素材核心来源 — 直接为 Quiz 游戏提供源源不断的题目 |

**Flutter 实现思路：**
```dart
class TriviaService {
  final Dio _dio = Dio(BaseOptions(baseUrl: 'https://opentdb.com/api.php'));

  Future<List<QuizQuestion>> getQuestions({
    int amount = 10,
    String? category,
    String difficulty = 'easy', // easy | medium | hard
  }) async {
    final resp = await _dio.get('', queryParameters: {
      'amount': amount,
      'category': category,
      'difficulty': difficulty,
      'type': 'multiple',
    });
    return (resp.data['results'] as List)
        .map((q) => QuizQuestion.fromOpenTrivia(q))
        .toList();
  }
}
```

**集成位置：** `games/quiz_game.dart` → 替代/补充现有 AI 生成题目，降低 token 消耗

**注意事项：** 内容为英文，需翻译或用于英语启蒙；有 token 编码（HTML entities），需 decode

---

### 3.10 PoetryDB — 古诗数据库

| 项目 | 说明 |
|------|------|
| **API** | [PoetryDB](https://github.com/thundercomb/poetrydb) |
| **用途** | 英文诗歌数据库，按作者、标题、内容检索 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **教育价值** | 与现有古诗模块互补 — 提供英文经典诗歌素材，双语阅读 |

**集成位置：** `poetry/` → 英文诗歌学习模块，"中英古诗对照"功能

---

### 3.11 Fruityvice — 水果知识百科

| 项目 | 说明 |
|------|------|
| **API** | [Fruityvice](https://www.fruityvice.com) |
| **用途** | 水果数据百科 — 营养成分、科属分类、产地 |
| **认证** | 无需认证 |
| **CORS** | ❌ 未知（建议后端代理） |
| **教育价值** | 自然科学启蒙 — "香蕉是浆果，草莓不是！" |

**集成位置：** `learning_home_screen.dart` → "水果百科" 卡片，配合营养教育

---

### 3.12 Nominatim (OpenStreetMap) — 地理编码

| 项目 | 说明 |
|------|------|
| **API** | [Nominatim](https://nominatim.org/) |
| **用途** | 地名搜索 / 反向地理编码，无需 API Key |
| **认证** | 无需认证（需遵守使用政策，1 req/s 上限） |
| **CORS** | ✅ 支持 |
| **教育价值** | 配合 REST Countries 和天气 API — 用户输入城市名 → 坐标 → 天气 |

**集成位置：** 后端代理调用，为天气/日出日落 API 提供坐标转换

---

## 四、🟡 中优先级集成（需要适配工作）

### 4.1 Wiktionary — 多语词典

| 项目 | 说明 |
|------|------|
| **API** | [Wiktionary](https://en.wiktionary.org/w/api.php) |
| **用途** | 多语言词典数据，补充 Free Dictionary API |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **适配工作** | API 响应格式复杂，需要解析 Wiktionary 的 JSON dump |

**教育价值：** 支持多语言查询（中/英/日等），适合双语启蒙家庭

---

### 4.2 Chinese Text Project — 中文经典

| 项目 | 说明 |
|------|------|
| **API** | [Chinese Text Project](https://ctext.org/tools/api) |
| **用途** | 中国古代文本数字化 — 论语、诗经、唐诗等 |
| **认证** | 无需认证（需遵守使用条款） |
| **CORS** | ✅ HTTPS |
| **适配工作** | 需要内容分级过滤（部分经典需注释才适合儿童） |

**教育价值：** 与现有古诗模块（`poetry/`）深度整合，提供原文查询、逐字注释、关联阅读

**集成位置：** `poetry_home_screen.dart` → 点击古诗 → 查看原文出处 + 相关篇章

---

### 4.3 LibreTranslate — 翻译服务

| 项目 | 说明 |
|------|------|
| **API** | [LibreTranslate](https://libretranslate.com/docs) |
| **用途** | 开源翻译 API，支持 17+ 语言 |
| **认证** | 公共实例免费（可能限流），自建实例无限制 |
| **CORS** | ✅ 支持 |
| **适配工作** | 公共实例可能不稳定，建议自建或使用备用实例 |

**教育价值：** 英语启蒙翻译辅助、多语言认知拓展

**集成位置：** AI 聊天中遇到英文 → 一键翻译；词典查询的补充

---

### 4.4 Fun Fact API — 趣味知识

| 项目 | 说明 |
|------|------|
| **API** | [Fun Fact](https://api.aakhilv.me) |
| **用途** | 随机趣味事实，每日知识推送 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **适配工作** | 需要内容安全过滤（部分事实可能不适合低龄儿童） |

**教育价值：** 每日一条"冷知识"，激发好奇心

**集成位置：** `child_home_screen.dart` → "今日趣闻" 卡片

**安全注意：** 需要维护一个过滤词表，或后端代理时做内容审核

---

### 4.5 Coinlore — 数学/逻辑游戏素材

| 项目 | 说明 |
|------|------|
| **API** | [Coinlore](https://www.coinlore.com/cryptocurrency-data-api) |
| **用途** | 提供数字数据，用于数学计算游戏（价格比较、百分比计算等） |
| **认证** | 无需认证 |
| **适配工作** | 加密货币主题需包装为纯数字游戏，避免涉及投资概念 |

**教育价值：** 大数认知、百分比计算、图表阅读（适合高年龄段 9-12 岁）

---

### 4.6 Random Useless Facts — 趣味冷知识

| 项目 | 说明 |
|------|------|
| **API** | [Random Useless Facts](https://uselessfacts.jsph.pl/) |
| **用途** | 随机真实趣闻 |
| **认证** | 无需认证 |
| **CORS** | ❌ 未知 |
| **适配工作** | 英文内容需翻译 + 内容安全过滤 |

---

### 4.7 Ocean Facts — 海洋科学

| 项目 | 说明 |
|------|------|
| **API** | [Ocean Facts](https://oceanfacts.herokuapp.com/) |
| **用途** | 海洋学知识，海洋生物、洋流、深海探索 |
| **认证** | 无需认证 |
| **CORS** | ✅ HTTPS |
| **适配工作** | 内容量有限，需与其他科学 API 互补 |

**教育价值：** 海洋主题学习单元，配合动物模块

---

### 4.8 OpenAQ — 空气质量

| 项目 | 说明 |
|------|------|
| **API** | [OpenAQ](https://docs.openaq.org/) |
| **用途** | 空气质量数据，环保教育 |
| **认证** | 需要 API Key（免费申请） |
| **教育价值** | 环保意识培养 — "今天空气质量优，适合户外运动！" |

**集成位置：** 与天气模块合并展示

---

### 4.9 World Bank Open Data — 全球数据

| 项目 | 说明 |
|------|------|
| **API** | [World Bank](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589) |
| **用途** | 全球发展数据（人口、GDP、教育率等），适合高年龄段 |
| **认证** | 无需认证 |
| **CORS** | ❌ 不支持（需后端代理） |
| **适配工作** | 数据复杂，需简化为儿童可理解的信息图 |

**教育价值：** 培养全球视野，配合 REST Countries 使用

---

### 4.10 Sport List & Data (Decathlon) — 体育知识

| 项目 | 说明 |
|------|------|
| **API** | [Sport List & Data](https://developers.decathlon.com/products/sports) |
| **用途** | 运动项目列表、规则介绍 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **教育价值：** 体育知识启蒙，配合"每日运动"推荐 |

---

### 4.11 JokeAPI — 笑话素材（过滤后）

| 项目 | 说明 |
|------|------|
| **API** | [JokeAPI](https://v2.jokeapi.dev/) |
| **用途** | 多语言笑话，可过滤类别 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |
| **适配工作** | 需过滤不适合儿童的类别（Dark 等），仅保留 Programming / Misc 中安全内容 |

**教育价值：** 语言学习趣味素材，"每日一笑"激励卡片

---

### 4.12 xeno-canto — 鸟鸣录音

| 项目 | 说明 |
|------|------|
| **API** | [xeno-canto](https://xeno-canto.org/explore/api) |
| **用途** | 全球鸟鸣声音录音库 |
| **认证** | 无需认证 |
| **适配工作** | 音频文件需缓存，内容需按地区筛选 |

**教育价值：** 自然科学听觉启蒙 — 听不同鸟的叫声，配合动物知识学习

**集成位置：** `learning_home_screen.dart` → "鸟鸣百科"互动卡片

---

### 4.13 FishWatch — 鱼类百科

| 项目 | 说明 |
|------|------|
| **API** | [FishWatch](https://www.fishwatch.gov/developers) |
| **用途** | 鱼类信息及图片 — 生物学、习性、栖息地 |
| **认证** | 无需认证 |
| **CORS** | ✅ 支持 |

**教育价值：** 海洋生物科学，配合海洋主题学习单元

**集成位置：** 学习模块 → "海洋探索" 主题，与 Ocean Facts 互补

---

### 4.14 Gutendex — 经典英文电子书

| 项目 | 说明 |
|------|------|
| **API** | [Gutendex](https://gutendex.com/) |
| **用途** | Project Gutenberg 电子书库 API，5 万+ 公版英文书 |
| **认证** | 无需认证 |
| **适配工作** | 需筛选适合儿童的读物（如童话、寓言），内容偏旧 |

**教育价值：** 英文阅读素材 — 安徒生童话、伊索寓言等公版书原文

**集成位置：** 阅读模块（未来）→ 分级英文阅读

---

### 4.15 SuperHeroes — 超级英雄百科

| 项目 | 说明 |
|------|------|
| **API** | [SuperHero API](https://superheroapi.com) |
| **用途** | 超级英雄/反派数据 — 能力值、传记、图片 |
| **认证** | 需要 API Key（免费） |
| **适配工作** | 内容需评估是否适合低龄儿童 |

**教育价值：** 趣味素材 — 能力值对比可做数学比较题，"你最像哪个英雄"性格测试

**集成位置：** `games/quiz_game.dart` → 超级英雄主题问答

---

## 五、🟢 低优先级 / 未来考虑

| API | 用途 | 暂缓原因 |
|-----|------|----------|
| NASA APOD / Imagery | 太空图片/每日天文一图 | 需要 API Key，图片需审核（部分可能不适合儿童） |
| SpaceX API | 火箭/发射数据 | 内容偏硬核，适合高年龄段 |
| Cat Facts API | 动物趣闻 | 内容单一，仅英文，优先级低于综合类 API |
| Dog CEO | 随机狗狗图片 | 有趣但教育价值有限，可作为奖励页彩蛋 |
| PotterDB | 哈利波特知识库 | IP 相关，需评估版权风险 |
| Open Library | 图书信息 | 内容量大但质量参差，需要大量过滤工作 |
| Art Institute of Chicago | 艺术品数据 | 教育价值高但需要精心设计交互，开发量大 |
| NPS (National Park Service) | 国家公园数据 | 需要 API Key，地理上与中国用户关联度低 |
| Purple Air | 空气质量（免费） | 数据偏专业，与 OpenAQ 功能重叠 |
| TLE Satellite Info | 卫星轨道数据 | 过于专业，仅适合太空主题深度探索 |
| Weatherstack | 天气数据 | 需 API Key，与 Open-Meteo 功能重叠（Open-Meteo 免费更好） |
| GBIF | 全球生物多样性数据 | 数据量极大偏学术性，适合做"物种百科"深度功能 |
| Movebank | 动物迁徙数据 | 数据偏科研，适合"动物世界"深度学习主题 |
| WolframAlpha | 知识问答引擎 | 需 API Key，功能与 AI 聊天有重叠 |
| Hugging Face | ML 模型推理 | 可做图片分类/NSFW 审核但需技术整合，未来考虑 |
| Deezer / Spotify | 音乐流媒体 | 需 OAuth，版权风险大，与学习场景关联弱 |
| Caldays / Nager.Date | 节假日数据 | 可做"今天是什么日子"但内容需中国节假日适配 |
| Verome | YouTube 音乐搜索 | 版权风险，需评估 |

---

## 六、技术架构建议

### 6.1 统一公共 API 管理层

```
┌─────────────────────────────────────────────────┐
│                Flutter App                       │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ WeatherCard  │  │ CountryCard │  ...         │
│  └──────┬──────┘  └──────┬──────┘               │
│         │                │                       │
│  ┌──────▼────────────────▼──────────────┐       │
│  │     PublicApiService (统一入口)        │       │
│  │  - 请求路由                            │       │
│  │  - 缓存管理 (Hive)                     │       │
│  │  - 错误处理 & 降级                     │       │
│  │  - 内容安全过滤                        │       │
│  └──────────────┬───────────────────────┘       │
└─────────────────┼───────────────────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Backend Proxy (Node.js)  │
    │   /api/public/*            │
    │  - CORS 代理               │
    │  - HTTPS 统一              │
    │  - 请求限流                │
    │  - 响应缓存 (Redis/内存)   │
    │  - 内容安全审核            │
    └─────────────┬─────────────┘
                  │
    ┌─────────────▼─────────────┐
    │    External Public APIs    │
    │  Open-Meteo / REST Countries │
    │  Numbers / USGS / etc.     │
    └───────────────────────────┘
```

### 6.2 Flutter 端实现

```dart
// services/public_api_service.dart
class PublicApiService {
  final Dio _dio;
  final HiveBox _cache;

  PublicApiService(this._dio, this._cache);

  /// 通用请求方法 — 带缓存 + 降级
  Future<T?> fetch<T>({
    required String endpoint,
    required Duration cacheDuration,
    required T Function(Map<String, dynamic>) parser,
    bool useProxy = true,
  }) async {
    final cacheKey = 'public_api:$endpoint';

    // 1. 检查缓存
    final cached = _cache.get(cacheKey);
    if (cached != null) {
      final entry = PublicApiCacheEntry.fromJson(cached);
      if (!entry.isExpired(cacheDuration)) {
        return parser(entry.data);
      }
    }

    // 2. 发起请求（通过后端代理或直接）
    try {
      final url = useProxy
          ? '/api/public/$endpoint'
          : endpoint;
      final resp = await _dio.get(url);
      
      // 3. 写入缓存
      await _cache.put(cacheKey, PublicApiCacheEntry(
        data: resp.data,
        fetchedAt: DateTime.now().millisecondsSinceEpoch,
      ).toJson());

      return parser(resp.data);
    } on DioException catch (e) {
      // 4. 降级：返回过期缓存
      if (cached != null) {
        _log.warning('API 请求失败，使用过期缓存: $endpoint');
        return parser((cached as Map)['data']);
      }
      _log.error('API 请求失败且无缓存: $endpoint', e);
      return null;
    }
  }
}
```

### 6.3 缓存策略

| API | 缓存时长 | 理由 |
|-----|----------|------|
| Open-Meteo 天气 | 30 分钟 | 天气变化慢，减少请求 |
| REST Countries | 24 小时 | 国家数据几乎不变 |
| Dictionary | 7 天 | 单词释义固定 |
| Numbers Facts | 12 小时 | 事实内容固定但需保持新鲜感 |
| ISS 位置 | 5 分钟 | 实时性要求较高 |
| Sunrise/Sunset | 24 小时 | 每天更新一次即可 |
| USGS 地震 | 15 分钟 | 近实时数据 |
| Open Trivia DB | 6 小时 | 题库更新不频繁，但需保持新鲜感 |
| PoetryDB | 7 天 | 诗歌数据固定 |
| Fruityvice | 7 天 | 水果数据固定 |
| Nominatim | 30 天 | 地名/坐标几乎不变 |

### 6.4 离线降级方案

```dart
// 离线时的降级策略
class OfflineFallback {
  // 预置的离线数据包
  static final List<CountryKnowledge> bundledCountries = [
    // 预置 20 个热门国家的离线数据
  ];
  
  static final Map<int, String> bundledNumberFacts = {
    1: '1 是最小的正整数',
    42: '42 是生命、宇宙以及一切的答案',
    100: '100! 有 24 个尾随零',
    // ... 预置 50 个数字事实
  };

  static final List<String> bundledWeatherFacts = [
    '云是由微小的水滴或冰晶组成的',
    '风速是用蒲福风级来衡量的',
    // ... 预置天气科普
  ];
}
```

### 6.5 后端代理实现（Node.js）

```javascript
// server/routes/publicApi.js
const express = require('express');
const router = express.Router();
const NodeCache = require('node-cache');
const cache = new NodeCache();

// 通用代理函数
async function proxyRequest(res, url, cacheKey, ttlSeconds = 1800) {
  // 检查缓存
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    
    // 内容安全过滤（可扩展）
    const safeData = filterContent(data);
    
    cache.set(cacheKey, safeData, ttlSeconds);
    res.json(safeData);
  } catch (err) {
    // 尝试返回过期缓存
    const stale = cache.get(cacheKey, true);
    if (stale) return res.json({ ...stale, _stale: true });
    res.status(502).json({ error: 'API unavailable' });
  }
}

// 路由
router.get('/weather', (req, res) => {
  const { lat, lng } = req.query;
  proxyRequest(res,
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Asia/Shanghai`,
    `weather:${lat}:${lng}`, 1800);
});

router.get('/country/random', async (req, res) => {
  proxyRequest(res,
    'https://restcountries.com/v3.1/all?fields=name,flags,capital,population,languages,currencies,region,map',
    'countries:all', 86400);
});

router.get('/number/:num', (req, res) => {
  proxyRequest(res,
    `http://numbersapi.com/${req.params.num}`,
    `number:${req.params.num}`, 43200);
});

router.get('/iss', (req, res) => {
  proxyRequest(res,
    'http://api.open-notify.org/iss-now.json',
    'iss:position', 300);
});

module.exports = router;
```

---

## 七、内容安全策略

儿童应用的内容安全是**最高优先级**：

### 7.1 过滤层级

```
API 原始响应
    │
    ▼
┌─────────────────────┐
│ 1. 后端白名单过滤    │  → 只保留预定义安全的字段
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. 关键词黑名单      │  → 过滤暴力/恐怖/不当内容
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. 年龄分级标记      │  → 标记内容适合的年龄段
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. 家长可控开关      │  → 家长可关闭特定 API 数据源
└─────────────────────┘
```

### 7.2 各 API 安全评估

| API | 风险等级 | 措施 |
|-----|----------|------|
| Open-Meteo | 🟢 极低 | 纯气象数据，无需过滤 |
| REST Countries | 🟢 极低 | 地理数据，安全 |
| Dictionary | 🟡 低 | 释义中可能含不雅例句，需过滤 |
| Numbers API | 🟡 低 | 英文趣闻，需翻译后审核 |
| Fun Fact | 🟡 中 | 随机内容，需关键词过滤 |
| Chinese Text Project | 🟡 中 | 古文内容需分级，部分不适合低龄 |
| Open Trivia DB | 🟡 低 | 可按类别过滤，排除 Dark 类别 |
| JokeAPI | 🟡 中 | 需严格过滤类别，仅保留安全内容 |
| Fruityvice | 🟢 极低 | 纯水果数据，安全 |
| PoetryDB | 🟡 低 | 经典诗歌，但部分内容需年龄分级 |
| SuperHeroes | 🟡 中 | 部分角色传记含暴力元素，需筛选 |
| Gutendex | 🟡 中 | 公版书内容质量参差，需筛选适合儿童的读物 |

---

## 八、实施路线图

### Phase 1 — 基础框架 + 天气/国家（1-2 周）

- [ ] 搭建后端代理路由 `/api/public/*`
- [ ] 实现 `PublicApiService` + 缓存层
- [ ] 集成 Open-Meteo → child home 天气卡片（含 Nominatim 城市名→坐标转换）
- [ ] 集成 REST Countries → "每日一国" 卡片
- [ ] 离线降级数据包（预置 20 国 + 天气科普）

### Phase 2 — 词典 + 数字趣闻 + 问答题库（1-2 周）

- [ ] 集成 Free Dictionary API → 查词弹窗
- [ ] 后端代理 Numbers API → "今日数字"
- [ ] 集成 Open Trivia DB → Quiz 游戏题目（按难度筛选）
- [ ] 词典音频播放功能
- [ ] 离线词典缓存（Hive）

### Phase 3 — 游戏素材增强（2 周）

- [ ] REST Countries → Matching 游戏国旗配对模式
- [ ] Numbers API → Quiz 游戏数学趣味题
- [ ] Fun Fact API → 每日知识挑战
- [ ] SuperHeroes → 能力值比较 + 主题问答
- [ ] 内容安全过滤管道

### Phase 4 — 科学探索模块（2 周）

- [ ] ISS 实时位置 → 太空探索卡片
- [ ] USGS 地震数据 → 地球科学模块
- [ ] Sunrise/Sunset → 自然节律展示
- [ ] Fruityvice → 水果百科卡片
- [ ] FishWatch + xeno-canto → 自然科学听觉/视觉结合
- [ ] 整合为"科学探索"主题学习单元

### Phase 5 — 语言与阅读（2-3 周）

- [ ] LibreTranslate → 翻译辅助
- [ ] Chinese Text Project + PoetryDB → 古诗模块增强 + 中英对照
- [ ] Wiktionary → 多语言支持
- [ ] Gutendex → 分级英文阅读（童话/寓言）
- [ ] 家长端"学习资源"面板

---

## 九、成本与风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| API 不可用/宕机 | 功能降级 | 离线缓存 + 预置数据兜底 |
| API 变更/下线 | 功能失效 | 抽象接口层，可快速切换数据源 |
| 内容不当 | 儿童安全 | 多层过滤 + 家长可控开关 |
| 请求限流 | 体验下降 | 积极缓存 + 后端代理合并请求 |
| CORS 限制 | 无法直连 | 统一后端代理解决 |
| 隐私合规 | 法律风险 | 不向第三方 API 传递用户个人信息 |

**成本估算：** 所有高优先级 API 均为免费，后端代理增加的服务器负载极小（缓存命中率预计 > 90%）。

---

## 十、与现有模块的集成矩阵

| 现有模块 | 可集成的 API | 增强效果 |
|----------|-------------|----------|
| `child_home_screen` | Open-Meteo, Numbers, Fun Fact, ISS, Fruityvice | 首页内容丰富度 ↑ |
| `learning_home_screen` | REST Countries, ISS, USGS, Sunrise, Fruityvice, FishWatch, xeno-canto | 知识广度 ↑ |
| `games/quiz_game` | Numbers, REST Countries, Fun Fact, Open Trivia DB, SuperHeroes | 题库素材 ↑↑ |
| `games/matching_game` | REST Countries (flags), SuperHeroes | 新增国旗配对/英雄匹配玩法 |
| `games/fill_blank` | Dictionary, Chinese Text Project, PoetryDB | 英文填词 + 古诗增强 |
| `poetry/` | Chinese Text Project, PoetryDB | 原文出处 + 关联阅读 + 中英对照 |
| `ai_chat_screen` | Dictionary, LibreTranslate, WolframAlpha | 查词/翻译/知识问答 |
| `parent/ability_radar` | 所有 API (间接) | 知识覆盖面评估数据 |
| `reward/` | Dog CEO, Cat Facts | 奖励页趣味彩蛋 |
| `learning/` (阅读) | Gutendex | 分级英文阅读素材 |

---

*文档版本: v2.0 | 创建日期: 2026-07-18 | 更新日期: 2026-07-18 | 基于 public-apis 项目 2026 年 7 月快照*

## 附录：public-apis 仓库分类覆盖范围

本次分析覆盖了 public-apis 项目的全部 52 个分类，以下是与灵犀伴学相关的分类及其中已评估的 API 数量：

| 分类 | 总 API 数 | 已纳入方案 | 高价值但暂缓 | 说明 |
|------|-----------|------------|-------------|------|
| Animals | 25 | 4 (Dog CEO, Cat Facts, FishWatch, xeno-canto) | 2 (IUCN, Movebank) | 动物图片/知识可做奖励和百科 |
| Books | 27 | 2 (PoetryDB, Gutendex) | 2 (Open Library, Google Books) | 公版书适合英文阅读模块 |
| Calendar | 18 | 0 | 2 (Caldays, Nager.Date) | 节假日数据需中国本地化适配 |
| Dictionaries | 13 | 3 (Free Dictionary, Chinese Text Project, Wiktionary) | 3 (Collins, Oxford, Merriam-Webster) | 词典是语言学习核心工具 |
| Entertainment | 16 | 3 (Fun Fact, JokeAPI, Random Useless Facts) | 1 (PotterDB) | 笑话/趣闻需内容过滤 |
| Environment | 19 | 1 (OpenAQ) | 3 (Carbon Interface, IQAir, PM2.5) | 环保教育适合高年龄段 |
| Food & Drink | 25 | 2 (Fruityvice, Open Food Facts) | 2 (Edamam, TheMealDB) | 水果/营养知识科普 |
| Games & Comics | 90+ | 2 (Open Trivia DB, SuperHeroes) | 5 (PokéAPI, Disney, D&D) | 游戏数据可做问答素材 |
| Geocoding | 80+ | 2 (REST Countries, Nominatim) | 3 (Mapbox, Google Maps, OpenCage) | 地理编码是天气/地图的基础设施 |
| Machine Learning | 30+ | 0 | 4 (Hugging Face, Perspective, Clarifai) | 内容审核/NSFW 过滤未来可用 |
| Music | 35+ | 0 | 3 (iTunes Search, Radio Browser, Lyrics.ovh) | 音乐教育价值有限，版权风险 |
| News | 20+ | 0 | 1 (Spaceflight News) | 新闻内容不适合低龄儿童 |
| Open Data | 40+ | 0 | 3 (Wikidata, Wikipedia, Nobel Prize) | 数据偏学术/成人向 |
| Science & Math | 35+ | 7 (Numbers, Open Notify, USGS, SpaceX, NASA, Sunrise, Ocean Facts) | 5 (Newton, Launch Library, GBIF, World Bank, USGS Water) | 科学启蒙是核心教育场景 |
| Sports & Fitness | 40+ | 1 (Sport List & Data) | 2 (NBA Stats, balldontlie) | 体育知识偏竞技向 |
| Text Analysis | 19 | 1 (LibreTranslate) | 3 (Perspective, Cloudmersive, Detect Language) | 内容审核/翻译辅助 |
| Weather | 30+ | 1 (Open-Meteo) | 3 (Weatherstack, OpenWeatherMap, Pirate Weather) | 天气是核心科普场景 |

**未纳入分析的分类**（与儿童教育关联度低）：Anime, Anti-Malware, Art & Design, Authentication, Blockchain, Business, Cloud Storage, Continuous Integration, Cryptocurrency, Currency Exchange, Data Validation, Development, Documents & Productivity, Email, Events, Finance, Government, Health, Jobs, Patent, Personality, Phone, Photography, Programming, Security, Shopping, Social, Test Data, Tracking, Transportation, URL Shorteners, Vehicle, Video。

这些分类中个别 API 可能有间接价值（如 Art & Design 的 Met Museum 艺术品数据可用于艺术启蒙），但开发成本高或内容偏专业，暂不纳入。
