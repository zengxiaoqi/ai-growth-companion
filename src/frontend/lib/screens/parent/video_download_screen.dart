import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

/// Picks a child from the parent's children list, returns the child id.
/// Shows a bottom sheet with child options.
Future<int?> _pickChild(BuildContext context, {String? title}) {
  return showModalBottomSheet<int>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) {
      return _ChildPickerSheet(title: title);
    },
  );
}

class _ChildPickerSheet extends StatefulWidget {
  final String? title;
  const _ChildPickerSheet({this.title});

  @override
  State<_ChildPickerSheet> createState() => _ChildPickerSheetState();
}

class _ChildPickerSheetState extends State<_ChildPickerSheet>
    with SingleTickerProviderStateMixin {
  List<Map<String, dynamic>> _children = [];
  bool _loading = true;
  late AnimationController _animCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic);
    _loadChildren();
    _animCtrl.forward();
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
        setState(() => _children = childList);
      }
    } catch (e) {
      _log.warning('Load children error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).padding.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              const SizedBox(width: 20),
              Icon(Icons.child_care, color: AppTheme.primaryColor, size: 24),
              const SizedBox(width: 8),
              Text(
                widget.title ?? '发布给孩子观看',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(),
            )
          else if (_children.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Text('暂无孩子账号', style: TextStyle(color: Colors.grey)),
            )
          else
            ...List.generate(_children.length, (i) {
              final child = _children[i];
              final id = child['id'] as int?;
              final name = child['name']?.toString() ?? '孩子';
              final avatar = child['avatar']?.toString();
              return FadeTransition(
                opacity: _fadeAnim,
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: AppTheme.childColors[i % AppTheme.childColors.length],
                    child: avatar != null && avatar.isNotEmpty
                        ? ClipOval(
                            child: Image.network(avatar, fit: BoxFit.cover, width: 40, height: 40, errorBuilder: (_, __, ___) => Text(name[0], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
                          )
                        : Text(name[0], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                  title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: const Icon(Icons.send_rounded, color: AppTheme.primaryColor),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  onTap: () => Navigator.pop(context, id),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class VideoDownloadScreen extends StatefulWidget {
  const VideoDownloadScreen({super.key});

  @override
  State<VideoDownloadScreen> createState() => _VideoDownloadScreenState();
}

class _VideoDownloadScreenState extends State<VideoDownloadScreen>
    with SingleTickerProviderStateMixin {
  final _urlController = TextEditingController();

  late TabController _tabCtrl;
  late AnimationController _batchBarAnimCtrl;
  late Animation<double> _batchBarAnim;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _batchBarAnimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _batchBarAnim = CurvedAnimation(
      parent: _batchBarAnimCtrl,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final provider = context.read<VideoDownloadProvider>();
    if (provider.downloads.isEmpty && !provider.isLoading) {
      provider.loadDownloads();
    }
  }

  @override
  void dispose() {
    _urlController.dispose();
    _tabCtrl.dispose();
    _batchBarAnimCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitDownload() async {
    final raw = _urlController.text.trim();
    if (raw.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入视频链接'), backgroundColor: Colors.red),
      );
      return;
    }

    final urls = raw
        .split(RegExp(r'[\s\n]+'))
        .where((u) => u.startsWith('http://') || u.startsWith('https://'))
        .toList();

    if (urls.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('未找到有效的视频链接'), backgroundColor: Colors.red),
      );
      return;
    }

    final provider = context.read<VideoDownloadProvider>();
    int successCount = 0;
    int failCount = 0;

    for (final url in urls) {
      final error = await provider.createDownload(url);
      if (error != null) {
        failCount++;
      } else {
        successCount++;
      }
    }

    _urlController.clear();

    if (!mounted) return;

    String msg;
    Color bg;
    if (failCount == 0) {
      msg = '已创建 $successCount 个下载任务';
      bg = Colors.green;
    } else if (successCount > 0) {
      msg = '成功 $successCount 个，失败 $failCount 个';
      bg = Colors.orange;
    } else {
      msg = '下载失败: $failCount 个任务均创建失败';
      bg = Colors.red;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: bg, duration: const Duration(seconds: 2)),
    );
  }

  void _enterBatchMode() {
    final provider = context.read<VideoDownloadProvider>();
    provider.enterBatchMode();
    _batchBarAnimCtrl.forward();
  }

  void _exitBatchMode() {
    final provider = context.read<VideoDownloadProvider>();
    provider.exitBatchMode();
    _batchBarAnimCtrl.reverse();
  }

  Future<void> _showPublishDialog({int? singleId}) async {
    final childId = await _pickChild(context);
    if (childId == null || !mounted) return;
    final provider = context.read<VideoDownloadProvider>();
    if (singleId != null) {
      await provider.publishToChild(singleId, childId);
    } else {
      await provider.batchPublish(childId);
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(singleId != null ? '已发布给孩子' : '已批量发布给该孩子'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _batchDeleteConfirm() async {
    final provider = context.read<VideoDownloadProvider>();
    final count = provider.selectedIds.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('批量删除'),
        content: Text('确定要删除选中的 $count 个视频吗？\n（视频文件也将一并删除）'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await provider.batchDelete();
      _exitBatchMode();
    }
  }

  Future<void> _batchRetry() async {
    final provider = context.read<VideoDownloadProvider>();
    await provider.batchRetry();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已重试失败任务'), backgroundColor: Colors.orange),
      );
    }
  }

  void _playVideo(VideoDownloadItem item) {
    if (item.filePath == null) return;
    final provider = context.read<VideoDownloadProvider>();
    final url = provider.getVideoUrl(item);

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _VideoPlayerScreen(
          url: url,
          title: item.title ?? '视频播放',
          itemId: item.id,
        ),
      ),
    );
  }

  void _confirmDelete(VideoDownloadItem item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
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

  void _confirmReDownload(VideoDownloadItem item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('重新下载'),
        content: Text('确定要重新下载 "${item.title ?? '此视频'}" 吗？\n\n如果原文件还在，将跳过下载。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context.read<VideoDownloadProvider>().reDownload(item.id);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.orange),
            child: const Text('重新下载'),
          ),
        ],
      ),
    );
  }

  void _cancelDownload(VideoDownloadItem item) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
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

  void _showEditUrlDialog(VideoDownloadItem item) {
    final urlController = TextEditingController(text: item.sourceUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('修改链接'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('当前链接下载失败，请输入新的链接重新下载：', style: TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: urlController,
              decoration: InputDecoration(
                hintText: '粘贴新的视频链接...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              keyboardType: TextInputType.url,
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          ElevatedButton(
            onPressed: () async {
              final newUrl = urlController.text.trim();
              if (newUrl.isEmpty) return;
              Navigator.pop(ctx);
              try {
                await context.read<VideoDownloadProvider>().updateUrl(item.id, newUrl);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('链接已更新，正在重新下载...'), backgroundColor: Colors.green),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('更新失败: $e'), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: const Text('保存并重新下载'),
          ),
        ],
      ),
    );
  }

  void _copyDownloadLink(VideoDownloadItem item) {
    final provider = context.read<VideoDownloadProvider>();
    final url = provider.getVideoUrl(item);
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('下载链接不可用'), backgroundColor: Colors.red),
      );
      return;
    }
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('下载链接已复制到剪贴板'), backgroundColor: Colors.green, duration: Duration(seconds: 2)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('视频下载'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        actions: [
          Consumer<VideoDownloadProvider>(
            builder: (context, provider, _) {
              if (provider.batchMode) {
                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${provider.selectedIds.length}', style: const TextStyle(color: Colors.white, fontSize: 14)),
                    const SizedBox(width: 4),
                    IconButton(
                      icon: const Icon(Icons.select_all, size: 20),
                      tooltip: '全选/取消',
                      onPressed: provider.allSelected ? provider.deselectAll : provider.selectAll,
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      tooltip: '退出批量模式',
                      onPressed: _exitBatchMode,
                    ),
                  ],
                );
              }
              final totalCount = provider.completed.length + provider.failed.length;
              if (totalCount == 0) return const SizedBox.shrink();
              return Stack(
                children: [
                  IconButton(
                    icon: const Icon(Icons.checklist, size: 22),
                    tooltip: '批量操作',
                    onPressed: _enterBatchMode,
                  ),
                  if (totalCount > 0)
                    Positioned(
                      right: 6,
                      top: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '$totalCount',
                          style: TextStyle(fontSize: 9, color: AppTheme.primaryColor, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
      body: Consumer<VideoDownloadProvider>(
        builder: (context, provider, _) {
          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () => provider.loadDownloads(),
                child: CustomScrollView(
                  slivers: [
                    SliverToBoxAdapter(child: _buildInputCard(provider)),
                    // Tab bar
                    SliverToBoxAdapter(
                      child: Container(
                        margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Row(
                            children: [
                              _buildTab('下载中', provider.inProgress.length, 0, AppTheme.secondaryColor, Icons.downloading_rounded),
                              const SizedBox(width: 4),
                              _buildTab('已完成', provider.completed.length, 1, AppTheme.successColor, Icons.check_circle_outline),
                              const SizedBox(width: 4),
                              _buildTab('失败', provider.failed.length, 2, AppTheme.errorColor, Icons.error_outline),
                            ],
                          ),
                        ),
                      ),
                    ),
                    // Tab content
                    if (provider.isLoading && provider.downloads.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.all(40),
                          child: Center(child: CircularProgressIndicator()),
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
                              Text('还没有下载任务', style: TextStyle(color: Colors.grey, fontSize: 16)),
                              SizedBox(height: 4),
                              Text('粘贴视频链接开始下载', style: TextStyle(color: Colors.grey, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                    // Tab 0: In Progress
                    if (_tabCtrl.index == 0)
                      ..._buildCardList(provider.inProgress, provider, (item) => _DownloadCard(
                        key: ValueKey(item.id),
                        item: item,
                        batchMode: provider.batchMode,
                        isSelected: provider.selectedIds.contains(item.id),
                        onTap: provider.batchMode ? () => provider.toggleSelection(item.id) : null,
                        onPlay: null,
                        onTogglePublish: null,
                        onRetry: null,
                        onCancel: () => _cancelDownload(item),
                        onDelete: () => _confirmDelete(item),
                        onEditUrl: null,
                        onCopyLink: null,
                      )),
                    // Tab 1: Completed
                    if (_tabCtrl.index == 1)
                      ..._buildCardList(provider.completed, provider, (item) => _DownloadCard(
                        key: ValueKey(item.id),
                        item: item,
                        batchMode: provider.batchMode,
                        isSelected: provider.selectedIds.contains(item.id),
                        onTap: provider.batchMode ? () => provider.toggleSelection(item.id) : null,
                        onPlay: () => _playVideo(item),
                        onTogglePublish: () => _showPublishDialog(singleId: item.id),
                        onRetry: null,
                        onReDownload: () => _confirmReDownload(item),
                        onDelete: () => _confirmDelete(item),
                        onEditUrl: null,
                        onCopyLink: () => _copyDownloadLink(item),
                      )),
                    // Tab 2: Failed
                    if (_tabCtrl.index == 2)
                      ..._buildCardList(provider.failed, provider, (item) => _DownloadCard(
                        key: ValueKey(item.id),
                        item: item,
                        batchMode: provider.batchMode,
                        isSelected: provider.selectedIds.contains(item.id),
                        onTap: provider.batchMode ? () => provider.toggleSelection(item.id) : null,
                        onPlay: null,
                        onTogglePublish: null,
                        onRetry: () => provider.retryDownload(item.id),
                        onDelete: () => _confirmDelete(item),
                        onEditUrl: () => _showEditUrlDialog(item),
                        onCopyLink: null,
                      )),
                    const SliverToBoxAdapter(child: SizedBox(height: 100)),
                  ],
                ),
              ),
              // Batch action bar at bottom
              if (provider.batchMode)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: FadeTransition(
                    opacity: _batchBarAnim,
                    child: _buildBatchActionBar(provider),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildTab(String label, int count, int index, Color color, IconData icon) {
    final isSelected = _tabCtrl.index == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tabCtrl.index = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: isSelected
                ? [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: isSelected ? color : Colors.grey),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? color : Colors.grey,
                ),
              ),
              if (count > 0) ...[
                const SizedBox(width: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: isSelected ? color.withValues(alpha: 0.15) : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(fontSize: 10, color: isSelected ? color : Colors.grey, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildCardList(List<VideoDownloadItem> items, VideoDownloadProvider provider, Widget Function(VideoDownloadItem) cardBuilder) {
    if (items.isEmpty) {
      final emptyMsg = _tabCtrl.index == 0 ? '没有进行中的下载' : (_tabCtrl.index == 1 ? '没有已完成的任务' : '没有失败的任务');
      return [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(40),
            child: Column(
              children: [
                Icon(Icons.inbox_rounded, size: 48, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                Text(emptyMsg, style: const TextStyle(color: Colors.grey, fontSize: 14)),
              ],
            ),
          ),
        ),
      ];
    }
    return [
      SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            if (index >= items.length) return null;
            return cardBuilder(items[index]);
          },
          childCount: items.length,
        ),
      ),
    ];
  }

  Widget _buildInputCard(VideoDownloadProvider provider) {
    return Card(
      margin: const EdgeInsets.all(16),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            colors: [Colors.white, AppTheme.backgroundColor.withValues(alpha: 0.5)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.download_rounded, color: AppTheme.primaryColor, size: 24),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('无水印视频下载', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textColor)),
                        SizedBox(height: 2),
                        Text('支持抖音、B站、快手、小红书等平台', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _urlController,
                decoration: InputDecoration(
                  hintText: '粘贴视频链接，支持批量粘贴...',
                  hintStyle: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                  prefixIcon: const Icon(Icons.link, size: 20, color: AppTheme.primaryColor),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Colors.grey.shade200),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Colors.grey.shade200),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppTheme.primaryColor, width: 2),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
                keyboardType: TextInputType.url,
                maxLines: 3,
                minLines: 1,
                onSubmitted: (_) => _submitDownload(),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _submitDownload,
                  icon: const Icon(Icons.download_rounded, size: 20),
                  label: const Text('开始下载', style: TextStyle(fontSize: 16)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.info_outline, size: 12, color: AppTheme.textSecondary),
                    const SizedBox(width: 4),
                    const Text('下载完成后可发布给孩子观看', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBatchActionBar(VideoDownloadProvider provider) {
    final hasCompleted = provider.selectedItems.any((d) => d.status == 'completed');
    final hasFailed = provider.selectedItems.any((d) => d.status == 'failed');
    final count = provider.selectedIds.length;

    if (count == 0) {
      return const SizedBox.shrink();
    }

    /// Batch download to local for all selected completed items
    void _batchDownloadLocal() {
      final urls = provider.getSelectedVideoUrls();
      if (urls.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('没有可下载的视频'), backgroundColor: Colors.red),
        );
        return;
      }
      // Trigger download for each URL (Web: one at a time via anchor click)
      for (final url in urls) {
        final filename = 'video_${DateTime.now().millisecondsSinceEpoch}.mp4';
        downloadToLocal(url, filename);
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已触发 ${urls.length} 个视频下载'), backgroundColor: Colors.teal, duration: const Duration(seconds: 2)),
      );
    }

    /// Batch copy video links
    void _batchCopyLinks() {
      final urls = provider.getSelectedVideoUrls();
      if (urls.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('没有可复制的链接'), backgroundColor: Colors.red),
        );
        return;
      }
      final links = urls.join('\n');
      Clipboard.setData(ClipboardData(text: links));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已复制 ${urls.length} 个视频链接'), backgroundColor: Colors.teal, duration: const Duration(seconds: 2)),
      );
    }

    /// Batch re-download confirm
    void _batchReDownloadConfirm() {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('批量重新下载'),
          content: Text('确定要重新下载选中的 ${provider.selectedItems.where((d) => d.status == 'completed').length} 个视频吗？\n\n如果原文件还在，将跳过下载。'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            TextButton(
              onPressed: () async {
                Navigator.pop(ctx);
                await provider.batchReDownload();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('已开始重新下载'), backgroundColor: Colors.orange),
                  );
                }
              },
              style: TextButton.styleFrom(foregroundColor: Colors.orange),
              child: const Text('重新下载'),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            Text('已选 $count 项', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textColor)),
            const SizedBox(width: 12),
            if (hasCompleted)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _BatchActionButton(
                  icon: Icons.file_download,
                  label: '下载到本地',
                  color: AppTheme.primaryColor,
                  onTap: _batchDownloadLocal,
                ),
              ),
            if (hasCompleted)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _BatchActionButton(
                  icon: Icons.copy,
                  label: '复制链接',
                  color: Colors.teal,
                  onTap: _batchCopyLinks,
                ),
              ),
            if (hasCompleted)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _BatchActionButton(
                  icon: Icons.replay,
                  label: '重新下载',
                  color: Colors.orange,
                  onTap: _batchReDownloadConfirm,
                ),
              ),
            if (hasCompleted)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _BatchActionButton(
                  icon: Icons.visibility,
                  label: '发布',
                  color: AppTheme.successColor,
                  onTap: () => _showPublishDialog(),
                ),
              ),
            if (hasFailed)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _BatchActionButton(
                  icon: Icons.refresh,
                  label: '重试',
                  color: Colors.orange,
                  onTap: _batchRetry,
                ),
              ),
            _BatchActionButton(
              icon: Icons.delete_outline,
              label: '删除',
              color: Colors.red,
              onTap: _batchDeleteConfirm,
            ),
          ],
        ),
      ),
    );
  }
}

class _BatchActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _BatchActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontSize: 13, color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _DownloadCard extends StatefulWidget {
  final VideoDownloadItem item;
  final bool batchMode;
  final bool isSelected;
  final VoidCallback? onTap;
  final VoidCallback? onPlay;
  final VoidCallback? onTogglePublish;
  final VoidCallback? onRetry;
  final VoidCallback? onReDownload;
  final VoidCallback? onCancel;
  final VoidCallback? onDelete;
  final VoidCallback? onEditUrl;
  final VoidCallback? onCopyLink;

  const _DownloadCard({
    super.key,
    required this.item,
    this.batchMode = false,
    this.isSelected = false,
    this.onTap,
    this.onPlay,
    this.onTogglePublish,
    this.onRetry,
    this.onReDownload,
    this.onCancel,
    this.onDelete,
    this.onEditUrl,
    this.onCopyLink,
  });

  @override
  State<_DownloadCard> createState() => _DownloadCardState();
}

class _DownloadCardState extends State<_DownloadCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  late AnimationController _pressCtrl;
  late Animation<double> _pressAnim;

  VideoDownloadItem get item => widget.item;

  @override
  void initState() {
    super.initState();
    _pressCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    );
    _pressAnim = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _pressCtrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _pressCtrl.dispose();
    super.dispose();
  }

  void _onTapDown(_) => _pressCtrl.forward();
  void _onTapUp(_) {
    _pressCtrl.reverse();
    if (widget.batchMode) {
      widget.onTap?.call();
    } else {
      setState(() => _expanded = !_expanded);
    }
  }
  void _onTapCancel() => _pressCtrl.reverse();

  @override
  Widget build(BuildContext context) {
    final isFailed = item.status == 'failed';
    final isCompleted = item.status == 'completed';
    final isInProgress = item.status == 'pending' || item.status == 'downloading';

    return AnimatedBuilder(
      animation: _pressAnim,
      builder: (context, child) {
        return Transform.scale(scale: _pressAnim.value, child: child);
      },
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        elevation: widget.isSelected ? 4 : 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: widget.isSelected
              ? BorderSide(color: AppTheme.primaryColor, width: 2)
              : BorderSide.none,
        ),
        color: widget.isSelected ? AppTheme.primaryColor.withValues(alpha: 0.05) : Colors.white,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InkWell(
              borderRadius: BorderRadius.circular(14),
              onTapDown: _onTapDown,
              onTapUp: _onTapUp,
              onTapCancel: _onTapCancel,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: [
                    // Selection checkbox in batch mode
                    if (widget.batchMode) ...[
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: widget.isSelected ? AppTheme.primaryColor : Colors.grey.shade400,
                            width: 2,
                          ),
                          color: widget.isSelected ? AppTheme.primaryColor : Colors.transparent,
                        ),
                        child: widget.isSelected
                            ? const Icon(Icons.check, size: 16, color: Colors.white)
                            : null,
                      ),
                      const SizedBox(width: 10),
                    ],
                    // Thumbnail or status icon
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: SizedBox(
                        width: 56,
                        height: 56,
                        child: isCompleted && item.thumbnail != null && item.thumbnail!.isNotEmpty
                            ? Image.network(
                                item.thumbnail!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _buildPlaceholderIcon(isInProgress),
                              )
                            : _buildPlaceholderIcon(isInProgress),
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
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTheme.textColor),
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
                    if (!widget.batchMode)
                      Icon(
                        _expanded ? Icons.expand_less : Icons.expand_more,
                        color: Colors.grey,
                        size: 20,
                      ),
                  ],
                ),
              ),
            ),
            // Expandable metadata (only when not in batch mode)
            if (!widget.batchMode && _expanded) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 16,
                      runSpacing: 4,
                      children: [
                        if (item.uploader != null && item.uploader!.isNotEmpty)
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
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.error_outline, size: 14, color: Colors.red.shade400),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                item.errorMessage!,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 11, color: Colors.red.shade700),
                              ),
                            ),
                          ],
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
                  if (widget.onPlay != null)
                    _ActionChip(
                      icon: Icons.play_arrow,
                      label: '播放',
                      color: AppTheme.primaryColor,
                      isPrimary: true,
                      onTap: widget.onPlay,
                    ),
                  if (isCompleted && item.filePath != null)
                    _ActionChip(
                      icon: Icons.file_download,
                      label: '下载到本地',
                      color: AppTheme.primaryColor,
                      isPrimary: false,
                      onTap: () => _downloadToLocal(context, item),
                    ),
                  if (widget.onTogglePublish != null)
                    _ActionChip(
                      icon: item.publishedToChild ? Icons.visibility : Icons.send_rounded,
                      label: item.publishedToChild ? '已发布' : '发布给孩子',
                      color: item.publishedToChild ? AppTheme.successColor : AppTheme.secondaryColor,
                      isPrimary: false,
                      onTap: widget.onTogglePublish,
                    ),
                  if (widget.onRetry != null)
                    _ActionChip(
                      icon: Icons.refresh,
                      label: '重试',
                      color: Colors.orange,
                      isPrimary: false,
                      onTap: widget.onRetry,
                    ),
                  if (isFailed && widget.onEditUrl != null)
                    _ActionChip(
                      icon: Icons.edit,
                      label: '编辑链接',
                      color: Colors.blue,
                      isPrimary: false,
                      onTap: widget.onEditUrl,
                    ),
                  if (isCompleted && item.filePath != null && widget.onCopyLink != null)
                    _ActionChip(
                      icon: Icons.copy,
                      label: '复制链接',
                      color: Colors.teal,
                      isPrimary: false,
                      onTap: widget.onCopyLink,
                    ),
                  if (isCompleted && widget.onReDownload != null)
                    _ActionChip(
                      icon: Icons.replay,
                      label: '重新下载',
                      color: Colors.orange,
                      isPrimary: false,
                      onTap: widget.onReDownload,
                    ),
                  if (widget.onCancel != null)
                    _ActionChip(
                      icon: Icons.cancel_outlined,
                      label: '取消下载',
                      color: Colors.orange,
                      isPrimary: false,
                      onTap: widget.onCancel,
                    ),
                  if (widget.onDelete != null)
                    _ActionChip(
                      icon: Icons.delete_outline,
                      label: '删除',
                      color: Colors.red,
                      isPrimary: false,
                      onTap: widget.onDelete,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceholderIcon(bool isInProgress) {
    return Container(
      color: Colors.grey.shade100,
      child: Icon(
        item.status == 'completed' ? Icons.video_library : Icons.downloading,
        color: Colors.grey.shade400,
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
        color = AppTheme.successColor;
      case 'downloading':
      case 'pending':
        color = AppTheme.secondaryColor;
      case 'failed':
        color = AppTheme.errorColor;
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

  Future<void> _downloadToLocal(BuildContext context, VideoDownloadItem item) async {
    try {
      final provider = context.read<VideoDownloadProvider>();
      final url = provider.getVideoUrl(item);

      final safeTitle = (item.title ?? 'video')
          .replaceAll(RegExp(r'[\\/:*?\"<>|#]'), '_')
          .replaceAll(RegExp(r'\\s+'), ' ')
          .trim();
      final ext = item.filePath!.endsWith('.mp4') ? '.mp4' : '.mp4';
      final filename = '${safeTitle}_无水印$ext';

      await downloadToLocal(url, filename);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('下载完成: $filename'),
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
          SnackBar(content: Text('下载失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final bool isPrimary;
  final VoidCallback? onTap;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.color,
    this.isPrimary = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (isPrimary) {
      return ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 16),
        label: Text(label, style: const TextStyle(fontSize: 12)),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          elevation: 0,
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      );
    }
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 14),
      label: Text(label, style: TextStyle(fontSize: 11, color: color)),
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withValues(alpha: 0.4)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}

/// Video player screen
class _VideoPlayerScreen extends StatefulWidget {
  final String url;
  final String title;
  final int? itemId;

  const _VideoPlayerScreen({
    required this.url,
    required this.title,
    this.itemId,
  });

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
        title: Text(widget.title, style: const TextStyle(fontSize: 16)),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: _hasError
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  const Text('视频加载失败', style: TextStyle(fontSize: 16, color: Colors.red)),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _hasError = false;
                        _isInitialized = false;
                      });
                      if (kIsWeb) {
                        _initWebPlayer();
                      } else {
                        _initMobilePlayer();
                      }
                    },
                    child: const Text('重新加载'),
                  ),
                ],
              )
            : kIsWeb
                ? HtmlElementView(viewType: _viewType)
                : _controller != null
                    ? AspectRatio(
                        aspectRatio: _controller!.value.aspectRatio,
                        child: VideoPlayer(_controller!),
                      )
                    : const CircularProgressIndicator(),
      ),
    );
  }
}