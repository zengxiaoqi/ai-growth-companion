import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../components/shimmer_loading.dart';
import '../../components/top_bar.dart';
import '../games/quiz_game.dart';

/// 领域元数据
class DomainMeta {
  final String label;
  final IconData icon;
  final Color color;
  final Color backgroundColor;

  const DomainMeta({
    required this.label,
    required this.icon,
    required this.color,
    required this.backgroundColor,
  });
}

const Map<String, DomainMeta> kDomainMeta = {
  'language': DomainMeta(
    label: '语言',
    icon: Icons.chat_bubble_rounded,
    color: AppTheme.primaryColor,
    backgroundColor: Color(0xFFFFE4EB),
  ),
  'math': DomainMeta(
    label: '数学',
    icon: Icons.calculate_rounded,
    color: AppTheme.secondaryColor,
    backgroundColor: Color(0xFFE4F3FB),
  ),
  'science': DomainMeta(
    label: '科学',
    icon: Icons.science_rounded,
    color: AppTheme.accentColor,
    backgroundColor: Color(0xFFE4F8E0),
  ),
  'art': DomainMeta(
    label: '艺术',
    icon: Icons.palette_rounded,
    color: AppTheme.softPurple,
    backgroundColor: Color(0xFFF3E4F8),
  ),
  'social': DomainMeta(
    label: '社会',
    icon: Icons.people_rounded,
    color: Color(0xFFFFCE4E),
    backgroundColor: Color(0xFFFFF5E0),
  ),
};

const int kMinReadingSeconds = 20;

/// 内容详情页面
class ContentDetailScreen extends StatefulWidget {
  final int contentId;
  final int? childId;

  const ContentDetailScreen({
    super.key,
    required this.contentId,
    this.childId,
  });

  @override
  State<ContentDetailScreen> createState() => _ContentDetailScreenState();
}

class _ContentDetailScreenState extends State<ContentDetailScreen> {
  ApiService get _api => context.read<ApiService>();
  
  Map<String, dynamic>? _content;
  bool _isLoading = true;
  String? _error;

  // 学习状态
  Map<String, dynamic>? _learningRecord;
  bool _isStarting = false;
  bool _isCompleting = false;
  String? _startError;

  // 测验状态
  bool _isQuizMode = false;
  bool _quizCompleted = false;
  List<Map<String, dynamic>> _quizSections = [];

  // 评分和完成
  int _score = 85;
  bool _showEvaluation = false;

  // 学习时间追踪
  int _learningElapsedSeconds = 0;
  Timer? _learningTimer;
  bool _hasScrolledThroughContent = false;
  bool _hasPlayedAudio = false;

  // 滚动控制器
  final ScrollController _contentScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadContent();
    _contentScrollController.addListener(_onContentScroll);
  }

  @override
  void dispose() {
    _learningTimer?.cancel();
    _contentScrollController.dispose();
    super.dispose();
  }

  Future<void> _loadContent() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final data = await _api.getContentDetail(widget.contentId);
      if (data != null) {
        setState(() {
          _content = data;
          _isLoading = false;
          _parseQuizSections();
        });
      } else {
        setState(() {
          _error = '内容不存在或已下线';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = '加载失败：$e';
        _isLoading = false;
      });
    }
  }

  void _parseQuizSections() {
    if (_content == null) return;
    
    final raw = _content!['content'];
    if (raw == null) return;

    try {
      dynamic parsed;
      if (raw is String) {
        parsed = jsonDecode(raw);
      } else {
        parsed = raw;
      }

      if (parsed is List) {
        _quizSections = parsed
            .where((item) => item is Map && item['questions'] is List)
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
      }
    } catch (e) {
      print('Parse quiz sections error: $e');
      _quizSections = [];
    }
  }

  bool get _hasInteractiveContent => _quizSections.isNotEmpty;

  String get _displayText {
    if (_content == null) return '';
    
    final raw = _content!['content'];
    if (raw == null) return '';

    try {
      dynamic parsed;
      if (raw is String) {
        parsed = jsonDecode(raw);
      } else {
        parsed = raw;
      }

      if (parsed is String) return parsed;

      if (parsed is List) {
        // 尝试提取文本内容（过滤 quiz sections）
        final textBlocks = parsed.where((item) {
          if (item is Map && item['questions'] is List) return false;
          return true;
        }).map((item) {
          if (item is String) return item;
          if (item is Map) {
            final title = item['title']?.toString() ?? '';
            final text = item['text']?.toString() ?? '';
            if (title.isNotEmpty && text.isNotEmpty) return '$title\n$text';
            return title.isNotEmpty ? title : text;
          }
          return item.toString();
        }).where((t) => t.isNotEmpty).toList();

        if (textBlocks.isNotEmpty) {
          return textBlocks.join('\n\n');
        }
      }

      return raw.toString();
    } catch (e) {
      return raw.toString();
    }
  }

  DomainMeta get _domainMeta {
    if (_content == null) {
      return const DomainMeta(
        label: '学习',
        icon: Icons.auto_awesome_rounded,
        color: AppTheme.primaryColor,
        backgroundColor: Color(0xFFFFE4EB),
      );
    }
    final domain = _content!['domain']?.toString() ?? '';
    return kDomainMeta[domain] ?? const DomainMeta(
      label: '学习',
      icon: Icons.auto_awesome_rounded,
      color: AppTheme.primaryColor,
      backgroundColor: Color(0xFFFFE4EB),
    );
  }

  void _onContentScroll() {
    if (_contentScrollController.position.pixels >=
        _contentScrollController.position.maxScrollExtent - 8) {
      if (!_hasScrolledThroughContent) {
        setState(() => _hasScrolledThroughContent = true);
      }
    }
  }

  bool get _canCompleteReading {
    return _learningRecord != null &&
        !_hasInteractiveContent &&
        _learningElapsedSeconds >= kMinReadingSeconds &&
        (_hasScrolledThroughContent || _hasPlayedAudio);
  }

  void _startLearningTimer() {
    _learningTimer?.cancel();
    final startTime = DateTime.now();
    _learningTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _learningElapsedSeconds = DateTime.now().difference(startTime).inSeconds;
        });
      }
    });
  }

  Future<void> _handleStartLearning() async {
    if (widget.childId == null) {
      setState(() => _startError = '请使用孩子账号开始学习。');
      return;
    }

    setState(() {
      _isStarting = true;
      _startError = null;
    });

    try {
      final record = await _api.startLearning(
        childId: widget.childId!,
        contentId: widget.contentId,
      );

      if (record != null) {
        setState(() {
          _learningRecord = record;
          _hasScrolledThroughContent = false;
          _hasPlayedAudio = false;
          _learningElapsedSeconds = 0;
          _isStarting = false;
        });

        _startLearningTimer();

        // 如果有互动内容，进入测验模式
        if (_hasInteractiveContent) {
          setState(() => _isQuizMode = true);
        }
      } else {
        setState(() {
          _startError = '开始学习失败，请稍后再试。';
          _isStarting = false;
        });
      }
    } catch (e) {
      setState(() {
        _startError = '开始学习失败：$e';
        _isStarting = false;
      });
    }
  }

  Future<void> _completeLearning(int score, String feedback) async {
    if (_learningRecord == null) return;

    setState(() => _isCompleting = true);

    try {
      final recordId = _learningRecord!['id'];
      if (recordId != null) {
        final record = await _api.completeLearning(
          recordId: recordId is int ? recordId : int.parse(recordId.toString()),
          score: score,
          durationSeconds: _learningElapsedSeconds,
          feedback: feedback,
        );

        if (mounted) {
          setState(() {
            _learningRecord = record;
            _score = score;
            _showEvaluation = true;
            _isCompleting = false;
          });
          _learningTimer?.cancel();
        }
      }
    } catch (e) {
      print('Complete learning error: $e');
      if (mounted) {
        setState(() => _isCompleting = false);
      }
    }
  }

  void _handleQuizComplete(Map<String, dynamic> result) {
    final correctCount = result['correctAnswers'] ?? result['score'] ?? 0;
    final totalQuestions = result['totalQuestions'] ?? 1;
    final quizScore = totalQuestions > 0
        ? ((correctCount as int) / (totalQuestions as int) * 100).round()
        : 85;

    setState(() {
      _score = quizScore;
      _quizCompleted = true;
      _isQuizMode = false;
    });

    _completeLearning(quizScore, '答对 $correctCount/$totalQuestions 题');
  }

  Future<void> _handleCompleteReading() async {
    await _completeLearning(_score, '完成学习内容');
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        body: Column(
          children: [
            TopBar(
              title: '学习详情',
              subtitle: '正在加载内容...',
              leftSlot: IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            const Expanded(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: ShimmerCard(height: 200),
              ),
            ),
          ],
        ),
      );
    }

    if (_error != null || _content == null) {
      return Scaffold(
        body: Column(
          children: [
            TopBar(
              title: '学习详情',
              subtitle: '未找到内容',
              leftSlot: IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.sentiment_dissatisfied_rounded,
                      size: 64,
                      color: AppTheme.textSecondary.withOpacity(0.5),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _error ?? '内容不存在或已下线',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textColor,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '你可以返回学习主页，选择其他课程。',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back_rounded),
                      label: const Text('返回'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      body: Column(
        children: [
          TopBar(
            title: _content!['title']?.toString() ?? '学习详情',
            subtitle: '${_domainMeta.label} · ${_content!['ageRange'] ?? ''} 岁',
            leftSlot: IconButton(
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          Expanded(
            child: _buildBody(),
          ),
          _buildBottomBar(),
        ],
      ),
    );
  }

  Widget _buildBody() {
    return BubbleBackground(
      child: SingleChildScrollView(
        controller: _isQuizMode ? null : _contentScrollController,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 缩略图
            if (_content!['thumbnail'] != null) _buildThumbnail(),
            
            // 内容信息卡片
            _buildContentInfo(),
            
            // 学习内容或测验
            if (_isQuizMode && _hasInteractiveContent)
              _buildQuizSection()
            else if (_displayText.isNotEmpty && !_quizCompleted)
              _buildContentBody(),
            
            // 媒体资源
            if (_content!['mediaUrls'] != null &&
                (_content!['mediaUrls'] as List).isNotEmpty)
              _buildMediaSection(),
            
            // 完成评估
            if (_showEvaluation) _buildEvaluation(),
          ],
        ),
      ),
    );
  }

  Widget _buildThumbnail() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        child: Stack(
          children: [
            Image.network(
              _content!['thumbnail'],
              width: double.infinity,
              height: 200,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                height: 200,
                color: AppTheme.softBlue.withOpacity(0.2),
                child: const Center(
                  child: Icon(Icons.image_rounded, size: 48, color: AppTheme.textSecondary),
                ),
              ),
            ),
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withOpacity(0.4),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _domainMeta.backgroundColor,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_domainMeta.icon, size: 16, color: _domainMeta.color),
                    const SizedBox(width: 4),
                    Text(
                      _domainMeta.label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: _domainMeta.color,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContentInfo() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _content!['title']?.toString() ?? '',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
          if (_content!['subtitle'] != null) ...[
            const SizedBox(height: 6),
            Text(
              _content!['subtitle'].toString(),
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              _buildInfoChip(
                icon: Icons.schedule_rounded,
                label: '${_content!['durationMinutes'] ?? 0} 分钟',
                color: AppTheme.primaryColor,
              ),
              const SizedBox(width: 8),
              _buildInfoChip(
                icon: Icons.star_rounded,
                label: '难度 ${_content!['difficulty'] ?? 1}',
                color: AppTheme.softYellow,
              ),
              const SizedBox(width: 8),
              _buildInfoChip(
                icon: _domainMeta.icon,
                label: _domainMeta.label,
                color: _domainMeta.color,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInfoChip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContentBody() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.menu_book_rounded, color: AppTheme.primaryColor),
              const SizedBox(width: 8),
              const Text(
                '学习内容',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
              if (_hasInteractiveContent) ...[
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '含互动练习',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.45,
            ),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.backgroundColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: SingleChildScrollView(
              child: Text(
                _displayText,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.8,
                  color: AppTheme.textColor,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuizSection() {
    if (_quizSections.isEmpty) {
      return const SizedBox.shrink();
    }

    // 使用第一个 quiz section
    final quizData = _quizSections.first;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: QuizGame(
        data: quizData,
        onExit: () {
          setState(() => _isQuizMode = false);
        },
        onFinished: _handleQuizComplete,
      ),
    );
  }

  Widget _buildMediaSection() {
    final mediaUrls = (_content!['mediaUrls'] as List).cast<String>();
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '媒体资源',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.5,
            ),
            itemCount: mediaUrls.length,
            itemBuilder: (context, index) {
              return ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  mediaUrls[index],
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: AppTheme.softBlue.withOpacity(0.2),
                    child: const Center(
                      child: Icon(Icons.image_rounded, color: AppTheme.textSecondary),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEvaluation() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.secondaryColor.withOpacity(0.15),
            AppTheme.primaryColor.withOpacity(0.1),
          ],
        ),
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        boxShadow: AppTheme.softShadow(AppTheme.secondaryColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.auto_awesome_rounded, size: 16, color: AppTheme.primaryColor),
                const SizedBox(width: 4),
                Text(
                  'AI 评估',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            '太棒了！🎉',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '你已经完成《${_content!['title']}》学习，获得 $_score 分。继续保持，下一次会更出色！',
            style: const TextStyle(
              fontSize: 14,
              height: 1.6,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            children: [
              _buildRewardChip(
                icon: Icons.check_circle_rounded,
                label: '+$_score 积分',
                color: AppTheme.accentColor,
              ),
              _buildRewardChip(
                icon: Icons.star_rounded,
                label: '+1 星星',
                color: AppTheme.softYellow,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRewardChip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
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
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar() {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: _buildBottomContent(),
    );
  }

  Widget _buildBottomContent() {
    // 未开始学习
    if (_learningRecord == null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_startError != null || widget.childId == null)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.info_outline_rounded, size: 16, color: AppTheme.warningColor),
                  const SizedBox(width: 6),
                  Text(
                    _startError ?? '请使用孩子账号开始学习。',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.warningColor,
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: (_isStarting || widget.childId == null) ? null : _handleStartLearning,
              icon: _isStarting
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.play_arrow_rounded),
              label: Text(_isStarting ? '正在开始...' : (_hasInteractiveContent ? '开始学习与练习' : '开始学习')),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
        ],
      );
    }

    // 测验模式中不显示底部栏
    if (_isQuizMode) {
      return const SizedBox.shrink();
    }

    // 已显示评估
    if (_showEvaluation) {
      return SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back_rounded),
          label: const Text('返回主页'),
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
      );
    }

    // 学习中（无互动内容）
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 评分滑块
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.backgroundColor,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              const Text(
                '学习评分',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SliderTheme(
                  data: SliderThemeData(
                    activeTrackColor: AppTheme.primaryColor,
                    inactiveTrackColor: AppTheme.primaryColor.withOpacity(0.2),
                    thumbColor: AppTheme.primaryColor,
                    overlayColor: AppTheme.primaryColor.withOpacity(0.2),
                    trackHeight: 6,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
                  ),
                  child: Slider(
                    value: _score.toDouble(),
                    min: 0,
                    max: 100,
                    onChanged: (value) {
                      setState(() => _score = value.round());
                    },
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 40,
                alignment: Alignment.center,
                child: Text(
                  '$_score',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: (_isCompleting || !_canCompleteReading) ? null : _handleCompleteReading,
            icon: _isCompleting
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check_circle_rounded),
            label: Text(_isCompleting ? '提交中...' : '完成学习'),
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.secondaryColor,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
        if (!_canCompleteReading) ...[
          const SizedBox(height: 6),
          Text(
            _learningElapsedSeconds < kMinReadingSeconds
                ? '请先学习 ${kMinReadingSeconds - _learningElapsedSeconds} 秒'
                : '请先滑动阅读学习内容，或使用语音朗读后再完成学习',
            style: const TextStyle(
              fontSize: 12,
              color: AppTheme.textSecondary,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
