// AI 对话升级 — 添加会话管理和上下文摘要
// 原始功能（内联测验、TTS朗读、语音输入）已完整保留

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../components/shimmer_loading.dart';
import '../services/tts_service.dart';
import '../providers/user_provider.dart';
import '../providers/chat_session_provider.dart';
import '../components/speech_input_widget.dart';

// ═══════════════════════════════════════════════════════════════════════════
// 测验数据工具函数（从原文件保留，与 chat_session_provider 保持一致逻辑）
// ═══════════════════════════════════════════════════════════════════════════

/// 从消息文本中提取测验数据。
({String displayText, List<Map<String, dynamic>>? questions})
    parseQuizFromContent(String raw) {
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
  }

  final jsonBlock = _findTrailingJson(raw);
  if (jsonBlock != null) {
    try {
      final decoded = json.decode(jsonBlock);
      if (decoded is Map<String, dynamic>) {
        final qs = _extractQuestions(decoded);
        if (qs != null) {
          final textPart = raw.substring(0, raw.lastIndexOf(jsonBlock)).trim();
          return (displayText: textPart, questions: qs);
        }
      }
    } catch (e) {
      debugPrint('⚠️ Quiz JSON parse error (trailing): $e');
    }
  }

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

  return (displayText: raw, questions: null);
}

List<Map<String, dynamic>>? _extractQuestions(Map<String, dynamic> decoded) {
  if (decoded['questions'] is List) {
    return _normalizeQuestions(decoded['questions'] as List);
  }
  if (decoded['data'] is Map<String, dynamic>) {
    final data = decoded['data'] as Map<String, dynamic>;
    if (data['questions'] is List) {
      return _normalizeQuestions(data['questions'] as List);
    }
  }
  final activityType = decoded['activityType']?.toString().toLowerCase();
  if (activityType != null && activityType.isNotEmpty && activityType != 'quiz') {
    return _buildGameHintCard(activityType);
  }
  return null;
}

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
          correctIndex = (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
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
  return [{
    'question': '🎮 这是一个互动游戏（$displayName），可在课程模式中打开完整版本哦！',
    'options': ['我知道了 👍', '带我去课程模式 📚'],
    'correctIndex': 0,
    'explanation': '当前聊天模式暂不支持此游戏类型。切换到课程模式即可体验完整的$displayName！',
  }];
}

String _buildDisplayText(Map<String, dynamic> decoded) {
  final topic = decoded['topic']?.toString();
  final ageGroup = decoded['ageGroup']?.toString();
  if (topic != null && topic.isNotEmpty) {
    final parts = <String>['来挑战几道$topic 题目吧！📝'];
    if (ageGroup != null && ageGroup.isNotEmpty) parts.add('（适合 $ageGroup）');
    final questions = decoded['questions'];
    if (questions is List && questions.any((q) => q is Map && q['explanation'] != null)) {
      parts.add('\n答完后有解析哦~');
    }
    return parts.join('');
  }
  return '来做几道题目吧！📝';
}

String? _findTrailingJson(String text) {
  final lastBrace = text.lastIndexOf('{');
  final lastBracket = text.lastIndexOf('[');
  final start = lastBrace > lastBracket ? lastBrace : lastBracket;
  if (start < 0) return null;
  final candidate = text.substring(start).trim();
  try {
    json.decode(candidate);
    return candidate;
  } catch (_) {
    return null;
  }
}

String? _findInlineJson(String text) {
  final patterns = [
    RegExp(r'\{(?:[^{}"]*"[^"]*"\s*:\s*[^{}]*)*"activityType"\s*:\s*"[^"]*"[^{}]*\}'),
    RegExp(r'\{(?:[^{}"]*"[^"]*"\s*:\s*[^{\[]*)*"questions"\s*:\s*\[[^\]]*\][^{}]*\}'),
    RegExp(r'\{[^{}]*"questions"\s*:\s*\[.*?\][^{}]*\}', dotAll: true),
  ];
  for (final p in patterns) {
    final match = p.firstMatch(text);
    if (match != null) {
      final candidate = match.group(0)!;
      try {
        json.decode(candidate);
        return candidate;
      } catch (_) {}
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 内联答题卡 Widget（保持原有实现）
// ═══════════════════════════════════════════════════════════════════════════

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
    if (_completed) return _buildCompletionCard();
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
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                ),
              ),
              const Spacer(),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(width: 60, height: 6, child: LinearProgressIndicator(
                  value: (_currentIndex + 1) / _questions.length,
                  backgroundColor: AppTheme.softPink.withValues(alpha: 0.3),
                  color: AppTheme.primaryColor,
                )),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(questionText, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textColor, height: 1.4)),
          const SizedBox(height: 12),
          ...List.generate(options.length, (index) {
            final isSelected = _selectedOption == index;
            final isCorrect = index == correctIndex;
            Color bgColor, borderColor;
            Widget? trailingIcon;
            if (_revealed) {
              if (isCorrect) {
                bgColor = AppTheme.accentColor.withValues(alpha: 0.15);
                borderColor = AppTheme.accentColor;
                trailingIcon = const Icon(Icons.check_circle_rounded, color: AppTheme.accentColor, size: 22);
              } else if (isSelected) {
                bgColor = AppTheme.warningColor.withValues(alpha: 0.18);
                borderColor = AppTheme.warningColor;
                trailingIcon = const Icon(Icons.cancel_rounded, color: AppTheme.warningColor, size: 22);
              } else {
                bgColor = Colors.white;
                borderColor = Colors.grey.shade200;
              }
            } else {
              bgColor = isSelected ? AppTheme.softPink.withValues(alpha: 0.25) : Colors.white;
              borderColor = isSelected ? AppTheme.primaryColor : Colors.grey.shade200;
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
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(14), border: Border.all(color: borderColor, width: 2)),
                    child: Row(children: [
                      CircleAvatar(radius: 14, backgroundColor: borderColor.withValues(alpha: 0.12), child: Text(
                        String.fromCharCode(65 + index), style: TextStyle(color: borderColor, fontWeight: FontWeight.bold, fontSize: 14))),
                      const SizedBox(width: 10),
                      Expanded(child: Text(options[index], style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppTheme.textColor))),
                      if (trailingIcon != null) trailingIcon,
                    ]),
                  ),
                ),
              ),
            );
          }),
          if (_revealed) ...[
            const SizedBox(height: 6),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (_selectedOption == correctIndex) ? AppTheme.accentColor.withValues(alpha: 0.12) : AppTheme.warningColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((_selectedOption == correctIndex) ? '✅' : '❌', style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    (_selectedOption == correctIndex) ? '答对啦！太棒了 🎉' : '正确答案是 ${String.fromCharCode(65 + correctIndex)}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textColor),
                  ),
                  if (explanation != null && explanation.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(explanation, style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.3)),
                  ],
                ])),
              ]),
            ),
            if (_revealed && _currentIndex < _questions.length - 1) ...[
              const SizedBox(height: 8),
              Align(alignment: Alignment.centerRight, child: TextButton.icon(
                onPressed: _goToNext,
                icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                label: const Text('下一题', style: TextStyle(fontSize: 13)),
                style: TextButton.styleFrom(foregroundColor: AppTheme.primaryColor, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6)),
              )),
            ],
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
            ? const LinearGradient(colors: [Color(0xFFE8F5E9), Color(0xFFC8E6C9)], begin: Alignment.topLeft, end: Alignment.bottomRight)
            : const LinearGradient(colors: [Color(0xFFFFF3E0), Color(0xFFFFE0B2)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: allCorrect ? AppTheme.accentColor.withValues(alpha: 0.4) : AppTheme.warningColor.withValues(alpha: 0.3)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(allCorrect ? '🎉 全部答对！' : '🌟 答题完成！',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppTheme.textColor)),
        const SizedBox(height: 8),
        Text('答对 $score / $total 题',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: allCorrect ? AppTheme.accentColor : AppTheme.warningColor)),
        const SizedBox(height: 10),
        GestureDetector(onTap: _reset, child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: AppTheme.primaryColor.withValues(alpha: 0.4))),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.refresh_rounded, size: 16, color: AppTheme.primaryColor),
            SizedBox(width: 4),
            Text('再做一次', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.primaryColor)),
          ]),
        )),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 会话抽屉面板
// ═══════════════════════════════════════════════════════════════════════════

/// 侧边会话列表抽屉
class _SessionDrawer extends StatelessWidget {
  final ChatSessionSummary? activeSession;
  final List<ChatSessionSummary> sessions;
  final bool loadingSessions;
  final void Function() onCreateNew;
  final void Function(ChatSessionSummary session) onSelectSession;
  final VoidCallback onClose;

  const _SessionDrawer({
    required this.activeSession,
    required this.sessions,
    required this.loadingSessions,
    required this.onCreateNew,
    required this.onSelectSession,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: MediaQuery.of(context).size.width * 0.82,
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.only(topRight: Radius.circular(20), bottomRight: Radius.circular(20)),
        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 20, offset: Offset(-5, 0))],
      ),
      child: Column(
        children: [
          // 头部
          Container(
            padding: const EdgeInsets.fromLTRB(20, 20, 16, 16),
            decoration: BoxDecoration(
              color: AppTheme.backgroundColor,
              borderRadius: const BorderRadius.only(topRight: Radius.circular(20)),
            ),
            child: Row(children: [
              IconButton(icon: const Icon(Icons.close_rounded), onPressed: onClose,
                  color: AppTheme.textSecondary, splashRadius: 20),
              const Spacer(),
              const Text('历史对话', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppTheme.textColor)),
              const Spacer(),
              IconButton(icon: const Icon(Icons.add_rounded), onPressed: onCreateNew,
                  color: AppTheme.primaryColor, tooltip: '新建对话', splashRadius: 20),
            ]),
          ),
          // 会话列表
          Expanded(
            child: loadingSessions
                ? const Center(child: CircularProgressIndicator())
                : sessions.isEmpty
                    ? _buildEmptySessions(context)
                    : RefreshIndicator(
                        onRefresh: () async {},
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: sessions.length,
                          separatorBuilder: (_, __) => const Divider(height: 1, indent: 20),
                          itemBuilder: (context, index) => _buildSessionTile(sessions[index], index == 0),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptySessions(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('💬', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 12),
        const Text('还没有对话记录哦～', style: TextStyle(fontSize: 15, color: AppTheme.textSecondary)),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: onCreateNew,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('开始新对话'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
          ),
        ),
      ]),
    );
  }

  Widget _buildSessionTile(ChatSessionSummary session, bool isActive) {
    return InkWell(
      onTap: () { onSelectSession(session); onClose(); },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 头像图标
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isActive ? AppTheme.primaryColor.withValues(alpha: 0.15) : AppTheme.softPink.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(child: Text(isActive ? '🦄' : '💬', style: const TextStyle(fontSize: 20))),
          ),
          const SizedBox(width: 12),
          // 内容
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(session.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: isActive ? FontWeight.w700 : FontWeight.w500, color: isActive ? AppTheme.primaryColor : AppTheme.textColor))),
                const SizedBox(width: 8),
                Text(session.formattedDate, style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
              ]),
              if (session.messageCount > 0)
                Text('${session.messageCount} 条消息', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
            ]),
          ),
          if (isActive) const Icon(Icons.check_circle_rounded, color: AppTheme.primaryColor, size: 18),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主屏幕
// ═══════════════════════════════════════════════════════════════════════════

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  bool _isLoading = false;
  bool _autoPlay = true;
  bool _isListening = false;
  int? _speakingMessageIndex;
  bool _showSessionDrawer = false;

  /// 每条消息的答题记录
  final Map<String, int> _questionAnswers = {};

  /// 是否已有活跃会话（用于判断是否在加载状态）
  bool _hasLoadedSession = false;

  @override
  void initState() {
    super.initState();
    TtsService().init();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<ChatSessionProvider>();
      final userProvider = context.read<UserProvider>();
      final childId = userProvider.activeChildId;
      if (childId != null) {
        provider.setChildId(childId);
      }
      // 加载会话列表
      provider.loadSessions();

      // 如果有活跃会话就恢复它
      if (provider.activeSession != null) {
        _hasLoadedSession = true;
      } else {
        // 设置默认开场白
        _addGreeting();
        _hasLoadedSession = true;
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _addGreeting() {
    // 仅在无会话时显示默认开场白
    if (!_hasLoadedSession) return;
    // 开场白由 Provider 管理，这里不做任何事
  }

  // ─── 消息发送（使用 Provider）─────────────────────────────────────

  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    _controller.clear();
    _scrollToBottom();

    final provider = context.read<ChatSessionProvider>();
    final msgIndex = await provider.sendMessage(message);

    // 自动朗读
    if (_autoPlay && mounted) {
      await _autoSpeakMessage(msgIndex);
    }
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

  // ─── 语音输出 ──────────────────────────────────────────────────────

  Future<void> _autoSpeakMessage(int index) async {
    if (index < 0) return;
    final provider = context.read<ChatSessionProvider>();
    if (index >= provider.localMessages.length) return;
    final msg = provider.localMessages[index];
    if (msg.role != 'assistant') return;

    final content = (msg.displayText ?? msg.content).trim();
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

  Future<void> _speakMessage(int index) async {
    final tts = TtsService();
    if (_speakingMessageIndex == index) {
      await tts.stop();
      setState(() => _speakingMessageIndex = null);
      return;
    }
    if (_speakingMessageIndex != null) await tts.stop();
    if (!mounted) return;

    final provider = context.read<ChatSessionProvider>();
    if (index >= provider.localMessages.length) return;
    final msg = provider.localMessages[index];
    final content = (msg.displayText ?? msg.content).trim();
    if (content.isEmpty) return;

    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted) setState(() => _speakingMessageIndex = null);
  }

  // ─── 语音输入回调 ──────────────────────────────────────────────────

  void _onSpeechResult(String text) {
    if (text.trim().isNotEmpty) {
      _sendMessage(text: text.trim());
    }
  }

  void _onListeningChange(bool isListening) {
    setState(() => _isListening = isListening);
  }

  // ─── 构建 ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [],
      child: Scaffold(
        body: Stack(
          children: [
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.backgroundColor, Color(0xFFFFF0F5)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: SafeArea(
                child: Column(children: [
                  // _buildTopBar(),  // 顶部栏已隐藏，让对话占满屏幕
                  Expanded(child: _buildMessageList()),
                  _buildInputArea(),
                ]),
              ),
            ),
            // 会话抽屉
            if (_showSessionDrawer)
              GestureDetector(
                onTap: () => setState(() => _showSessionDrawer = false),
                child: Container(color: Colors.black26),
              ),
            if (_showSessionDrawer)
              SlideTransition(
                position: Tween<Offset>(begin: const Offset(-1, 0), end: Offset.zero).animate(
                    CurvedAnimation(parent: ModalRoute.of(context)!.animation ?? const AlwaysStoppedAnimation(0), curve: Curves.easeOut)),
                child: Consumer<ChatSessionProvider>(
                  builder: (ctx, provider, _) => _SessionDrawer(
                    activeSession: provider.activeSession,
                    sessions: provider.sessions,
                    loadingSessions: provider.loadingSessions,
                    onCreateNew: () async {
                      await provider.createNewSession();
                      setState(() {
                        _showSessionDrawer = false;
                      });
                    },
                    onSelectSession: (session) async {
                      await provider.switchToSession(session);
                    },
                    onClose: () => setState(() => _showSessionDrawer = false),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }


  Widget _buildMessageList() {
    return Consumer<ChatSessionProvider>(
      builder: (ctx, provider, _) {
        final messages = provider.localMessages;
        if (provider.isLoadingMessages) {
          return const Center(child: ShimmerCard(width: 80, height: 80));
        }
        return ListView.builder(
          controller: _scrollController,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          itemCount: messages.length + (_isLoading ? 1 : 0),
          itemBuilder: (context, index) {
            if (_isLoading && index == messages.length) {
              return _buildLoadingIndicator();
            }
            final message = messages[index];
            final isUser = message.role == 'user';
            return _buildMessageBubble(message, isUser, index);
          },
        );
      },
    );
  }

  Widget _buildMessageBubble(ChatMessageEntry message, bool isUser, int index) {
    final isSpeaking = _speakingMessageIndex == index;
    final quizQuestions = message.quizQuestions;
    final displayText = message.displayText ?? message.content;
    final hasQuiz = quizQuestions != null && quizQuestions.isNotEmpty;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      builder: (context, value, child) {
        return Opacity(opacity: value, child: Transform.scale(scale: value, child: child));
      },
      child: Padding(padding: const EdgeInsets.only(bottom: 12), child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
          decoration: BoxDecoration(
            gradient: isUser ? const LinearGradient(
                colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
                begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
            color: isUser ? null : Colors.white,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(AppTheme.buttonRadius),
              topRight: const Radius.circular(AppTheme.buttonRadius),
              bottomLeft: Radius.circular(isUser ? AppTheme.buttonRadius : 6),
              bottomRight: Radius.circular(isUser ? 6 : AppTheme.buttonRadius),
            ),
            boxShadow: [
              BoxShadow(color: (isUser ? AppTheme.primaryColor : Colors.grey).withValues(alpha: 0.15),
                  blurRadius: 15, offset: const Offset(0, 5)),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(20, 14, 12, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              if (!isUser) ...[const Text('🦄', style: TextStyle(fontSize: 24)), const SizedBox(width: 10)],
              Flexible(child: Text(displayText,
                  style: TextStyle(color: isUser ? Colors.white : AppTheme.textColor, fontSize: 16, height: 1.4))),
              if (isUser) const SizedBox(width: 4),
            ]),
            if (!isUser && hasQuiz) ...[
              const SizedBox(height: 12),
              _InlineQuizCard(
                questions: quizQuestions,
                messageIndex: index,
                onAnswered: (qIdx, selected) {
                  setState(() => _questionAnswers['${index}_$qIdx'] = selected);
                },
              ),
            ],
            if (!isUser) ...[
              const SizedBox(height: 6),
              Align(alignment: Alignment.centerRight, child: _buildSpeakButton(isSpeaking, index)),
            ],
          ]),
        ),
      )),
    );
  }

  Widget _buildSpeakButton(bool isSpeaking, int index) {
    return GestureDetector(
      onTap: () => _speakMessage(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: isSpeaking ? AppTheme.primaryColor.withValues(alpha: 0.15) : AppTheme.primaryColor.withValues(alpha: 0.08),
          shape: BoxShape.circle,
        ),
        child: Icon(isSpeaking ? Icons.volume_up_rounded : Icons.volume_mute_rounded, size: 20,
            color: isSpeaking ? AppTheme.primaryColor : AppTheme.textSecondary),
      ),
    );
  }

  Widget _buildLoadingIndicator() {
    return const Padding(padding: EdgeInsets.only(bottom: 12), child: Align(
      alignment: Alignment.centerLeft, child: ShimmerCard(width: 200, height: 48)));
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppTheme.cardRadius)),
        boxShadow: [
          BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.1), blurRadius: 20, offset: const Offset(0, -5)),
        ],
      ),
      child: Row(children: [
        SpeechInputWidget(
          onResult: _onSpeechResult,
          onListeningChange: _onListeningChange,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Container(
            decoration: BoxDecoration(color: AppTheme.backgroundColor, borderRadius: BorderRadius.circular(AppTheme.buttonRadius + 1)),
            child: TextField(
              controller: _controller,
              maxLines: 3, minLines: 1,
              decoration: InputDecoration(
                hintText: _isListening ? '正在听你说话…' : '和小犀聊天吧~',
                hintStyle: TextStyle(color: AppTheme.textSecondary.withValues(alpha: 0.5)),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
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
            width: 48, height: 48,
            decoration: BoxDecoration(
              gradient: _isLoading
                  ? LinearGradient(colors: [Colors.grey.shade300, Colors.grey.shade400])
                  : const LinearGradient(colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              shape: BoxShape.circle,
              boxShadow: _isLoading ? null : [
                BoxShadow(color: AppTheme.primaryColor.withValues(alpha: 0.4), blurRadius: 15, offset: const Offset(0, 5)),
              ],
            ),
            child: _isLoading
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                : const Icon(Icons.send_rounded, color: Colors.white, size: 24),
          ),
        ),
      ]),
    );
  }
}
