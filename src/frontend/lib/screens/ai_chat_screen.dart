// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画
// 2026-05-12 — 内联测验答题卡支持

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../components/section_header.dart';
import '../components/shimmer_loading.dart';
import '../services/api_service.dart';
import '../services/tts_service.dart';
import '../providers/user_provider.dart';
import '../components/speech_input_widget.dart';

// ─── 测验数据工具函数 ──────────────────────────────────────────────────────

/// 从消息文本中提取测验数据。
///
/// 支持三种格式：
/// 1. 整段 JSON = `{"questions":[...], "topic":"...", "ageGroup":"..."}`（generate-quiz 返回格式）
/// 2. 带 activityType 的复合格式 = `{"activityType":"quiz","data":{"questions":[...]}}`
/// 3. 纯文本 + 末尾 JSON = `"这是题目：\n\n{...}"`
///
/// 返回 `(displayText, quizQuestions)`，如果没有测验数据则 `quizQuestions` 为 null。
({String displayText, List<Map<String, dynamic>>? questions})
    parseQuizFromContent(String raw) {
  // 1) 先尝试将整段解析为 JSON
  try {
    final decoded = json.decode(raw);
    if (decoded is Map<String, dynamic>) {
      final qs = _extractQuestions(decoded);
      if (qs != null) {
        return (displayText: _buildDisplayText(decoded), questions: qs);
      }
    }
  } catch (e) {
    debugPrint('⚠️ Quiz JSON parse error (full message): $e');
    // 不是纯 JSON，继续检查混合内容
  }

  // 2) 查找末尾的 JSON 块（"text...\n\n{"questions":[...]}"）
  final jsonBlock = _findTrailingJson(raw);
  if (jsonBlock != null) {
    try {
      final decoded = json.decode(jsonBlock);
      if (decoded is Map<String, dynamic>) {
        final qs = _extractQuestions(decoded);
        if (qs != null) {
          // 提取 JSON 之前的纯文本部分
          final textPart = raw.substring(0, raw.lastIndexOf(jsonBlock)).trim();
          return (displayText: textPart, questions: qs);
        }
      }
    } catch (e) {
      debugPrint('⚠️ Quiz JSON parse error (trailing): $e');
    }
  }

  // 3) 查找行内的 JSON 对象（被其他文本包裹的 {...}）
  final inlineJson = _findInlineJson(raw);
  if (inlineJson != null) {
    try {
      final decoded = json.decode(inlineJson);
      if (decoded is Map<String, dynamic>) {
        final qs = _extractQuestions(decoded);
        if (qs != null) {
          final textBefore = raw.substring(0, raw.indexOf(inlineJson)).trim();
          final textAfter = raw
              .substring(raw.indexOf(inlineJson) + inlineJson.length)
              .trim();
          final text = [textBefore, textAfter].where((s) => s.isNotEmpty).join('\n');
          return (displayText: text, questions: qs);
        }
      }
    } catch (e) {
      debugPrint('⚠️ Quiz JSON parse error (inline): $e');
    }
  }

  // 没有测验数据
  return (displayText: raw, questions: null);
}

/// 从解码后的 map 中提取规范化的题目列表。
List<Map<String, dynamic>>? _extractQuestions(Map<String, dynamic> decoded) {
  // 直接包含 questions 数组
  if (decoded['questions'] is List) {
    return _normalizeQuestions(decoded['questions'] as List);
  }

  // 嵌套在 data 字段中
  if (decoded['data'] is Map<String, dynamic>) {
    final data = decoded['data'] as Map<String, dynamic>;
    if (data['questions'] is List) {
      return _normalizeQuestions(data['questions'] as List);
    }
    // 🔧 P2-4: data 层检测其他游戏类型
    final dataActivityType = data['activityType']?.toString().toLowerCase();
    if (dataActivityType != null && dataActivityType.isNotEmpty && dataActivityType != 'quiz') {
      return _buildGameHintCard(dataActivityType);
    }
  }

  // 🔧 P2-4: 检测其他游戏类型（非 quiz），生成提示卡片
  final activityType = decoded['activityType']?.toString().toLowerCase();
  if (activityType != null && activityType.isNotEmpty && activityType != 'quiz') {
    return _buildGameHintCard(activityType);
  }

  return null;
}

/// 将原始 questions 数组规范化为统一格式。
List<Map<String, dynamic>> _normalizeQuestions(List rawQuestions) {
  return rawQuestions
      .whereType<Map>()
      .map((q) => q.map((k, v) => MapEntry(k.toString(), v)))
      .where((q) {
        final question = q['question']?.toString().trim();
        if (question == null || question.isEmpty) return false;
        final optionsRaw = q['options'];
        if (optionsRaw is! List || optionsRaw.length < 2) return false;
        return true;
      })
      .map((q) {
        final options = (q['options'] as List)
            .map((e) => e.toString().trim())
            .where((e) => e.isNotEmpty)
            .toList();

        var correctIndex = int.tryParse(
                q['correctIndex']?.toString() ?? q['correctAnswer']?.toString() ?? '') ??
            0;
        if (correctIndex < 0 || correctIndex >= options.length) {
          final oneBased = correctIndex - 1;
          correctIndex =
              (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
        }

        return <String, dynamic>{
          'question': q['question'].toString().trim(),
          'options': options,
          'correctIndex': correctIndex,
          'explanation': q['explanation']?.toString(),
        };
      })
      .toList();
}

/// 为非 quiz 游戏类型生成提示卡片。
List<Map<String, dynamic>> _buildGameHintCard(String activityType) {
  const typeNames = {
    'true_false': '判断题',
    'fill_blank': '填空题',
    'matching': '配对连线',
    'sequencing': '排序题',
    'connection': '关联题',
    'puzzle': '拼图游戏',
  };
  final displayName = typeNames[activityType] ?? activityType;

  return [
    {
      'question': '🎮 这是一个互动游戏（$displayName），可在课程模式中打开完整版本哦！',
      'options': ['我知道了 👍', '带我去课程模式 📚'],
      'correctIndex': 0,
      'explanation': '当前聊天模式暂不支持此游戏类型。切换到课程模式即可体验完整的$displayName！',
    }
  ];
}

/// 构建 JSON-only 情况下的可展示文本（题目说明）。
String _buildDisplayText(Map<String, dynamic> decoded) {
  // 🔧 P2-4: 非 quiz 游戏类型展示提示文案
  final activityType = decoded['activityType']?.toString().toLowerCase();
  if (activityType != null && activityType.isNotEmpty && activityType != 'quiz') {
    const typeNames = {
      'true_false': '判断题',
      'fill_blank': '填空题',
      'matching': '配对连线',
      'sequencing': '排序题',
      'connection': '关联题',
      'puzzle': '拼图游戏',
    };
    final displayName = typeNames[activityType] ?? activityType;
    return '🎮 这是一个互动游戏（$displayName），可在课程模式中打开完整版本哦！';
  }

  final topic = decoded['topic']?.toString();
  final ageGroup = decoded['ageGroup']?.toString();
  if (topic != null && topic.isNotEmpty) {
    final parts = <String>['来挑战几道$topic 题目吧！📝'];
    if (ageGroup != null && ageGroup.isNotEmpty) {
      parts.add('（适合 $ageGroup）');
    }
    // 有 explanation 时提示用户注意查看
    final questions = decoded['questions'];
    if (questions is List && questions.any((q) => q is Map && q['explanation'] != null)) {
      parts.add('\n答完后有解析哦~');
    }
    return parts.join('');
  }
  return '来做几道题目吧！📝';
}

/// 查找文本末尾的合法 JSON 对象/数组块。
String? _findTrailingJson(String text) {
  // 从末尾向前找最后一个 '{' 或 '['
  final lastBrace = text.lastIndexOf('{');
  final lastBracket = text.lastIndexOf('[');
  final start = lastBrace > lastBracket ? lastBrace : lastBracket;
  if (start < 0) return null;

  final candidate = text.substring(start).trim();
  if (_isValidJsonLike(candidate)) return candidate;
  return null;
}

/// 查找文本中间行内的 JSON 对象。
String? _findInlineJson(String text) {
  // 匹配 {"activityType": 或 {"questions":
  final patterns = [
    RegExp(r'\{(?:[^{}"]*"[^"]*"\s*:\s*[^{}]*)*"activityType"\s*:\s*"[^"]*"[^{}]*\}'),
    RegExp(r'\{(?:[^{}"]*"[^"]*"\s*:\s*[^{\[]*)*"questions"\s*:\s*\[[^\]]*\][^{}]*\}'),
    RegExp(r'\{[^{}]*"questions"\s*:\s*\[.*?\][^{}]*\}', dotAll: true),
  ];

  for (final p in patterns) {
    final match = p.firstMatch(text);
    if (match != null) {
      final candidate = match.group(0)!;
      if (_isValidJsonLike(candidate)) return candidate;
    }
  }
  return null;
}

bool _isValidJsonLike(String s) {
  try {
    json.decode(s);
    return true;
  } catch (e) {
    debugPrint('⚠️ Quiz JSON parse error (validation): $e');
    return false;
  }
}

// ─── 内联答题卡 Widget ────────────────────────────────────────────────────

/// 在聊天气泡内渲染的紧凑测验答题卡，适合儿童使用。
class _InlineQuizCard extends StatefulWidget {
  final List<Map<String, dynamic>> questions;
  final int messageIndex;
  final void Function(int questionIndex, int selectedOption) onAnswered;

  const _InlineQuizCard({
    required this.questions,
    required this.messageIndex,
    required this.onAnswered,
  });

  @override
  State<_InlineQuizCard> createState() => _InlineQuizCardState();
}

class _InlineQuizCardState extends State<_InlineQuizCard> {
  int _currentIndex = 0;
  int? _selectedOption;
  bool _revealed = false;
  int _correctCount = 0;
  bool _completed = false;

  List<Map<String, dynamic>> get _questions => widget.questions;

  void _selectOption(int index) {
    if (_revealed) return;

    final current = _questions[_currentIndex];
    final correctIndex = current['correctIndex'] as int? ?? 0;
    final isCorrect = index == correctIndex;

    setState(() {
      _selectedOption = index;
      _revealed = true;
      if (isCorrect) _correctCount++;
    });

    widget.onAnswered(_currentIndex, index);

    // 自动进入下一题
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (!mounted) return;
      if (_currentIndex >= _questions.length - 1) {
        setState(() => _completed = true);
      } else {
        setState(() {
          _currentIndex++;
          _selectedOption = null;
          _revealed = false;
        });
      }
    });
  }

  void _goToNext() {
    if (_currentIndex >= _questions.length - 1) {
      setState(() => _completed = true);
    } else {
      setState(() {
        _currentIndex++;
        _selectedOption = null;
        _revealed = false;
      });
    }
  }

  void _reset() {
    setState(() {
      _currentIndex = 0;
      _selectedOption = null;
      _revealed = false;
      _completed = false;
      _correctCount = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_completed) {
      return _buildCompletionCard();
    }

    final current = _questions[_currentIndex];
    final questionText = current['question']?.toString() ?? '';
    final options = (current['options'] as List?)?.cast<String>() ?? [];
    final correctIndex = current['correctIndex'] as int? ?? 0;
    final explanation = current['explanation']?.toString();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.softYellow.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.softOrange.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 题号 & 进度
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '第 ${_currentIndex + 1}/${_questions.length} 题',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
              const Spacer(),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                  width: 60,
                  height: 6,
                  child: LinearProgressIndicator(
                    value: (_currentIndex + 1) / _questions.length,
                    backgroundColor: AppTheme.softPink.withValues(alpha: 0.3),
                    color: AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // 题目文字
          Text(
            questionText,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppTheme.textColor,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),

          // 选项按钮
          ...List.generate(options.length, (index) {
            final isSelected = _selectedOption == index;
            final isCorrect = index == correctIndex;

            Color bgColor;
            Color borderColor;
            Widget? trailingIcon;

            if (_revealed) {
              if (isCorrect) {
                bgColor = AppTheme.accentColor.withValues(alpha: 0.15);
                borderColor = AppTheme.accentColor;
                trailingIcon = const Icon(Icons.check_circle_rounded,
                    color: AppTheme.accentColor, size: 22);
              } else if (isSelected) {
                bgColor = AppTheme.warningColor.withValues(alpha: 0.18);
                borderColor = AppTheme.warningColor;
                trailingIcon = const Icon(Icons.cancel_rounded,
                    color: AppTheme.warningColor, size: 22);
              } else {
                bgColor = Colors.white;
                borderColor = Colors.grey.shade200;
                trailingIcon = null;
              }
            } else {
              bgColor = isSelected
                  ? AppTheme.softPink.withValues(alpha: 0.25)
                  : Colors.white;
              borderColor = isSelected
                  ? AppTheme.primaryColor
                  : Colors.grey.shade200;
              trailingIcon = null;
            }

            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GestureDetector(
                onTap: _revealed ? null : () => _selectOption(index),
                child: AnimatedScale(
                  scale: isSelected ? 1.02 : 1.0,
                  duration: const Duration(milliseconds: 150),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOut,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 13),
                    decoration: BoxDecoration(
                      color: bgColor,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: borderColor, width: 2),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 14,
                          backgroundColor: borderColor.withValues(alpha: 0.12),
                          child: Text(
                            String.fromCharCode(65 + index),
                            style: TextStyle(
                              color: borderColor,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            options[index],
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textColor,
                            ),
                          ),
                        ),
                        if (trailingIcon != null) trailingIcon,
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),

          // 反馈 & 解析
          if (_revealed) ...[
            const SizedBox(height: 6),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (_selectedOption == correctIndex)
                    ? AppTheme.accentColor.withValues(alpha: 0.12)
                    : AppTheme.warningColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (_selectedOption == correctIndex) ? '✅' : '❌',
                    style: const TextStyle(fontSize: 18),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (_selectedOption == correctIndex)
                              ? '答对啦！太棒了 🎉'
                              : '正确答案是 ${String.fromCharCode(65 + correctIndex)}',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textColor,
                          ),
                        ),
                        if (explanation != null && explanation.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            explanation,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                              height: 1.3,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],

          // 手动「下一题」按钮（当用户想跳过自动计时时）
          if (_revealed && _currentIndex < _questions.length - 1) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _goToNext,
                icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                label: const Text('下一题', style: TextStyle(fontSize: 13)),
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.primaryColor,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCompletionCard() {
    final total = _questions.length;
    final score = _correctCount;
    final allCorrect = score == total;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: allCorrect
            ? const LinearGradient(
                colors: [Color(0xFFE8F5E9), Color(0xFFC8E6C9)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : const LinearGradient(
                colors: [Color(0xFFFFF3E0), Color(0xFFFFE0B2)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: allCorrect
              ? AppTheme.accentColor.withValues(alpha: 0.4)
              : AppTheme.warningColor.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            allCorrect ? '🎉 全部答对！' : '🌟 答题完成！',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppTheme.textColor,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '答对 $score / $total 题',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: allCorrect ? AppTheme.accentColor : AppTheme.warningColor,
            ),
          ),
          const SizedBox(height: 10),
          // 重新答题按钮
          GestureDetector(
            onTap: _reset,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.4)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.refresh_rounded,
                      size: 16, color: AppTheme.primaryColor),
                  SizedBox(width: 4),
                  Text(
                    '再做一次',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── 主屏幕 ────────────────────────────────────────────────────────────────

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, dynamic>> _messages = [];
  final ScrollController _scrollController = ScrollController();

  bool _isLoading = false;
  bool _autoPlay = true;
  bool _isListening = false;
  int? _speakingMessageIndex;

  /// 每条消息的答题记录：key = "${messageIndex}_${questionIndex}", value = 所选选项索引
  final Map<String, int> _questionAnswers = {};

  @override
  void initState() {
    super.initState();

    TtsService().init();

    _messages.add({
      'role': 'assistant',
      'content': '你好呀！我是小犀 🦄\n有什么想聊的吗？',
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  // ─── 消息发送 ─────────────────────────────────────────────────────────

  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    setState(() {
      _messages.add({'role': 'user', 'content': message});
      _isLoading = true;
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final userProvider = context.read<UserProvider>();
      final childId = userProvider.activeChildId;
      final api = context.read<ApiService>();
      final response = await api.sendAIChatMessage(message, childId: childId);

      final reply = response?['reply'] as String? ??
          response?['content'] as String? ??
          '抱歉，我暂时无法回复 ~';

      // 解析测验数据
      final parsed = parseQuizFromContent(reply);
      final msgEntry = <String, dynamic>{
        'role': 'assistant',
        'content': reply,
        'displayText': parsed.displayText,
      };
      if (parsed.questions != null) {
        msgEntry['quizQuestions'] = parsed.questions;
      }

      final msgIndex = _messages.length;
      setState(() {
        _messages.add(msgEntry);
        _isLoading = false;
      });

      // 自动朗读（只朗读展示文本，不朗读 JSON）
      if (_autoPlay) {
        await _autoSpeakMessage(msgIndex);
      }
    } catch (e) {
      debugPrint('⚠️ AI chat send error: $e');
      setState(() {
        _messages.add({
          'role': 'assistant',
          'content': '哎呀，网络不太好，再试一次吧 🌐',
        });
        _isLoading = false;
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ─── 语音输出 ────────────────────────────────────────────────────────

  /// 自动朗读助手回复（不改变 speaking index UI 高亮）
  Future<void> _autoSpeakMessage(int index) async {
    if (index >= _messages.length) return;
    if (_messages[index]['role'] != 'assistant') return;

    final content = _speakableContent(index);
    if (content.isEmpty) return;

    final tts = TtsService();
    if (!tts.isAvailable) return;

    await tts.stop();
    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted && _speakingMessageIndex == index) {
      setState(() => _speakingMessageIndex = null);
    }
  }

  /// 点击朗读按钮
  Future<void> _speakMessage(int index) async {
    final tts = TtsService();

    if (_speakingMessageIndex == index) {
      await tts.stop();
      setState(() => _speakingMessageIndex = null);
      return;
    }

    if (_speakingMessageIndex != null) {
      await tts.stop();
    }

    final content = _speakableContent(index);
    if (content.isEmpty) return;

    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted) {
      setState(() => _speakingMessageIndex = null);
    }
  }

  /// 获取适合朗读的文本内容（优先 displayText，否则用 content）。
  String _speakableContent(int index) {
    final msg = _messages[index];
    return (msg['displayText']?.toString() ?? msg['content']?.toString() ?? '')
        .trim();
  }

  // ─── 语音输入回调 ─────────────────────────────────────────────────────

  /// 语音识别结果：自动填入输入框并发送。
  void _onSpeechResult(String text) {
    if (text.trim().isNotEmpty) {
      _sendMessage(text: text.trim());
    }
  }

  /// 录音状态变化：更新 UI 提示。
  void _onListeningChange(bool isListening) {
    setState(() => _isListening = isListening);
  }

  // ─── 构建 ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.backgroundColor, Color(0xFFFFF0F5)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildTopBar(),
              Expanded(
                child: _buildMessageList(),
              ),
              _buildInputArea(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
      child: Row(
        children: [
          const SectionHeader(
            title: '小犀聊天',
            emoji: '🦄',
          ),
          const Spacer(),
          InkWell(
            borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
            onTap: () => setState(() => _autoPlay = !_autoPlay),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _autoPlay
                    ? AppTheme.primaryColor.withValues(alpha: 0.12)
                    : Colors.grey.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _autoPlay
                        ? Icons.volume_up_rounded
                        : Icons.volume_off_rounded,
                    size: 18,
                    color: _autoPlay
                        ? AppTheme.primaryColor
                        : AppTheme.textSecondary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _autoPlay ? '自动朗读' : '静音',
                    style: TextStyle(
                      fontSize: 12,
                      color: _autoPlay
                          ? AppTheme.primaryColor
                          : AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      itemCount: _messages.length + (_isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (_isLoading && index == _messages.length) {
          return _buildLoadingIndicator();
        }
        final message = _messages[index];
        final isUser = message['role'] == 'user';
        return _buildMessageBubble(message, isUser, index);
      },
    );
  }

  Widget _buildMessageBubble(
      Map<String, dynamic> message, bool isUser, int index) {
    final isSpeaking = _speakingMessageIndex == index;
    final quizQuestions = message['quizQuestions'] as List<Map<String, dynamic>>?;
    final displayText =
        message['displayText']?.toString() ?? message['content']?.toString() ?? '';
    final hasQuiz = quizQuestions != null && quizQuestions.isNotEmpty;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      builder: (context, value, child) {
        return Transform.scale(
          scale: value,
          child: Opacity(opacity: value, child: child),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Align(
          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.85,
            ),
            decoration: BoxDecoration(
              gradient: isUser
                  ? const LinearGradient(
                      colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    )
                  : null,
              color: isUser ? null : Colors.white,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(AppTheme.buttonRadius),
                topRight: const Radius.circular(AppTheme.buttonRadius),
                bottomLeft:
                    Radius.circular(isUser ? AppTheme.buttonRadius : 6),
                bottomRight:
                    Radius.circular(isUser ? 6 : AppTheme.buttonRadius),
              ),
              boxShadow: [
                BoxShadow(
                  color: (isUser ? AppTheme.primaryColor : Colors.grey)
                      .withValues(alpha: 0.15),
                  blurRadius: 15,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 12, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 文本内容
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!isUser) ...[
                      const Text('🦄', style: TextStyle(fontSize: 24)),
                      const SizedBox(width: 10),
                    ],
                    Flexible(
                      child: Text(
                        displayText,
                        style: TextStyle(
                          color: isUser ? Colors.white : AppTheme.textColor,
                          fontSize: 16,
                          height: 1.4,
                        ),
                      ),
                    ),
                    if (isUser) const SizedBox(width: 4),
                  ],
                ),

                // 内联答题卡
                if (!isUser && hasQuiz) ...[
                  const SizedBox(height: 12),
                  _InlineQuizCard(
                    questions: quizQuestions,
                    messageIndex: index,
                    onAnswered: (qIdx, selected) {
                      _questionAnswers['${index}_$qIdx'] = selected;
                    },
                  ),
                ],

                // 助手冒泡：朗读按钮
                if (!isUser) ...[
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: _buildSpeakButton(isSpeaking, index),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSpeakButton(bool isSpeaking, int index) {
    return GestureDetector(
      onTap: () => _speakMessage(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: isSpeaking
              ? AppTheme.primaryColor.withValues(alpha: 0.15)
              : AppTheme.primaryColor.withValues(alpha: 0.08),
          shape: BoxShape.circle,
        ),
        child: Icon(
          isSpeaking ? Icons.volume_up_rounded : Icons.volume_mute_rounded,
          size: 20,
          color: isSpeaking ? AppTheme.primaryColor : AppTheme.textSecondary,
        ),
      ),
    );
  }

  Widget _buildLoadingIndicator() {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: ShimmerCard(width: 200, height: 48),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppTheme.cardRadius)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withValues(alpha: 0.1),
            blurRadius: 20,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: Row(
        children: [
          // 语音输入按钮
          SpeechInputWidget(
            onResult: _onSpeechResult,
            onListeningChange: _onListeningChange,
          ),
          const SizedBox(width: 8),
          // 文字输入框
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius:
                    BorderRadius.circular(AppTheme.buttonRadius + 1),
              ),
              child: TextField(
                controller: _controller,
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: _isListening ? '正在听你说话…' : '和小犀聊天吧~',
                  hintStyle: TextStyle(
                    color: AppTheme.textSecondary.withValues(alpha: 0.5),
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 14),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 发送按钮
          GestureDetector(
            onTap: _isLoading ? null : () => _sendMessage(),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: _isLoading
                    ? LinearGradient(
                        colors: [Colors.grey.shade300, Colors.grey.shade400],
                      )
                    : const LinearGradient(
                        colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                shape: BoxShape.circle,
                boxShadow: _isLoading
                    ? null
                    : [
                        BoxShadow(
                          color: AppTheme.primaryColor.withValues(alpha: 0.4),
                          blurRadius: 15,
                          offset: const Offset(0, 5),
                        ),
                      ],
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2.5,
                      ),
                    )
                  : const Icon(Icons.send_rounded,
                      color: Colors.white, size: 24),
            ),
          ),
        ],
      ),
    );
  }
}