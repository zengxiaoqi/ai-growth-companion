import 'package:flutter/material.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';

/// 填字游戏页
class FillBlankGameScreen extends StatefulWidget {
  const FillBlankGameScreen({super.key});

  @override
  State<FillBlankGameScreen> createState() => _FillBlankGameScreenState();
}

class _FillBlankGameScreenState extends State<FillBlankGameScreen>
    with SingleTickerProviderStateMixin {
  late final PoetryService _poetryService;
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  FillBlankGame? _game;
  bool _isLoading = true;
  String? _error;

  // 用户答案
  final Map<int, String> _userAnswers = {};
  final Map<int, bool> _answerStatus = {}; // true=正确, false=错误
  bool _isCompleted = false;

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
    _loadGame();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadGame() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _userAnswers.clear();
      _answerStatus.clear();
      _isCompleted = false;
    });

    try {
      final game = await _poetryService.fetchFillBlankGame();
      setState(() {
        _game = game;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = '加载游戏失败: $e';
        _isLoading = false;
      });
    }
  }

  void _checkAnswer(int blankIndex, String answer) {
    if (_game == null) return;

    final correctAnswer = _game!.answers[blankIndex];
    final isCorrect = answer == correctAnswer;

    setState(() {
      _userAnswers[blankIndex] = answer;
      _answerStatus[blankIndex] = isCorrect;

      // 检查是否全部完成
      if (_answerStatus.length == _game!.blankIndices.length) {
        _isCompleted = true;
      }
    });
  }

  void _showCandidatesDialog(int blankIndex) {
    if (_game == null) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFFF5F0E8),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '选择正确的字',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF8B2500),
              ),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: _game!.candidates.map((candidate) {
                return ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    _checkAnswer(blankIndex, candidate);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8B2500),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 16,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    candidate,
                    style: const TextStyle(fontSize: 20),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8),
      appBar: AppBar(
        title: const Text('填字游戏'),
        backgroundColor: const Color(0xFF8B2500),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadGame,
            tooltip: '换一题',
          ),
        ],
      ),
      body: FadeTransition(
        opacity: _fadeIn,
        child: _buildBody(),
      ),
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
            Text(_error!),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadGame,
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_game == null) {
      return const Center(child: Text('暂无数据'));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          // 诗词信息卡片
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                Text(
                  _game!.title,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF8B2500),
                  ),
                ),
                const SizedBox(height: 8),
                if (_game!.authorName != null || _game!.dynastyName != null)
                  Text(
                    '${_game!.dynastyName ?? ''} ${_game!.authorName ?? ''}',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                const SizedBox(height: 24),
                // 诗词内容
                ..._game!.lines.asMap().entries.map((entry) {
                  final lineIndex = entry.key;
                  final line = entry.value;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: _buildPoemLine(lineIndex, line),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 完成提示
          if (_isCompleted) _buildCompletionCard(),
        ],
      ),
    );
  }

  Widget _buildPoemLine(int lineIndex, String line) {
    // 检查这一行是否有挖空
    final blankInLine = _game!.blankIndices.asMap().entries.where(
      (e) => _getBlankLineIndex(e.value) == lineIndex,
    );

    if (blankInLine.isEmpty) {
      return Text(
        line,
        style: const TextStyle(
          fontSize: 20,
          height: 1.8,
          color: Color(0xFF333333),
        ),
      );
    }

    // 有挖空，需要分段显示
    final widgets = <Widget>[];
    int lastEnd = 0;

    for (final blank in blankInLine) {
      final blankGlobalIndex = blank.key;
      final charIndex = _getBlankCharIndex(blank.value);

      if (charIndex > lastEnd) {
        widgets.add(
          Text(
            line.substring(lastEnd, charIndex),
            style: const TextStyle(
              fontSize: 20,
              height: 1.8,
              color: Color(0xFF333333),
            ),
          ),
        );
      }

      widgets.add(_buildBlankWidget(blankGlobalIndex, charIndex, line));
      lastEnd = charIndex + 1;
    }

    if (lastEnd < line.length) {
      widgets.add(
        Text(
          line.substring(lastEnd),
          style: const TextStyle(
            fontSize: 20,
            height: 1.8,
            color: Color(0xFF333333),
          ),
        ),
      );
    }

    return Row(
      children: widgets,
    );
  }

  int _getBlankLineIndex(int blankIndex) {
    // 根据 blankIndex 找到对应的行
    int charCount = 0;
    for (int i = 0; i < _game!.lines.length; i++) {
      for (int j = 0; j < _game!.lines[i].length; j++) {
        if (charCount == blankIndex) return i;
        charCount++;
      }
      charCount++; // 换行符
    }
    return 0;
  }

  int _getBlankCharIndex(int blankIndex) {
    int charCount = 0;
    for (int i = 0; i < _game!.lines.length; i++) {
      for (int j = 0; j < _game!.lines[i].length; j++) {
        if (charCount == blankIndex) return j;
        charCount++;
      }
      charCount++; // 换行符
    }
    return 0;
  }

  Widget _buildBlankWidget(int blankGlobalIndex, int charIndex, String line) {
    final userAnswer = _userAnswers[blankGlobalIndex];
    final status = _answerStatus[blankGlobalIndex];

    Color bgColor = const Color(0xFFE0E0E0);
    Color textColor = Colors.grey;
    String displayText = '？';

    if (userAnswer != null) {
      displayText = userAnswer;
      if (status == true) {
        bgColor = const Color(0xFF4CAF50);
        textColor = Colors.white;
      } else {
        bgColor = const Color(0xFFF44336);
        textColor = Colors.white;
      }
    }

    return InkWell(
      onTap: userAnswer == null ? () => _showCandidatesDialog(blankGlobalIndex) : null,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: userAnswer == null ? const Color(0xFF8B2500) : Colors.transparent,
            width: 2,
          ),
        ),
        alignment: Alignment.center,
        child: Text(
          displayText,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: textColor,
          ),
        ),
      ),
    );
  }

  Widget _buildCompletionCard() {
    final total = _game!.blankIndices.length;
    final correct = _answerStatus.values.where((v) => v).length;

    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2E7D32), Color(0xFF4CAF50)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2E7D32).withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          const Icon(Icons.celebration, size: 48, color: Colors.white),
          const SizedBox(height: 12),
          const Text(
            '完成！',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '答对 $correct / $total 题',
            style: const TextStyle(fontSize: 16, color: Colors.white),
          ),
          if (_game!.appreciation != null) ...[
            const SizedBox(height: 16),
            const Divider(color: Colors.white54),
            const SizedBox(height: 16),
            const Text(
              '诗词赏析',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _game!.appreciation!,
              style: const TextStyle(fontSize: 14, color: Colors.white),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: _loadGame,
            icon: const Icon(Icons.refresh),
            label: const Text('再来一题'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF2E7D32),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }
}


