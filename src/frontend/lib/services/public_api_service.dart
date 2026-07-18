import 'package:dio/dio.dart';
import 'api_service.dart';
import '../utils/app_logger.dart';

final _log = AppLogger('PublicApiService');

/// 灵犀伴学公共 API 服务 — 通过后端 `/api/public/*` 代理访问外部公共数据。
///
/// 所有方法返回 null 而非抛异常（儿童应用不允许崩溃），调用方判空降级即可。
class PublicApiService {
  static PublicApiService? _instance;
  static PublicApiService get instance {
    _instance ??= PublicApiService._();
    return _instance!;
  }

  late final Dio _dio;

  PublicApiService._() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiService.baseUrl,   // 复用主服务 base url（同源 /api）
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
    ));
  }

  // --- 天气 ---

  /// 通过城市名获取天气（后端内置中国城市坐标表）。
  /// 返回 {city, lat, lng, weather: {current:{temperature_2m,...}, daily:{sunrise,sunset}}}
  Future<Map<String, dynamic>?> getWeatherByCity(String city) async {
    try {
      final resp = await _dio.get(
        '/public/weather/by-city',
        queryParameters: {'city': city},
      );
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('weather failed: $e');
      return null;
    }
  }

  // --- 国家 ---

  /// 每日一国（后端按日期 seed）
  Future<Map<String, dynamic>?> getDailyCountry() async {
    try {
      final resp = await _dio.get('/public/country/daily');
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('dailyCountry failed: $e');
      return null;
    }
  }

  /// 全部国家（内置 30 国数据包）
  Future<List<dynamic>?> getAllCountries() async {
    try {
      final resp = await _dio.get('/public/country/all');
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('allCountries failed: $e');
      return null;
    }
  }

  // --- 数字趣闻 ---

  Future<Map<String, dynamic>?> getNumberFact(int number) async {
    try {
      final resp = await _dio.get('/public/number/$number');
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('numberFact failed: $e');
      return null;
    }
  }

  // --- 太空 ---

  /// ISS 实时位置 {latitude, longitude, altitude_km, velocity_kmh, visibility, timestamp}
  Future<Map<String, dynamic>?> getIssPosition() async {
    try {
      final resp = await _dio.get('/public/iss');
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('iss failed: $e');
      return null;
    }
  }

  /// 太空中的宇航员 {number, people: [{name, country, countryflag, ...}]}
  Future<Map<String, dynamic>?> getPeopleInSpace() async {
    try {
      final resp = await _dio.get('/public/space-people');
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('spacePeople failed: $e');
      return null;
    }
  }

  // --- 自然 ---

  /// 日出日落（传 lat/lng）
  Future<Map<String, dynamic>?> getSunriseSunset(double lat, double lng) async {
    try {
      final resp = await _dio.get(
        '/public/sun',
        queryParameters: {'lat': lat, 'lng': lng},
      );
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('sunriseSunset failed: $e');
      return null;
    }
  }

  /// USGS 地震数据（GeoJSON FeatureCollection）
  Future<Map<String, dynamic>?> getEarthquakes() async {
    try {
      final resp = await _dio.get('/public/earthquakes');
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('earthquakes failed: $e');
      return null;
    }
  }

  /// 水果百科
  Future<List<dynamic>?> getFruits() async {
    try {
      final resp = await _dio.get('/public/fruits');
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('fruits failed: $e');
      return null;
    }
  }

  // --- 游戏 / 语言 ---

  /// Open Trivia DB 题库
  /// 返回 {response_code, results: [{type, difficulty, category, question, correct_answer, incorrect_answers}, ...]}
  Future<Map<String, dynamic>?> getTrivia({
    int amount = 10,
    String difficulty = 'easy',
    String? category,
  }) async {
    try {
      final resp = await _dio.get(
        '/public/trivia',
        queryParameters: {
          'amount': amount,
          'difficulty': difficulty,
          if (category != null) 'category': category,
        },
      );
      return resp.data as Map<String, dynamic>;
    } catch (e) {
      _log.warning('trivia failed: $e');
      return null;
    }
  }

  /// 词典查询（英文单词）— 404 返回 null
  Future<List<dynamic>?> getDictionaryEntry(String word) async {
    try {
      final resp = await _dio.get('/public/dictionary/${Uri.encodeComponent(word)}');
      // 后端在 404 时返回 null
      if (resp.data == null) return null;
      return resp.data as List<dynamic>;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      _log.warning('dictionary failed: $e');
      return null;
    } catch (e) {
      _log.warning('dictionary failed: $e');
      return null;
    }
  }

  /// 地理编码（城市名 → 坐标）
  Future<List<dynamic>?> geocode(String city) async {
    try {
      final resp = await _dio.get(
        '/public/geocode',
        queryParameters: {'city': city},
      );
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('geocode failed: $e');
      return null;
    }
  }

  // ─── B1: Bored API — 亲子活动推荐 ───

  /// 获取一个随机儿童友好活动
  /// 返回 {activity, type, participants, price, accessibility, kidFriendly, ...}
  Future<Map<String, dynamic>?> getKidFriendlyActivity() async {
    try {
      final resp = await _dio.get('/public/activity');
      if (resp.data == null) return null;
      return Map<String, dynamic>.from(resp.data as Map);
    } catch (e) {
      _log.warning('activity failed: $e');
      return null;
    }
  }

  /// 按类型筛选活动（返回数组）
  Future<List<dynamic>?> getActivitiesByType(String type) async {
    try {
      final resp = await _dio.get(
        '/public/activity/filter',
        queryParameters: {'type': type},
      );
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('activity filter failed: $e');
      return null;
    }
  }

  // ─── B2: PoetryDB — 英文经典诗歌 ───

  /// 获取一首随机英文诗歌
  /// 返回 [{title, author, lines: [...], linecount: "N"}]
  Future<Map<String, dynamic>?> getRandomPoem() async {
    try {
      final resp = await _dio.get('/public/poem/random');
      if (resp.data == null) return null;
      final list = resp.data as List<dynamic>;
      if (list.isEmpty) return null;
      return Map<String, dynamic>.from(list[0] as Map);
    } catch (e) {
      _log.warning('poem random failed: $e');
      return null;
    }
  }

  /// 按作者搜索诗歌
  Future<List<dynamic>?> getPoemsByAuthor(String author) async {
    try {
      final resp = await _dio.get(
        '/public/poem/author',
        queryParameters: {'name': author},
      );
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('poem author failed: $e');
      return null;
    }
  }

  /// 按标题搜索诗歌
  Future<List<dynamic>?> getPoemsByTitle(String title) async {
    try {
      final resp = await _dio.get(
        '/public/poem/title',
        queryParameters: {'title': title},
      );
      return resp.data as List<dynamic>;
    } catch (e) {
      _log.warning('poem title failed: $e');
      return null;
    }
  }

  // ─── C1: 翻译 (MyMemory) ───

  /// 翻译文本，默认 en→zh
  /// 返回 {responseData: {translatedText: "你好"}, matches: [...]}
  Future<Map<String, dynamic>?> translate(
    String text, {
    String source = 'en',
    String target = 'zh',
  }) async {
    try {
      final resp = await _dio.get(
        '/public/translate',
        queryParameters: {
          'q': text,
          'source': source,
          'target': target,
        },
      );
      if (resp.data == null) return null;
      return Map<String, dynamic>.from(resp.data as Map);
    } catch (e) {
      _log.warning('translate failed: $e');
      return null;
    }
  }

  // ─── C3: JokeAPI ───

  /// 获取儿童友好笑话（safe-mode）
  /// 返回 {category, type: 'single'|'twopart', joke?, setup?, delivery?}
  Future<Map<String, dynamic>?> getJoke({String category = 'Any'}) async {
    try {
      final resp = await _dio.get(
        '/public/joke',
        queryParameters: {'category': category},
      );
      if (resp.data == null) return null;
      return Map<String, dynamic>.from(resp.data as Map);
    } catch (e) {
      _log.warning('joke failed: $e');
      return null;
    }
  }

  // ─── C4: Useless Facts ───

  /// 今日趣闻
  /// 返回 {id, text, source, ...}
  Future<Map<String, dynamic>?> getTodayFact() async {
    try {
      final resp = await _dio.get('/public/fact/today');
      if (resp.data == null) return null;
      return Map<String, dynamic>.from(resp.data as Map);
    } catch (e) {
      _log.warning('fact today failed: $e');
      return null;
    }
  }

  /// 随机趣闻
  Future<Map<String, dynamic>?> getRandomFact() async {
    try {
      final resp = await _dio.get('/public/fact/random');
      if (resp.data == null) return null;
      return Map<String, dynamic>.from(resp.data as Map);
    } catch (e) {
      _log.warning('fact random failed: $e');
      return null;
    }
  }
}
