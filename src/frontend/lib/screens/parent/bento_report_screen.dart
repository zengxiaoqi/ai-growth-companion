import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// Bento 报告幻灯片页面
///
/// 生成 Bento 幻灯片报告，然后在新标签页打开。
/// 不再使用 WebView 内嵌（Bento 是全屏自包含应用，UI 风格不匹配）。
class BentoReportScreen extends StatefulWidget {
  final int childId;
  final String period; // 'daily', 'weekly', 'monthly'

  const BentoReportScreen({
    super.key,
    required this.childId,
    this.period = 'weekly',
  });

  @override
  State<BentoReportScreen> createState() => _BentoReportScreenState();
}

class _BentoReportScreenState extends State<BentoReportScreen> {
  bool _isLoading = false;
  bool _isDone = false;
  String? _error;
  String? _bentoUrl;

  String get _periodLabel {
    switch (widget.period) {
      case 'daily':
        return '日报';
      case 'weekly':
        return '周报';
      case 'monthly':
        return '月报';
      default:
        return '报告';
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _generateAndOpen());
  }

  Future<void> _generateAndOpen() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = context.read<ApiService>();
      final token = api.token;
      if (token == null || token.isEmpty) {
        throw Exception('未登录，请重新登录后重试');
      }

      final result = await api.generateBentoReport(widget.childId, widget.period);

      if (!mounted) return;

      final fileId = result['id']?.toString() ??
          result['fileId']?.toString() ??
          result['file_id']?.toString();

      String url;
      if (fileId != null && fileId.isNotEmpty) {
        url = api.getBentoFileUrl(fileId, token);
      } else {
        throw Exception('未能获取报告文件');
      }

      setState(() {
        _bentoUrl = url;
        _isLoading = false;
        _isDone = true;
      });

      // 在新标签页打开
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        setState(() {
          _error = '无法打开浏览器，请手动复制链接';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '生成报告失败：$e';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部标题栏
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.arrow_back_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      '幻灯片 $_periodLabel',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _isLoading ? null : _generateAndOpen,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
            ),

            // 内容区域
            Expanded(
              child: _buildBody(theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ThemeData theme) {
    // 加载中
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(
              color: AppTheme.primaryColor,
            ),
            const SizedBox(height: 20),
            Text(
              '正在生成报告...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'AI 正在为您制作精美的幻灯片',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      );
    }

    // 错误状态
    if (_error != null) {
      return _buildErrorState(theme);
    }

    // 生成完成
    if (_isDone && _bentoUrl != null) {
      return _buildSuccessState(theme);
    }

    // 初始空白状态
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.slideshow_rounded,
            size: 64,
            color: AppTheme.textSecondary.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 16),
          Text(
            '点击刷新按钮生成报告',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppTheme.warningColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: AppTheme.warningColor,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              '生成失败',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _generateAndOpen,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('重新生成'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 32,
                  vertical: 16,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.check_circle_outline_rounded,
                size: 48,
                color: Colors.green,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              '报告已生成',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '幻灯片已在新标签页打开',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            // 如果浏览器没打开，提供手动复制链接
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '如果浏览器没有自动打开，请复制链接手动打开：',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SelectableText(
                    _bentoUrl!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async {
                final uri = Uri.parse(_bentoUrl!);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('再次打开'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 32,
                  vertical: 16,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}