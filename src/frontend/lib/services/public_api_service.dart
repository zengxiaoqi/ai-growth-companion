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
}
