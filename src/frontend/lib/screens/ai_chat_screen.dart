import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import '../services/tts_service.dart';
import '../providers/user_provider.dart';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, String>> _messages = [];
  final ScrollController _scrollController = ScrollController();

  bool _isLoading = false;
  bool _autoPlay = true;
  int? _speakingMessageIndex;
  late AnimationController _bubbleAnimationController;

  @override
  void initState() {
    super.initState();

    _bubbleAnimationController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat(reverse: true);

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
    _bubbleAnimationController.dispose();
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
      final msgIndex = _messages.length;
      setState(() {
        _messages.add({'role': 'assistant', 'content': reply});
        _isLoading = false;
      });

      // 自动朗读
      if (_autoPlay) {
        await _autoSpeakMessage(msgIndex);
      }
    } catch (_) {
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

    final content = _messages[index]['content'] ?? '';
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

    // 如果正在朗读同一条消息，则停止
    if (_speakingMessageIndex == index) {
      await tts.stop();
      setState(() => _speakingMessageIndex = null);
      return;
    }

    // 停止当前朗读
    if (_speakingMessageIndex != null) {
      await tts.stop();
    }

    final content = _messages[index]['content'] ?? '';
    if (content.isEmpty) return;

    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted) {
      setState(() => _speakingMessageIndex = null);
    }
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
              // 顶部控制栏：tittle + 自动播放开关
              _buildTopBar(),
              // 消息列表
              Expanded(
                child: _buildMessageList(),
              ),
              // 输入框
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
          const Text(
            '🦄 小犀聊天',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: AppTheme.textColor,
            ),
          ),
          const Spacer(),
          // 自动朗读切换
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => setState(() => _autoPlay = !_autoPlay),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _autoPlay
                    ? AppTheme.primaryColor.withOpacity(0.12)
                    : Colors.grey.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _autoPlay ? Icons.volume_up_rounded : Icons.volume_off_rounded,
                    size: 18,
                    color: _autoPlay ? AppTheme.primaryColor : AppTheme.textSecondary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _autoPlay ? '自动朗读' : '静音',
                    style: TextStyle(
                      fontSize: 12,
                      color: _autoPlay ? AppTheme.primaryColor : AppTheme.textSecondary,
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
        return _buildMessageBubble(message['content']!, isUser, index);
      },
    );
  }

  Widget _buildMessageBubble(String content, bool isUser, int index) {
    final isSpeaking = _speakingMessageIndex == index;

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
              maxWidth: MediaQuery.of(context).size.width * 0.75,
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
                topLeft: const Radius.circular(24),
                topRight: const Radius.circular(24),
                bottomLeft: Radius.circular(isUser ? 24 : 6),
                bottomRight: Radius.circular(isUser ? 6 : 24),
              ),
              boxShadow: [
                BoxShadow(
                  color: (isUser ? AppTheme.primaryColor : Colors.grey)
                      .withOpacity(0.15),
                  blurRadius: 15,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 8, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!isUser) ...[
                      const Text('🦄', style: TextStyle(fontSize: 24)),
                      const SizedBox(width: 10),
                    ],
                    Flexible(
                      child: Text(
                        content,
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
              ? AppTheme.primaryColor.withOpacity(0.15)
              : AppTheme.primaryColor.withOpacity(0.08),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.grey.withOpacity(0.1),
                blurRadius: 15,
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🦄', style: TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              AnimatedBuilder(
                animation: _bubbleAnimationController,
                builder: (context, child) {
                  return Row(
                    children: [
                      _buildDot(0),
                      const SizedBox(width: 4),
                      _buildDot(1),
                      const SizedBox(width: 4),
                      _buildDot(2),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDot(int index) {
    return AnimatedBuilder(
      animation: _bubbleAnimationController,
      builder: (context, child) {
        final delay = index * 0.2;
        final value = ((_bubbleAnimationController.value + delay) % 1.0);
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withOpacity(0.3 + value * 0.7),
            shape: BoxShape.circle,
          ),
        );
      },
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withOpacity(0.1),
            blurRadius: 20,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius: BorderRadius.circular(25),
              ),
              child: TextField(
                controller: _controller,
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: '和小犀聊天吧~',
                  hintStyle: TextStyle(
                    color: AppTheme.textSecondary.withOpacity(0.5),
                  ),
                  border: InputBorder.none,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          const SizedBox(width: 12),
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
                          color: AppTheme.primaryColor.withOpacity(0.4),
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