
import '../utils/app_logger.dart';
import 'api_service.dart';

final _log = AppLogger('PoetryService');

/// 诗词数据模型
class Poem {
  final int id;
  final String title;
  final String content;
  final String? type;
  final Author? author;
  final Dynasty? dynasty;

  Poem({
    required this.id,
    required this.title,
    required this.content,
    this.type,
    this.author,
    this.dynasty,
  });

  factory Poem.fromJson(Map<String, dynamic> json) {
    String content = '';
    if (json['content'] is String) {
      content = json['content'] as String;
    } else if (json['content'] is List) {
      content = (json['content'] as List).join('\n');
    }

    return Poem(
      id: json['id'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      content: content,
      type: json['type'] as String?,
      author: json['author'] != null ? Author.fromJson(json['author']) : null,
      dynasty: json['dynasty'] != null ? Dynasty.fromJson(json['dynasty']) : null,
    );
  }

  /// 获取内容行列表
  List<String> get contentLines => content.split('\n').where((l) => l.isNotEmpty).toList();
}

/// 作者模型
class Author {
  final int id;
  final String name;

  Author({required this.id, required this.name});

  factory Author.fromJson(Map<String, dynamic> json) {
    return Author(
      id: json['id'] as int? ?? 0,
      name: json['name'] as String? ?? '',
    );
  }
}

/// 朝代模型
class Dynasty {
  final int id;
  final String name;
  final String? nameZhHant;
  final int? sortOrder;

  Dynasty({required this.id, required this.name, this.nameZhHant, this.sortOrder});

  factory Dynasty.fromJson(Map<String, dynamic> json) {
    return Dynasty(
      id: json['id'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      nameZhHant: json['nameZhHant'] as String?,
      sortOrder: json['sortOrder'] as int?,
    );
  }
}

/// 诗词分页结果
class PoetryPageResult {
  final List<Poem> list;
  final int total;
  final int page;
  final int pageSize;

  PoetryPageResult({
    required this.list,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  factory PoetryPageResult.fromJson(Map<String, dynamic> json) {
    return PoetryPageResult(
      list: (json['list'] as List?)
              ?.map((e) => Poem.fromJson(e))
              .toList() ??
          [],
      total: json['total'] as int? ?? 0,
      page: json['page'] as int? ?? 1,
      pageSize: json['pageSize'] as int? ?? 20,
    );
  }
}

/// 诗词服务
class PoetryService {
  final ApiService _apiService;

  PoetryService(this._apiService);

  /// 获取诗词列表
  Future<PoetryPageResult> getPoems({
    int page = 1,
    int pageSize = 20,
    String lang = 'zh-Hans',
  }) async {
    try {
      final response = await _apiService.dio.get(
        '/poetry',
        queryParameters: {
          'page': page,
          'page_size': pageSize,
          'lang': lang,
        },
      );
      return PoetryPageResult.fromJson(response.data);
    } catch (e) {
      _log.severe('获取诗词列表失败: $e');
      rethrow;
    }
  }

  /// 搜索诗词
  Future<PoetryPageResult> searchPoems({
    required String query,
    String searchType = 'all',
    int page = 1,
    int pageSize = 20,
    String lang = 'zh-Hans',
  }) async {
    try {
      final response = await _apiService.dio.get(
        '/poetry/search',
        queryParameters: {
          'q': query,
          'type': searchType,
          'page': page,
          'page_size': pageSize,
          'lang': lang,
        },
      );
      return PoetryPageResult.fromJson(response.data);
    } catch (e) {
      _log.severe('搜索诗词失败: $e');
      rethrow;
    }
  }

  /// 随机诗词
  Future<Poem?> getRandomPoem({
    String? author,
    String? dynasty,
    String? type,
    String? char,
    String lang = 'zh-Hans',
  }) async {
    try {
      final queryParameters = <String, dynamic>{'lang': lang};
      if (author != null && author.isNotEmpty) queryParameters['author'] = author;
      if (dynasty != null && dynasty.isNotEmpty) queryParameters['dynasty'] = dynasty;
      if (type != null && type.isNotEmpty) queryParameters['type'] = type;
      if (char != null && char.isNotEmpty) queryParameters['char'] = char;

      final response = await _apiService.dio.get(
        '/poetry/random',
        queryParameters: queryParameters,
      );
      if (response.data == null) return null;
      return Poem.fromJson(response.data);
    } catch (e) {
      _log.severe('获取随机诗词失败: $e');
      rethrow;
    }
  }

  /// 获取诗词详情
  Future<Poem?> getPoemById(int id, {String lang = 'zh-Hans'}) async {
    try {
      final response = await _apiService.dio.get(
        '/poetry/$id',
        queryParameters: {'lang': lang},
      );
      if (response.data == null) return null;
      return Poem.fromJson(response.data);
    } catch (e) {
      _log.severe('获取诗词详情失败: $e');
      rethrow;
    }
  }

  /// 获取朝代列表
  Future<List<Dynasty>> getDynasties() async {
    try {
      final response = await _apiService.dio.get('/poetry/dynasties');
      return (response.data as List)
          .map((e) => Dynasty.fromJson(e))
          .toList();
    } catch (e) {
      _log.severe('获取朝代列表失败: $e');
      rethrow;
    }
  }

  /// 获取诗词体裁列表
  Future<List<Map<String, dynamic>>> getTypes() async {
    try {
      final response = await _apiService.dio.get('/poetry/types');
      return (response.data as List)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (e) {
      _log.severe('获取诗词体裁列表失败: $e');
      rethrow;
    }
  }

  /// 获取统计信息
  Future<Map<String, dynamic>> getStatistics() async {
    try {
      final response = await _apiService.dio.get('/poetry/statistics');
      return response.data;
    } catch (e) {
      _log.severe('获取统计信息失败: $e');
      rethrow;
    }
  }

  /// 填字游戏：随机挖空诗句
  Future<FillBlankGame> fetchFillBlankGame() async {
    try {
      final response = await _apiService.dio.get('/poetry/game/fill-blank');
      return FillBlankGame.fromJson(response.data);
    } catch (e) {
      _log.severe('获取填字游戏失败: $e');
      rethrow;
    }
  }

  /// 飞花令：按字查诗句
  Future<FlyingFlowerGame> fetchFlyingFlowerGame(String keyword) async {
    try {
      final response = await _apiService.dio.get(
        '/poetry/game/flying-flower',
        queryParameters: {'keyword': keyword},
      );
      return FlyingFlowerGame.fromJson(response.data);
    } catch (e) {
      _log.severe('获取飞花令失败: $e');
      rethrow;
    }
  }

  /// 诗词接龙
  Future<SolitaireGame> fetchSolitaireGame() async {
    try {
      final response = await _apiService.dio.get('/poetry/game/solitaire');
      return SolitaireGame.fromJson(response.data);
    } catch (e) {
      _log.severe('获取诗词接龙失败: $e');
      rethrow;
    }
  }
}

/// 填字游戏数据模型
class FillBlankGame {
  final int poemId;
  final String title;
  final String? authorName;
  final String? dynastyName;
  final List<String> lines;
  final List<int> blankIndices;
  final List<String> answers;
  final List<String> candidates;
  final String? appreciation;

  FillBlankGame({
    required this.poemId,
    required this.title,
    this.authorName,
    this.dynastyName,
    required this.lines,
    required this.blankIndices,
    required this.answers,
    required this.candidates,
    this.appreciation,
  });

  factory FillBlankGame.fromJson(Map<String, dynamic> json) {
    return FillBlankGame(
      poemId: json['poemId'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      authorName: json['authorName'] as String?,
      dynastyName: json['dynastyName'] as String?,
      lines: (json['lines'] as List?)?.map((e) => e.toString()).toList() ?? [],
      blankIndices: (json['blankIndices'] as List?)?.map((e) => e as int).toList() ?? [],
      answers: (json['answers'] as List?)?.map((e) => e.toString()).toList() ?? [],
      candidates: (json['candidates'] as List?)?.map((e) => e.toString()).toList() ?? [],
      appreciation: json['appreciation'] as String?,
    );
  }
}

/// 飞花令数据模型
class FlyingFlowerGame {
  final String keyword;
  final List<FlyingFlowerEntry> entries;

  FlyingFlowerGame({required this.keyword, required this.entries});

  factory FlyingFlowerGame.fromJson(Map<String, dynamic> json) {
    return FlyingFlowerGame(
      keyword: json['keyword'] as String? ?? '',
      entries: (json['entries'] as List?)
              ?.map((e) => FlyingFlowerEntry.fromJson(e))
              .toList() ??
          [],
    );
  }
}

class FlyingFlowerEntry {
  final int poemId;
  final String title;
  final String? authorName;
  final String? dynastyName;
  final String line;
  final String fullContent;

  FlyingFlowerEntry({
    required this.poemId,
    required this.title,
    this.authorName,
    this.dynastyName,
    required this.line,
    required this.fullContent,
  });

  factory FlyingFlowerEntry.fromJson(Map<String, dynamic> json) {
    String content = '';
    if (json['fullContent'] is String) {
      content = json['fullContent'] as String;
    } else if (json['fullContent'] is List) {
      content = (json['fullContent'] as List).join('\n');
    }
    return FlyingFlowerEntry(
      poemId: json['poemId'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      authorName: json['authorName'] as String?,
      dynastyName: json['dynastyName'] as String?,
      line: json['line'] as String? ?? '',
      fullContent: content,
    );
  }
}

/// 诗词接龙数据模型
class SolitaireGame {
  final int poemId;
  final String title;
  final String? authorName;
  final String? dynastyName;
  final String currentLine;
  final List<String> options;
  final int correctIndex;

  SolitaireGame({
    required this.poemId,
    required this.title,
    this.authorName,
    this.dynastyName,
    required this.currentLine,
    required this.options,
    required this.correctIndex,
  });

  factory SolitaireGame.fromJson(Map<String, dynamic> json) {
    return SolitaireGame(
      poemId: json['poemId'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      authorName: json['authorName'] as String?,
      dynastyName: json['dynastyName'] as String?,
      currentLine: json['currentLine'] as String? ?? '',
      options: (json['options'] as List?)?.map((e) => e.toString()).toList() ?? [],
      correctIndex: json['correctIndex'] as int? ?? 0,
    );
  }
}
