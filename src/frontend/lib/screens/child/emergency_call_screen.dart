import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

/// 紧急呼叫页面（孩子端全屏页面）
///
/// 状态机流程：
/// idle → countdown（5秒倒计时）→ calling（API 调用中）→ success / error
///
/// 设计要点：
/// - 大图标、大按钮、大字体，适合儿童操作
/// - 红色主题，传递紧急感
/// - Material 3 风格
enum _CallState { idle, countdown, calling, success, error }

class EmergencyCallScreen extends StatefulWidget {
  /// 孩子 ID，用于调用紧急呼叫接口
  final int childId;

  const EmergencyCallScreen({super.key, required this.childId});

  @override
  State<EmergencyCallScreen> createState() => _EmergencyCallScreenState();
}

class _EmergencyCallScreenState extends State<EmergencyCallScreen>
    with SingleTickerProviderStateMixin {
  _CallState _state = _CallState.idle;
  int _countdown = 5;
  String _errorMsg = '';
  Timer? _timer;

  // 脉冲动画控制器（calling 状态使用）
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  /// 开始 5 秒倒计时
  void _startCountdown() {
    setState(() {
      _state = _CallState.countdown;
      _countdown = 5;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_countdown <= 1) {
        timer.cancel();
        _triggerCall();
      } else {
        setState(() => _countdown--);
      }
    });
  }

  /// 取消倒计时，返回 idle
  void _cancelCountdown() {
    _timer?.cancel();
    if (mounted) {
      setState(() {
        _state = _CallState.idle;
        _countdown = 5;
      });
    }
  }

  /// 调用紧急呼叫 API
  Future<void> _triggerCall() async {
    if (!mounted) return;
    setState(() => _state = _CallState.calling);
    _pulseController.repeat(reverse: true);

    final api = context.read<ApiService>();
    try {
      final result = await api.triggerEmergencyCall(widget.childId);
      if (!mounted) return;

      if (result != null && result.containsKey('error')) {
        setState(() {
          _errorMsg = result['error']?.toString() ?? '呼叫失败，请重试';
          _state = _CallState.error;
        });
      } else {
        setState(() => _state = _CallState.success);
        // 3 秒后自动返回
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) Navigator.of(context).pop();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMsg = '呼叫失败，请重试';
        _state = _CallState.error;
      });
    } finally {
      _pulseController.stop();
    }
  }

  /// 重试
  void _retry() {
    setState(() {
      _state = _CallState.idle;
      _errorMsg = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // 顶部返回按钮
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 12, top: 8),
                child: IconButton(
                  onPressed: _state == _CallState.calling
                      ? null
                      : () => Navigator.of(context).pop(),
                  icon: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.arrow_back_rounded, size: 22),
                  ),
                ),
              ),
            ),
            // 主体内容居中
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: _buildStateContent(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 根据当前状态渲染对应内容
  Widget _buildStateContent() {
    switch (_state) {
      case _CallState.idle:
        return _buildIdleState();
      case _CallState.countdown:
        return _buildCountdownState();
      case _CallState.calling:
        return _buildCallingState();
      case _CallState.success:
        return _buildSuccessState();
      case _CallState.error:
        return _buildErrorState();
    }
  }

  // ==================== idle 状态 ====================
  Widget _buildIdleState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 大电话图标
        _buildIconCircle(
          icon: Icons.phone_rounded,
          color: const Color(0xFFD32F2F),
          bgColor: const Color(0xFFD32F2F).withOpacity(0.1),
          size: 100,
          iconSize: 52,
        ),
        const SizedBox(height: 32),
        // 标题
        const Text(
          '紧急呼叫',
          style: TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.w900,
            color: Color(0xFFD32F2F),
          ),
        ),
        const SizedBox(height: 12),
        // 描述
        Text(
          '呼叫爸爸妈妈',
          style: TextStyle(
            fontSize: 22,
            color: Colors.grey.shade600,
          ),
        ),
        const SizedBox(height: 48),
        // 红色大按钮
        SizedBox(
          width: double.infinity,
          height: 72,
          child: ElevatedButton(
            onPressed: _startCountdown,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD32F2F),
              foregroundColor: Colors.white,
              elevation: 4,
              shadowColor: const Color(0xFFD32F2F).withOpacity(0.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            child: const Text(
              '📞 呼叫爸爸妈妈',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        // 取消按钮
        SizedBox(
          width: double.infinity,
          height: 60,
          child: OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.grey.shade700,
              side: BorderSide(color: Colors.grey.shade300, width: 1.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            child: const Text(
              '取消',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }

  // ==================== countdown 状态 ====================
  Widget _buildCountdownState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 倒计时大数字
        _buildIconCircle(
          child: Text(
            '$_countdown',
            style: const TextStyle(
              fontSize: 72,
              fontWeight: FontWeight.w900,
              color: Color(0xFFD32F2F),
            ),
          ),
          bgColor: const Color(0xFFD32F2F).withOpacity(0.1),
          size: 130,
        ),
        const SizedBox(height: 32),
        const Text(
          '即将呼叫',
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: Color(0xFFD32F2F),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '$_countdown 秒后通知爸爸妈妈',
          style: TextStyle(
            fontSize: 20,
            color: Colors.grey.shade600,
          ),
        ),
        const SizedBox(height: 48),
        // 取消按钮
        SizedBox(
          width: double.infinity,
          height: 68,
          child: ElevatedButton(
            onPressed: _cancelCountdown,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.grey.shade200,
              foregroundColor: Colors.grey.shade800,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            child: const Text(
              '取消',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ==================== calling 状态 ====================
  Widget _buildCallingState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 脉冲动画电话图标
        AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (context, child) {
            return Transform.scale(
              scale: _pulseAnimation.value,
              child: _buildIconCircle(
                icon: Icons.phone_rounded,
                color: AppTheme.primaryColor,
                bgColor: AppTheme.primaryColor.withOpacity(0.1),
                size: 100,
                iconSize: 52,
              ),
            );
          },
        ),
        const SizedBox(height: 32),
        const Text(
          '正在呼叫',
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: AppTheme.textColor,
          ),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(Colors.grey.shade500),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '正在通知爸爸妈妈...',
              style: TextStyle(
                fontSize: 20,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ==================== success 状态 ====================
  Widget _buildSuccessState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 成功图标（带弹跳动画）
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.0, end: 1.0),
          duration: const Duration(milliseconds: 500),
          curve: Curves.elasticOut,
          builder: (context, value, child) {
            return Transform.scale(scale: value, child: child);
          },
          child: _buildIconCircle(
            icon: Icons.check_circle_rounded,
            color: const Color(0xFF2E7D32),
            bgColor: const Color(0xFF2E7D32).withOpacity(0.12),
            size: 100,
            iconSize: 56,
          ),
        ),
        const SizedBox(height: 32),
        const Text(
          '通知成功',
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: Color(0xFF2E7D32),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '已经通知爸爸妈妈了！',
          style: TextStyle(
            fontSize: 20,
            color: Colors.grey.shade600,
          ),
        ),
        const SizedBox(height: 24),
        Text(
          '3 秒后自动返回...',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey.shade400,
          ),
        ),
      ],
    );
  }

  // ==================== error 状态 ====================
  Widget _buildErrorState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 警告图标
        _buildIconCircle(
          icon: Icons.warning_rounded,
          color: const Color(0xFFD32F2F),
          bgColor: const Color(0xFFD32F2F).withOpacity(0.1),
          size: 100,
          iconSize: 52,
        ),
        const SizedBox(height: 32),
        const Text(
          '呼叫失败',
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: Color(0xFFD32F2F),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          _errorMsg,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            color: Colors.grey.shade600,
          ),
        ),
        const SizedBox(height: 40),
        // 重试按钮
        SizedBox(
          width: double.infinity,
          height: 68,
          child: ElevatedButton(
            onPressed: _retry,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD32F2F),
              foregroundColor: Colors.white,
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            child: const Text(
              '重试',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(height: 16),
        // 关闭按钮
        SizedBox(
          width: double.infinity,
          height: 60,
          child: OutlinedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.grey.shade700,
              side: BorderSide(color: Colors.grey.shade300, width: 1.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            child: const Text(
              '关闭',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }

  // ==================== 通用组件 ====================

  /// 圆形图标容器
  Widget _buildIconCircle({
    IconData? icon,
    Widget? child,
    Color? color,
    required Color bgColor,
    double size = 80,
    double iconSize = 40,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bgColor,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: child ??
            Icon(
              icon,
              size: iconSize,
              color: color,
            ),
      ),
    );
  }
}
