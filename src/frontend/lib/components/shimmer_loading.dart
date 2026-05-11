import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'app_card.dart';

/// 骨架屏加载占位组件集。
///
/// 使用自定义动画（不依赖第三方 shimmer 包），提供多种骨架屏形状：
/// - [ShimmerCard] — 卡片形状骨架
/// - [ShimmerListTile] — 列表行形状骨架（头像 + 文本行）
/// - [ShimmerBlock] — 任意自定义形状骨架
///
/// 基本用法：
/// ```dart
/// // 卡片骨架
/// ShimmerCard(height: 120);
///
/// // 列表骨架
/// Column(
///   children: List.generate(5, (_) => ShimmerListTile()),
/// )
/// ```
///
/// ——— ShimmerPlaceholder（核心基类）———
///
/// 给任意 child 添加闪光动画遮罩。通常配合灰色骨架形状使用。
///
/// ```dart
/// ShimmerPlaceholder(
///   child: Container(height: 16, color: Colors.white),
/// )
/// ```

/// 卡片骨架屏占位
///
/// 展示一个带圆角的矩形卡片骨架，尺寸可配置。
class ShimmerCard extends StatelessWidget {
  /// 卡片高度
  final double height;

  /// 卡片宽度（默认撑满父级）
  final double? width;

  /// 外边距
  final EdgeInsetsGeometry margin;

  /// 圆角（默认 [AppTheme.cardRadius]）
  final BorderRadiusGeometry borderRadius;

  const ShimmerCard({
    super.key,
    this.height = 160,
    this.width,
    this.margin = const EdgeInsets.only(bottom: 16),
    this.borderRadius = const BorderRadius.all(Radius.circular(AppTheme.cardRadius)),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: ShimmerPlaceholder(
        borderRadius: borderRadius,
        child: Container(
          height: height,
          width: width ?? double.infinity,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: borderRadius,
          ),
        ),
      ),
    );
  }
}

/// 列表行骨架屏占位
///
/// 模拟一个带圆形头像 + 两条文本行的列表项骨架。
class ShimmerListTile extends StatelessWidget {
  /// 行高（默认 72）
  final double height;

  /// 头像直径（默认 44）
  final double avatarSize;

  /// 外边距
  final EdgeInsetsGeometry margin;

  /// 是否显示尾部图标占位（如 chevron）
  final bool showTrailing;

  const ShimmerListTile({
    super.key,
    this.height = 72,
    this.avatarSize = 44,
    this.margin = const EdgeInsets.only(bottom: 8),
    this.showTrailing = true,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: ShimmerPlaceholder(
        borderRadius: BorderRadius.circular(AppTheme.smallRadius),
        child: Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.smallRadius),
          ),
          child: Row(
            children: [
              // 圆形头像占位
              Container(
                width: avatarSize,
                height: avatarSize,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),

              // 文本行占位
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 第一行（较宽，模拟标题）
                    Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 8),
                    // 第二行（较窄，模拟副标题）
                    Container(
                      height: 12,
                      width: MediaQuery.of(context).size.width * 0.4,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),

              // 尾部箭头占位
              if (showTrailing) ...[
                const SizedBox(width: 8),
                Container(
                  width: 16,
                  height: 16,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// 自定义形状骨架屏占位
///
/// 提供灵活的自定义骨架构造方式。
///
/// 示例：生成 N 个文本框骨架
/// ```dart
/// ShimmerBlock.builder(
///   itemCount: 5,
///   itemBuilder: (_, __) => Container(
///     height: 18,
///     margin: const EdgeInsets.only(bottom: 8),
///     decoration: BoxDecoration(
///       color: Colors.white,
///       borderRadius: BorderRadius.circular(8),
///     ),
///   ),
/// )
/// ```
class ShimmerBlock extends StatelessWidget {
  /// 单个自定义骨架 child
  final Widget? child;

  /// 批量构建器
  final int? itemCount;
  final Widget Function(BuildContext context, int index)? itemBuilder;

  const ShimmerBlock({
    super.key,
    this.child,
    this.itemCount,
    this.itemBuilder,
  }) : assert(
          child != null || (itemCount != null && itemBuilder != null),
          'Must provide either child or (itemCount + itemBuilder).',
        );

  /// 快速构建批量骨架项的命名构造函数
  const ShimmerBlock.builder({
    Key? key,
    required int itemCount,
    required Widget Function(BuildContext context, int index) itemBuilder,
  }) : this(
          key: key,
          itemCount: itemCount,
          itemBuilder: itemBuilder,
        );

  @override
  Widget build(BuildContext context) {
    if (child != null) {
      return ShimmerPlaceholder(
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        child: child!,
      );
    }

    return Column(
      children: List.generate(
        itemCount!,
        (index) => ShimmerPlaceholder(
          borderRadius: BorderRadius.circular(AppTheme.smallRadius),
          child: itemBuilder!(context, index),
        ),
      ),
    );
  }
}