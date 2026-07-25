import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'web_video_impl.dart';
import '../../models/video_download_models.dart';
import '../../providers/video_download_provider.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_logger.dart';

final _log = AppLogger('VideoDownloadScreen');

class VideoDownloadScreen extends StatefulWidget {
  const VideoDownloadScreen({super.key});

  @override
  State<VideoDownloadScreen> createState() => _VideoDownloadScreenState();
}

class _VideoDownloadScreenState extends State<VideoDownloadScreen> {
  final _urlController = TextEditingController();
  int? _selectedChildId;
  List<Map<String, dynamic>> _children = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _loadChildren();
    final provider = context.read<VideoDownloadProvider>();
    if (provider.downloads.isEmpty && !provider.isLoading) {
      provider.loadDownloads();
    }
  }

  Future<void> _loadChildren() async {
    try {
      final userProvider = context.read<UserProvider>();
      final api = context.read<ApiService>();
      final parentId = userProvider.currentUser?['parentId'] is int
          ? userProvider.currentUser!['parentId'] as int
          : userProvider.currentUser?['id'] is int
              ? userProvider.currentUser!['id'] as int
              : null;
      if (parentId == null) return;
      final children = await api.getChildrenByParent(parentId);
      final childList = children
          .whereType<Map>()
          .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
          .toList();
      if (mounted) {
        setState(() {
          _children = childList;
          if (_selectedChildId == null && childList.isNotEmpty) {
            final firstId = childList.first['id'];
            if (firstId is int) _selectedChildId = firstId;
          }
        });
      }
    } catch (e) {
      _log.warning('Load children error: $e');
    }
  }

  Future<void> _submitDownload() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入视频链接'), backgroundColor: Colors.red),
      );
      return;
    }

    final provider = context.read<VideoDownloadProvider>();
    final error = await provider.createDownload(url, childId: _selectedChildId);

    if (error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('下载失败: $error'),
          backgroundColor: Colors.red,
        ),
      );
    } else {
      _urlController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('下载任务已创建，正在后台下载...'),
            backgroundColor: Colors.green,
          ),
        );
      }
    }
  }

  Future<void> _playVideo(VideoDownloadItem item) async {
    if (item.filePath == null) return;
    final provider = context.read<VideoDownloadProvider>();
    final url = provider.getVideoUrl(item);

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _VideoPlayerScreen(
          url: url,
          title: item.title ?? '视频播放',
        ),
      ),
    );
  }

  void _confirmDelete(VideoDownloadItem item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除视频'),
        content: Text('确定要删除 "${item.title ?? '此视频'}" 吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<VideoDownloadProvider>().deleteDownload(item.id);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );
  }

  void _cancelDownload(VideoDownloadItem item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('取消下载'),
        content: Text('确定要取消 "${item.title ?? '此视频'}" 的下载吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('继续下载')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<VideoDownloadProvider>().cancelDownload(item.id);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('取消下载'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('视频下载'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: Consumer<VideoDownloadProvider>(
        builder: (context, provider, _) {
          return RefreshIndicator(
            onRefresh: () => provider.loadDownloads(),
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _buildInputCard(provider)),
                if (provider.isLoading && provider.downloads.isEmpty)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                if (provider.inProgress.isNotEmpty)
                  SliverToBoxAdapter(child: _buildSectionHeader('下载中', provider.inProgress.length)),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      if (index >= provider.inProgress.length) return null;
                      final item = provider.inProgress[index];
                      return _DownloadCard(
                        item: item,
                        onPlay: null,
                        onTogglePublish: null,
                        onRetry: null,
                        onCancel: () => _cancelDownload(item),
                        onDelete: () => _confirmDelete(item),
                      );
                    },
                    childCount: provider.inProgress.length,
                  ),
                ),
                if (provider.completed.isNotEmpty)
                  SliverToBoxAdapter(child: _buildSectionHeader('已完成', provider.completed.length)),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      if (index >= provider.completed.length) return null;
                      final item = provider.completed[index];
                      return _DownloadCard(
                        item: item,
                        onPlay: () => _playVideo(item),
                        onTogglePublish: () => provider.togglePublish(item.id),
                        onRetry: null,
                        onDelete: () => _confirmDelete(item),
                      );
                    },
                    childCount: provider.completed.length,
                  ),
                ),
                if (provider.failed.isNotEmpty)
                  SliverToBoxAdapter(child: _buildSectionHeader('下载失败', provider.failed.length)),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      if (index >= provider.failed.length) return null;
                      final item = provider.failed[index];
                      return _DownloadCard(
                        item: item,
                        onPlay: null,
                        onTogglePublish: null,
                        onRetry: () => provider.retryDownload(item.id),
                        onDelete: () => _confirmDelete(item),
                      );
                    },
                    childCount: provider.failed.length,
                  ),
                ),
                if (provider.downloads.isEmpty && !provider.isLoading)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Column(
                        children: [
                          Icon(Icons.video_library, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('还没有下载任务', style: TextStyle(color: Colors.grey)),
                          Text('粘贴视频链接开始下载', style: TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 100)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String title, int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '$count',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInputCard(VideoDownloadProvider provider) {
    return Card(
      margin: const EdgeInsets.all(16),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.download_rounded, color: AppTheme.primaryColor, size: 24),
                const SizedBox(width: 8),
                const Text('无水印视频下载', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              '支持抖音、头条、B站、快手、小红书、优酷、爱奇艺等平台',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                hintText: '粘贴视频链接...',
                hintStyle: const TextStyle(color: Colors.grey),
                prefixIcon: const Icon(Icons.link),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppTheme.primaryColor, width: 2),
                ),
              ),
              keyboardType: TextInputType.url,
              onSubmitted: (_) => _submitDownload(),
            ),
            if (_children.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('发布给孩子：', style: TextStyle(fontSize: 13)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      value: _selectedChildId,
                      decoration: InputDecoration(
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                      ),
                      items: _children.map((child) {
                        final id = child['id'] as int?;
                        final name = child['name'] ?? '孩子';
                        return DropdownMenuItem<int>(
                          value: id,
                          child: Text(name.toString(), style: const TextStyle(fontSize: 13)),
                        );
                      }).toList(),
                      onChanged: (val) => setState(() => _selectedChildId = val),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _submitDownload,
                icon: const Icon(Icons.download_rounded),
                label: const Text('开始下载'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DownloadCard extends StatefulWidget {
  final VideoDownloadItem item;
  final VoidCallback? onPlay;
  final VoidCallback? onTogglePublish;
  final VoidCallback? onRetry;
  final VoidCallback? onCancel;
  final VoidCallback? onDelete;

  const _DownloadCard({
    required this.item,
    this.onPlay,
    this.onTogglePublish,
    this.onRetry,
    this.onCancel,
    this.onDelete,
  });

  @override
  State<_DownloadCard> createState() => _DownloadCardState();
}

class _DownloadCardState extends State<_DownloadCard> {
  bool _expanded = false;

  VideoDownloadItem get item => widget.item;
  VoidCallback? get onPlay => widget.onPlay;
  VoidCallback? get onTogglePublish => widget.onTogglePublish;
  VoidCallback? get onRetry => widget.onRetry;
  VoidCallback? get onCancel => widget.onCancel;
  VoidCallback? get onDelete => widget.onDelete;

  @override
  Widget build(BuildContext context) {
    final isFailed = item.status == 'failed';
    final isCompleted = item.status == 'completed';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  // Thumbnail or status icon
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: isCompleted && item.thumbnail != null
                          ? Image.network(
                              item.thumbnail!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _buildPlaceholderIcon(),
                            )
                          : _buildPlaceholderIcon(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title ?? item.sourceUrl,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _buildPlatformChip(),
                            const SizedBox(width: 6),
                            _buildStatusChip(),
                            if (item.duration != null && item.duration! > 0) ...[
                              const SizedBox(width: 6),
                              Text(
                                item.durationDisplay,
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: Colors.grey,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Video metadata
                  Wrap(
                    spacing: 16,
                    runSpacing: 4,
                    children: [
                      if (item.uploader != null)
                        _metaRow(Icons.person_outline, item.uploader!),
                      if (item.fileSize != null && item.fileSize! > 0)
                        _metaRow(Icons.storage, item.fileSizeDisplay),
                      _metaRow(Icons.link, item.sourceUrl.length > 40
                          ? '${item.sourceUrl.substring(0, 37)}...'
                          : item.sourceUrl),
                    ],
                  ),
                  if (isFailed && item.errorMessage != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        item.errorMessage!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: Colors.red.shade700),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
          // Action buttons — always visible
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                    if (onPlay != null)
                      ElevatedButton.icon(
                        onPressed: onPlay,
                        icon: const Icon(Icons.play_arrow, size: 18),
                        label: const Text('播放'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    if (isCompleted && item.filePath != null)
                      OutlinedButton.icon(
                        onPressed: () => _downloadToLocal(context, item),
                        icon: const Icon(Icons.file_download, size: 18),
                        label: const Text('下载到本地'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppTheme.primaryColor,
                          side: BorderSide(color: AppTheme.primaryColor),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    if (onTogglePublish != null)
                      ElevatedButton.icon(
                        onPressed: onTogglePublish,
                        icon: Icon(
                          item.publishedToChild ? Icons.visibility : Icons.visibility_off,
                          size: 18,
                        ),
                        label: Text(item.publishedToChild ? '已发布' : '发布给孩子'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: item.publishedToChild
                              ? Colors.green
                              : Colors.grey.shade300,
                          foregroundColor: item.publishedToChild ? Colors.white : Colors.black87,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    if (onRetry != null)
                      OutlinedButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('重试'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.orange,
                          side: BorderSide(color: Colors.orange.shade300),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    if (onDelete != null)
                      OutlinedButton.icon(
                        onPressed: onDelete,
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: const Text('删除'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: BorderSide(color: Colors.red.shade300),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    if (onCancel != null)
                      OutlinedButton.icon(
                        onPressed: onCancel,
                        icon: const Icon(Icons.cancel_outlined, size: 18),
                        label: const Text('取消下载'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.orange,
                          side: BorderSide(color: Colors.orange.shade300),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlaceholderIcon() {
    return Container(
      color: Colors.grey.shade200,
      child: Icon(
        item.status == 'completed' ? Icons.video_library : Icons.downloading,
        color: Colors.grey,
        size: 28,
      ),
    );
  }

  Widget _buildPlatformChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: _platformColor().withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        item.platformDisplayName,
        style: TextStyle(fontSize: 10, color: _platformColor(), fontWeight: FontWeight.w500),
      ),
    );
  }

  Color _platformColor() {
    switch (item.platform) {
      case 'douyin':
        return const Color(0xFF000000);
      case 'bilibili':
        return const Color(0xFFFB7299);
      case 'tencent':
        return const Color(0xFF12B7F5);
      case 'youtube':
        return const Color(0xFFFF0000);
      case 'toutiao':
        return const Color(0xFFD43C33);
      case 'kuaishou':
        return const Color(0xFFFF4906);
      case 'xiaohongshu':
        return const Color(0xFFFF2442);
      case 'youku':
        return const Color(0xFF1FA6E6);
      case 'iqiyi':
        return const Color(0xFF07C160);
      default:
        return Colors.grey;
    }
  }

  Widget _buildStatusChip() {
    Color color;
    switch (item.status) {
      case 'completed':
        color = Colors.green;
      case 'downloading':
      case 'pending':
        color = Colors.orange;
      case 'failed':
        color = Colors.red;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (item.status == 'downloading' || item.status == 'pending')
            SizedBox(
              width: 10,
              height: 10,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          if (item.status == 'downloading' || item.status == 'pending')
            const SizedBox(width: 4),
          Text(
            item.statusDisplay,
            style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _metaRow(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.grey),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }

  /// Download video file to user's local device
  Future<void> _downloadToLocal(BuildContext context, VideoDownloadItem item) async {
    try {
      final provider = context.read<VideoDownloadProvider>();
      final url = provider.getVideoUrl(item);

      // Create a safe filename from the title
      final safeTitle = (item.title ?? 'video')
          .replaceAll(RegExp(r'[\\/:*?"<>|#]'), '_')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      final ext = item.filePath!.endsWith('.mp4') ? '.mp4' : '.mp4';
      final filename = '${safeTitle}_无水印$ext';

      // Download via platform-specific implementation
      await downloadToLocal(url, filename);

      // Show success feedback
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已开始下载: $filename'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 3),
          ),
        );
      }
      _log.info('Triggered local download: $filename from $url');
    } catch (e) {
      _log.warning('Download to local failed: $e');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('下载失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

/// Video player screen
///
/// On Web: uses native HTML5 `<video controls>` via [HtmlElementView] for
/// full browser-native playback controls (seek, volume, fullscreen, etc.).
/// The previous `video_player` overlay approach broke on Web because the
/// Flutter gesture-detector layer intercepted pointer events meant for the
/// underlying platform-view `<video>` element, making the progress bar and
/// playback controls unresponsive.
///
/// On mobile: uses `video_player` package with custom controls overlay.
class _VideoPlayerScreen extends StatefulWidget {
  final String url;
  final String title;

  const _VideoPlayerScreen({required this.url, required this.title});

  @override
  State<_VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<_VideoPlayerScreen> {
  static int _viewIdCounter = 0;

  // Web-only
  late String _viewType;

  // Mobile-only
  VideoPlayerController? _controller;

  bool _isInitialized = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      _initWebPlayer();
    } else {
      _initMobilePlayer();
    }
  }

  void _initWebPlayer() {
    _viewType = 'video-download-player-${_viewIdCounter++}';
    initWebVideoPlayer(_viewType, widget.url, () {
      _log.warning('HTML5 video error');
      if (mounted) setState(() => _hasError = true);
    }, () {
      if (mounted) setState(() => _isInitialized = true);
    });
  }

  void _initMobilePlayer() {
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller!.initialize().then((_) {
      if (mounted) {
        setState(() => _isInitialized = true);
        _controller!.setLooping(true);
        _controller!.play();
      }
    }).catchError((e) {
      _log.warning('Video player init error: $e');
      if (mounted) {
        setState(() => _hasError = true);
      }
    });
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      backgroundColor: Colors.black,
      body: Center(
        child: _hasError
            ? const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, color: Colors.white54, size: 48),
                  SizedBox(height: 16),
                  Text('视频加载失败', style: TextStyle(color: Colors.white54)),
                ],
              )
            : !_isInitialized
                ? const CircularProgressIndicator(color: Colors.white)
                : kIsWeb
                    ? HtmlElementView(viewType: _viewType)
                    : _buildMobilePlayer(),
      ),
    );
  }

  Widget _buildMobilePlayer() {
    return AspectRatio(
      aspectRatio: _controller!.value.aspectRatio,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          VideoPlayer(_controller!),
          // Play/Pause overlay
          Positioned.fill(
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _controller!.value.isPlaying
                      ? _controller!.pause()
                      : _controller!.play();
                });
              },
              child: ValueListenableBuilder(
                valueListenable: _controller!,
                builder: (context, VideoPlayerValue value, _) {
                  return value.isPlaying
                      ? const SizedBox.shrink()
                      : Center(
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(40),
                            ),
                            child: const Icon(
                              Icons.play_arrow,
                              color: Colors.white,
                              size: 40,
                            ),
                          ),
                        );
                },
              ),
            ),
          ),
          // Progress bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _VideoProgressBar(controller: _controller!),
          ),
        ],
      ),
    );
  }
}

class _VideoProgressBar extends StatefulWidget {
  final VideoPlayerController controller;

  const _VideoProgressBar({required this.controller});

  @override
  State<_VideoProgressBar> createState() => _VideoProgressBarState();
}

class _VideoProgressBarState extends State<_VideoProgressBar> {
  bool _dragging = false;
  double _dragValue = 0;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: widget.controller,
      builder: (context, VideoPlayerValue value, _) {
        final duration = value.duration.inMilliseconds.toDouble();
        final position = _dragging
            ? _dragValue * duration
            : value.position.inMilliseconds.toDouble();
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 4,
                child: Slider(
                  value: duration > 0 ? (position / duration).clamp(0, 1) : 0,
                  onChanged: (val) {
                    setState(() {
                      _dragging = true;
                      _dragValue = val;
                    });
                  },
                  onChangeEnd: (val) {
                    final newPos = Duration(
                      milliseconds: (val * duration).toInt(),
                    );
                    widget.controller.seekTo(newPos);
                    setState(() {
                      _dragging = false;
                    });
                  },
                  activeColor: Colors.white,
                  inactiveColor: Colors.white30,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _formatDuration(value.position),
                      style: const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                    Text(
                      _formatDuration(value.duration),
                      style: const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}
