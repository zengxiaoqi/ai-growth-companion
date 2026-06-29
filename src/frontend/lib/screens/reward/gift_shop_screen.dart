// 礼品商城页面

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../theme/app_theme.dart';
import '../../components/reward_icon.dart';
import '../../components/icon_picker.dart';
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
        children: [
          const Icon(Icons.monetization_on_rounded, color: Colors.white, size: 28),
          const SizedBox(width: 12),
          const Text('我的积分', style: TextStyle(color: Colors.white, fontSize: 15)),
          const SizedBox(width: 8),
          Text(
            '$totalPoints',
            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
          ),
          const Text(' 分', style: TextStyle(color: Colors.white, fontSize: 15)),
          const Spacer(),
          // 管理礼品按钮 — 带文字的 pill 样式，桌面端更明显
          GestureDetector(
            onTap: () => _showGiftManagement(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.settings, color: Colors.white, size: 18),
                  SizedBox(width: 4),
                  Text(
                    '管理礼品',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
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
                      // 支持自定义图片或 emoji
                      if (gift.iconImage != null && gift.iconImage!.isNotEmpty)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: CachedNetworkImage(
                            imageUrl: gift.iconImage!.startsWith('http')
                                ? gift.iconImage!
                                : 'https://lingxi.chataifree.eu.org/api${gift.iconImage}',
                            fit: BoxFit.cover,
                            width: 56,
                            height: 56,
                            errorWidget: (context, url, error) =>
                                Text(gift.emoji, style: const TextStyle(fontSize: 48)),
                          ),
                        )
                      else
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
              // 支持自定义图片或 emoji
              if (gift.iconImage != null && gift.iconImage!.isNotEmpty)
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: CachedNetworkImage(
                    imageUrl: gift.iconImage!.startsWith('http')
                        ? gift.iconImage!
                        : 'https://lingxi.chataifree.eu.org/api${gift.iconImage}',
                    fit: BoxFit.cover,
                    width: 64,
                    height: 64,
                    errorWidget: (context, url, error) =>
                        Text(gift.emoji, style: const TextStyle(fontSize: 56)),
                  ),
                )
              else
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
    if (!mounted) return;
    if (childId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先添加/选择孩子')),
      );
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

  // ==================== 礼品管理 ====================

  void _showGiftManagement(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => const _GiftManagementSheet(),
    );
  }
}

/// 礼品管理底部弹窗
class _GiftManagementSheet extends StatefulWidget {
  const _GiftManagementSheet();

  @override
  State<_GiftManagementSheet> createState() => _GiftManagementSheetState();
}

class _GiftManagementSheetState extends State<_GiftManagementSheet> {
  static const _giftCategories = [
    {'key': 'entertainment', 'label': '🎮 娱乐'},
    {'key': 'food', 'label': '🍔 美食'},
    {'key': 'toy', 'label': '🧸 玩具'},
    {'key': 'activity', 'label': '🎉 活动'},
    {'key': 'other', 'label': '📦 其他'},
  ];

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    return SizedBox(
      height: screenHeight * 0.85,
      child: Column(
        children: [
          // 拖拽指示器
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // 标题栏
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('礼品管理', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.grey),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(),
          // 礼品列表
          Expanded(
            child: Consumer<RewardProvider>(
              builder: (context, reward, _) {
                if (reward.gifts.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('暂无礼品，点击下方按钮添加', style: TextStyle(color: Colors.grey)),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: () => _showEditDialog(context),
                          icon: const Icon(Icons.add),
                          label: const Text('添加第一个礼品'),
                        ),
                      ],
                    ),
                  );
                }

                final gifts = reward.gifts;
                // 按分类分组
                final categories = <String, List<Gift>>{};
                for (final g in gifts) {
                  categories.putIfAbsent(g.category, () => []).add(g);
                }

                return ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    // 醒目的新增按钮
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => _showEditDialog(context),
                        icon: const Icon(Icons.add_circle_outline, size: 20),
                        label: const Text('新增兑换礼品', style: TextStyle(fontSize: 15)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...categories.entries.expand((entry) => [
                          Padding(
                            padding: const EdgeInsets.only(top: 12, bottom: 8),
                            child: Text(
                              _categoryLabel(entry.key),
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Colors.grey[600],
                              ),
                            ),
                          ),
                          ...entry.value.map((g) => _buildGiftTile(context, g, reward)),
                        ]),
                    const SizedBox(height: 20),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGiftTile(BuildContext context, Gift gift, RewardProvider reward) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        leading: RewardIcon(
          emoji: gift.emoji,
          iconImage: gift.iconImage,
          size: 40,
          backgroundColor: AppTheme.accentColor,
        ),
        title: Text(
          gift.name,
          style: TextStyle(
            color: gift.isEnabled ? null : Colors.grey,
            decoration: gift.isEnabled ? null : TextDecoration.lineThrough,
          ),
        ),
        subtitle: Text(
          '${gift.pointsCost} 积分${gift.stock > 0 ? " · 库存${gift.stock}" : ""}',
          style: TextStyle(
            color: AppTheme.accentColor,
            fontSize: 12,
          ),
        ),
        trailing: PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert, color: Colors.grey, size: 22),
          onSelected: (value) async {
            switch (value) {
              case 'toggle':
                await reward.toggleGift(gift.id);
                break;
              case 'edit':
                _showEditDialog(context, gift: gift);
                break;
              case 'delete':
                _confirmDelete(context, gift, reward);
                break;
            }
          },
          itemBuilder: (ctx) => [
            PopupMenuItem(
              value: 'toggle',
              child: Row(
                children: [
                  Icon(
                    gift.isEnabled ? Icons.visibility_off : Icons.visibility,
                    size: 18,
                    color: Colors.grey,
                  ),
                  const SizedBox(width: 8),
                  Text(gift.isEnabled ? '禁用' : '启用'),
                ],
              ),
            ),
            const PopupMenuItem(
              value: 'edit',
              child: Row(
                children: [
                  Icon(Icons.edit, size: 18, color: Colors.orange),
                  SizedBox(width: 8),
                  Text('编辑'),
                ],
              ),
            ),
            const PopupMenuItem(
              value: 'delete',
              child: Row(
                children: [
                  Icon(Icons.delete_outline, size: 18, color: Colors.red),
                  SizedBox(width: 8),
                  Text('删除', style: TextStyle(color: Colors.red)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _categoryLabel(String category) {
    for (final c in _giftCategories) {
      if (c['key'] == category) return c['label']!;
    }
    return '📋 $category';
  }

  /// 新增/编辑礼品对话框
  void _showEditDialog(BuildContext context, {Gift? gift}) {
    final isEdit = gift != null;
    final nameController = TextEditingController(text: gift?.name ?? '');
    final emojiController = TextEditingController(text: gift?.emoji ?? '🎁');
    final pointsController =
        TextEditingController(text: gift != null ? gift.pointsCost.toString() : '10');
    final descController = TextEditingController(text: gift?.description ?? '');
    final stockController =
        TextEditingController(text: gift != null ? gift.stock.toString() : '-1');
    String selectedCategory = gift?.category ?? 'entertainment';
    // 当前图标状态
    String currentEmoji = gift?.emoji ?? '🎁';
    String? currentIconImage = gift?.iconImage;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(isEdit ? '编辑礼品' : '新增礼品'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 图标选择器（编辑模式）
                if (isEdit) ...[
                  IconPicker(
                    emoji: currentEmoji,
                    iconImage: currentIconImage,
                    size: 56,
                    onImageSelectedBytes: (bytes, fileName) async {
                      final reward = context.read<RewardProvider>();
                      final ok = await reward.uploadGiftIconFromBytes(gift.id, bytes, fileName);
                      if (ok) {
                        final updated = reward.gifts.firstWhere((g) => g.id == gift.id,
                            orElse: () => gift);
                        setState(() {
                          currentIconImage = updated.iconImage;
                          currentEmoji = updated.emoji;
                        });
                      }
                      return ok;
                    },
                    onImageDeleted: () async {
                      final reward = context.read<RewardProvider>();
                      final ok = await reward.deleteGiftIcon(gift.id);
                      if (ok) {
                        final updated = reward.gifts.firstWhere((g) => g.id == gift.id,
                            orElse: () => gift);
                        setState(() {
                          currentIconImage = null;
                          currentEmoji = updated.emoji;
                        });
                      }
                      return ok;
                    },
                    onEmojiSelected: (emoji) async {
                      emojiController.text = emoji;
                      setState(() => currentEmoji = emoji);
                      if (currentIconImage != null) {
                        final reward = context.read<RewardProvider>();
                        await reward.deleteGiftIcon(gift.id);
                        setState(() => currentIconImage = null);
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '点击图标可上传自定义图片或选择 emoji',
                    style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                  ),
                  const SizedBox(height: 16),
                ] else ...[
                  // 新增模式：emoji 文本输入
                  TextField(
                    controller: emojiController,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 24),
                    decoration: const InputDecoration(
                      labelText: 'Emoji',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(vertical: 8),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                // 名称
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: '礼品名称',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: pointsController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '所需积分',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.star, color: Colors.amber),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descController,
                  decoration: const InputDecoration(
                    labelText: '描述（可选）',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                // 分类选择
                DropdownButtonFormField<String>(
                  initialValue: selectedCategory,
                  decoration: const InputDecoration(
                    labelText: '分类',
                    border: OutlineInputBorder(),
                  ),
                  items: _giftCategories.map((c) {
                    return DropdownMenuItem(
                      value: c['key'],
                      child: Text(c['label']!),
                    );
                  }).toList(),
                  onChanged: (v) => setState(() => selectedCategory = v!),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: stockController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '库存（-1=不限）',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () async {
                final name = nameController.text.trim();
                if (name.isEmpty) return;
                final points = int.tryParse(pointsController.text) ?? 10;
                final stock = int.tryParse(stockController.text) ?? -1;
                final emoji = emojiController.text.trim();
                final desc = descController.text.trim();
                Navigator.pop(ctx);

                final reward = context.read<RewardProvider>();
                if (isEdit) {
                  await reward.updateGift(
                    id: gift.id,
                    name: name,
                    emoji: emoji.isEmpty ? '🎁' : emoji,
                    description: desc,
                    pointsCost: points,
                    category: selectedCategory,
                    stock: stock,
                  );
                } else {
                  await reward.createGift(
                    name: name,
                    emoji: emoji.isEmpty ? '🎁' : emoji,
                    description: desc,
                    pointsCost: points,
                    category: selectedCategory,
                    stock: stock,
                  );
                }
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(isEdit ? '礼品已更新' : '礼品已添加')),
                  );
                }
              },
              child: Text(isEdit ? '保存' : '添加'),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, Gift gift, RewardProvider reward) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('确认删除'),
        content: Text('确定要删除礼品"${gift.name}"吗？此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.pop(ctx);
              reward.deleteGift(gift.id);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('礼品已删除')),
              );
            },
            child: const Text('删除'),
          ),
        ],
      ),
    );
  }
}
