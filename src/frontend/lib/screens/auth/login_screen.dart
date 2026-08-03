// UI Refresh: 2026-05-12 — 统一组件 + 微交互动画

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;
  bool _rememberMe = false;
  bool _isLoading = false;
  String? _error;

  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOut,
    );
    _animationController.forward();

    // 从 storage 恢复记住我状态和已保存的凭证
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final storage = context.read<StorageService>();
      final remembered = storage.getRememberMe();
      if (remembered) {
        final savedPhone = storage.getRememberedPhone();
        final savedPassword = storage.getRememberedPassword();
        setState(() {
          _rememberMe = true;
          if (savedPhone != null) _phoneController.text = savedPhone;
          if (savedPassword != null) _passwordController.text = savedPassword;
        });
      } else {
        // 未勾选记住我时清空凭证（防止手动清除 checkbox 后旧数据残留）
        _phoneController.clear();
        _passwordController.clear();
        setState(() => _rememberMe = false);
      }
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  // 登录
  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final apiService = context.read<ApiService>();
      final result = await apiService.login(
        _phoneController.text.trim(),
        _passwordController.text,
      );

      debugPrint('[LOGIN] API response keys: ${result.keys.toList()}');

      if (result.containsKey('error')) {
        final errMsg = result['error']?.toString() ?? '未知错误';
        debugPrint('[LOGIN] Error: $errMsg');
        setState(() => _error = '登录失败: $errMsg');
        return;
      }

      // 保存 rememberMe 标志（capture references before await to satisfy use_build_context_synchronously)
      final storage = mounted ? context.read<StorageService>() : null;
      if (storage == null) return;
      await storage.saveRememberMe(_rememberMe);
      // 保存登录凭证，退出后自动填回手机号和密码
      if (_rememberMe) {
        await storage.saveCredentials(
          _phoneController.text.trim(),
          _passwordController.text,
        );
      } else {
        await storage.clearCredentials();
      }
      if (!mounted) return;

      // 保存 token（仅在"记住我"勾选时持久化，否则仅内存使用）
      final token = result['access_token'] ?? result['token'];
      debugPrint('[LOGIN] Token found: ${token != null}, rememberMe: $_rememberMe');
      if (token != null) {
        if (_rememberMe) {
          await storage.saveToken(token.toString());
          debugPrint('[LOGIN] Token saved to storage (rememberMe=true)');
          if (!mounted) return;
        } else {
          // 不持久化 token，仅注入到 ApiService 供当前会话使用
          debugPrint('[LOGIN] Token not saved (rememberMe=false)');
        }
        context.read<ApiService>().setToken(token.toString());
      }

      // 保存用户信息并跳转模式选择
      final user = result['user'] as Map<String, dynamic>? ?? result;
      debugPrint('[LOGIN] User data: id=${user['id']}, type=${user['type']}, name=${user['name']}');
      if (mounted) {
        final userProvider = context.read<UserProvider>();
        // 先注入 token 到 ApiService（不等 userProvider.login 内部处理）
        if (token != null) {
          context.read<ApiService>().setToken(token.toString());
        }
        await userProvider.login(Map<String, dynamic>.from(user));
        debugPrint('[LOGIN] userProvider.login() done, isLoggedIn=${userProvider.isLoggedIn}');
      } else {
        debugPrint('[LOGIN] Widget not mounted before userProvider.login()');
      }
    } catch (e, stack) {
      debugPrint('[LOGIN] Exception: $e');
      debugPrint('[LOGIN] Stack: $stack');
      setState(() => _error = '网络错误，请稍后重试');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Form(
                key: _formKey,
                child: AppCard(
                  color: Colors.white,
                  boxShadow: AppTheme.softShadow(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildHeader(),
                      const SizedBox(height: 40),
                      _buildPhoneField(),
                      const SizedBox(height: 20),
                      _buildPasswordField(),
                      const SizedBox(height: 16),
                      _buildRememberAndForgot(),
                      const SizedBox(height: 24),
                      if (_error != null) ...[
                        _buildErrorBanner(),
                        const SizedBox(height: 16),
                      ],
                      _buildLoginButton(),
                      const SizedBox(height: 16),
                      _buildChildQuickLoginButton(),
                      const SizedBox(height: 24),
                      _buildRegisterLink(),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // 顶部 Logo 区域
  Widget _buildHeader() {
    return Column(
      children: [
        // Logo 容器
        Container(
          width: 100,
          height: 100,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppTheme.primaryColor, Color(0xFFFFA5B9)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTheme.cardRadius + 8),
            boxShadow: AppTheme.glowShadow(AppTheme.primaryColor),
          ),
          child: const Center(
            child: Icon(
              Icons.auto_awesome,
              size: 50,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          '欢迎回来',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
            color: AppTheme.primaryColor,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          '登录您的账号继续学习之旅',
          style: TextStyle(
            fontSize: 16,
            color: AppTheme.textSecondary,
          ),
        ),
      ],
    );
  }

  // 手机号输入框
  Widget _buildPhoneField() {
    return TextFormField(
      controller: _phoneController,
      keyboardType: TextInputType.phone,
      maxLength: 15,
      decoration: InputDecoration(
        labelText: '手机号 / 账号',
        hintText: '请输入手机号或账号',
        prefixIcon: const Icon(Icons.phone_android_rounded, color: AppTheme.primaryColor),
        counterText: '',
        suffixIcon: _phoneController.text.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.clear_rounded, size: 20),
                onPressed: () {
                  _phoneController.clear();
                  setState(() {});
                },
              )
            : null,
      ),
      validator: (value) {
        if (value == null || value.trim().isEmpty) return '请输入手机号或账号';
        // 支持：纯数字账号（5-15位）、带+号的国际号码
        final cleaned = value.trim();
        if (cleaned.length < 5) return '账号太短';
        return null;
      },
      onChanged: (_) => setState(() {}),
    );
  }

  // 密码输入框
  Widget _buildPasswordField() {
    return TextFormField(
      controller: _passwordController,
      obscureText: _obscurePassword,
      decoration: InputDecoration(
        labelText: '密码',
        hintText: '请输入密码',
        prefixIcon: const Icon(Icons.lock_outline_rounded, color: AppTheme.primaryColor),
        suffixIcon: IconButton(
          icon: Icon(
            _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            color: AppTheme.textSecondary,
          ),
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
        ),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) return '请输入密码';
        if (value.length < 6) return '密码至少6位';
        return null;
      },
      onFieldSubmitted: (_) => _handleLogin(),
    );
  }

  // 记住我
  Widget _buildRememberAndForgot() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        GestureDetector(
          onTap: () {
            setState(() => _rememberMe = !_rememberMe);
            // 取消记住我时立即清除已保存的凭证
            if (!_rememberMe) {
              context.read<StorageService>().clearCredentials();
            }
          },
          child: Row(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: _rememberMe ? AppTheme.primaryColor : Colors.transparent,
                  border: Border.all(
                    color: _rememberMe ? AppTheme.primaryColor : AppTheme.textSecondary.withValues(alpha: 0.4),
                    width: 2,
                  ),
                  borderRadius: BorderRadius.circular(AppTheme.smallRadius),
                ),
                child: _rememberMe
                    ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 8),
              const Text(
                '记住我',
                style: TextStyle(
                  fontSize: 14,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // 错误提示
  Widget _buildErrorBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(AppTheme.smallRadius),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, color: Colors.red.shade400, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _error!,
              style: TextStyle(
                fontSize: 14,
                color: Colors.red.shade700,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 登录按钮
  Widget _buildLoginButton() {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: _isLoading ? null : _handleLogin,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          disabledBackgroundColor: AppTheme.primaryColor.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
          ),
          elevation: _isLoading ? 0 : 4,
          shadowColor: AppTheme.primaryColor.withValues(alpha: 0.4),
        ),
        child: _isLoading
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.5,
                ),
              )
            : const Text(
                '登录',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
      ),
    );
  }

  // 孩子快捷登录按钮
  Widget _buildChildQuickLoginButton() {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        onPressed: _showChildLoginDialog,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppTheme.primaryColor,
          side: BorderSide(color: AppTheme.primaryColor.withValues(alpha: 0.4), width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
          ),
        ),
        icon: const Icon(Icons.rocket_launch_rounded, size: 20),
        label: const Text(
          '孩子快捷登录',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  // 孩子快捷登录弹窗
  void _showChildLoginDialog() {
    final codeController = TextEditingController();
    bool isSubmitting = false;

    showDialog(
      context: context,
      barrierDismissible: !isSubmitting,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              title: const Text('孩子快捷登录'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    '请输入6位登录验证码',
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: codeController,
                    keyboardType: TextInputType.text,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 8,
                    ),
                    decoration: const InputDecoration(
                      hintText: 'ABC123',
                      counterText: '',
                      border: OutlineInputBorder(),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: AppTheme.primaryColor, width: 2),
                      ),
                    ),
                    autofocus: true,
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting ? null : () => Navigator.pop(dialogContext),
                  child: const Text('取消'),
                ),
                ElevatedButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final code = codeController.text.trim().toUpperCase();
                          if (code.length != 6) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              const SnackBar(content: Text('请输入6位验证码')),
                            );
                            return;
                          }

                          setState(() => isSubmitting = true);

                          try {
                            final apiService = context.read<ApiService>();
                            final result = await apiService.childLogin(code);

                            if (!mounted || !dialogContext.mounted) return;
                            Navigator.pop(dialogContext);

                            if (result.containsKey('error')) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(result['error'].toString())),
                              );
                              return;
                            }

                            // 保存 token（孩子快捷登录也受"记住我"控制）
                            final token = result['access_token'] ?? result['token'];
                            if (token != null) {
                              final storage = context.read<StorageService>();
await storage.saveToken(token.toString());
                              if (!mounted) return;
                              context.read<ApiService>().setToken(token.toString());
                            }

                            // 保存用户信息
                            final user = result['user'] as Map<String, dynamic>? ?? result;
                            if (mounted) {
                              final userProvider = context.read<UserProvider>();
                              await userProvider.login(Map<String, dynamic>.from(user));
                            }
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('登录失败: $e')),
                              );
                            }
                          } finally {
                            if (mounted) setState(() => isSubmitting = false);
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text('登录'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // 注册链接
  Widget _buildRegisterLink() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text(
          '还没有账号？',
          style: TextStyle(color: AppTheme.textSecondary, fontSize: 15),
        ),
        GestureDetector(
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const RegisterScreen()),
            );
          },
          child: const Text(
            '注册新账号',
            style: TextStyle(
              color: AppTheme.primaryColor,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
        ),
      ],
    );
  }
}
