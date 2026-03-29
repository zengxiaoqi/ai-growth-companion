import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

class LearningHomeScreen extends StatelessWidget {
  const LearningHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BubbleBackground(
      child: SafeArea(
        child: Column(
          children: [
            // 顶部标题
            _buildHeader(),
            // 学科选择
            Expanded(
              child: _buildSubjectGrid(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          // 装饰云朵
          const CloudDecoration(size: 32, color: AppTheme.softBlue),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              '📚 学习中心',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: AppTheme.textColor,
              ),
            ),
          ),
          // 装饰星星
          const StarDecoration(size: 24),
          const SizedBox(width: 8),
          const Text('✨', style: TextStyle(fontSize: 24)),
        ],
      ),
    );
  }

  Widget _buildSubjectGrid() {
    final subjects = [
      {'title': '语言', 'icon': Icons.chat_bubble_rounded, 'emoji': '🗣️', 'color': AppTheme.primaryColor, 'gradient': [AppTheme.primaryColor, const Color(0xFFFF9EBB)]},
      {'title': '数学', 'icon': Icons.calculate_rounded, 'emoji': '🔢', 'color': AppTheme.secondaryColor, 'gradient': [AppTheme.secondaryColor, const Color(0xFF9AD0E8)]},
      {'title': '科学', 'icon': Icons.science_rounded, 'emoji': '🔬', 'color': AppTheme.accentColor, 'gradient': [AppTheme.accentColor, const Color(0xFF9AE87A)]},
      {'title': '艺术', 'icon': Icons.palette_rounded, 'emoji': '🎨', 'color': const Color(0xFFDDA0DD), 'gradient': [const Color(0xFFDDA0DD), const Color(0xFFE8B8E8)]},
      {'title': '社会', 'icon': Icons.people_rounded, 'emoji': '🌍', 'color': const Color(0xFFFFCE4E), 'gradient': [const Color(0xFFFFCE4E), const Color(0xFFFFE066)]},
      {'title': '音乐', 'icon': Icons.music_note_rounded, 'emoji': '🎵', 'color': const Color(0xFFFF85A2), 'gradient': [const Color(0xFFFF85A2), const Color(0xFFFFA5B9)]},
    ];

    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 0.9,
      ),
      itemCount: subjects.length,
      itemBuilder: (context, index) {
        final subject = subjects[index];
        return _SubjectCard(
          title: subject['title'] as String,
          icon: subject['icon'] as IconData,
          emoji: subject['emoji'] as String,
          color: subject['color'] as Color,
          gradient: subject['gradient'] as List<Color>,
          index: index,
        );
      },
    );
  }
}

class _SubjectCard extends StatefulWidget {
  final String title;
  final IconData icon;
  final String emoji;
  final Color color;
  final List<Color> gradient;
  final int index;

  const _SubjectCard({
    required this.title,
    required this.icon,
    required this.emoji,
    required this.color,
    required this.gradient,
    required this.index,
  });

  @override
  State<_SubjectCard> createState() => _SubjectCardState();
}

class _SubjectCardState extends State<_SubjectCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
    
    _scaleAnimation = Tween<double>(begin: 1.0, end: 1.05).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) {
        setState(() => _isPressed = false);
        // 跳转到对应学科页面
      },
      onTapCancel: () => setState(() => _isPressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        transform: Matrix4.identity()..scale(_isPressed ? 0.95 : 1.0),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                widget.gradient[0].withOpacity(0.15),
                widget.gradient[1].withOpacity(0.05),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: widget.color.withOpacity(0.2),
              width: 2,
            ),
            boxShadow: [
              BoxShadow(
                color: widget.color.withOpacity(0.15),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Stack(
            children: [
              // 背景装饰
              Positioned(
                right: -10,
                top: -10,
                child: AnimatedBuilder(
                  animation: _scaleAnimation,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _scaleAnimation.value,
                      child: child,
                    );
                  },
                  child: Icon(
                    widget.icon,
                    size: 80,
                    color: widget.color.withOpacity(0.1),
                  ),
                ),
              ),
              Positioned(
                right: 10,
                bottom: 10,
                child: Text(
                  widget.emoji,
                  style: TextStyle(
                    fontSize: 30,
                    color: widget.color.withOpacity(0.3),
                  ),
                ),
              ),
              // 内容
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            widget.color.withOpacity(0.2),
                            widget.color.withOpacity(0.1),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: widget.color.withOpacity(0.3),
                            blurRadius: 15,
                          ),
                        ],
                      ),
                      child: Icon(widget.icon, size: 40, color: widget.color),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.8),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        widget.title,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: widget.color,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.arrow_forward_rounded, size: 16, color: widget.color.withOpacity(0.6)),
                        const SizedBox(width: 4),
                        Text(
                          '开始学习',
                          style: TextStyle(
                            fontSize: 12,
                            color: widget.color.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}