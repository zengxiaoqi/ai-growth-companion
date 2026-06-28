// 积分奖惩系统 - 首页（打卡面板）

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../components/stat_card.dart';
import '../../components/task_card.dart';
import '../../providers/user_provider.dart';
import '../../providers/reward_provider.dart';
import '../../services/api_service.dart';
import '../../models/reward_models.dart';
import 'gift_shop_screen.dart';
import 'growth_report_screen.dart';
import 'calendar_screen.dart';

class RewardHomeScreen extends StatefulWidget {
  const RewardHomeScreen({super.key});

  @override
  State<RewardHomeScreen> createState() => _RewardHomeScreenState();
}

class _RewardHomeScreenState extends State<RewardHomeScreen> {
  int _currentTab = 0;
  int? _resolvedChildId; // 缓存解析后的 childId

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  /// 获取正确的 childId（家长自动获取第一个孩子）
  Future<int?> _resolveChildId() async {
    if (_resolvedChildId != null) return _resolvedChildId!;
    final userProvider = context.read<UserProvider>();
    _resolvedChildId = await userProvider.resolveChildId();
    return _resolvedChildId;
  }

  Future<void> _loadData() async {
    final rewardProvider = context.read<RewardProvider>();

    // 解析 childId
    final childId = await _resolveChildId();

    // 行为模板和礼品不需要 childId（后端从 JWT 取 userId）
    await Future.wait([
      rewardProvider.loadBehaviors(),
      rewardProvider.loadGifts(),
    ]);

    // 只有解析到 childId 才加载孩子相关数据
    if (childId != null) {
      await Future.wait([
        rewardProvider.loadPointRecords(childId),
        rewardProvider.loadRedemptions(childId),
      ]);
      await rewardProvider.loadTodayRecords(childId);
      await rewardProvider.loadSummary(childId);
    }
  }

  /// 切换孩子后重新加载数据
  void _onChildChanged(int newChildId) {
    setState(() {
      _resolvedChildId = newChildId;
    });
    final rewardProvider = context.read<RewardProvider>();
    rewardProvider.loadPointRecords(newChildId);
    rewardProvider.loadTodayRecords(newChildId);
    rewardProvider.loadSummary(newChildId);
    rewardProvider.loadRedemptions(newChildId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('积分奖惩'),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Consumer<RewardProvider>(
        builder: (context, reward, _) {
          return Column(
            children: [
              // 积分概览卡片
              _buildPointsOverview(reward.summary),
              // Tab 切换
              _buildTabBar(),
              // 内容区域
              Expanded(
                child: IndexedStack(
                  index: _currentTab,
                  children: [
                    _CheckInPanel(onManageTemplates: () => _showTemplateManagement()),
                    const _GiftShopPanel(),
                    const _CalendarPanel(),
                    const _GrowthReportPanel(),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// 打开行为模板管理底部弹窗
  void _showTemplateManagement() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const _BehaviorTemplateManagementSheet(),
    );
  }

  Widget _buildPointsOverview(PointsSummary? summary) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(32),
          bottomRight: Radius.circular(32),
        ),
      ),
      child: Row(
        children: [
          AnimatedStatCard(
            label: '总积分',
            value: '${summary?.totalPoints ?? 0}',
            icon: Icons.star_rounded,
            color: Colors.white,
          ),
          const SizedBox(width: 12),
          AnimatedStatCard(
            label: '今日',
            value: '+${summary?.todayPoints ?? 0}',
            icon: Icons.today_rounded,
            color: Colors.white,
          ),
          const SizedBox(width: 12),
          AnimatedStatCard(
            label: '连续',
            value: '${summary?.streak ?? 0}天',
            icon: Icons.local_fire_department_rounded,
            color: Colors.white,
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.subtleShadow(),
      ),
      child: Row(
        children: [
          _buildTab(0, '打卡', Icons.check_circle_outline),
          _buildTab(1, '商城', Icons.card_giftcard),
          _buildTab(2, '日历', Icons.calendar_today),
          _buildTab(3, '报告', Icons.insights),
        ],
      ),
    );
  }

  Widget _buildTab(int index, String label, IconData icon) {
    final isSelected = _currentTab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _currentTab = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            gradient: isSelected ? AppTheme.primaryGradient : null,
            color: isSelected ? null : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
            boxShadow: isSelected ? AppTheme.softShadow(AppTheme.primaryColor) : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(
                  icon,
                  key: ValueKey('$index-$isSelected'),
                  size: 18,
                  color: isSelected ? Colors.white : AppTheme.textSecondary,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : AppTheme.textSecondary,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// 打卡面板
class _CheckInPanel extends StatelessWidget {
  final VoidCallback onManageTemplates;

  const _CheckInPanel({required this.onManageTemplates});

  @override
  Widget build(BuildContext context) {
    return Consumer<RewardProvider>(
      builder: (context, reward, _) {
        final templates = reward.behaviors;
        final todayRecords = reward.todayRecords;

        if (reward.isLoading && templates.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        if (templates.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('暂无行为模板，点击设置添加', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: onManageTemplates,
                  icon: const Icon(Icons.settings),
                  label: const Text('管理模板'),
                ),
              ],
            ),
          );
        }

        // 按分类分组
        final categories = <String, List<BehaviorTemplate>>{};
        for (final t in templates) {
          categories.putIfAbsent(t.category, () => []).add(t);
        }

        return ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            // 管理模板按钮
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onManageTemplates,
                  icon: const Icon(Icons.settings, size: 18),
                  label: const Text('管理模板', style: TextStyle(fontSize: 13)),
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.primaryColor,
                  ),
                ),
              ),
            ),
            // 今日打卡记录
            if (todayRecords.isNotEmpty) ...[
              const _RewardSectionHeader(title: '今日打卡', emoji: '✅'),
              const SizedBox(height: 12),
              ...todayRecords.map((r) => _buildTodayRecordCard(r)),
              const SizedBox(height: 20),
            ],
            // 按分类显示行为模板
            ...categories.entries.expand((entry) => [
                  _RewardSectionHeader(
                      title: _getCategoryLabel(entry.key), emoji: _getCategoryEmoji(entry.key)),
                  const SizedBox(height: 12),
                  ...entry.value.map((t) => _buildBehaviorCard(context, t, reward)),
                  const SizedBox(height: 12),
                ]),
          ],
        );
      },
    );
  }

  Widget _buildTodayRecordCard(PointRecord record) {
    final isPositive = record.points >= 0;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: (isPositive ? AppTheme.accentColor : AppTheme.warningColor)
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isPositive ? Icons.check_circle : Icons.remove_circle,
              color: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.behaviorName,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '${record.recordedAt.hour}:${record.recordedAt.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${isPositive ? '+' : ''}${record.points}',
            style: TextStyle(
              color: isPositive ? AppTheme.accentColor : AppTheme.warningColor,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBehaviorCard(
      BuildContext context, BehaviorTemplate template, RewardProvider reward) {
    final isPositive = template.points >= 0;

    // 检查今日是否已打卡该行为
    final alreadyCheckedIn = reward.todayRecords.any(
      (r) => r.behaviorName == template.name,
    );

    // 根据分类选择合适的图标
    final iconData = _getIconForCategory(template.category);

    return AnimatedTaskCard(
      title: template.name,
      subtitle: '${isPositive ? '+' : ''}${template.points} 积分',
      icon: iconData.icon,
      iconColor: isPositive ? iconData.color : AppTheme.warningColor,
      isCompleted: alreadyCheckedIn,
      onTap: alreadyCheckedIn ? null : () => _handleCheckIn(context, template, reward),
    );
  }

  _IconData _getIconForCategory(String category) {
    switch (category) {
      case 'daily':
      case '日常习惯':
        return _IconData(Icons.wb_sunny_rounded, AppTheme.secondaryColor);
      case 'extra':
      case '学习活动':
        return _IconData(Icons.menu_book_rounded, AppTheme.primaryColor);
      case 'negative':
      case '扣分行为':
        return _IconData(Icons.warning_amber_rounded, AppTheme.warningColor);
      default:
        return _IconData(Icons.check_circle_outline, AppTheme.textSecondary);
    }
  }

  String _getCategoryEmoji(String category) {
    switch (category) {
      case 'daily':
      case '日常习惯':
        return '🌅';
      case 'extra':
      case '学习活动':
        return '📚';
      case 'negative':
      case '扣分行为':
        return '⚠️';
      default:
        return '📋';
    }
  }

  String _getCategoryLabel(String category) {
    switch (category) {
      case 'daily':
        return '日常习惯';
      case 'extra':
        return '额外加分';
      case 'negative':
        return '扣分行为';
      default:
        return category;
    }
  }

  Future<void> _handleCheckIn(
    BuildContext context,
    BehaviorTemplate template,
    RewardProvider reward,
  ) async {
    final userProvider = context.read<UserProvider>();
    final childId = await userProvider.resolveChildId();

    if (childId == null) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('未找到孩子信息，请先绑定孩子'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    final record = await reward.recordPoints(
      childId: childId,
      behaviorName: template.name,
      points: template.points,
      templateId: template.id,
    );

    if (context.mounted) {
      if (record != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              template.points >= 0
                  ? '✅ ${template.name} +${template.points}积分'
                  : '⚠️ ${template.name} ${template.points}积分',
            ),
            backgroundColor:
                template.points >= 0 ? AppTheme.accentColor : AppTheme.warningColor,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('操作失败: ${reward.error ?? "未知错误"}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

class _IconData {
  final IconData icon;
  final Color color;
  _IconData(this.icon, this.color);
}

// ==================== 行为模板管理底部弹窗 ====================

class _BehaviorTemplateManagementSheet extends StatefulWidget {
  const _BehaviorTemplateManagementSheet();

  @override
  State<_BehaviorTemplateManagementSheet> createState() =>
      _BehaviorTemplateManagementSheetState();
}

class _BehaviorTemplateManagementSheetState
    extends State<_BehaviorTemplateManagementSheet> {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      child: Column(
        children: [
          // 顶部拖拽指示器
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
                const Text(
                  '行为模板管理',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.grey),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(),
          // 模板列表
          Expanded(
            child: Consumer<RewardProvider>(
              builder: (context, reward, _) {
                if (reward.behaviors.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('暂无模板，点击下方按钮添加', style: TextStyle(color: Colors.grey)),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: () => _showEditDialog(context),
                          icon: const Icon(Icons.add),
                          label: const Text('添加第一个模板'),
                        ),
                      ],
                    ),
                  );
                }

                final templates = reward.behaviors;
                // 按分类分组
                final categories = <String, List<BehaviorTemplate>>{};
                for (final t in templates) {
                  categories.putIfAbsent(t.category, () => []).add(t);
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
                        label: const Text('新增行为模板', style: TextStyle(fontSize: 15)),
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
                          ...entry.value.map((t) => _buildTemplateTile(context, t, reward)),
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

  Widget _buildTemplateTile(
      BuildContext context, BehaviorTemplate template, RewardProvider reward) {
    final isPositive = template.points >= 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        leading: Text(template.emoji, style: const TextStyle(fontSize: 24)),
        title: Text(template.name),
        subtitle: Text(
          '${isPositive ? '+' : ''}${template.points} 积分',
          style: TextStyle(
            color: isPositive ? Colors.green : Colors.red,
            fontSize: 12,
          ),
        ),
        trailing: PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert, color: Colors.grey, size: 22),
          onSelected: (value) async {
            switch (value) {
              case 'toggle':
                await reward.toggleBehavior(template.id);
                break;
              case 'edit':
                _showEditDialog(context, template: template);
                break;
              case 'delete':
                _confirmDelete(context, template, reward);
                break;
            }
          },
          itemBuilder: (ctx) => [
            PopupMenuItem(
              value: 'toggle',
              child: Row(
                children: [
                  Icon(
                    template.isEnabled ? Icons.visibility_off : Icons.visibility,
                    size: 18,
                    color: Colors.grey,
                  ),
                  const SizedBox(width: 8),
                  Text(template.isEnabled ? '禁用' : '启用'),
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
    switch (category) {
      case 'daily':
        return '🌅 日常习惯';
      case 'extra':
        return '📚 额外加分';
      case 'negative':
        return '⚠️ 扣分行为';
      default:
        return '📋 $category';
    }
  }

  /// 新增/编辑模板对话框
  void _showEditDialog(BuildContext context, {BehaviorTemplate? template}) {
    final isEdit = template != null;
    final nameController = TextEditingController(text: template?.name ?? '');
    final emojiController = TextEditingController(text: template?.emoji ?? '⭐');
    final pointsController =
        TextEditingController(text: template?.points.toString() ?? '1');
    String selectedCategory = template?.category ?? 'daily';

    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(isEdit ? '编辑行为模板' : '新增行为模板'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: '行为名称',
                    hintText: '如：起床洗漱',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emojiController,
                  decoration: const InputDecoration(
                    labelText: 'Emoji 图标',
                    hintText: '如：🌅',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: pointsController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '积分值（正数加分，负数扣分）',
                    hintText: '如：2 或 -3',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedCategory,
                  decoration: const InputDecoration(
                    labelText: '分类',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'daily', child: Text('🌅 日常习惯')),
                    DropdownMenuItem(value: 'extra', child: Text('📚 额外加分')),
                    DropdownMenuItem(value: 'negative', child: Text('⚠️ 扣分行为')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      setDialogState(() => selectedCategory = v);
                    }
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('取消'),
            ),
            ElevatedButton(
              onPressed: () async {
                final name = nameController.text.trim();
                final emoji = emojiController.text.trim();
                final points = int.tryParse(pointsController.text.trim());
                if (name.isEmpty || points == null) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    const SnackBar(content: Text('请填写名称和有效积分值'), backgroundColor: Colors.red),
                  );
                  return;
                }
                final reward = context.read<RewardProvider>();
                if (isEdit) {
                  await reward.updateBehavior(
                    id: template.id,
                    name: name,
                    points: points,
                    emoji: emoji.isNotEmpty ? emoji : '⭐',
                    category: selectedCategory,
                  );
                } else {
                  await reward.createBehavior(
                    name: name,
                    points: points,
                    emoji: emoji.isNotEmpty ? emoji : '⭐',
                    category: selectedCategory,
                  );
                }
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(isEdit ? '保存' : '添加'),
            ),
          ],
        ),
      ),
    );
  }

  /// 确认删除
  void _confirmDelete(
      BuildContext context, BehaviorTemplate template, RewardProvider reward) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除「${template.name}」吗？\n已打卡的记录不受影响。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              await reward.deleteBehavior(template.id);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('删除', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}

// 商城面板
class _GiftShopPanel extends StatelessWidget {
  const _GiftShopPanel();

  @override
  Widget build(BuildContext context) {
    return const GiftShopPanel();
  }
}

// 日历面板
class _CalendarPanel extends StatelessWidget {
  const _CalendarPanel();

  @override
  Widget build(BuildContext context) {
    return const CalendarScreen();
  }
}

// 报告面板
class _GrowthReportPanel extends StatelessWidget {
  const _GrowthReportPanel();

  @override
  Widget build(BuildContext context) {
    return const GrowthReportPanel();
  }
}

// 简化的 SectionHeader (renamed to avoid conflict with components/section_header.dart)
class _RewardSectionHeader extends StatelessWidget {
  final String title;
  final String emoji;

  const _RewardSectionHeader({
    super.key,
    required this.title,
    this.emoji = '',
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          if (emoji.isNotEmpty) ...[
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 8),
          ],
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

// 简化的 GrowthReportPanel
class GrowthReportPanel extends StatelessWidget {
  const GrowthReportPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return const RewardGrowthReportScreen();
  }
}

// 简化的 GiftShopPanel
class GiftShopPanel extends StatelessWidget {
  const GiftShopPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return const GiftShopScreen();
  }
}
