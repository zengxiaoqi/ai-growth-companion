// 礼品商城页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../models/reward_models.dart';

class GiftShopScreen extends StatefulWidget {
  const GiftShopScreen({super.key});

  @override
  State<GiftShopScreen> createState() => _GiftShopScreenState();
}

class _GiftShopScreenState extends State<GiftShopScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  String _selectedCategory = 'all';

  static const _categories = [
    {'key': 'all', 'label': '全部', 'icon': Icons.grid_view_rounded},
    {'key': 'entertainment', 'label': '娱乐', 'icon': Icons.movie_rounded},
    {'key': 'food', 'label': '美食', 'icon': Icons.restaurant_rounded},
    {'key': 'toy', 'label': '玩具', 'icon': Icons.toys_rounded},
    {'key': 'activity', 'label': '活动', 'icon': Icons.celebration_rounded},
    {'key': 'other', 'label': '其他', 'icon': Icons.more_horiz_rounded},
  ];

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _animController.forward();
    _loadData();
  }

  Future<void> _loadData() async {
    final rewardProvider = context.read<RewardProvider>();
    await rewardProvider.loadGifts();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final gifts = _filterGifts(reward.enabledGifts);
        final totalPoints = reward.summary?.totalPoints ?? 0;
        final screenWidth = MediaQuery.of(context).size.width;
        // 响应式列数：手机2列，平板3-4列
        final crossAxisCount = screenWidth > 900 ? 4 : (screenWidth > 600 ? 3 : 2);

        return Column(
          children: [
            // 积分余额
            _buildPointsBar(totalPoints),
            // 分类标签
            _buildCategoryTabs(),
            // 礼品列表
            Expanded(
              child: gifts.isEmpty
                  ? _buildEmptyState()
                  : GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate:
                          SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 0.85,
                      ),
                      itemCount: gifts.length,
                      itemBuilder: (context, index) {
                        return _buildGiftCard(
                          gifts[index],
                          totalPoints,
                          reward,
                          index,
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildPointsBar(int totalPoints) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.softShadow(AppTheme.primaryColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.monetization_on_rounded, color: Colors.white, size: 28),
          const SizedBox(width: 12),
          const Text(
            '我的积分',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$totalPoints',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.bold,
            ),
          ),
          const Text(
            ' 分',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryTabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: _categories.map((cat) {
          final key = cat['key'] as String;
          final label = cat['label'] as String;
          final icon = cat['icon'] as IconData;
          final isSelected = _selectedCategory == key;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => setState(() => _selectedCategory = key),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppTheme.secondaryColor
                      : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      icon,
                      size: 16,
                      color: isSelected ? Colors.white : AppTheme.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      label,
                      style: TextStyle(
                        color: isSelected ? Colors.white : AppTheme.textSecondary,
                        fontSize: 13,
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.card_giftcard_outlined,
            size: 64,
            color: AppTheme.textSecondary.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 16),
          Text(
            '暂无礼品',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGiftCard(
    Gift gift,
    int totalPoints,
    RewardProvider reward,
    int index,
  ) {
    final canAfford = totalPoints >= gift.pointsCost;
    final progress = totalPoints / gift.pointsCost;
    final categoryColor = _getCategoryColor(gift.category);

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 400 + index * 80),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Transform.translate(
          offset: Offset(0, 20 * (1 - value)),
          child: Opacity(opacity: value, child: child),
        );
      },
      child: GestureDetector(
        onTap: () => _onGiftTap(gift, totalPoints, reward),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: categoryColor.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 顶部 emoji 区域
              Expanded(
                flex: 3,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        categoryColor.withValues(alpha: 0.08),
                        categoryColor.withValues(alpha: 0.18),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Text(
                        gift.emoji,
                        style: const TextStyle(fontSize: 48),
                      ),
                      if (canAfford)
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.accentColor,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              '可兑换',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              // 底部信息区域
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        gift.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      if (gift.description != null &&
                          gift.description!.isNotEmpty)
                        Text(
                          gift.description!,
                          style: TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 11,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      const Spacer(),
                      // 积分进度
                      Row(
                        children: [
                          Icon(
                            Icons.star_rounded,
                            size: 14,
                            color: canAfford
                                ? AppTheme.accentColor
                                : AppTheme.warningColor,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            '${gift.pointsCost}',
                            style: TextStyle(
                              color: canAfford
                                  ? AppTheme.accentColor
                                  : AppTheme.warningColor,
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const Spacer(),
                          if (!canAfford)
                            Text(
                              '差${gift.pointsCost - totalPoints}',
                              style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 10,
                              ),
                            ),
                        ],
                      ),
                      if (!canAfford) ...[
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0.0, end: progress.clamp(0.0, 1.0)),
                            duration: const Duration(milliseconds: 800),
                            builder: (context, value, _) {
                              return LinearProgressIndicator(
                                value: value,
                                backgroundColor: Colors.grey.shade200,
                                valueColor: AlwaysStoppedAnimation(
                                  AppTheme.warningColor.withValues(alpha: 0.6),
                                ),
                                minHeight: 4,
                              );
                            },
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'entertainment':
        return AppTheme.primaryColor;
      case 'food':
        return AppTheme.softOrange;
      case 'toy':
        return AppTheme.secondaryColor;
      case 'activity':
        return AppTheme.softPurple;
      default:
        return AppTheme.accentColor;
    }
  }

  List<Gift> _filterGifts(List<Gift> gifts) {
    if (_selectedCategory == 'all') return gifts;
    return gifts.where((g) => g.category == _selectedCategory).toList();
  }

  void _onGiftTap(
    Gift gift,
    int totalPoints,
    RewardProvider reward,
  ) {
    final canAfford = totalPoints >= gift.pointsCost;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(gift.emoji, style: const TextStyle(fontSize: 56)),
              const SizedBox(height: 12),
              Text(
                gift.name,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (gift.description != null && gift.description!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  gift.description!,
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.star_rounded,
                      color: Colors.amber, size: 24),
                  const SizedBox(width: 4),
                  Text(
                    '${gift.pointsCost} 积分',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                canAfford
                    ? '当前积分: $totalPoints ✅'
                    : '还差 ${gift.pointsCost - totalPoints} 积分',
                style: TextStyle(
                  color: canAfford ? AppTheme.accentColor : AppTheme.warningColor,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 24),
              if (canAfford)
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _confirmRedeem(gift, reward);
                    },
                    icon: const Icon(Icons.card_giftcard_rounded),
                    label: const Text('立即兑换'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTheme.accentColor,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                )
              else
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text('继续加油'),
                  ),
                ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('取消'),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _confirmRedeem(Gift gift, RewardProvider reward) async {
    final userProvider = context.read<UserProvider>();
    final childId = await userProvider.resolveChildId();
    if (childId == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先添加/选择孩子')),
        );
      }
      return;
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('确认兑换'),
        content: Text(
          '确定要用 ${gift.pointsCost} 积分兑换 "${gift.name}" 吗？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final record = await reward.redeemGift(
                childId: childId,
                giftId: gift.id,
                giftName: gift.name,
                pointsCost: gift.pointsCost,
              );
              if (record != null && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('🎉 兑换成功！${gift.name}'),
                    backgroundColor: AppTheme.accentColor,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                );
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.accentColor,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('确认兑换'),
          ),
        ],
      ),
    );
  }
}
