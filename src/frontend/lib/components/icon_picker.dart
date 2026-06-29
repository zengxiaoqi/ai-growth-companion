import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:typed_data';
import '../theme/app_theme.dart';
import 'reward_icon.dart';

/// 图标选择器组件
///
/// 支持两种选择方式：
/// 1. 上传图片文件（覆盖默认 emoji）
/// 2. 从预设 emoji 列表中选择
///
/// 显示当前图标，点击后弹出选择面板
///
/// 用法：
/// ```dart
/// IconPicker(
///   emoji: '⭐',
///   iconImage: template.iconImage,
///   onImageSelected: (path) => provider.uploadBehaviorIcon(id, path),
///   onImageDeleted: () => provider.deleteBehaviorIcon(id),
///   onEmojiSelected: (emoji) => updateBehavior(emoji: emoji),
/// )
/// ```
class IconPicker extends StatefulWidget {
  /// 当前 emoji
  final String emoji;

  /// 当前自定义图片 URL
  final String? iconImage;

  /// 图片上传回调（传入文件路径，用于移动端）
  final Future<bool> Function(String filePath)? onImageSelected;

  /// 图片上传回调（传入 bytes + 文件名，用于 Web 平台）
  final Future<bool> Function(Uint8List bytes, String fileName)? onImageSelectedBytes;

  /// 图片删除回调
  final Future<bool> Function()? onImageDeleted;

  /// emoji 选择回调
  final ValueChanged<String>? onEmojiSelected;

  /// 尺寸
  final double size;

  const IconPicker({
    super.key,
    required this.emoji,
    this.iconImage,
    this.onImageSelected,
    this.onImageSelectedBytes,
    this.onImageDeleted,
    this.onEmojiSelected,
    this.size = 56,
  });

  @override
  State<IconPicker> createState() => _IconPickerState();
}

class _IconPickerState extends State<IconPicker> {
  bool _uploading = false;

  /// 预设 emoji 列表
  static const List<String> _presetEmojis = [
    '⭐', '🌟', '✨', '☀️', '🌙', '🌈',
    '🍎', '🍞', '🥛', '🍚', '🥗', '🍜',
    '📚', '✏️', '🎨', '🎵', '⚽', '🧩',
    '🛏️', '🚿', '🪥', '🧴', '👕', '👗',
    '🎁', '🏆', '🎖️', '🏅', '💎', '🔥',
    '😊', '💪', '👍', '🎯', '📖', '💡',
  ];

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    try {
      final xfile = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 80,
      );
      if (xfile == null) return;

      setState(() => _uploading = true);

      // 统一使用 bytes 上传（Web 和移动端都支持）
      final bytes = await xfile.readAsBytes();
      final fileName = xfile.name.isNotEmpty ? xfile.name : 'icon.png';

      bool success = false;
      if (widget.onImageSelectedBytes != null) {
        // Web 优先使用 bytes 上传
        success = await widget.onImageSelectedBytes!(bytes, fileName);
      } else if (widget.onImageSelected != null) {
        // 移动端 fallback 使用文件路径
        final path = xfile.path;
        if (path != null && path.isNotEmpty) {
          success = await widget.onImageSelected!(path);
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('无法获取图片路径')),
            );
          }
          setState(() => _uploading = false);
          return;
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('未配置上传回调')),
          );
        }
        setState(() => _uploading = false);
        return;
      }

      setState(() => _uploading = false);
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('图标上传成功'),
            backgroundColor: AppTheme.successColor,
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('上传失败'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } catch (e) {
      setState(() => _uploading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('选择图片失败: $e'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    }
  }

  Future<void> _deleteImage() async {
    if (widget.onImageDeleted == null) return;
    setState(() => _uploading = true);
    final success = await widget.onImageDeleted!();
    setState(() => _uploading = false);
    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('已恢复为默认 emoji 图标'),
          backgroundColor: AppTheme.successColor,
        ),
      );
    }
  }

  void _showPickerDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 标题
                Row(
                  children: [
                    Text(
                      '选择图标',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textColor,
                      ),
                    ),
                    const Spacer(),
                    if (widget.iconImage != null && widget.onImageDeleted != null)
                      TextButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _deleteImage();
                        },
                        icon: const Icon(Icons.delete_outline, size: 20),
                        label: const Text('恢复默认'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppTheme.errorColor,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 16),

                // 上传图片按钮
                if (widget.onImageSelected != null || widget.onImageSelectedBytes != null) ...[
                  _UploadButton(
                    uploading: _uploading,
                    onTap: _uploading ? null : () {
                      Navigator.pop(context);
                      _pickImage();
                    },
                  ),
                  const SizedBox(height: 20),
                ],

                // 预设 emoji 网格
                if (widget.onEmojiSelected != null) ...[
                  Text(
                    '或选择 emoji',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 6,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 1,
                    ),
                    itemCount: _presetEmojis.length,
                    itemBuilder: (context, index) {
                      final emoji = _presetEmojis[index];
                      final isSelected = emoji == widget.emoji && (widget.iconImage == null);
                      return GestureDetector(
                        onTap: () {
                          widget.onEmojiSelected!(emoji);
                          Navigator.pop(context);
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppTheme.primaryColor.withValues(alpha: 0.15)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(10),
                            border: isSelected
                                ? Border.all(color: AppTheme.primaryColor, width: 2)
                                : null,
                          ),
                          child: Center(
                            child: Text(
                              emoji,
                              style: const TextStyle(fontSize: 24),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _showPickerDialog,
      child: Stack(
        children: [
          RewardIcon(
            emoji: widget.emoji,
            iconImage: widget.iconImage,
            size: widget.size,
          ),
          // 右下角编辑标识
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: AppTheme.primaryColor,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: const Icon(
                Icons.edit,
                color: Colors.white,
                size: 10,
              ),
            ),
          ),
          if (_uploading)
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _UploadButton extends StatelessWidget {
  final bool uploading;
  final VoidCallback? onTap;

  const _UploadButton({this.uploading = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.primaryColor.withValues(alpha: 0.3),
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (uploading)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
                  ),
                )
              else
                Icon(Icons.upload_outlined, color: AppTheme.primaryColor, size: 22),
              const SizedBox(width: 8),
              Text(
                uploading ? '上传中...' : '上传自定义图片',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
