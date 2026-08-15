import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/video_download_models.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/animation_utils.dart';
import '../../components/app_card.dart';

class ChildVideoScreen extends StatefulWidget {
  const ChildVideoScreen({super.key});

  @override
  State<ChildVideoScreen> createState() => _ChildVideoScreenState();
}

class _ChildVideoScreenState extends State<ChildVideoScreen> {
  List<VideoDownloadItem> _videos = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadVideos();
  }

  Future<void> _loadVideos() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final userProvider = context.read<UserProvider>();
      final childId = userProvider.activeChildId;
      if (childId == null) {
        setState(() => _isLoading = false);
        return;
      }
      final apiService = userProvider.apiService;
      if (apiService == null) {
        setState(() => _isLoading = false);
        return;
      }
      final response = await apiService.dio.get('/video-download/child/$childId');
      final list = (response.data as List)
          .map((j) => VideoDownloadItem.fromJson(j as Map<String, dynamic>))
          .toList();
      if (mounted) {
        setState(() {
          _videos = list;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('ChildVideoScreen load error: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String _getVideoUrl(VideoDownloadItem item) {
    if (item.filePath == null) return '';
    final origin = ApiService.baseUrl.replaceAll('/api', '');
    return '$origin${item.filePath}';
  }

  void _playVideo(VideoDownloadItem item) {
    final url = _getVideoUrl(item);
    if (url.isEmpty) return;
    // Open in full-screen browser player
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _VideoPlayScreen(url: url, title: item.title ?? '视频'),
      ),
    );
  }

  void _downloadVideo(VideoDownloadItem item) {
    final url = _getVideoUrl(item);
    if (url.isEmpty) return;
    final filename = 'video_${item.id}.mp4';
    html.AnchorElement(href: url)
      ..download = filename
      ..click();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的视频'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '刷新',
            onPressed: _loadVideos,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _videos.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadVideos,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _videos.length,
                    itemBuilder: (context, index) {
                      final item = _videos[index];
                      return _ChildVideoCard(
                        item: item,
                        onPlay: () => _playVideo(item),
                        onDownload: () => _downloadVideo(item),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.video_library_rounded, size: 80, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          const Text(
            '还没有视频',
            style: TextStyle(fontSize: 18, color: Colors.grey, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 8),
          const Text(
            '让爸爸妈妈下载视频发布给你吧',
            style: TextStyle(fontSize: 14, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}

class _ChildVideoCard extends StatelessWidget {
  final VideoDownloadItem item;
  final VoidCallback onPlay;
  final VoidCallback onDownload;

  const _ChildVideoCard({
    required this.item,
    required this.onPlay,
    required this.onDownload,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: BounceIn(
        child: AppCard(
          padding: const EdgeInsets.all(0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Thumbnail / preview area — tap to play
              GestureDetector(
                onTap: onPlay,
                child: Stack(
                  children: [
                    AspectRatio(
                      aspectRatio: 16 / 9,
                      child: item.thumbnail != null && item.thumbnail!.isNotEmpty
                          ? Image.network(
                              item.thumbnail!,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              errorBuilder: (_, __, ___) => Container(
                                color: Colors.grey.shade200,
                                child: const Center(
                                  child: Icon(Icons.video_file, size: 48, color: Colors.grey),
                                ),
                              ),
                            )
                          : Container(
                              color: Colors.grey.shade200,
                              child: Center(
                                child: Icon(Icons.video_file, size: 48, color: Colors.grey.shade400),
                              ),
                            ),
                    ),
                    // Play button overlay
                    Positioned.fill(
                      child: Center(
                        child: Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.9),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.15),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.play_arrow_rounded, size: 36, color: AppTheme.primaryColor),
                        ),
                      ),
                    ),
                    // Duration badge
                    if (item.duration != null && item.duration! > 0)
                      Positioned(
                        right: 8,
                        bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            item.durationDisplay,
                            style: const TextStyle(fontSize: 12, color: Colors.white),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              // Info section
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title ?? '未命名视频',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textColor),
                          ),
                          if (item.uploader != null && item.uploader!.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Icon(Icons.person, size: 12, color: Colors.grey.shade500),
                                const SizedBox(width: 4),
                                Text(
                                  item.uploader!,
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: Icon(Icons.download_rounded, color: AppTheme.primaryColor, size: 22),
                      tooltip: '下载到本地',
                      onPressed: onDownload,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen video playback using an HTML5 <video> element via dart:html
class _VideoPlayScreen extends StatefulWidget {
  final String url;
  final String title;
  const _VideoPlayScreen({required this.url, required this.title});

  @override
  State<_VideoPlayScreen> createState() => _VideoPlayScreenState();
}

class _VideoPlayScreenState extends State<_VideoPlayScreen> {
  html.VideoElement? _video;

  @override
  void initState() {
    super.initState();
    _createVideo();
  }

  void _createVideo() {
    _video = html.VideoElement()
      ..src = widget.url
      ..controls = true
      ..autoplay = true
      ..style.width = '100%'
      ..style.height = '100%'
      ..style.objectFit = 'contain';
    html.document.body?.append(_video!);
  }

  @override
  void dispose() {
    _video?.remove();
    _video = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.title, style: const TextStyle(color: Colors.white, fontSize: 16)),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Center(
        child: _video != null
            ? SizedBox(
                width: double.infinity,
                height: MediaQuery.of(context).size.height * 0.6,
                child: const Center(
                  child: Text('正在加载视频...', style: TextStyle(color: Colors.white54)),
                ),
              )
            : const Center(
                child: Text('无法加载视频', style: TextStyle(color: Colors.white54)),
              ),
      ),
    );
  }
}