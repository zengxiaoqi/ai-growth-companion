// AI 对话升级 — 添加会话管理和上下文摘要
// 原始功能（内联测验、TTS朗读、语音输入）已完整保留

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../components/shimmer_loading.dart';
import '../services/tts_service.dart';
import '../providers/user_provider.dart';
import '../providers/chat_session_provider.dart';
import '../components/speech_input_widget.dart';
import 'games/game_renderer.dart';

// ═══════════════════════════════════════════════════════════════════════════
// 内联答题卡 Widget
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
// 内联游戏卡 Widget — 非 quiz 类型的游戏渲染（matching/fill_blank/sequencing/connection/puzzle/true_false）
// ═══════════════════════════════════════════════════════════════════════════

class _InlineGameCard extends StatefulWidget {
  final String gameType;
  final Map<String, dynamic> gameData;

  const _InlineGameCard({
    required this.gameType,
    required this.gameData,
  });

  @override
  State<_InlineGameCard> createState() => _InlineGameCardState();
}

class _InlineGameCardState extends State<_InlineGameCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (!_expanded) {
      // 收起状态：显示一个"点击开始游戏"按钮
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
                    _gameTypeLabel(widget.gameType),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.primaryColor),
                  ),
                ),
                const Spacer(),
                const Text('🎮', style: TextStyle(fontSize: 20)),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              widget.gameData['title']?.toString() ?? '互动游戏',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textColor),
            ),
            const SizedBox(height: 10),
            GestureDetector(
              onTap: () => setState(() => _expanded = true),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.primaryColor, Color(0xFFFF9EBB)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.play_arrow_rounded, size: 20, color: Colors.white),
                    SizedBox(width: 4),
                    Text('开始游戏', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    // 展开状态：直接渲染 GameRenderer
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.6,
        ),
        child: GameRenderer(
          activityType: widget.gameType,
          initialData: widget.gameData,
          onExit: () => setState(() => _expanded = false),
        ),
      ),
    );
  }

  String _gameTypeLabel(String type) {
    const labels = {
      'quiz': '选择题',
      'true_false': '判断题',
      'matching': '配对游戏',
      'fill_blank': '填空游戏',
      'sequencing': '排序游戏',
      'connection': '连线游戏',
      'puzzle': '拼图游戏',
    };
    return labels[type] ?? '互动游戏';
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
            decoration: const BoxDecoration(
              color: AppTheme.backgroundColor,
              borderRadius: BorderRadius.only(topRight: Radius.circular(20)),
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
                Text(session.formattedDate, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
              ]),
              if (session.messageCount > 0)
                Text('${session.messageCount} 条消息', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
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

  final bool _autoPlay = true;
  bool _isListening = false;
  int? _speakingMessageIndex;
  bool _showSessionDrawer = false;

  /// 每条消息的答题记录（用于思考内容折叠状态）
  final Map<int, bool> _thinkingExpanded = {};

  /// 切换思考区域展开/折叠
  void _toggleThinking(int index) {
    setState(() {
      _thinkingExpanded[index] = !(_thinkingExpanded[index] ?? false);
    });
  }

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

      // 如果有活跃会话就恢复它（加载历史消息）
      if (provider.activeSession != null) {
        provider.switchToSession(provider.activeSession!);
      } else {
        // 没有活跃会话，添加默认开场白
        provider.resetGreeting();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  bool _isLoading = false;

  // ─── 消息发送（使用 Provider）─────────────────────────────────────

  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    _controller.clear();
    setState(() => _isLoading = true);
    _scrollToBottom();

    final provider = context.read<ChatSessionProvider>();
    // 不 await，让用户消息立即显示，AI 回复通过 notifyListeners 流式更新
    provider.sendMessage(message).then((msgIndex) {
      if (mounted) {
        setState(() => _isLoading = false);
        _scrollToBottom();
        // 自动朗读
        if (_autoPlay) {
          _autoSpeakMessage(msgIndex);
        }
      }
    }).catchError((e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    });
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
      providers: const [],
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(child: Container(
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
            )),
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
        debugPrint('🔍 [UI] Consumer rebuild, messages=${messages.length}, isLoadingMessages=${provider.isLoadingMessages}, isLoading=$_isLoading');
        // Web端：不用Stack/Positioned，用纯Container+Column+Expanded+ListView
        return Column(children: [
          if (provider.isLoadingMessages)
            Expanded(child: const Center(child: ShimmerCard(width: 80, height: 80)))
          else
            Expanded(
              child: ListView.builder(
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
              ),
            ),
        ]);
      },
    );
  }

  Widget _buildMessageBubble(ChatMessageEntry message, bool isUser, int index) {
    final isSpeaking = _speakingMessageIndex == index;
    final quizQuestions = message.quizQuestions;
    final displayText = message.displayText ?? message.content;
    final hasQuiz = quizQuestions != null && quizQuestions.isNotEmpty;
    final hasGame = message.gameType != null && message.gameData != null;
    final isStreaming = message.isStreaming;
    final isEmpty = displayText.isEmpty;
    final thinkingContent = message.thinkingContent?.trim();
    final showThinking = thinkingContent != null && thinkingContent.isNotEmpty;
    final expanded = _thinkingExpanded[index] ?? false;

    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Align(
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
            // ── AI 消息：思考内容区域（可折叠）──
            if (!isUser && showThinking) ...[
              GestureDetector(
                onTap: () => _toggleThinking(index),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppTheme.textSecondary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppTheme.textSecondary.withValues(alpha: 0.15)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(expanded ? Icons.keyboard_arrow_down_rounded : Icons.keyboard_arrow_up_rounded,
                        size: 18, color: AppTheme.textSecondary),
                    const SizedBox(width: 6),
                    Text('💭 思考过程', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
                    const Spacer(),
                    if (showThinking && !isStreaming) ...[
                      Text('${thinkingContent.replaceAll(RegExp(r'\\s+'), ' ').split('').length} 字',
                          style: TextStyle(fontSize: 11, color: AppTheme.textSecondary.withValues(alpha: 0.5))),
                    ],
                  ]),
                ),
              ),
              if (expanded) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    color: AppTheme.textSecondary.withValues(alpha: 0.05),
                    child: MarkdownBody(
                      data: thinkingContent,
                      styleSheet: Theme.of(context).useMaterial3
                        ? MarkdownStyleSheet.fromTheme(Theme.of(context))
                        : MarkdownStyleSheet(
                            p: TextStyle(fontSize: 13, height: 1.4, color: AppTheme.textSecondary.withValues(alpha: 0.75)),
                            code: TextStyle(fontSize: 12, fontFamily: 'monospace', color: AppTheme.textSecondary),
                            codeblockDecoration: BoxDecoration(
                              color: AppTheme.textSecondary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            blockquoteDecoration: BoxDecoration(
                              color: AppTheme.textSecondary.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            blockquote: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: AppTheme.textSecondary.withValues(alpha: 0.65)),
                          ),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
            ],

            // ── 消息主体文本（临时用Text替代MarkdownBody排查）──
            if (!isUser) ...[
              const Text('🦄', style: TextStyle(fontSize: 24)),
              const SizedBox(height: 4),
              if (isEmpty && isStreaming)
                _buildTypingIndicator()
              else
                Text(displayText,
                  style: const TextStyle(fontSize: 16, height: 1.4, color: AppTheme.textColor)),
              if (isStreaming && !isEmpty) ...[
                const SizedBox(height: 4),
                _buildStreamingDots(),
              ],
            ] else
              Text(displayText,
                style: const TextStyle(color: Colors.white, fontSize: 16, height: 1.4)),
            if (isUser) const SizedBox(width: 4),
            if (!isUser && hasQuiz) ...[
              const SizedBox(height: 12),
              _InlineQuizCard(
                questions: quizQuestions,
                messageIndex: index,
                onAnswered: (qIdx, selected) {
                  // placeholder — quiz answers handled by InlineQuizCard internally
                },
              ),
            ],
            if (!isUser && hasGame) ...[
              const SizedBox(height: 12),
              _InlineGameCard(
                gameType: message.gameType!,
                gameData: message.gameData!,
              ),
            ],
            if (!isUser && !isStreaming) ...[
              const SizedBox(height: 6),
              Align(alignment: Alignment.centerRight, child: _buildSpeakButton(isSpeaking, index)),
            ],
          ]),
        ),
      ),
    );
  }

  /// 三个跳动圆点的打字指示器
  Widget _buildTypingIndicator() {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      _DotAnimation(delay: 0),
      const SizedBox(width: 4),
      _DotAnimation(delay: 200),
      const SizedBox(width: 4),
      _DotAnimation(delay: 400),
    ]);
  }

  /// 流式输出时文末的小跳动点
  Widget _buildStreamingDots() {
    return SizedBox(
      width: 16, height: 20,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _DotAnimation(delay: 0, size: 4),
        const SizedBox(width: 2),
        _DotAnimation(delay: 200, size: 4),
      ]),
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

/// 跳动圆点动画组件（用于打字指示器）
class _DotAnimation extends StatefulWidget {
  final int delay;
  final double size;

  const _DotAnimation({this.delay = 0, this.size = 8});

  @override
  State<_DotAnimation> createState() => _DotAnimationState();
}

class _DotAnimationState extends State<_DotAnimation> with TickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Opacity(
          opacity: 0.4 + (_controller.value * 0.6),
          child: Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor,
              shape: BoxShape.circle,
            ),
          ),
        );
      },
    );
  }
}
