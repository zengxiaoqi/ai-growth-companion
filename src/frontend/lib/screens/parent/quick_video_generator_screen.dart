import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/user_provider.dart';
import '../../services/api_service.dart';

/// 视频生成状态机
enum VideoGenStatus { idle, generating, polling, completed, failed, timeout }

/// 可选风格
const _styleOptions = ['story', 'science', 'song'];
const _styleLabels = {'story': '故事', 'science': '科学', 'song': '儿歌'};
const _styleIcons = {
  'story': Icons.menu_book_rounded,
  'science': Icons.science_rounded,
  'song': Icons.music_note_rounded,
};

/// 年龄组选项
const _ageGroups = ['3-4', '4-5', '5-6', '6-7', '7-8'];

class QuickVideoGeneratorScreen extends StatefulWidget {
  const QuickVideoGeneratorScreen({super.key});

  @override
  State<QuickVideoGeneratorScreen> createState() =>
      _QuickVideoGeneratorScreenState();
}

class _QuickVideoGeneratorScreenState extends State<QuickVideoGeneratorScreen> {
  final _topicController = TextEditingController();
  late final ApiService _api;

  VideoGenStatus _status = VideoGenStatus.idle;
  String _errorMessage = '';
  int _pollCount = 0;
  static const _maxPollCount = 120; // 最多轮询 120 次 (约 10 分钟，AI agent pipeline 可能需要 7+ 分钟)

  // 表单状态
  String _ageGroup = '4-5';
  String? _style;
  double _durationSec = 60;
  int? _selectedChildId;

  // 任务结果
  int? _taskId;
  int? _contentId;
  Timer? _pollTimer;

  // 孩子列表
  List<Map<String, dynamic>> _children = [];
  bool _loadingChildren = false;

  @override
  void initState() {
    super.initState();
    // 从 Provider 获取已注入 token 的 ApiService 实例，
    // 不要 new ApiService() — 那样会丢失 token 导致所有 API 请求返回 401
    _api = context.read<ApiService>();
    _loadChildren();
  }

  @override
  void dispose() {
    _topicController.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadChildren() async {
    final userProvider = context.read<UserProvider>();
    final currentUser = userProvider.currentUser;
    if (currentUser == null) return;

    final parentId = currentUser['id'] as int?;
    if (parentId == null) return;

    setState(() => _loadingChildren = true);
    final children = await _api.getChildrenByParent(parentId);
    if (!mounted) return;
    setState(() {
      _children = children
          .map((c) => c is Map<String, dynamic>
              ? c
              : jsonDecode(jsonEncode(c)) as Map<String, dynamic>)
          .toList();
      _loadingChildren = false;
      // 自动选中第一个孩子
      if (_selectedChildId == null && _children.isNotEmpty) {
        _selectedChildId = _children.first['id'] as int?;
      }
    });
  }

  Future<void> _startGeneration() async {
    final topic = _topicController.text.trim();
    if (topic.isEmpty) {
      _showSnack('请输入视频主题');
      return;
    }
    if (_selectedChildId == null) {
      _showSnack('请选择孩子');
      return;
    }

    setState(() {
      _status = VideoGenStatus.generating;
      _errorMessage = '';
      _pollCount = 0;
      _taskId = null;
      _contentId = null;
    });

    final result = await _api.quickGenerateVideo(
      topic: topic,
      ageGroup: _ageGroup,
      childId: _selectedChildId!,
      durationSec: _durationSec.toInt(),
      style: _style,
    );

    if (!mounted) return;

    if (result == null || result['taskId'] == null) {
      setState(() {
        _status = VideoGenStatus.failed;
        _errorMessage = result?['message'] as String? ?? '生成请求失败，请稍后重试';
      });
      return;
    }

    setState(() {
      _taskId = result['taskId'] as int;
      _contentId = result['contentId'] as int;
      _status = VideoGenStatus.polling;
    });

    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (!mounted) {
        _pollTimer?.cancel();
        return;
      }

      if (_taskId == null || _contentId == null) {
        _pollTimer?.cancel();
        return;
      }

      final status = await _api.getQuickVideoTaskStatus(
        _contentId!,
        _taskId!,
        _selectedChildId!,
      );

      if (!mounted) return;

      final newCount = _pollCount + 1;
      setState(() => _pollCount = newCount);

      if (status == null) {
        // 网络错误，继续轮询
        if (newCount >= _maxPollCount) {
          setState(() {
            _status = VideoGenStatus.timeout;
            _errorMessage = '视频生成超时，请稍后重试';
          });
          _pollTimer?.cancel();
        }
        return;
      }

      final taskStatus = status['status'] as String?;
      final ready = status['ready'] as bool? ?? false;

      if (taskStatus == 'completed' || ready) {
        _pollTimer?.cancel();
        setState(() => _status = VideoGenStatus.completed);
      } else if (taskStatus == 'failed') {
        _pollTimer?.cancel();
        setState(() {
          _status = VideoGenStatus.failed;
          _errorMessage =
              (status['errorMessage'] as String?) ?? '视频生成失败';
        });
      } else if (newCount >= _maxPollCount) {
        _pollTimer?.cancel();
        setState(() {
          _status = VideoGenStatus.timeout;
          _errorMessage = '视频生成超时，请稍后重试';
        });
      }
      // else: 继续轮询
    });
  }

  void _reset() {
    _pollTimer?.cancel();
    setState(() {
      _status = VideoGenStatus.idle;
      _errorMessage = '';
      _pollCount = 0;
      _taskId = null;
      _contentId = null;
    });
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  // ── UI ────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      appBar: AppBar(
        title: const Text('快速视频生成', style: TextStyle(color: Colors.white)),
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHeader(),
              const SizedBox(height: 24),
              if (_status == VideoGenStatus.idle ||
                  _status == VideoGenStatus.failed ||
                  _status == VideoGenStatus.timeout)
                ..._buildForm(),
              _buildStatusArea(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.softPurple, AppTheme.secondaryColor],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          const Icon(Icons.video_library_rounded, color: Colors.white, size: 48),
          const SizedBox(height: 12),
          const Text(
            '一键生成教学视频',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'AI 自动生成内容并渲染为动画视频',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildForm() {
    return [
      // 孩子选择
      _buildChildSelector(),
      const SizedBox(height: 16),
      // 主题输入
      _buildTopicField(),
      const SizedBox(height: 16),
      // 年龄组
      _buildAgeGroupSelector(),
      const SizedBox(height: 16),
      // 时长滑块
      _buildDurationSlider(),
      const SizedBox(height: 16),
      // 风格选择
      _buildStyleSelector(),
      const SizedBox(height: 24),
      // 生成按钮 / 重试
      _buildActionButton(),
      if (_status == VideoGenStatus.failed ||
          _status == VideoGenStatus.timeout)
        _buildErrorDisplay(),
    ];
  }

  Widget _buildChildSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '选择孩子',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        const SizedBox(height: 8),
        if (_loadingChildren)
          const Center(child: CircularProgressIndicator())
        else if (_children.isEmpty)
          const Text(
            '暂无关联孩子',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _children.map((child) {
              final id = child['id'] as int?;
              final name = child['name'] as String? ?? '孩子 $id';
              final selected = _selectedChildId == id;
              return ChoiceChip(
                label: Text(name),
                selected: selected,
                onSelected: (_) => setState(() => _selectedChildId = id),
                selectedColor: AppTheme.primaryColor.withValues(alpha: 0.2),
                backgroundColor: Colors.white,
                side: BorderSide(
                  color: selected ? AppTheme.primaryColor : Colors.grey.shade300,
                ),
              );
            }).toList(),
          ),
      ],
    );
  }

  Widget _buildTopicField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '视频主题',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _topicController,
          enabled: _status == VideoGenStatus.idle,
          decoration: InputDecoration(
            hintText: '例如：海洋动物、太阳系、数学加减法',
            prefixIcon: const Icon(Icons.topic_rounded),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.white,
          ),
        ),
      ],
    );
  }

  Widget _buildAgeGroupSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '年龄段',
          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _ageGroups.map((age) {
            final selected = _ageGroup == age;
            return ChoiceChip(
              label: Text('$age 岁'),
              selected: selected,
              onSelected: (_) => setState(() => _ageGroup = age),
              selectedColor: AppTheme.secondaryColor.withValues(alpha: 0.2),
              backgroundColor: Colors.white,
              side: BorderSide(
                color:
                    selected ? AppTheme.secondaryColor : Colors.grey.shade300,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildDurationSlider() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              '视频时长',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            Text(
              '${_durationSec.toInt()} 秒',
              style: const TextStyle(
                color: AppTheme.primaryColor,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        Slider(
          value: _durationSec,
          min: 10,
          max: 180,
          divisions: 17,
          activeColor: AppTheme.primaryColor,
          label: '${_durationSec.toInt()} 秒',
          onChanged: (v) => setState(() => _durationSec = v),
        ),
        const Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('10s', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            Text('180s', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          ],
        ),
      ],
    );
  }

  Widget _buildStyleSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              '视频风格',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            if (_style != null) ...[
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _style = null),
                child: const Text('清除选择', style: TextStyle(fontSize: 13)),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _styleOptions.map((s) {
            final selected = _style == s;
            return FilterChip(
              label: Text(_styleLabels[s]!),
              avatar: Icon(_styleIcons[s], size: 18),
              selected: selected,
              onSelected: (v) => setState(() => _style = v ? s : null),
              selectedColor: AppTheme.accentColor.withValues(alpha: 0.2),
              backgroundColor: Colors.white,
              side: BorderSide(
                color: selected ? AppTheme.accentColor : Colors.grey.shade300,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildActionButton() {
    final isRetry = _status == VideoGenStatus.failed ||
        _status == VideoGenStatus.timeout;
    final label = isRetry ? '重新生成' : '开始生成';
    final icon = isRetry ? Icons.refresh_rounded : Icons.auto_awesome_rounded;

    return SizedBox(
      height: 52,
      child: ElevatedButton.icon(
        onPressed: _status == VideoGenStatus.idle || isRetry
            ? () {
                if (isRetry) _reset();
                _startGeneration();
              }
            : null,
        icon: Icon(icon),
        label: Text(label, style: const TextStyle(fontSize: 16)),
        style: ElevatedButton.styleFrom(
          backgroundColor: isRetry ? AppTheme.accentColor : AppTheme.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorDisplay() {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.warningColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.warningColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppTheme.warningColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _errorMessage,
              style: const TextStyle(color: AppTheme.warningColor, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  // ── 状态区 ────────────────────────────────────────────────

  Widget _buildStatusArea() {
    switch (_status) {
      case VideoGenStatus.generating:
        return _buildGeneratingCard();
      case VideoGenStatus.polling:
        return _buildPollingCard();
      case VideoGenStatus.completed:
        return _buildCompletedCard();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildGeneratingCard() {
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: const Column(
        children: [
          SizedBox(
            width: 48,
            height: 48,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          SizedBox(height: 16),
          Text(
            '正在生成视频…',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8),
          Text(
            'AI 正在创作内容，请稍候…',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildPollingCard() {
    final progress = (_pollCount / _maxPollCount).clamp(0.0, 1.0);
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        children: [
          const SizedBox(
            width: 60,
            height: 60,
            child: CircularProgressIndicator(
              value: null, // indeterminate until we have real progress
              strokeWidth: 4,
              color: AppTheme.secondaryColor,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            '视频渲染中…',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            '已等待 ${_pollCount * 5} 秒',
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: Colors.grey.shade200,
              valueColor: const AlwaysStoppedAnimation(AppTheme.secondaryColor),
            ),
          ),
          const SizedBox(height: 16),
          TextButton.icon(
            onPressed: _reset,
            icon: const Icon(Icons.cancel_outlined, size: 18),
            label: const Text('取消'),
            style: TextButton.styleFrom(foregroundColor: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildCompletedCard() {
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.check_circle_rounded,
            color: AppTheme.accentColor,
            size: 56,
          ),
          const SizedBox(height: 12),
          const Text(
            '视频生成成功！',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.accentColor,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '主题：${_topicController.text}',
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: () {
                if (_contentId != null && _selectedChildId != null) {
                  Navigator.of(context).pushNamed(
                    '/learning/structuredLesson',
                    arguments: {
                      'contentId': _contentId,
                      'childId': _selectedChildId,
                    },
                  );
                } else {
                  _showSnack('课程信息缺失，无法查看');
                }
              },
              icon: const Icon(Icons.play_circle_rounded),
              label: const Text('查看课程视频'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.secondaryColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: _reset,
              icon: const Icon(Icons.add_circle_outline),
              label: const Text('再生成一个'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primaryColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}