import 'package:flutter/material.dart';
import 'fill_blank_game_screen.dart';
import 'flying_flower_game_screen.dart';
import 'solitaire_game_screen.dart';

/// 诗词游戏入口页
class PoetryGameScreen extends StatefulWidget {
  const PoetryGameScreen({super.key});

  @override
  State<PoetryGameScreen> createState() => _PoetryGameScreenState();
}

class _PoetryGameScreenState extends State<PoetryGameScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeIn = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8), // 米黄色背景
      appBar: AppBar(
        title: const Text('诗词游戏'),
        backgroundColor: const Color(0xFF8B2500), // 朱红色
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: FadeTransition(
        opacity: _fadeIn,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 标题区域
              Container(
                padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 24),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF8B2500), Color(0xFFB85450)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF8B2500).withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    const Icon(
                      Icons.auto_stories,
                      size: 48,
                      color: Colors.white,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      '诗韵游艺',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '品味诗词之美',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white70,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // 游戏卡片列表
              _buildGameCard(
                context: context,
                icon: Icons.edit_note,
                title: '填字游戏',
                subtitle: '填入缺失的字词',
                description: '还原完整诗词',
                color: const Color(0xFF2E7D32),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const FillBlankGameScreen()),
                ),
              ),
              const SizedBox(height: 16),

              _buildGameCard(
                context: context,
                icon: Icons.local_florist,
                title: '飞花令',
                subtitle: '输入一个字',
                description: '找出包含该字的诗句',
                color: const Color(0xFF6A1B9A),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const FlyingFlowerGameScreen()),
                ),
              ),
              const SizedBox(height: 16),

              _buildGameCard(
                context: context,
                icon: Icons.link,
                title: '诗词接龙',
                subtitle: '上句接下句',
                description: '完成诗词接龙',
                color: const Color(0xFF1565C0),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const SolitaireGameScreen()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGameCard({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String subtitle,
    required String description,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: color.withValues(alpha: 0.2),
          width: 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                // 图标
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [color, color.withValues(alpha: 0.7)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, size: 32, color: Colors.white),
                ),
                const SizedBox(width: 16),
                // 内容
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: color,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey[700],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        description,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[500],
                        ),
                      ),
                    ],
                  ),
                ),
                // 箭头
                Icon(
                  Icons.arrow_forward_ios,
                  size: 16,
                  color: Colors.grey[400],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
