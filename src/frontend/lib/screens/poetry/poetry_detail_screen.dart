import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';
import '../../services/tts_service.dart';

/// 诗词详情页
///
/// 功能：
/// - 诗词正文展示（标题/作者/朝代/体裁/内容）
/// - TTS 朗读（逐句播放，当前句高亮）
/// - 注解/翻译/赏析（LLM 生成，可展开）
/// - 字体大小调整、复制
class PoetryDetailScreen extends StatefulWidget {
  final int poemId;
  final String lang;

  const PoetryDetailScreen({super.key, required this.poemId, this.lang = 'zh-Hans'});

  @override
  State<PoetryDetailScreen> createState() => _PoetryDetailScreenState();
}

class _PoetryDetailScreenState extends State<PoetryDetailScreen> {
  late final PoetryService _poetryService;
  final TtsService _ttsService = TtsService();
  Poem? _poem;
  bool _isLoading = true;
  String? _error;
  double _fontSize = 18;

  // 注解相关
  PoemAnnotation? _annotation;
  bool _isLoadingAnnotation = false;
  String? _annotationError;
  bool _annotationLoaded = false;

  // TTS 朗读相关
  final List<String> _ttsQueue = []; // 待朗读的句子列表
  int _currentTtsIndex = -1; // 正在朗读的句子索引，-1 表示未在朗读
  bool _isTtsPlaying = false;

  @override
  void initState() {
    super.initState();
    _poetryService = PoetryService(ApiService());
    _ttsService.init();
    _loadPoem();
  }

  @override
  void dispose() {
    // 离开页面时停止朗读
    _ttsService.stop();
    super.dispose();
  }

  Future<void> _loadPoem() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final poem = await _poetryService.getPoemById(widget.poemId, lang: widget.lang);
      setState(() {
        _poem = poem;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = '加载失败: $e';
        _isLoading = false;
      });
    }
  }

  /// 构造 TTS 朗读队列：标题+作者信息+逐句内容
  List<String> _buildTtsSegments() {
    if (_poem == null) return [];
    final segments = <String>[];
    segments.add(_poem!.title);
    if (_poem!.author != null || _poem!.dynasty != null) {
      final parts = <String>[];
      if (_poem!.dynasty != null) parts.add(_poem!.dynasty!.name);
      if (_poem!.author != null) parts.add(_poem!.author!.name);
      segments.add(parts.join(' '));
    }
    segments.addAll(_poem!.contentLines);
    return segments;
  }

  /// 开始/停止朗读
  Future<void> _toggleTts() async {
    if (_isTtsPlaying) {
      // 停止
      await _ttsService.stop();
      setState(() {
        _isTtsPlaying = false;
        _currentTtsIndex = -1;
      });
      return;
    }

    final segments = _buildTtsSegments();
    if (segments.isEmpty) return;

    setState(() {
      _isTtsPlaying = true;
      _ttsQueue.clear();
      _ttsQueue.addAll(segments);
      _currentTtsIndex = 0;
    });

    // 逐句播放
    for (var i = 0; i < segments.length; i++) {
      if (!mounted || !_isTtsPlaying) break;
      setState(() => _currentTtsIndex = i);
      try {
        await _ttsService.speak(segments[i]);
        // 等待这句播完
        await _ttsService.onComplete;
      } catch (_) {
        break;
      }
      // 句间短停顿
      await Future.delayed(const Duration(milliseconds: 350));
    }

    if (mounted) {
      setState(() {
        _isTtsPlaying = false;
        _currentTtsIndex = -1;
      });
    }
  }

  /// 加载注解/翻译
  Future<void> _loadAnnotation() async {
    if (_annotationLoaded) return;
    setState(() {
      _isLoadingAnnotation = true;
      _annotationError = null;
    });
    try {
      final annotation = await _poetryService.getPoemAnnotation(widget.poemId, lang: widget.lang);
      setState(() {
        _annotation = annotation;
        _isLoadingAnnotation = false;
        _annotationLoaded = true;
      });
    } catch (e) {
      setState(() {
        _isLoadingAnnotation = false;
        _annotationError = '加载注解失败: $e';
      });
    }
  }

  void _showSettings() {
    showModalBottomSheet(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (context, setState) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('字体大小', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Text('A', style: TextStyle(fontSize: 14)),
                  Expanded(
                    child: Slider(
                      value: _fontSize,
                      min: 14,
                      max: 28,
                      divisions: 7,
                      label: _fontSize.round().toString(),
                      onChanged: (value) {
                        setState(() => _fontSize = value);
                        this.setState(() => _fontSize = value);
                      },
                    ),
                  ),
                  const Text('A', style: TextStyle(fontSize: 22)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _copyContent() {
    if (_poem == null) return;

    final content = '''
${_poem!.title}
${_poem!.dynasty != null ? '[${_poem!.dynasty!.name}]' : ''}${_poem!.author != null ? ' ${_poem!.author!.name}' : ''}

${_poem!.content}
''';

    Clipboard.setData(ClipboardData(text: content));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已复制到剪贴板')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_poem?.title ?? '诗词详情'),
        actions: [
          // TTS 朗读按钮
          IconButton(
            icon: Icon(_isTtsPlaying ? Icons.stop_circle : Icons.record_voice_over),
            tooltip: _isTtsPlaying ? '停止朗读' : '朗读',
            onPressed: _poem == null ? null : _toggleTts,
          ),
          IconButton(
            icon: const Icon(Icons.text_fields),
            tooltip: '字体设置',
            onPressed: _showSettings,
          ),
          IconButton(
            icon: const Icon(Icons.copy),
            tooltip: '复制',
            onPressed: _copyContent,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadPoem,
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_poem == null) {
      return const Center(child: Text('诗词不存在'));
    }

    final contentLines = _poem!.contentLines;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // 标题
          Text(
            _poem!.title,
            style: TextStyle(
              fontSize: _fontSize + 10,
              fontWeight: FontWeight.bold,
              color: _currentTtsIndex == 0
                  ? Theme.of(context).colorScheme.primary
                  : null,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),

          // 作者和朝代
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_poem!.dynasty != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    _poem!.dynasty!.name,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSecondaryContainer,
                    ),
                  ),
                ),
              if (_poem!.dynasty != null && _poem!.author != null)
                const SizedBox(width: 12),
              if (_poem!.author != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    _poem!.author!.name,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // 类型标签
          if (_poem!.type != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _poem!.type!,
                style: TextStyle(fontSize: 12, color: Colors.grey[700]),
              ),
            ),

          const SizedBox(height: 32),

          // 诗词内容（逐句高亮）
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              children: List.generate(contentLines.length, (i) {
                // TTS 句子索引偏移：0=标题，1=作者，2+=内容句
                final ttsIndex = 2 + i;
                final isCurrent = _isTtsPlaying && _currentTtsIndex == ttsIndex;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 250),
                    style: TextStyle(
                      fontSize: _fontSize,
                      height: 1.8,
                      color: isCurrent
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.onSurface,
                      fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                    ),
                    child: Text(
                      contentLines[i],
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }),
            ),
          ),

          const SizedBox(height: 24),

          // 注解/翻译/赏析区块
          _buildAnnotationSection(),
        ],
      ),
    );
  }

  /// 注解/翻译/赏析区块
  Widget _buildAnnotationSection() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.25),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Row(
          children: [
            Icon(Icons.menu_book, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 8),
            const Text('注解 / 翻译 / 赏析'),
          ],
        ),
        onExpansionChanged: (expanded) {
          if (expanded) _loadAnnotation();
        },
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: _buildAnnotationContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildAnnotationContent() {
    if (_isLoadingAnnotation) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
        ),
      );
    }

    if (_annotationError != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(Icons.error_outline, color: Colors.orange[400]),
            const SizedBox(height: 8),
            Text(_annotationError!, textAlign: TextAlign.center,
                style: TextStyle(color: Colors.orange[700], fontSize: 13)),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () {
                setState(() {
                  _annotationLoaded = false;
                  _annotationError = null;
                });
                _loadAnnotation();
              },
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_annotation == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Text('暂无注解'),
      );
    }

    final ann = _annotation!;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 翻译
        if (ann.translation.isNotEmpty) ...[
          _annotationSectionTitle('白话译文', Icons.translate, theme),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Text(
              ann.translation,
              style: TextStyle(fontSize: 15, height: 1.7, color: theme.colorScheme.onSurface.withValues(alpha: 0.9)),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // 字词注解
        if (ann.notes.isNotEmpty) ...[
          _annotationSectionTitle('字词注解', Icons.spellcheck, theme),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Column(
              children: ann.notes.map((n) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(fontSize: 14, height: 1.6, color: theme.colorScheme.onSurface),
                      children: [
                        TextSpan(
                          text: '${n.term}：',
                          style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary),
                        ),
                        TextSpan(text: n.explanation),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // 赏析
        if (ann.appreciation.isNotEmpty) ...[
          _annotationSectionTitle('作品赏析', Icons.lightbulb_outline, theme),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Text(
              ann.appreciation,
              style: TextStyle(fontSize: 14, height: 1.7, color: theme.colorScheme.onSurface.withValues(alpha: 0.85)),
            ),
          ),
        ],

        // 来源标记
        if (ann.source == 'fallback') ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Text(
              '（注解服务暂不可用）',
              style: TextStyle(fontSize: 12, color: Colors.grey[500], fontStyle: FontStyle.italic),
            ),
          ),
        ],
      ],
    );
  }

  Widget _annotationSectionTitle(String title, IconData icon, ThemeData theme) {
    return Row(
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.primary),
        const SizedBox(width: 6),
        Text(
          title,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.primary,
          ),
        ),
      ],
    );
  }
}
