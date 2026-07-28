import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// Bento 报告幻灯片预览页面
///
/// 通过 WebView 加载 Bento 生成的幻灯片报告，支持日报/周报/月报。
/// Web 平台使用 iframe 方式嵌入，其他平台使用 webview_flutter。
///
/// 需要依赖：
/// - webview_flutter（非 Web 平台预览）
/// - url_launcher（可选，Web 平台在新窗口打开）
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
  bool _isLoaded = false;
  String? _error;
  String? _bentoUrl;
  WebViewController? _webViewController;

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _generateReport());
  }

  @override
  void dispose() {
    _webViewController?.clearCache();
    super.dispose();
  }

  Future<void> _generateReport() async {
    setState(() {
      _isLoading = true;
      _isLoaded = false;
      _error = null;
      _bentoUrl = null;
    });

    try {
      final api = context.read<ApiService>();
      final result = await api.generateBentoReport(widget.childId, widget.period);

      if (!mounted) return;

      final fileId = result['id']?.toString() ??
          result['fileId']?.toString() ??
          result['file_id']?.toString();

      if (fileId != null && fileId.isNotEmpty) {
        final url = api.getBentoFileUrl(fileId);
        setState(() {
          _bentoUrl = url;
          _isLoaded = true;
          _isLoading = false;
        });

        // 非 Web 平台：初始化 WebView
        if (!kIsWeb) {
          _initWebView(url);
        }
      } else {
        // 尝试直接使用返回的 url
        final directUrl = result['url']?.toString();
        if (directUrl != null && directUrl.isNotEmpty) {
          setState(() {
            _bentoUrl = directUrl;
            _isLoaded = true;
            _isLoading = false;
          });
          if (!kIsWeb) {
            _initWebView(directUrl);
          }
        } else {
          setState(() {
            _error = '未能获取报告文件，请重试';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '生成报告失败：$e';
        _isLoading = false;
      });
    }
  }

  Future<void> _initWebView(String url) async {
    try {
      _webViewController = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (_) {
              // WebView 加载中
            },
            onPageFinished: (_) {
              if (mounted) {
                setState(() {}); // 刷新 UI
              }
            },
            onWebResourceError: (error) {
              if (mounted) {
                setState(() {
                  _error = '页面加载失败：${error.description}';
                });
              }
            },
          ),
        )
        ..loadRequest(Uri.parse(url));
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'WebView 初始化失败：$e';
        });
      }
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
                  // 刷新按钮
                  IconButton(
                    onPressed: _isLoading ? null : _generateReport,
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

    // 加载完成
    if (_isLoaded && _bentoUrl != null) {
      return _buildBentoView(theme);
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
              onPressed: _generateReport,
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

  Widget _buildBentoView(ThemeData theme) {
    if (kIsWeb) {
      return _buildWebView(theme);
    }

    // 非 Web 平台：使用 WebView
    if (_webViewController != null) {
      return WebViewWidget(controller: _webViewController!);
    }

    // WebView 尚未初始化
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(
            color: AppTheme.primaryColor,
          ),
          const SizedBox(height: 16),
          Text(
            '正在加载幻灯片...',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWebView(ThemeData theme) {
    return Column(
      children: [
        // 提示条
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.secondaryColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.secondaryColor.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Icon(
                Icons.info_outline_rounded,
                size: 18,
                color: AppTheme.secondaryColor,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Web 平台暂不支持嵌入式预览，请复制下方链接在新窗口查看',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppTheme.textColor,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        // 预览 URL（可复制）
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: SelectableText(
            _bentoUrl!,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.textSecondary,
              fontSize: 12,
            ),
          ),
        ),
        const SizedBox(height: 16),
        // 提示使用 url_launcher 打开
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            '建议使用 url_launcher 或手动复制链接到浏览器打开',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.textSecondary,
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}