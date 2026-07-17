import 'package:flutter/material.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';
import '../games/game_tts_helper.dart';
import 'poetry_detail_screen.dart';

/// 飞花令游戏页
class FlyingFlowerGameScreen extends StatefulWidget {
  const FlyingFlowerGameScreen({super.key});

  @override
  State<FlyingFlowerGameScreen> createState() => _FlyingFlowerGameScreenState();
}

class _FlyingFlowerGameScreenState extends State<FlyingFlowerGameScreen>
    with SingleTickerProviderStateMixin, GameTtsHelper {
  late final PoetryService _poetryService;
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  final _keywordController = TextEditingController();
  FlyingFlowerGame? _game;
  bool _isLoading = false;
  String? _error;
  String _lang = 'zh-Hans';

  // 常用关键字
  final List<String> _commonKeywords = [
    '花', '月', '风', '雪', '云', '水', '山', '春', '秋', '夜',
    '雨', '柳', '梅', '酒', '梦', '泪', '心', '人', '天', '日',
  ];

  @override
  void initState() {
    super.initState();
    _poetryService = PoetryService(ApiService());
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _fadeIn = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _controller.forward();
  }

  @override
  void dispose() {
    disposeTts();
    _controller.dispose();
    _keywordController.dispose();
    super.dispose();
  }

  Future<void> _search(String keyword) async {
    if (keyword.isEmpty) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final game = await _poetryService.fetchFlyingFlowerGame(keyword);
      setState(() {
        _game = game;
        _isLoading = false;
      });
      // 搜索成功后自动朗读第一条结果
      if (game.entries.isNotEmpty) {
        speakAfterDelay(game.entries.first.line);
      }
    } catch (e) {
      setState(() {
        _error = '搜索失败: $e';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8),
      appBar: AppBar(
        title: const Text(
          '飞花令',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        backgroundColor: const Color(0xFF6A1B9A),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          buildTtsToggleButton(),
          TextButton(
            onPressed: () {
              setState(() {
                _lang = _lang == 'zh-Hans' ? 'zh-Hant' : 'zh-Hans';
              });
              if (_game != null) {
                _search(_keywordController.text.trim().isNotEmpty
                    ? _keywordController.text.trim()
                    : _game!.keyword);
              }
            },
            child: Text(
              _lang == 'zh-Hans' ? '繁' : '简',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
      body: FadeTransition(
        opacity: _fadeIn,
        child: Column(
          children: [
            // 搜索区域
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6A1B9A), Color(0xFF9C4DCC)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.local_florist,
                    size: 40,
                    color: Colors.white,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '一字飞花',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 搜索框
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(25),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 16),
                        const Icon(Icons.search, color: Color(0xFF6A1B9A)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _keywordController,
                            decoration: const InputDecoration(
                              hintText: '输入一个字...',
                              border: InputBorder.none,
                              hintStyle: TextStyle(color: Colors.grey),
                            ),
                            style: const TextStyle(fontSize: 16),
                            onSubmitted: _search,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.arrow_forward,
                            color: Color(0xFF6A1B9A),
                          ),
                          onPressed: () => _search(_keywordController.text),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  // 常用关键字
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _commonKeywords.map((keyword) {
                      return ActionChip(
                        label: Text(keyword),
                        onPressed: () {
                          _keywordController.text = keyword;
                          _search(keyword);
                        },
                        backgroundColor: Colors.white,
                        labelStyle: const TextStyle(
                          color: Color(0xFF6A1B9A),
                          fontWeight: FontWeight.w600,
                        ),
                        side: BorderSide(
                          color: const Color(0xFF6A1B9A).withOpacity(0.3),
                          width: 1,
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            // 结果区域
            Expanded(child: _buildResults()),
          ],
        ),
      ),
    );
  }

  Widget _buildResults() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            Text(_error!),
          ],
        ),
      );
    }

    if (_game == null) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('输入一个字开始搜索'),
          ],
        ),
      );
    }

    if (_game!.entries.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.sentiment_dissatisfied, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text('未找到包含"${_game!.keyword}"的诗句'),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _game!.entries.length,
      itemBuilder: (context, index) {
        final entry = _game!.entries[index];
        return _buildEntryCard(entry);
      },
    );
  }

  Widget _buildEntryCard(FlyingFlowerEntry entry) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => PoetryDetailScreen(poemId: entry.poemId, lang: _lang),
              ),
            );
          },
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题行
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF6A1B9A),
                        ),
                      ),
                    ),
                    if (entry.authorName != null)
                      Text(
                        entry.authorName!,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[600],
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                // 诗句（高亮关键字）
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F0E8),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text.rich(
                          _buildHighlightedText(entry.line, _game!.keyword),
                          style: const TextStyle(
                            fontSize: 18,
                            height: 1.6,
                            color: Color(0xFF333333),
                          ),
                        ),
                      ),
                      buildReplayButton(entry.line),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                // 查看全文提示
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      '查看完整诗词',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[500],
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_ios,
                      size: 12,
                      color: Colors.grey[400],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  TextSpan _buildHighlightedText(String text, String keyword) {
    if (keyword.isEmpty) {
      return TextSpan(text: text);
    }

    final parts = text.split(keyword);
    final spans = <TextSpan>[];

    for (int i = 0; i < parts.length; i++) {
      if (parts[i].isNotEmpty) {
        spans.add(TextSpan(text: parts[i]));
      }
      if (i < parts.length - 1) {
        spans.add(
          TextSpan(
            text: keyword,
            style: const TextStyle(
              color: Color(0xFF6A1B9A),
              fontWeight: FontWeight.bold,
              backgroundColor: Color(0xFFFFEB3B),
            ),
          ),
        );
      }
    }

    return TextSpan(children: spans);
  }
}
