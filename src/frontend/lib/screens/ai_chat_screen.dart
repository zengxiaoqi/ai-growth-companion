import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

class AIChatScreen extends StatefulWidget {
  const AIChatScreen({super.key});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen> with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, String>> _messages = [];
  final ScrollController _scrollController = ScrollController();
  bool _isLoading = false;
  late AnimationController _bubbleAnimationController;

  @override
  void initState() {
    super.initState();
    _bubbleAnimationController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat(reverse: true);
    
    // 添加欢迎消息
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

  void _sendMessage() async {
    final message = _controller.text.trim();
    if (message.isEmpty) return;

    setState(() {
      _messages.add({'role': 'user', 'content': message});
      _isLoading = true;
    });
    _controller.clear();
    _scrollToBottom();

    // 模拟 AI 响应
    await Future.delayed(const Duration(milliseconds: 800));
    
    setState(() {
      _messages.add({
        'role': 'assistant',
        'content': _getAIResponse(message),
      });
      _isLoading = false;
    });
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

  String _getAIResponse(String message) {
    final responses = [
      '太棒了！继续加油~ 🌟',
      '你真聪明！🎉',
      '让我们一起学习吧！📚',
      '太好了，这个问题问得很好！',
      '我喜欢你提出的问题，继续探索吧~ ✨',
    ];
    return responses[message.length % responses.length];
  }

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
              // 自定义顶部栏
              _buildAppBar(),
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

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.1),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: const Icon(Icons.arrow_back_rounded, color: AppTheme.textColor),
            ),
          ),
          const Spacer(),
          // 头像和名字
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.withOpacity(0.1),
                  blurRadius: 8,
                ),
              ],
            ),
            child: const Row(
              children: [
                Text('🦄', style: TextStyle(fontSize: 24)),
                SizedBox(width: 8),
                Text(
                  '小犀',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textColor,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          // 装饰星星
          const StarDecoration(size: 20),
        ],
      ),
    );
  }

  Widget _buildMessageList() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _messages.length + (_isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (_isLoading && index == _messages.length) {
          return _buildLoadingIndicator();
        }
        final message = _messages[index];
        final isUser = message['role'] == 'user';
        return _buildMessageBubble(message['content']!, isUser);
      },
    );
  }

  Widget _buildMessageBubble(String content, bool isUser) {
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
                  color: (isUser ? AppTheme.primaryColor : Colors.grey).withOpacity(0.15),
                  blurRadius: 15,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
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
              ],
            ),
          ),
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
          // 输入框
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
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 发送按钮
          GestureDetector(
            onTap: _isLoading ? null : _sendMessage,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(14),
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
                  : const Icon(Icons.send_rounded, color: Colors.white, size: 24),
            ),
          ),
        ],
      ),
    );
  }
}