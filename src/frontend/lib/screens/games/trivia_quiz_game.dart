import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../utils/app_logger.dart';
import '../../services/public_api_service.dart';
import 'quiz_game.dart';

final _log = AppLogger('TriviaQuizGame');

/// Open Trivia DB 知识问答游戏
///
/// 从后端 `/api/public/trivia` 拉取题目，转换成 [QuizGame] 期望的 data
/// 格式后启动 [QuizGame]。支持难度选择与类别筛选。
///
/// 因为 Open Trivia DB 题目为英文 HTML-encoded，这里仅做最小解码（将
/// `&#039;` `&quot;` 等 HTML entities 还原），不做翻译——可配合"英语
/// 启蒙"场景使用。如需中文题目，未来可对接 LibreTranslate。
class TriviaQuizGame extends StatefulWidget {
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const TriviaQuizGame({
    super.key,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<TriviaQuizGame> createState() => _TriviaQuizGameState();
}

class _TriviaQuizGameState extends State<TriviaQuizGame> {
  // Open Trivia DB 类别 id 列表（常用子集）
  static const List<Map<String, dynamic>> kCategories = [
    {'id': null, 'label': '任意 🎲'},
    {'id': 17, 'label': '科学 🔬'},
    {'id': 18, 'label': '计算机 💻'},
    {'id': 19, 'label': '数学 ➗'},
    {'id': 21, 'label': '运动 ⚽'},
    {'id': 22, 'label': '地理 🌍'},
    {'id': 23, 'label': '历史 📜'},
    {'id': 9, 'label': '常识 🌟'},
    {'id': 11, 'label': '电影 🎬'},
    {'id': 12, 'label': '音乐 🎵'},
    {'id': 14, 'label': '电视 📺'},
    {'id': 27, 'label': '动物 🐾'},
  ];

  static const List<Map<String, dynamic>> kDifficulties = [
    {'id': 'easy', 'label': '简单'},
    {'id': 'medium', 'label': '中等'},
    {'id': 'hard', 'label': '困难'},
  ];

  int? _selectedCategoryId;
  String _difficulty = 'easy';
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _gameData;

  Future<void> _startGame() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final resp = await PublicApiService.instance.getTrivia(
        amount: 10,
        difficulty: _difficulty,
        category: _selectedCategoryId?.toString(),
      );
      if (resp == null) {
        setState(() {
          _error = '无法获取题目，请稍后再试';
          _loading = false;
        });
        return;
      }
      final results = (resp['results'] as List?) ?? [];
      if (results.isEmpty) {
        setState(() {
          _error = '该类别暂无可用题目，请换一个试试';
          _loading = false;
        });
        return;
      }
      final data = _convertToQuizGameData(results);
      if (!mounted) return;
      setState(() {
        _gameData = data;
        _loading = false;
      });
    } catch (e) {
      _log.warning('Trivia load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
        _loading = false;
      });
    }
  }

  /// Open Trivia DB 单题 → QuizGame 题目格式
  /// Open Trivia: {question, correct_answer, incorrect_answers}
  /// → {question, options: [4 个打乱后的答案], correctIndex: }
  Map<String, dynamic> _convertToQuizGameData(List<dynamic> results) {
    final questions = <Map<String, dynamic>>[];
    for (final raw in results) {
      final m = raw as Map;
      final question = _decodeHtml(m['question']?.toString() ?? '');
      final correct = _decodeHtml(m['correct_answer']?.toString() ?? '');
      final incorrect = (m['incorrect_answers'] as List?)
              ?.map((e) => _decodeHtml(e.toString()))
              .toList() ??
          const <String>[];
      // 合并 + 打乱
      final options = [...incorrect, correct]..shuffle();
      final correctIndex = options.indexOf(correct);
      questions.add({
        'question': question,
        'options': options,
        'correctIndex': correctIndex,
        'category': m['category']?.toString(),
        'explanation': '正确答案：$correct',
      });
    }
    return {
      'title': '知识问答 · ${_difficultyLabel()}',
      'questions': questions,
    };
  }

  String _difficultyLabel() {
    return kDifficulties.firstWhere(
      (d) => d['id'] == _difficulty,
      orElse: () => const {'label': '简单'},
    )['label'] as String;
  }

  /// 简单 HTML entity 解码（Open Trivia DB 返回 &#039; &quot; 等）
  String _decodeHtml(String s) {
    if (s.isEmpty) return s;
    // 使用 dart:convert 的 HtmlEscape 反向操作没有标准 API
    // 这里手写常见的几种替换
    return s
        .replaceAll('&quot;', '"')
        .replaceAll('&#039;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ');
  }

  @override
  Widget build(BuildContext context) {
    // 如果已开始游戏，渲染 QuizGame
    if (_gameData != null) {
      return QuizGame(
        data: _gameData!,
        onExit: () {
          setState(() => _gameData = null);
          widget.onExit();
        },
        onFinished: widget.onFinished,
      );
    }

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF7EC8E3), Color(0xFFB8E0F5)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // 顶部栏
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded,
                        color: Colors.white),
                    onPressed: widget.onExit,
                  ),
                  const Text(
                    '🧠 知识问答',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            // 主体
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    const Text(
                      '🌍 选择类别',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: kCategories.map((c) {
                        final selected = _selectedCategoryId == c['id'];
                        return GestureDetector(
                          onTap: () =>
                              setState(() => _selectedCategoryId = c['id'] as int?),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: selected
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              c['label'] as String,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color:
                                    selected ? AppTheme.secondaryColor : Colors.white,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      '⚙️ 选择难度',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: kDifficulties.map((d) {
                        final selected = _difficulty == d['id'];
                        return Expanded(
                          child: GestureDetector(
                            onTap: () =>
                                setState(() => _difficulty = d['id'] as String),
                            child: Container(
                              margin: const EdgeInsets.only(right: 10),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: selected
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Center(
                                child: Text(
                                  d['label'] as String,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: selected
                                        ? AppTheme.secondaryColor
                                        : Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    // 提示
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Row(
                        children: [
                          Text('💡', style: TextStyle(fontSize: 18)),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '题目来自国际开源题库（英语），非常适合英语启蒙！'
                              '答错也没关系，重要的是开眼界。',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.white,
                                height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),
                    // 错误提示
                    if (_error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.error_outline,
                                color: Colors.red.shade600),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: TextStyle(
                                  color: Colors.red.shade800,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    // 开始按钮
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.accentColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                          elevation: 0,
                        ),
                        onPressed: _loading ? null : _startGame,
                        child: _loading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text(
                                '🚀 开始答题',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
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
}
