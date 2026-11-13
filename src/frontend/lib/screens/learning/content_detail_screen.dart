import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../components/shimmer_loading.dart';
import '../../components/top_bar.dart';
import '../../utils/app_logger.dart';
import '../games/quiz_game.dart';
import 'widgets/lesson_section_renderer.dart';

final _log = AppLogger('ContentDetailScreen');

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

Map<String, DomainMeta> kDomainMeta = {
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
    color: Color(0xFFE3BC45),
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

  // lesson_pack 结构化 sections（按类型渲染）
  List<Map<String, dynamic>> _sections = [];

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
          _parseSections();
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

      // lesson_pack 结构: { type: "lesson_pack", content: [...] }
      // 取嵌套的 content 数组
      if (parsed is Map && parsed['content'] is List) {
        parsed = parsed['content'];
      }

      if (parsed is List) {
        _quizSections = parsed
            .where((item) =>
                item is Map &&
                item['questions'] is List &&
                (item['questions'] as List).whereType<Map>().any((q) =>
                    (q['q'] ?? q['question'])?.toString().isNotEmpty ?? false))
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();
      }
    } catch (e) {
      _log.warning('Parse quiz sections error: $e');
      _quizSections = [];
    }
  }

  /// 解析 lesson_pack 的 sections 列表，供按类型渲染。
  void _parseSections() {
    _sections = [];
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

      if (parsed is Map && parsed['content'] is List) {
        parsed = parsed['content'];
      }

      if (parsed is List) {
        _sections = parsed
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      }
    } catch (e) {
      _log.warning('Parse sections error: $e');
      _sections = [];
    }
  }

  bool get _hasInteractiveContent => _quizSections.isNotEmpty;

  /// 提取内容文本用于显示，避免暴露原始 JSON
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

      // Case 1: 简单故事 { text: "...", moral: "..." }
      if (parsed is Map && parsed.containsKey('text')) {
        final text = parsed['text']?.toString() ?? '';
        final moral = parsed['moral']?.toString() ?? '';
        if (text.isNotEmpty) {
          return moral.isNotEmpty ? '$text\n\n$moral' : text;
        }
      }

      // Case 2: lesson_pack { type: "lesson_pack", content: [...] }
      if (parsed is Map && parsed['content'] is List) {
        final items = parsed['content'] as List;
        final textBlocks = <String>[];
        for (final item in items) {
          if (item is Map) {
            final parts = <String>[];

            final title = item['title']?.toString() ?? '';
            if (title.isNotEmpty) parts.add('📖 $title');

            final poet = item['poet']?.toString() ?? '';
            if (poet.isNotEmpty) parts.add('作者：$poet');

            final text = item['text']?.toString() ?? '';
            if (text.isNotEmpty) parts.add(text);

            final content = item['content']?.toString() ?? '';
            if (content.isNotEmpty) parts.add(content);

            final meaning = item['meaning']?.toString() ?? '';
            if (meaning.isNotEmpty) parts.add('📝 $meaning');

            final description = item['description']?.toString() ?? '';
            if (description.isNotEmpty) parts.add(description);

            final result = item['result']?.toString() ?? '';
            if (result.isNotEmpty) parts.add('🎯 结果：$result');

            final instructions = item['instructions']?.toString() ?? '';
            if (instructions.isNotEmpty) parts.add(instructions);

            final lyrics = item['lyrics']?.toString() ?? '';
            if (lyrics.isNotEmpty) parts.add(lyrics);

            // 列表字段
            final steps = item['steps'];
            if (steps is List && steps.isNotEmpty) {
              parts.add('步骤：');
              for (var i = 0; i < steps.length; i++) {
                parts.add('  ${i + 1}. ${steps[i].toString()}');
              }
            }

            final materials = item['materials'];
            if (materials is List && materials.isNotEmpty) {
              parts.add('材料：${materials.join('、')}');
            }

            final tasks = item['tasks'];
            if (tasks is List && tasks.isNotEmpty) {
              parts.add('任务：');
              for (final t in tasks) {
                parts.add('  \u2022 ${t.toString()}');
              }
            }

            final examples = item['examples'];
            if (examples is List && examples.isNotEmpty) {
              parts.add('示例：${examples.join('、')}');
            }

            final activities = item['activities'];
            if (activities is List && activities.isNotEmpty) {
              parts.add(activities.join('\n'));
            }

            if (parts.isNotEmpty) {
              textBlocks.add(parts.join('\n'));
            }
          } else if (item is String && item.isNotEmpty) {
            textBlocks.add(item);
          }
        }
        if (textBlocks.isNotEmpty) {
          return textBlocks.join('\n\n');
        }
      }

      // Case 3: 普通列表
      if (parsed is List) {
        final textBlocks = <String>[];
        for (final item in parsed) {
          if (item is Map) {
            final title = item['title']?.toString() ?? '';
            final text = item['text']?.toString() ?? '';
            final content = item['content']?.toString() ?? '';
            final meaning = item['meaning']?.toString() ?? '';

            final parts = <String>[];
            if (title.isNotEmpty) parts.add(title);
            if (text.isNotEmpty) parts.add(text);
            if (content.isNotEmpty) parts.add(content);
            if (meaning.isNotEmpty) parts.add(meaning);

            if (parts.isNotEmpty) {
              textBlocks.add(parts.join('\n'));
            }
          } else if (item is String && item.isNotEmpty) {
            textBlocks.add(item);
          }
        }
        if (textBlocks.isNotEmpty) {
          return textBlocks.join('\n\n');
        }
      }

      // Case 4: 其他 Map 类型，尝试提取常用文本字段
      if (parsed is Map) {
        final textFields = [
          'title',
          'text',
          'content',
          'description',
          'moral',
          'meaning'
        ];
        final parts = <String>[];
        for (final field in textFields) {
          if (parsed.containsKey(field) && parsed[field] is String) {
            final val = parsed[field].toString();
            if (val.isNotEmpty) parts.add(val);
          }
        }
        if (parts.isNotEmpty) return parts.join('\n\n');
      }

      // Case 5: 未识别的嵌套对象（如 {"seasons": {"spring": "温暖花开"}}）
      // 直接 toString 会把 JSON 语法丢给孩子，这里扁平化成「小标题 + 条目」。
      if (parsed is Map) {
        final blocks = <String>[];
        parsed.forEach((key, value) {
          if (value is Map) {
            final parts = <String>[];
            value.forEach((k, v) {
              final text = v?.toString().trim() ?? '';
              if (text.isNotEmpty) parts.add('· $k：$text');
            });
            if (parts.isNotEmpty) {
              blocks.add('【$key】\n${parts.join('\n')}');
            }
          } else if (value is List) {
            if (value.isNotEmpty) {
              blocks.add('【$key】\n${value.map((e) => '· $e').join('\n')}');
            }
          } else {
            final text = value?.toString().trim() ?? '';
            if (text.isNotEmpty) blocks.add('$key：$text');
          }
        });
        if (blocks.isNotEmpty) return blocks.join('\n\n');
      }

      // 未识别的结构不再 toString 上屏（会把 JSON 语法丢给孩子），
      // 返回空串走友好空态。
      return '';
    } catch (e) {
      return '';
    }
  }

  DomainMeta get _domainMeta {
    if (_content == null) {
      return DomainMeta(
        label: '学习',
        icon: Icons.auto_awesome_rounded,
        color: AppTheme.primaryColor,
        backgroundColor: Color(0xFFFFE4EB),
      );
    }
    final domain = _content!['domain']?.toString() ?? '';
    return kDomainMeta[domain] ??
        DomainMeta(
          label: '学习',
          icon: Icons.auto_awesome_rounded,
          color: AppTheme.primaryColor,
          backgroundColor: Color(0xFFFFE4EB),
        );
  }

  /// 内容没超出屏幕时根本滚不动，`_onContentScroll` 永远不会触发，
  /// 孩子就会被「滑到底部读完」卡死。这里在布局完成后补一次判定：
  /// 不可滚动 = 已经一眼看完全文。
  void _markReadIfNotScrollable() {
    if (!mounted || _hasScrolledThroughContent) return;
    if (!_contentScrollController.hasClients) return;
    if (_contentScrollController.position.maxScrollExtent <= 0) {
      setState(() => _hasScrolledThroughContent = true);
    }
  }

  void _onContentScroll() {
    // Only mark as scrolled if there's actually scrollable content
    if (_contentScrollController.position.maxScrollExtent > 0 &&
        _contentScrollController.position.pixels >=
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
          _learningElapsedSeconds =
              DateTime.now().difference(startTime).inSeconds;
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
      _log.warning('Complete learning error: $e');
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
            Expanded(
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
                      color: AppTheme.textSecondary.withValues(alpha: 0.5),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _error ?? '内容不存在或已下线',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textColor,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
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
    _scheduleReadCheck();
    return BubbleBackground(
      child: Column(
        children: [
          // 阅读进度条：只在不处于测验态时显示，让孩子看到「还剩多少」
          if (!_isQuizMode && !_showEvaluation) _buildReadingProgress(),
          Expanded(
            child: SingleChildScrollView(
              controller: _isQuizMode ? null : _contentScrollController,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 封面 + 信息（合并成一张主卡，避免两张白卡叠在一起）
                  _buildHeroCard(),

                  // 学习内容或测验
                  if (_isQuizMode && _hasInteractiveContent)
                    _buildQuizSection()
                  else if (!_quizCompleted) ...[
                    if (_sections.isNotEmpty)
                      LessonSectionRenderer(
                        sections: _sections,
                        onQuizFinished: _learningRecord != null
                            ? _handleQuizComplete
                            : null,
                      )
                    else if (_displayText.isNotEmpty)
                      _buildContentBody()
                    else
                      _buildEmptyContent(),
                  ],

                  // 媒体资源
                  if (_content!['mediaUrls'] != null &&
                      _content!['mediaUrls'] is List &&
                      (_content!['mediaUrls'] as List).isNotEmpty)
                    _buildMediaSection(),

                  // 完成评估
                  if (_showEvaluation) _buildEvaluation(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _scheduleReadCheck() {
    if (_isLoading || _content == null || _isQuizMode || _showEvaluation) return;
    if (_hasScrolledThroughContent) return;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _markReadIfNotScrollable(),
    );
  }

  /// 顶部细进度条：跟随正文滚动，读完即满格。
  Widget _buildReadingProgress() {
    return AnimatedBuilder(
      animation: _contentScrollController,
      builder: (context, _) {
        double progress = 0;
        if (_contentScrollController.hasClients) {
          final max = _contentScrollController.position.maxScrollExtent;
          final pixels = _contentScrollController.position.pixels;
          progress = max <= 0 ? 1 : (pixels / max).clamp(0.0, 1.0);
        }
        return TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: 0, end: progress),
          duration: const Duration(milliseconds: 180),
          builder: (context, value, __) => Container(
            height: 4,
            margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            decoration: BoxDecoration(
              color: AppTheme.active.ink2.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(999),
            ),
            child: value <= 0.01
                ? const SizedBox.shrink()
                : FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: value,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.primaryColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
          ),
        );
      },
    );
  }

  /// 封面 + 标题 + 元信息合并成的一张主卡。
  ///
  /// 之前是「封面卡片」+「信息卡片」两张白卡竖排，层级松散、首屏信息密度低；
  /// 合并后封面成为卡片的视觉主体，标题紧跟其后，滚动时视线不断裂。
  Widget _buildHeroCard() {
    final palette = AppTheme.active;
    final hasThumb = _content!['thumbnail'] != null;
    final ageRange = _content!['ageRange']?.toString().trim() ?? '';
    final subtitle = _content!['subtitle']?.toString().trim() ?? '';
    final minutes = _content!['durationMinutes'];
    final difficulty = _content!['difficulty'] ?? 1;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (hasThumb)
            SizedBox(
              height: 176,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    _content!['thumbnail'].toString(),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Color.alphaBlend(
                        _domainMeta.color.withValues(alpha: 0.14),
                        palette.card,
                      ),
                      alignment: Alignment.center,
                      child: Icon(_domainMeta.icon,
                          size: 44,
                          color: _domainMeta.color.withValues(alpha: 0.7)),
                    ),
                  ),
                  // 底部渐隐，让上浮的学科胶囊更清晰
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            Colors.black.withValues(alpha: 0.34),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 12,
                    bottom: 12,
                    child: _domainPill(),
                  ),
                ],
              ),
            )
          else
            Container(
              height: 96,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color.alphaBlend(
                      _domainMeta.color.withValues(alpha: 0.22),
                      palette.card,
                    ),
                    Color.alphaBlend(
                      _domainMeta.color.withValues(alpha: 0.06),
                      palette.card,
                    ),
                  ],
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: _domainMeta.color.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(_domainMeta.icon,
                        size: 26, color: _domainMeta.color),
                  ),
                  const SizedBox(width: 12),
                  _domainPill(),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _content!['title']?.toString() ?? '',
                  style: TextStyle(
                    fontSize: 21,
                    height: 1.3,
                    fontWeight: FontWeight.w800,
                    color: palette.ink,
                  ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: palette.ink2,
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _metaChip(
                      icon: Icons.schedule_rounded,
                      label: '$minutes 分钟',
                      color: palette.pop,
                    ),
                    _metaChip(
                      icon: Icons.signal_cellular_alt_rounded,
                      label: '难度 $difficulty',
                      color: Color.lerp(palette.pop, palette.ink, 0.35)!,
                    ),
                    if (ageRange.isNotEmpty)
                      _metaChip(
                        icon: Icons.child_care_rounded,
                        label: '$ageRange 岁',
                        color: palette.ink2,
                      ),
                    if (_hasInteractiveContent)
                      _metaChip(
                        icon: Icons.sports_esports_rounded,
                        label: '含互动练习',
                        color: palette.pop,
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

  Widget _domainPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          _domainMeta.color.withValues(alpha: 0.18),
          AppTheme.active.card,
        ),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_domainMeta.icon, size: 14, color: _domainMeta.color),
          const SizedBox(width: 4),
          Text(
            _domainMeta.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: _domainMeta.color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _metaChip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContentBody() {
    final palette = AppTheme.active;
    // 按空行切段：原来整篇塞进一个 Text，长文在手机上极难读。
    final paragraphs = _displayText
        .split(RegExp(r'\n\s*\n'))
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.menu_book_rounded,
                  size: 20, color: palette.pop),
              const SizedBox(width: 8),
              Text(
                '学习内容',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: palette.ink,
                ),
              ),
              if (_hasInteractiveContent) ...[
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: palette.pop.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '含互动练习',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: palette.pop,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '慢慢读，读完到最下面就可以完成啦',
            style: TextStyle(
              fontSize: 11,
              height: 1.5,
              color: palette.ink2,
            ),
          ),
          const SizedBox(height: 14),
          // 正文不再塞进固定高度的内层滚动框：
          //   1) 手机上「文中再滚一层」很难操作，孩子容易卡住；
          //   2) 完成学习需要滚到底（_onContentScroll），内层滚动会让外层
          //      的 maxScrollExtent 很小甚至为 0，判定永远不成立。
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            decoration: BoxDecoration(
              color: Color.alphaBlend(
                palette.pop.withValues(alpha: 0.04),
                palette.soft,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < paragraphs.length; i++)
                  Padding(
                    padding: EdgeInsets.only(
                      bottom: i == paragraphs.length - 1 ? 0 : 14,
                    ),
                    child: Text(
                      paragraphs[i],
                      style: TextStyle(
                        fontSize: 16,
                        height: 1.85,
                        letterSpacing: 0.2,
                        color: palette.ink,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 内容既无 sections 也无文本时的友好空态（不暴露原始 JSON）。
  Widget _buildEmptyContent() {
    final palette = AppTheme.active;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        children: [
          Icon(Icons.hourglass_top_rounded,
              size: 40, color: palette.pop.withValues(alpha: 0.7)),
          const SizedBox(height: 10),
          Text(
            '内容准备中',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: palette.ink,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '这门课的学习材料正在路上，先去别的课程看看吧',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: palette.ink2),
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
        color: AppTheme.active.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: AppTheme.active.isCartoon
            ? Border.all(color: AppTheme.active.line, width: 2)
            : null,
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
        color: AppTheme.active.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: AppTheme.active.isCartoon
            ? Border.all(color: AppTheme.active.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
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
                    color: AppTheme.softBlue.withValues(alpha: 0.2),
                    child: Center(
                      child: Icon(Icons.image_rounded,
                          color: AppTheme.textSecondary),
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
    final palette = AppTheme.active;
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.translate(
          offset: Offset(0, (1 - t) * 14),
          child: child,
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color.alphaBlend(
                palette.pop.withValues(alpha: 0.16),
                palette.card,
              ),
              Color.alphaBlend(
                palette.cta.withValues(alpha: 0.14),
                palette.card,
              ),
            ],
          ),
          borderRadius: BorderRadius.circular(AppTheme.cardRadius),
          border: palette.isCartoon
              ? Border.all(color: palette.line, width: 2)
              : null,
          boxShadow: AppTheme.softShadow(),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // 分数环
                SizedBox(
                  width: 66,
                  height: 66,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        width: 66,
                        height: 66,
                        child: CircularProgressIndicator(
                          value: (_score.clamp(0, 100)) / 100,
                          strokeWidth: 6,
                          backgroundColor:
                              palette.pop.withValues(alpha: 0.14),
                          valueColor: AlwaysStoppedAnimation<Color>(
                            palette.pop,
                          ),
                          strokeCap: StrokeCap.round,
                        ),
                      ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '$_score',
                            style: TextStyle(
                              fontSize: 20,
                              height: 1.0,
                              fontWeight: FontWeight.w800,
                              color: palette.ink,
                            ),
                          ),
                          Text(
                            '分',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: palette.ink2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: palette.pop.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.auto_awesome_rounded,
                                    size: 12, color: palette.pop),
                                const SizedBox(width: 3),
                                Text(
                                  'AI 评估',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: palette.pop,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '太棒了！🎉',
                        style: TextStyle(
                          fontSize: 22,
                          height: 1.2,
                          fontWeight: FontWeight.w800,
                          color: palette.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '你已经完成《${_content!['title']}》学习，获得 $_score 分。继续保持，下一次会更出色！',
              style: TextStyle(
                fontSize: 13,
                height: 1.65,
                color: palette.ink2,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                _buildRewardChip(
                  icon: Icons.check_circle_rounded,
                  label: '+$_score 积分',
                  color: palette.pop,
                ),
                _buildRewardChip(
                  icon: Icons.star_rounded,
                  label: '+1 星星',
                  color: Color.lerp(palette.cta, palette.ink, 0.25)!,
                ),
              ],
            ),
          ],
        ),
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
        color: color.withValues(alpha: 0.15),
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
    final palette = AppTheme.active;
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: 0.97),
        border: Border(
          top: BorderSide(color: palette.line.withValues(alpha: 0.8)),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: _buildBottomContent(),
    );
  }

  Widget _buildBottomContent() {
    final palette = AppTheme.active;

    // 未开始学习
    if (_learningRecord == null) {
      final blocked = widget.childId == null;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_startError != null || blocked) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.info_outline_rounded,
                      size: 15, color: AppTheme.warningColor),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      _startError ?? '请使用孩子账号开始学习。',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.warningColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          SizedBox(
            width: double.infinity,
            height: 54,
            child: FilledButton.icon(
              onPressed: (_isStarting || blocked) ? null : _handleStartLearning,
              icon: _isStarting
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: palette.ctaInk,
                      ),
                    )
                  : Icon(Icons.play_arrow_rounded, color: palette.ctaInk),
              label: Text(
                _isStarting
                    ? '正在开始...'
                    : (_hasInteractiveContent ? '开始学习与练习' : '开始学习'),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: palette.cta,
                foregroundColor: palette.ctaInk,
                disabledBackgroundColor: palette.cta.withValues(alpha: 0.4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(palette.radiusMd),
                ),
                elevation: 0,
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
        height: 54,
        child: FilledButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(Icons.arrow_back_rounded, color: palette.ctaInk),
          label: Text(
            '返回主页',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          style: FilledButton.styleFrom(
            backgroundColor: palette.cta,
            foregroundColor: palette.ctaInk,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(palette.radiusMd),
            ),
            elevation: 0,
          ),
        ),
      );
    }

    // 学习中（无互动内容）：给自己打个分 → 完成学习
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          decoration: BoxDecoration(
            color: Color.alphaBlend(
              palette.pop.withValues(alpha: 0.05),
              palette.soft,
            ),
            borderRadius: BorderRadius.circular(palette.radiusMd),
          ),
          child: Row(
            children: [
              Text(
                _score >= 90
                    ? '😄'
                    : _score >= 75
                        ? '🙂'
                        : _score >= 60
                            ? '😐'
                            : '🙁',
                style: const TextStyle(fontSize: 17),
              ),
              const SizedBox(width: 6),
              Text(
                '打个分',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: palette.ink,
                ),
              ),
              Expanded(
                child: SliderTheme(
                  data: SliderThemeData(
                    activeTrackColor: palette.pop,
                    inactiveTrackColor: palette.pop.withValues(alpha: 0.18),
                    thumbColor: palette.pop,
                    overlayColor: palette.pop.withValues(alpha: 0.16),
                    trackHeight: 5,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 8),
                    overlayShape:
                        const RoundSliderOverlayShape(overlayRadius: 14),
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
              SizedBox(
                width: 42,
                child: Text(
                  '$_score 分',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: palette.pop,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 54,
          child: FilledButton.icon(
            onPressed:
                (_isCompleting || !_canCompleteReading) ? null : _handleCompleteReading,
            icon: _isCompleting
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: palette.ctaInk,
                    ),
                  )
                : Icon(Icons.check_circle_rounded, color: palette.ctaInk),
            label: Text(
              _isCompleting ? '提交中...' : '完成学习',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            style: FilledButton.styleFrom(
              backgroundColor: palette.cta,
              foregroundColor: palette.ctaInk,
              disabledBackgroundColor: palette.cta.withValues(alpha: 0.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(palette.radiusMd),
              ),
              elevation: 0,
            ),
          ),
        ),
        if (!_canCompleteReading) ...[
          const SizedBox(height: 8),
          Text(
            _learningElapsedSeconds < kMinReadingSeconds
                ? '再读 ${kMinReadingSeconds - _learningElapsedSeconds} 秒就可以完成啦'
                : '滑到底部读完，就能完成学习啦',
            style: TextStyle(
              fontSize: 11,
              color: palette.ink2,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
