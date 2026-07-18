/// WMO（世界气象组织）天气代码 → 儿童友好中文描述 + 科普小知识
///
/// 数据来源：WMO Weather interpretation codes (WW)
/// https://open-meteo.com/en/docs#weathervariables
/// 0  = 晴空无云
/// 1-3 = 晴 / 多云
/// 45,48 = 雾 / 雾凇
/// 51-57 = 毛毛雨（不同强度）
/// 61-67 = 雨（小/中/大，可能有冻雨）
/// 71-77 = 雪
/// 80-82 = 阵雨
/// 85-86 = 阵雪
/// 95 = 雷暴
/// 96-99 = 雷暴伴冰雹
///
/// 每个映射包含三段：
///   - emoji: 直观图标
///   - label: 儿童友好中文短语（≤8字）
///   - fact:  相关科普小知识（30-60字）
class WmoWeatherInfo {
  final String emoji;
  final String label;
  final String fact;

  const WmoWeatherInfo(this.emoji, this.label, this.fact);
}

const Map<int, WmoWeatherInfo> kWmoWeatherCodeMap = {
  0: WmoWeatherInfo('☀️', '晴空万里', '今天没有一朵云！太阳是地球最大的能量来源，它每秒发出的光要走 8 分钟才能到达地球。'),
  1: WmoWeatherInfo('🌤️', '大部分晴朗', '天空只有零星几朵云，云其实是由飘在高空的小水滴或冰晶组成的。'),
  2: WmoWeatherInfo('⛅', '局部多云', '云的形状会告诉你天气：像棉花糖一样的积云代表好天气，像被子一样的层云可能要下雨。'),
  3: WmoWeatherInfo('☁️', '阴天', '阴天云层很厚，挡住了阳光。但云也像一床被子，能让晚上不那么冷。'),
  45: WmoWeatherInfo('🌫️', '有雾', '雾就是飘在地面的云！当空气里的水汽遇冷凝结成小水滴，就形成了雾。'),
  48: WmoWeatherInfo('🌫️', '雾凇', '雾凇是雾里的过冷水滴碰到冷东西直接结成的冰晶，像树上开满了白花。'),
  51: WmoWeatherInfo('🌦️', '小毛毛雨', '毛毛雨的雨滴非常小，下落速度也很慢，像从云里飘下来的细丝。'),
  53: WmoWeatherInfo('🌦️', '毛毛雨', '毛毛雨的雨滴直径不到 0.5 毫米，比小米粒还小，但是能下很久。'),
  55: WmoWeatherInfo('🌧️', '大毛毛雨', '毛毛雨虽然小，但下久了路上也会积水。记得带伞哦！'),
  56: WmoWeatherInfo('🌧️', '冻毛毛雨', '冻雨是落到地面时会结冰的雨，路上会变滑，走路要小心。'),
  57: WmoWeatherInfo('🌧️', '大冻毛毛雨', '冻雨碰到地面结成冰壳，树枝和电线都会被冰包住，变得亮晶晶。'),
  61: WmoWeatherInfo('🌧️', '小雨', '小雨 24 小时降水量不到 10 毫米，差不多一个矿泉水瓶盖那么深。'),
  63: WmoWeatherInfo('🌧️', '中雨', '中雨 24 小时降水 10-25 毫米，能听到雨点打在窗户上啪嗒啪嗒响。'),
  65: WmoWeatherInfo('⛈️', '大雨', '大雨 24 小时降水超过 25 毫米，能见度变低，出门要注意安全。'),
  66: WmoWeatherInfo('🌧️', '冻雨', '冻雨是暖空气里的雨掉进冷空气层，碰到地面立刻结冰，比雪还滑！'),
  67: WmoWeatherInfo('🌧️', '大冻雨', '冻雨会在电线和树枝上结成厚厚的冰，可能压断树枝。'),
  71: WmoWeatherInfo('🌨️', '小雪', '雪花其实是冰晶！每片雪花都有六个角，而且世界上找不到两片完全相同的雪花。'),
  73: WmoWeatherInfo('🌨️', '中雪', '雪是白色的，但其实是透明的冰晶反光。雪能像棉被一样保护冬天的小麦苗。'),
  75: WmoWeatherInfo('❄️', '大雪', '大雪 24 小时降雪超过 5 毫米。雪越大越松软，踩上去会咯吱咯吱响。'),
  77: WmoWeatherInfo('❄️', '雪粒', '雪粒是细小冰珠，像盐粒一样，落在衣服上会弹起来。'),
  80: WmoWeatherInfo('🌦️', '小阵雨', '阵雨是突然下突然停的雨，常常出太阳的时候就开始下，所以叫"太阳雨"。'),
  81: WmoWeatherInfo('🌧️', '中阵雨', '阵雨来自积雨云，这种云像一座高高的山，顶部是平的。'),
  82: WmoWeatherInfo('⛈️', '大阵雨', '大阵雨很猛但很短，常常下几分钟就停了，雨后会出现彩虹！'),
  85: WmoWeatherInfo('🌨️', '小阵雪', '阵雪和阵雨一样来去匆匆，雪片在风里跳舞，特别好看。'),
  86: WmoWeatherInfo('❄️', '大阵雪', '大阵雪会很快在地上铺一层白，出门堆雪人的好时机！'),
  95: WmoWeatherInfo('⛈️', '雷暴', '打雷是云里的电放出来的声音！光比声音快得多，所以总是先看到闪电再听到雷。'),
  96: WmoWeatherInfo('⛈️', '雷暴伴小冰雹', '冰雹是积雨云里被吹上吹下的水滴冻成的冰球，小的像豆子，大的像鸡蛋。'),
  99: WmoWeatherInfo('⛈️', '雷暴伴大冰雹', '大冰雹很危险，砸到人会疼，砸到车会凹。遇到要赶紧躲进屋里。'),
};

const WmoWeatherInfo _kUnknownWeather = WmoWeatherInfo('🌡️', '天气数据', '天气和温度、湿度、风都有关系，多观察自然能学到很多知识。');

WmoWeatherInfo wmoWeatherInfo(int code) {
  return kWmoWeatherCodeMap[code] ?? _kUnknownWeather;
}
