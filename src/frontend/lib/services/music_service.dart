import 'api_service.dart';

/// 音乐曲目（后端 music 模块返回的 token 能力 URL）
class MusicTrack {
  final String title;
  final String artist;
  final String url;
  final int? durationS;

  const MusicTrack({
    required this.title,
    required this.artist,
    required this.url,
    this.durationS,
  });

  factory MusicTrack.fromJson(Map<String, dynamic> json) {
    return MusicTrack(
      title: json['title'] as String? ?? '',
      artist: json['artist'] as String? ?? '',
      url: json['url'] as String? ?? '',
      durationS: (json['duration_s'] as num?)?.toInt(),
    );
  }

  /// 完整播放地址（baseUrl 已含 /api 前缀）
  String get audioUrl => '${ApiService.baseUrl}$url';

  String get durationLabel {
    final s = durationS;
    if (s == null || s <= 0) return '';
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }
}

class MusicSearchResult {
  final bool enabled;
  final List<MusicTrack> tracks;

  const MusicSearchResult({required this.enabled, required this.tracks});
}

/// 音乐搜索服务 — 复用共享 ApiService 实例（携带 JWT）
class MusicService {
  final ApiService _api;

  MusicService(this._api);

  Future<MusicSearchResult> search(String query, {int limit = 10}) async {
    final response = await _api.dio.get(
      '/music/search',
      queryParameters: {'q': query, 'limit': limit},
    );
    final data = response.data as Map<String, dynamic>;
    final list = (data['tracks'] as List? ?? [])
        .map((j) => MusicTrack.fromJson(j as Map<String, dynamic>))
        .where((t) => t.url.isNotEmpty)
        .toList();
    return MusicSearchResult(
      enabled: data['enabled'] as bool? ?? false,
      tracks: list,
    );
  }
}