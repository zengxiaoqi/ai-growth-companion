import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';

/// 诗词详情页
class PoetryDetailScreen extends StatefulWidget {
  final int poemId;
  final String lang;

  const PoetryDetailScreen({super.key, required this.poemId, this.lang = 'zh-Hans'});

  @override
  State<PoetryDetailScreen> createState() => _PoetryDetailScreenState();
}

class _PoetryDetailScreenState extends State<PoetryDetailScreen> {
  late final PoetryService _poetryService;
  Poem? _poem;
  bool _isLoading = true;
  String? _error;
  double _fontSize = 18;

  @override
  void initState() {
    super.initState();
    _poetryService = PoetryService(ApiService());
    _loadPoem();
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

  void _shareContent() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('分享功能开发中...')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_poem?.title ?? '诗词详情'),
        actions: [
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
          IconButton(
            icon: const Icon(Icons.share),
            tooltip: '分享',
            onPressed: _shareContent,
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

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // 标题
          Text(
            _poem!.title,
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
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
          
          // 诗词内容
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
              children: _poem!.contentLines.map((line) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    line,
                    style: TextStyle(
                      fontSize: _fontSize,
                      height: 1.8,
                    ),
                    textAlign: TextAlign.center,
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
