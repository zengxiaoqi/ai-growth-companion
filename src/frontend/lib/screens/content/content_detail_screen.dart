import 'dart:convert' as _convert;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/content_provider.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../learning/structured_lesson_view.dart';

/// 内容详情页 - 展示课程封面、描述、学习按钮和推荐内容
class ContentDetailScreen extends StatefulWidget {
  final int contentId;
  final VoidCallback onBack;

  const ContentDetailScreen({
    super.key,
    required this.contentId,
    required this.onBack,
  });

  @override
  State<ContentDetailScreen> createState() => _ContentDetailScreenState();
}

class _ContentDetailScreenState extends State<ContentDetailScreen> {
  bool _isFavorite = false;
  bool _isStarting = false;
  bool _isCompleted = false;
  int _score = 85;
  String? _errorMessage;

  // 领域图标和颜色映射
  static const Map<String, _DomainInfo> _domainMap = {
    'language': _DomainInfo('语言', Icons.chat_bubble_rounded, AppTheme.primaryColor),
    'math': _DomainInfo('数学', Icons.calculate_rounded, AppTheme.secondaryColor),
    'science': _DomainInfo('科学', Icons.science_rounded, AppTheme.accentColor),
    'art': _DomainInfo('艺术', Icons.palette_rounded, Color(0xFFDDA0DD)),
    'social': _DomainInfo('社会', Icons.people_rounded, Color(0xFFFFCE4E)),
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadContent();
    });
  }

  void _loadContent() {
    final provider = context.read<ContentProvider>();
    provider.loadContentDetail(widget.contentId);
    provider.loadRecommendations(
      context.read<UserProvider>().currentUser?['id'] ?? 0,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Consumer<ContentProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading) {
            return const _LoadingView();
          }

          final content = provider.currentContent;
          if (content == null) {
            return _EmptyView(onBack: widget.onBack);
          }

          return _buildContent(context, content, provider);
        },
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> content,
    ContentProvider provider,
  ) {
    final title = content['title'] ?? '未知内容';
    final subtitle = content['subtitle'] ?? '';
    final thumbnail = content['thumbnail'] ?? '';
    final domain = content['domain'] ?? '';
    final ageRange = content['age_range'] ?? content['ageRange'] ?? '';
    final difficulty = content['difficulty'] ?? 1;
    final duration = content['duration_minutes'] ?? content['durationMinutes'] ?? 10;
    final description = _resolveDisplayText(content['content']);
    final domainInfo = _domainMap[domain] ??
        const _DomainInfo('学习', Icons.auto_awesome_rounded, AppTheme.primaryColor);

    return Stack(
      children: [
        // 主滚动内容
        CustomScrollView(
          slivers: [
            // 封面图 SliverAppBar
            _buildSliverAppBar(context, title, thumbnail, domainInfo, ageRange),

            // 内容信息
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 标题
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),

                    // 信息标签
                    _buildInfoTags(context, duration, difficulty, domainInfo),
                    const SizedBox(height: 20),

                    // 学习内容
                    if (description.isNotEmpty) ...[
                      _buildSectionTitle('学习内容', Icons.menu_book_rounded),
                      const SizedBox(height: 8),
                      _buildContentCard(description),
                      const SizedBox(height: 20),
                    ],

                    // 完成评估卡片
                    if (_isCompleted) ...[
                      _buildEvaluationCard(title),
                      const SizedBox(height: 20),
                    ],

                    // 推荐内容
                    if (provider.recommendations.isNotEmpty) ...[
                      _buildSectionTitle('相关推荐', Icons.recommend_rounded),
                      const SizedBox(height: 8),
                      _buildRecommendations(provider),
                      const SizedBox(height: 120),
                    ] else
                      const SizedBox(height: 120),
                  ],
                ),
              ),
            ),
          ],
        ),

        // 底部操作栏
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _buildBottomBar(context, content),
        ),
      ],
    );
  }

  Widget _buildSliverAppBar(
    BuildContext context,
    String title,
    String thumbnail,
    _DomainInfo domainInfo,
    String ageRange,
  ) {
    return SliverAppBar(
      expandedHeight: thumbnail.isNotEmpty ? 260 : 120,
      pinned: true,
      backgroundColor: domainInfo.color.withOpacity(0.1),
      leading: IconButton(
        icon: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.8),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.arrow_back_rounded, color: AppTheme.textColor),
        ),
        onPressed: widget.onBack,
      ),
      actions: [
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: IconButton(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.8),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color: _isFavorite ? AppTheme.primaryColor : AppTheme.textColor,
              ),
            ),
            onPressed: () => setState(() => _isFavorite = !_isFavorite),
          ),
        ),
      ],
      flexibleSpace: thumbnail.isNotEmpty
          ? FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  // 占位渐变背景
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          domainInfo.color.withOpacity(0.3),
                          domainInfo.color.withOpacity(0.1),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                  ),
                  // 这里可以替换为真实图片加载
                  Center(
                    child: Icon(
                      domainInfo.icon,
                      size: 80,
                      color: domainInfo.color.withOpacity(0.3),
                    ),
                  ),
                  // 底部渐变遮罩
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      height: 80,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            AppTheme.backgroundColor,
                          ],
                        ),
                      ),
                    ),
                  ),
                  // 领域标签
                  Positioned(
                    left: 20,
                    bottom: 16,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: domainInfo.color.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(domainInfo.icon, size: 16, color: Colors.white),
                          const SizedBox(width: 4),
                          Text(
                            '${domainInfo.label} · $ageRange 岁',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            )
          : null,
    );
  }

  Widget _buildInfoTags(
    BuildContext context,
    int duration,
    int difficulty,
    _DomainInfo domainInfo,
  ) {
    return Row(
      children: [
        _buildTag(
          icon: Icons.schedule_rounded,
          label: '$duration 分钟',
          color: AppTheme.primaryColor,
        ),
        const SizedBox(width: 10),
        _buildTag(
          icon: Icons.star_rounded,
          label: '难度 $difficulty',
          color: AppTheme.softYellow,
        ),
        const SizedBox(width: 10),
        _buildTag(
          icon: domainInfo.icon,
          label: domainInfo.label,
          color: domainInfo.color,
        ),
      ],
    );
  }

  Widget _buildTag({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppTheme.primaryColor),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppTheme.textColor,
          ),
        ),
      ],
    );
  }

  Widget _buildContentCard(String description) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Text(
        description,
        style: const TextStyle(
          fontSize: 14,
          height: 1.8,
          color: AppTheme.textColor,
        ),
      ),
    );
  }

  Widget _buildEvaluationCard(String title) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.primaryColor.withOpacity(0.9),
            const Color(0xFFFFA5B9).withOpacity(0.9),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.auto_awesome_rounded, size: 14, color: Colors.white),
                    SizedBox(width: 4),
                    Text(
                      'AI 评估',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            '太棒了！',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '你已经完成《$title》学习，获得 $_score 分。继续保持！',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withOpacity(0.9),
              height: 1.5,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _buildRewardBadge(Icons.check_circle_rounded, '+$_score 积分'),
              const SizedBox(width: 12),
              _buildRewardBadge(Icons.star_rounded, '+1 星星'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRewardBadge(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.2),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecommendations(ContentProvider provider) {
    final items = provider.recommendations.take(4).toList();
    return SizedBox(
      height: 140,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final item = items[index];
          return _RecommendCard(
            title: item['title'] ?? '未知',
            domain: item['domain'] ?? '',
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ContentDetailScreen(
                    contentId: item['id'],
                    onBack: () => Navigator.of(context).pop(),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildBottomBar(BuildContext context, Map<String, dynamic> content) {
    final userProvider = context.watch<UserProvider>();
    final currentUser = userProvider.currentUser;
    final childId = currentUser?['id'] as int?;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 错误提示
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        size: 16, color: AppTheme.warningColor),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppTheme.warningColor,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            if (_isCompleted)
              // 已完成：返回按钮
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: widget.onBack,
                  icon: const Icon(Icons.arrow_back_rounded),
                  label: const Text('返回主页'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.secondaryColor,
                  ),
                ),
              )
            else
              // 开始学习按钮
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: (_isStarting || childId == null)
                      ? null
                      : () => _handleStartLearning(context, content, childId),
                  icon: _isStarting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.play_arrow_rounded),
                  label: Text(
                    _isStarting ? '正在开始...' : '开始学习',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleStartLearning(
    BuildContext context,
    Map<String, dynamic> content,
    int childId,
  ) async {
    setState(() {
      _isStarting = true;
      _errorMessage = null;
    });

    try {
      final apiService = ApiService();
      final record = await apiService.startLearning(
        childId: childId,
        contentId: widget.contentId,
      );

      if (record == null) {
        setState(() => _errorMessage = '开始学习失败，请稍后再试');
        return;
      }

      // 判断是否为结构化课程
      final rawContent = content['content'];
      final isStructured = _isStructuredLesson(rawContent);

      if (isStructured && mounted) {
        // 进入结构化课程视图
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => StructuredLessonView(
              contentId: widget.contentId,
              childId: childId,
              onBack: () {
                Navigator.of(context).pop();
                setState(() => _isCompleted = true);
              },
            ),
          ),
        );
      } else {
        // 简单学习内容，直接标记完成
        await apiService.completeLearning(
          recordId: record['id'],
          score: _score,
          durationSeconds: 30,
        );
        if (mounted) {
          setState(() => _isCompleted = true);
        }
      }
    } catch (e) {
      setState(() => _errorMessage = '开始学习失败：$e');
    } finally {
      if (mounted) setState(() => _isStarting = false);
    }
  }

  /// 判断内容是否为结构化课程（包含 steps）
  bool _isStructuredLesson(dynamic rawContent) {
    if (rawContent == null) return false;
    try {
      final parsed = rawContent is String ? _parseJson(rawContent) : rawContent;
      if (parsed is Map && parsed.containsKey('steps')) {
        return (parsed['steps'] as List?)?.isNotEmpty ?? false;
      }
    } catch (_) {}
    return false;
  }

  /// 解析内容文本为可显示的字符串
  String _resolveDisplayText(dynamic rawContent) {
    if (rawContent == null) return '';
    if (rawContent is String) {
      final trimmed = rawContent.trim();
      if (trimmed.isEmpty) return '';
      final parsed = _parseJson(trimmed);
      if (parsed != null) return _flattenToText(parsed);
      return trimmed;
    }
    return _flattenToText(rawContent);
  }

  dynamic _parseJson(String s) {
    try {
      return _jsonCodec.decode(s);
    } catch (_) {
      return null;
    }
  }

  static const _jsonCodec = _JsonCodec();

  String _flattenToText(dynamic value, [int depth = 0]) {
    if (value == null) return '';
    if (value is String) return value.trim();
    if (value is num || value is bool) return value.toString();
    if (value is List) {
      return value.map((e) => _flattenToText(e, depth)).where((s) => s.isNotEmpty).join('\n');
    }
    if (value is Map) {
      final lines = <String>[];
      for (final entry in value.entries) {
        final childText = _flattenToText(entry.value, depth + 1);
        if (childText.isEmpty) continue;
        final key = entry.key.toString();
        if (childText.contains('\n')) {
          lines.add('$key：');
          lines.addAll(
            childText.split('\n').map((l) => '${'  ' * (depth + 1)}$l'),
          );
        } else {
          lines.add('$key：$childText');
        }
      }
      return lines.join('\n');
    }
    return '';
  }
}

// ─── 辅助组件 ────────────────────────────────────────────────────────────

class _DomainInfo {
  final String label;
  final IconData icon;
  final Color color;
  const _DomainInfo(this.label, this.icon, this.color);
}

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('学习详情'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: AppTheme.primaryColor),
            SizedBox(height: 16),
            Text(
              '正在加载内容...',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final VoidCallback onBack;
  const _EmptyView({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('学习详情'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: onBack,
        ),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.menu_book_rounded, size: 64, color: AppTheme.textSecondary),
            const SizedBox(height: 16),
            const Text(
              '内容不存在或已下线',
              style: TextStyle(fontSize: 16, color: AppTheme.textColor),
            ),
            const SizedBox(height: 8),
            const Text(
              '你可以返回学习主页，选择其他课程。',
              style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 24),
            ElevatedButton(onPressed: onBack, child: const Text('返回')),
          ],
        ),
      ),
    );
  }
}

class _RecommendCard extends StatelessWidget {
  final String title;
  final String domain;
  final VoidCallback onTap;

  const _RecommendCard({
    required this.title,
    required this.domain,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = const {
      'language': AppTheme.primaryColor,
      'math': AppTheme.secondaryColor,
      'science': AppTheme.accentColor,
      'art': Color(0xFFDDA0DD),
      'social': Color(0xFFFFCE4E),
    }[domain] ?? AppTheme.primaryColor;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 160,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color.withOpacity(0.15), color.withOpacity(0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.play_circle_outline_rounded, size: 28, color: color),
            const Spacer(),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: color.withOpacity(0.9),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 简易 JSON 解码器，基于 dart:convert
class _JsonCodec {
  const _JsonCodec();
  dynamic decode(String source) => _convert.jsonDecode(source);
}
