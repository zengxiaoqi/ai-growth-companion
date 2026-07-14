// AI 对话升级 — 添加会话管理和上下文摘要
// 原始功能（内联测验、TTS朗读、语音输入）已完整保留

import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
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
        color: allCorrect ? const Color(0xFFE8F5E9) : const Color(0xFFFFF3E0),
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
                  color: AppTheme.primaryColor,
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

    final provider = context.read<ChatSessionProvider>();
    
    // 先设置 loading 状态（禁用发送按钮）
    setState(() => _isLoading = true);
    
    // 启动发送流程 - provider.sendMessage 会同步添加用户消息和 AI 占位符
    // 然后异步等待 SSE 流
    final sendFuture = provider.sendMessage(message);
    
    // 等待当前帧完成，确保消息已添加到列表并渲染
    // 使用 addPostFrameCallback 确保 ListView 已布局完成
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottomImmediate();
    });
    
    sendFuture.then((msgIndex) {
      if (mounted) {
        setState(() => _isLoading = false);
        _scrollToBottom();
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

  /// 立即滚动到底部（用于消息发送后确保新消息可见）
  /// 与 _scrollToBottom 不同，这个方法会重试直到滚动成功
  void _scrollToBottomImmediate() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    } else {
      // ListView 还没布局完成，延迟重试
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
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
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: AppTheme.backgroundColor,
        ),
        child: SafeArea(
          child: Column(children: [
            // 主消息列表
            Expanded(child: _buildMessageList()),
            // 输入区域
            _buildInputArea(),
          ]),
        ),
      ),
    );
  }

  /// 打开会话抽屉（用 OverlayEntry 替代 Stack，避免 Web 端渲染问题）
  void _openSessionDrawer() {
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) => _SessionDrawerOverlay(
        onClose: () => entry.remove(),
      ),
    );
    overlay.insert(entry);
  }


  Widget _buildMessageList() {
    return Consumer<ChatSessionProvider>(
      builder: (ctx, provider, _) {
        try {
        final messages = provider.localMessages;
        // 始终显示 ListView，不因 isLoadingMessages 替换为骨架屏
        // 这样用户消息和已有消息始终可见，加载状态用顶部小指示器表示
        return Column(children: [
          // 加载历史消息时显示顶部小进度条
          if (provider.isLoadingMessages)
            const LinearProgressIndicator(minHeight: 2, backgroundColor: Colors.transparent),
          Expanded(
            child: messages.isEmpty && !provider.isLoadingMessages
                ? const Center(child: Text('和小犀聊天吧~ 🦄', style: TextStyle(fontSize: 16, color: Colors.grey)))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      if (index >= messages.length) return const SizedBox.shrink();
                      final message = messages[index];
                      final isUser = message.role == 'user';
                      return _buildMessageBubble(message, isUser, index);
                    },
                  ),
          ),
        ]);
        } catch (e, s) {
          debugPrint('🔥 [MessageList] EXCEPTION: $e');
          debugPrint('🔥 [MessageList] STACK: $s');
          return Center(child: Text('⚠️ 消息列表渲染错误: $e', style: const TextStyle(color: Colors.red)));
        }
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
    debugPrint('🔍 [UI] buildBubble idx=$index role=${message.role} isEmpty=$isEmpty isStreaming=$isStreaming displayText="${displayText.length > 50 ? displayText.substring(0, 50) : displayText}" hasGame=$hasGame hasQuiz=$hasQuiz showThinking=$showThinking');

    try {
    return _buildMessageBubbleInner(message, isUser, index, isSpeaking, quizQuestions,
        displayText, hasQuiz, hasGame, isStreaming, isEmpty, thinkingContent, showThinking, expanded);
    } catch (e, s) {
      debugPrint('🔥 [UI] EXCEPTION in buildBubble idx=$index: $e');
      debugPrint('🔥 [UI] STACK: $s');
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Align(alignment: Alignment.centerLeft, child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(12)),
          child: Text('⚠️ 渲染错误: $e', style: TextStyle(fontSize: 13, color: Colors.red)),
        )),
      );
    }
  }

  Widget _buildMessageBubbleInner(ChatMessageEntry message, bool isUser, int index,
      bool isSpeaking, dynamic quizQuestions, String displayText,
      bool hasQuiz, bool hasGame, bool isStreaming, bool isEmpty,
      String? thinkingContent, bool showThinking, bool expanded) {
    debugPrint('🔍 [UI] buildInner START idx=$index');

    // Build children list with debug logging
    final List<Widget> columnChildren = [];
    
    // ── AI 消息：思考内容区域（可折叠）──
    if (!isUser && showThinking) {
      debugPrint('🔍 [UI] buildInner idx=$index: adding thinking section');
      columnChildren.addAll(_buildThinkingSection(thinkingContent, expanded, isStreaming, index));
    }

    // ── 消息主体文本 ──
    if (!isUser) {
      debugPrint('🔍 [UI] buildInner idx=$index: adding AI message body (isEmpty=$isEmpty, isStreaming=$isStreaming)');
      columnChildren.add(const Text('🦄', style: TextStyle(fontSize: 24)));
      columnChildren.add(const SizedBox(height: 4));
      if (isEmpty && isStreaming) {
        debugPrint('🔍 [UI] buildInner idx=$index: adding typing indicator');
        columnChildren.add(_buildTypingIndicator());
      } else {
        columnChildren.add(Text(displayText,
          style: const TextStyle(fontSize: 16, height: 1.4, color: AppTheme.textColor)));
        if (isStreaming && !isEmpty) {
          columnChildren.add(const SizedBox(height: 4));
          columnChildren.add(_buildStreamingDots());
        }
      }
    } else {
      columnChildren.add(Text(displayText,
        style: const TextStyle(color: Colors.white, fontSize: 16, height: 1.4)));
      columnChildren.add(const SizedBox(width: 4));
    }

    // ── Quiz card ──
    if (!isUser && hasQuiz) {
      debugPrint('🔍 [UI] buildInner idx=$index: adding quiz card');
      columnChildren.add(const SizedBox(height: 12));
      columnChildren.add(_InlineQuizCard(
        questions: quizQuestions,
        messageIndex: index,
        onAnswered: (qIdx, selected) {},
      ));
    }

    // ── Game card ──
    if (!isUser && hasGame) {
      debugPrint('🔍 [UI] buildInner idx=$index: adding game card');
      columnChildren.add(const SizedBox(height: 12));
      columnChildren.add(_InlineGameCard(
        gameType: message.gameType!,
        gameData: message.gameData!,
      ));
    }

    // ── Speak button ──
    if (!isUser && !isStreaming) {
      debugPrint('🔍 [UI] buildInner idx=$index: adding speak button');
      columnChildren.add(const SizedBox(height: 6));
      columnChildren.add(Align(alignment: Alignment.centerRight, child: _buildSpeakButton(isSpeaking, index)));
    }

    debugPrint('🔍 [UI] buildInner idx=$index: assembling widget tree (${columnChildren.length} children)');

    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
          decoration: BoxDecoration(
            color: isUser ? AppTheme.primaryColor : Colors.white,
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: columnChildren,
        ),
      ),
    ),
  );
  }

  List<Widget> _buildThinkingSection(String? thinkingContent, bool expanded, bool isStreaming, int index) {
    return [
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
            if (!isStreaming) ...[
              Text('${(thinkingContent ?? '').replaceAll(RegExp(r'\\s+'), ' ').split('').length} 字',
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
              data: thinkingContent ?? '',
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
    ];
  }
  /// 三个跳动圆点的打字指示器（临时用静态组件替代_DotAnimation排查）
  Widget _buildTypingIndicator() {
    debugPrint('🔍 [UI] _buildTypingIndicator CALLED');
    return Row(mainAxisSize: MainAxisSize.min, children: [
      _SimpleDot(),
      const SizedBox(width: 4),
      _SimpleDot(),
      const SizedBox(width: 4),
      _SimpleDot(),
    ]);
  }

  /// 流式输出时文末的小跳动点
  Widget _buildStreamingDots() {
    return SizedBox(
      width: 16, height: 20,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _SimpleDot(size: 4),
        const SizedBox(width: 2),
        _SimpleDot(size: 4),
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
        // 会话历史按钮
        GestureDetector(
          onTap: _openSessionDrawer,
          child: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: AppTheme.primaryColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.chat_rounded, size: 20, color: AppTheme.primaryColor),
          ),
        ),
        const SizedBox(width: 8),
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
              color: _isLoading ? Colors.grey.shade400 : AppTheme.primaryColor,
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
class _SimpleDot extends StatelessWidget {
  final double size;
  const _SimpleDot({this.size = 8});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AppTheme.primaryColor,
        shape: BoxShape.circle,
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 会话抽屉覆盖层 — 用 Overlay 替代 Stack，避免 Web 端渲染问题
// ═══════════════════════════════════════════════════════════════════════════

class _SessionDrawerOverlay extends StatelessWidget {
  final VoidCallback onClose;

  const _SessionDrawerOverlay({required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 半透明背景
        Positioned.fill(
          child: GestureDetector(
            onTap: onClose,
            child: Container(color: Colors.black26),
          ),
        ),
        // 抽屉面板
        Positioned(
          top: 0,
          bottom: 0,
          left: 0,
          child: Consumer<ChatSessionProvider>(
            builder: (ctx, provider, _) => _SessionDrawer(
              activeSession: provider.activeSession,
              sessions: provider.sessions,
              loadingSessions: provider.loadingSessions,
              onCreateNew: () async {
                await provider.createNewSession();
                onClose();
              },
              onSelectSession: (session) async {
                await provider.switchToSession(session);
              },
              onClose: onClose,
            ),
          ),
        ),
      ],
    );
  }
}
