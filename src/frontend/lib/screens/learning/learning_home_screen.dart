import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

class LearningHomeScreen extends StatelessWidget {
  const LearningHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          // 顶部
          Container(
            padding: const EdgeInsets.all(20),
            child: const Row(
              children: [
                Text(
                  '📚 学习中心',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          // 学科选择
          Expanded(
            child: GridView.count(
              padding: const EdgeInsets.all(20),
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              children: [
                _DomainCard(
                  title: '语言',
                  icon: Icons.chat_bubble,
                  color: AppTheme.primaryColor,
                ),
                _DomainCard(
                  title: '数学',
                  icon: Icons.calculate,
                  color: AppTheme.secondaryColor,
                ),
                _DomainCard(
                  title: '科学',
                  icon: Icons.science,
                  color: AppTheme.accentColor,
                ),
                _DomainCard(
                  title: '艺术',
                  icon: Icons.palette,
                  color: const Color(0xFFA55EEA),
                ),
                _DomainCard(
                  title: '社会',
                  icon: Icons.people,
                  color: const Color(0xFFFFCE4E),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DomainCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;

  const _DomainCard({
    required this.title,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {},
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.2),
              blurRadius: 10,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 40, color: color),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}