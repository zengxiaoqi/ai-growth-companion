class VideoDownloadItem {
  final int id;
  final int parentId;
  final int? childId;
  final String sourceUrl;
  final String? title;
  final String? thumbnail;
  final String? platform;
  final String? uploader;
  final int? duration;
  final String? filePath;
  final int? fileSize;
  final String status; // pending, downloading, completed, failed
  final String? errorMessage;
  final bool publishedToChild;
  final DateTime createdAt;

  VideoDownloadItem({
    required this.id,
    required this.parentId,
    this.childId,
    required this.sourceUrl,
    this.title,
    this.thumbnail,
    this.platform,
    this.uploader,
    this.duration,
    this.filePath,
    this.fileSize,
    required this.status,
    this.errorMessage,
    required this.publishedToChild,
    required this.createdAt,
  });

  factory VideoDownloadItem.fromJson(Map<String, dynamic> json) {
    return VideoDownloadItem(
      id: json['id'] as int,
      parentId: json['parentId'] as int,
      childId: json['childId'] as int?,
      sourceUrl: json['sourceUrl'] as String,
      title: json['title'] as String?,
      thumbnail: json['thumbnail'] as String?,
      platform: json['platform'] as String?,
      uploader: json['uploader'] as String?,
      duration: json['duration'] != null ? (json['duration'] as num).toInt() : null,
      filePath: json['filePath'] as String?,
      fileSize: json['fileSize'] as int?,
      status: json['status'] as String,
      errorMessage: json['errorMessage'] as String?,
      publishedToChild: json['publishedToChild'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  String get platformDisplayName {
    switch (platform) {
      case 'douyin':
        return '抖音';
      case 'bilibili':
        return '哔哩哔哩';
      case 'tencent':
        return '腾讯视频';
      case 'youtube':
        return 'YouTube';
      case 'twitter':
        return 'X / 推特';
      case 'tiktok':
        return 'TikTok';
      case 'higgsfield':
        return 'Higgsfield';
      case 'weibo':
        return '微博';
      case 'kuaishou':
        return '快手';
      case 'toutiao':
        return '今日头条';
      case 'ixigua':
        return '西瓜视频';
      case 'xiaohongshu':
        return '小红书';
      case 'youku':
        return '优酷';
      case 'iqiyi':
        return '爱奇艺';
      case 'sohu':
        return '搜狐视频';
      case 'acfun':
        return 'AcFun';
      default:
        return platform != null ? platform! : '未知';
    }
  }

  String get fileSizeDisplay {
    if (fileSize == null) return '';
    final mb = fileSize! / (1024 * 1024);
    if (mb >= 1) return '${mb.toStringAsFixed(1)} MB';
    final kb = fileSize! / 1024;
    return '${kb.toStringAsFixed(0)} KB';
  }

  String get durationDisplay {
    if (duration == null) return '';
    final m = duration! ~/ 60;
    final s = duration! % 60;
    return '${m}:${s.toString().padLeft(2, '0')}';
  }

  String get statusDisplay {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'downloading':
        return '下载中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  }

  String get videoUrl {
    // filePath is relative: /uploads/videos/xxx.mp4
    // Frontend constructs full URL via api baseUrl
    if (filePath == null) return '';
    return filePath!;
  }
}
