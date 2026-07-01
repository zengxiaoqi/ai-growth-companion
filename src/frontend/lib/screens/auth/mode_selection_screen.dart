import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';

class ModeSelectionScreen extends StatelessWidget {
  const ModeSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userProvider = context.watch<UserProvider>();
    final userName = userProvider.currentUser?['name'] ?? '用户';
    final userType = userProvider.currentUser?['type']?.toString() ?? 'child';
    final isChild = userType == 'child';
    final isParent = userType == 'parent';

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 顶部标签
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppTheme.accentColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.auto_awesome, size: 16, color: AppTheme.accentColor),
                      SizedBox(width: 6),
                      Text(
                        '触控友好模式已开启',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.accentColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // 标题
              const Text(
                '请选择使用模式',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textColor,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '学生端适合沉浸学习，家长端可查看进展并管理学习计划。',
                style: TextStyle(
                  fontSize: 14,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 28),

              // 学生模式卡片
              _buildStudentCard(context, isChild),
              const SizedBox(height: 20),

              // 家长模式卡片
              _buildParentCard(context, userName, userProvider, isParent),
              const SizedBox(height: 28),

              // 底部安全提示
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.shield_rounded, size: 16, color: AppTheme.textSecondary.withValues(alpha: 0.6)),
                    const SizedBox(width: 6),
                    Text(
                      '全程启用安全保护与家长管控能力',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textSecondary.withValues(alpha: 0.6),
                      ),
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

  // 学生模式卡片
  Widget _buildStudentCard(BuildContext context, bool isChild) {
    return GestureDetector(
      onTap: isChild
          ? () {
              context.read<UserProvider>().setSelectedMode('child');
            }
          : null,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppTheme.primaryColor.withValues(alpha: isChild ? 0.12 : 0.04),
              blurRadius: 25,
              offset: const Offset(0, 8),
            ),
          ],
          border: isChild ? null : Border.all(color: Colors.grey.shade200, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 头部
            Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: isChild ? 0.15 : 0.08),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(
                    Icons.rocket_launch_rounded,
                    size: 28,
                    color: isChild ? AppTheme.primaryColor : Colors.grey.shade400,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '学生模式',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: isChild ? AppTheme.primaryColor : Colors.grey.shade500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '课程、挑战与 AI 伙伴',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isChild ? AppTheme.textSecondary : Colors.grey.shade400,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            // 描述
            Text(
              isChild
                  ? '进入学习主界面，开始今日任务、完成互动练习，并解锁成长成就。'
                  : '仅孩子账号可进入学生端。',
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: isChild ? AppTheme.textSecondary : Colors.grey.shade400,
              ),
            ),
            const SizedBox(height: 20),

            // 按钮
            Container(
              width: double.infinity,
              height: 50,
              decoration: BoxDecoration(
                gradient: isChild
                    ? const LinearGradient(colors: [AppTheme.primaryColor, Color(0xFFFFA5B9)])
                    : LinearGradient(colors: [Colors.grey.shade300, Colors.grey.shade400]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.rocket_launch_rounded, color: Colors.white, size: 20),
                  SizedBox(width: 8),
                  Text(
                    isChild ? '进入学生端' : '不可用',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 家长模式卡片
  Widget _buildParentCard(BuildContext context, String userName, UserProvider userProvider, bool isParent) {
    return GestureDetector(
      onTap: isParent
          ? () {
              context.read<UserProvider>().setSelectedMode('parent');
            }
          : null,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppTheme.secondaryColor.withValues(alpha: isParent ? 0.12 : 0.04),
              blurRadius: 25,
              offset: const Offset(0, 8),
            ),
          ],
          border: isParent ? null : Border.all(color: Colors.grey.shade200, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 头部
            Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryColor.withValues(alpha: isParent ? 0.15 : 0.08),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(
                    Icons.trending_up_rounded,
                    size: 28,
                    color: isParent ? AppTheme.secondaryColor : Colors.grey.shade400,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '家长模式',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: isParent ? AppTheme.textColor : Colors.grey.shade500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '报告、管控与作业管理',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isParent ? AppTheme.textSecondary : Colors.grey.shade400,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            // 当前账号信息
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.backgroundColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.account_circle_rounded, size: 16, color: AppTheme.textColor),
                      const SizedBox(width: 6),
                      Text(
                        '当前账号：$userName',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    isParent ? '已登录家长账号' : '当前为孩子账号，家长端不可用',
                    style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // 按钮
            Container(
              width: double.infinity,
              height: 50,
              decoration: BoxDecoration(
                gradient: isParent
                    ? const LinearGradient(colors: [AppTheme.secondaryColor, Color(0xFFA8D8EA)])
                    : LinearGradient(colors: [Colors.grey.shade300, Colors.grey.shade400]),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.lock_outline_rounded, color: Colors.white, size: 20),
                  SizedBox(width: 8),
                  Text(
                    isParent ? '进入家长端' : '不可用',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
