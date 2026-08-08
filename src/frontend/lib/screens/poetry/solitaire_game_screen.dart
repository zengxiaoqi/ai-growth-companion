import 'package:flutter/material.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';
import '../games/game_tts_helper.dart';

/// 诗词接龙游戏页
class SolitaireGameScreen extends StatefulWidget {
  const SolitaireGameScreen({super.key});

  @override
  State<SolitaireGameScreen> createState() => _SolitaireGameScreenState();
}

class _SolitaireGameScreenState extends State<SolitaireGameScreen>
    with SingleTickerProviderStateMixin, GameTtsHelper {
  late final PoetryService _poetryService;
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  SolitaireGame? _game;
  bool _isLoading = true;
  String? _error;
  int? _selectedIndex;
  bool _showResult = false;
  int _score = 0;
  int _streak = 0;

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
    disposeTts();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadGame() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _selectedIndex = null;
      _showResult = false;
    });

    try {
      final game = await _poetryService.fetchSolitaireGame();
      setState(() {
        _game = game;
        _isLoading = false;
      });
      // 加载成功后自动朗读当前诗句
      speakAfterDelay(_game!.currentLine);
    } catch (e) {
      setState(() {
        _error = '加载游戏失败: $e';
        _isLoading = false;
      });
    }
  }

  void _selectOption(int index) {
    if (_showResult || _game == null) return;

    setState(() {
      _selectedIndex = index;
      _showResult = true;
      if (index == _game!.correctIndex) {
        _score++;
        _streak++;
      } else {
        _streak = 0;
      }
    });

    // TTS反馈
    if (index == _game!.correctIndex) {
      speak('答对了！连击$_streak次');
    } else {
      speak('答错了，正确答案是${_game!.options[_game!.correctIndex]}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8),
      appBar: AppBar(
        title: const Text('诗词接龙'),
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          buildTtsToggleButton(),
          // 分数显示
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Icon(Icons.star, color: Colors.amber, size: 20),
                  const SizedBox(width: 4),
                  Text(
                    '$_score',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  if (_streak > 1) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.amber,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '连击$_streak',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
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
          // 诗词信息
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: [
                Text(
                  _game!.title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1565C0),
                  ),
                ),
                const SizedBox(height: 4),
                if (_game!.authorName != null || _game!.dynastyName != null)
                  Text(
                    '${_game!.dynastyName ?? ''} ${_game!.authorName ?? ''}',
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 当前诗句
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1565C0), Color(0xFF42A5F5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF1565C0).withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                const Text(
                  '请接下一句',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white70,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _game!.currentLine,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    height: 1.6,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Icon(
                  Icons.arrow_downward,
                  color: Colors.white54,
                  size: 28,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 选项
          ..._game!.options.asMap().entries.map((entry) {
            final index = entry.key;
            final option = entry.value;
            return _buildOptionCard(index, option);
          }),

          // 结果提示
          if (_showResult) _buildResultHint(),
        ],
      ),
    );
  }

  Widget _buildOptionCard(int index, String option) {
    final isSelected = _selectedIndex == index;
    final isCorrect = index == _game!.correctIndex;

    Color bgColor = Colors.white;
    Color borderColor = Colors.grey.shade300;
    Color textColor = const Color(0xFF333333);

    if (_showResult) {
      if (isCorrect) {
        bgColor = const Color(0xFFE8F5E9);
        borderColor = const Color(0xFF4CAF50);
        textColor = const Color(0xFF2E7D32);
      } else if (isSelected && !isCorrect) {
        bgColor = const Color(0xFFFFEBEE);
        borderColor = const Color(0xFFF44336);
        textColor = const Color(0xFFC62828);
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _showResult ? null : () => _selectOption(index),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                // 序号
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: borderColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: borderColor,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // 选项内容
                Expanded(
                  child: Text(
                    option,
                    style: TextStyle(
                      fontSize: 18,
                      color: textColor,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ),
                // 结果图标
                if (_showResult && isCorrect)
                  const Icon(Icons.check_circle, color: Color(0xFF4CAF50), size: 24),
                if (_showResult && isSelected && !isCorrect)
                  const Icon(Icons.cancel, color: Color(0xFFF44336), size: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildResultHint() {
    final isCorrect = _selectedIndex == _game!.correctIndex;

    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isCorrect ? const Color(0xFFE8F5E9) : const Color(0xFFFFEBEE),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            isCorrect ? Icons.celebration : Icons.lightbulb,
            color: isCorrect ? const Color(0xFF2E7D32) : const Color(0xFFC62828),
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              isCorrect ? '答对了！继续加油！' : '答错了，正确答案已高亮显示',
              style: TextStyle(
                fontSize: 15,
                color: isCorrect ? const Color(0xFF2E7D32) : const Color(0xFFC62828),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          TextButton(
            onPressed: _loadGame,
            child: const Text('下一题'),
          ),
        ],
      ),
    );
  }
}


