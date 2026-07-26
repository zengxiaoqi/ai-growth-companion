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

/// 任务状态中文标签
String _statusLabel(String status) {
  switch (status) {
    case 'pending':
      return '排队中';
    case 'processing':
      return '生成中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

/// 任务状态颜色
Color _statusColor(String status) {
  switch (status) {
    case 'pending':
      return Colors.orange;
    case 'processing':
      return AppTheme.secondaryColor;
    case 'completed':
      return AppTheme.accentColor;
    case 'failed':
      return Colors.red;
    default:
      return Colors.grey;
  }
}

/// 任务状态图标
IconData _statusIcon(String status) {
  switch (status) {
    case 'pending':
      return Icons.hourglass_empty_rounded;
    case 'processing':
      return Icons.sync_rounded;
    case 'completed':
      return Icons.check_circle_rounded;
    case 'failed':
      return Icons.error_rounded;
    default:
      return Icons.help_rounded;
  }
}

class QuickVideoGeneratorScreen extends StatefulWidget {
  const QuickVideoGeneratorScreen({super.key});

  @override
  State<QuickVideoGeneratorScreen> createState() =>
      _QuickVideoGeneratorScreenState();
}

class _QuickVideoGeneratorScreenState extends State<QuickVideoGeneratorScreen>
    with SingleTickerProviderStateMixin {
  final _topicController = TextEditingController();
  late final ApiService _api;

  VideoGenStatus _status = VideoGenStatus.idle;
  String _errorMessage = '';
  int _pollCount = 0;
  static const _maxPollCount = 120;

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

  // 历史记录
  List<Map<String, dynamic>> _historyTasks = [];
  bool _loadingHistory = false;
  String? _historyError;

  // Tab 控制器
  late TabController _tabController;

  // 当前主题文字（用于历史记录显示）
  String _currentTopic = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 1 && !_tabController.indexIsChanging) {
        _loadHistory();
      }
    });
    _api = context.read<ApiService>();
    _loadChildren();
  }

  @override
  void dispose() {
    _topicController.dispose();
    _pollTimer?.cancel();
    _tabController.dispose();
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
      if (_selectedChildId == null && _children.isNotEmpty) {
        _selectedChildId = _children.first['id'] as int?;
      }
    });
  }

  Future<void> _loadHistory() async {
    if (_selectedChildId == null) return;
    setState(() {
      _loadingHistory = true;
      _historyError = null;
    });
    final tasks = await _api.getQuickGenerateTaskHistory(_selectedChildId!);
    if (!mounted) return;
    // 获取任务对应的 content 标题
    setState(() {
      _historyTasks = tasks;
      _loadingHistory = false;
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

    _currentTopic = topic;
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

  /// 重试失败的历史任务
  Future<void> _retryHistoryTask(Map<String, dynamic> task) async {
    final taskId = task['taskId'] as int;
    if (_selectedChildId == null) return;

    final result = await _api.retryQuickGenerateTask(taskId, _selectedChildId!);
    if (!mounted) return;

    if (result != null) {
      _showSnack('任务已重新加入队列');
      _loadHistory();
    } else {
      _showSnack('重试失败，请稍后重试');
    }
  }

  /// 查看历史任务视频
  void _viewHistoryVideo(Map<String, dynamic> task) {
    final contentId = task['contentId'] as int?;
    if (contentId != null && _selectedChildId != null) {
      Navigator.of(context).pushNamed(
        '/learning/structuredLesson',
        arguments: {
          'contentId': contentId,
          'childId': _selectedChildId,
        },
      );
    } else {
      _showSnack('课程信息缺失，无法查看');
    }
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
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(icon: Icon(Icons.auto_awesome_rounded), text: '生成'),
            Tab(icon: Icon(Icons.history_rounded), text: '历史记录'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildGenerateTab(),
          _buildHistoryTab(),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  生成 Tab
  // ═══════════════════════════════════════════════════════════

  Widget _buildGenerateTab() {
    return SafeArea(
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
      _buildChildSelector(),
      const SizedBox(height: 16),
      _buildTopicField(),
      const SizedBox(height: 16),
      _buildAgeGroupSelector(),
      const SizedBox(height: 16),
      _buildDurationSlider(),
      const SizedBox(height: 16),
      _buildStyleSelector(),
      const SizedBox(height: 24),
      _buildActionButton(),
      if (_status == VideoGenStatus.failed || _status == VideoGenStatus.timeout)
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
              value: null,
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
            '主题：$_currentTopic',
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

  // ═══════════════════════════════════════════════════════════
  //  历史记录 Tab
  // ═══════════════════════════════════════════════════════════

  Widget _buildHistoryTab() {
    if (_selectedChildId == null) {
      return const Center(
        child: Text('请先在「生成」页面选择孩子',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 15)),
      );
    }

    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_historyError != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            Text(_historyError!, style: const TextStyle(fontSize: 15)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loadHistory,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_historyTasks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.video_library_rounded, size: 64, color: AppTheme.textSecondary),
            const SizedBox(height: 16),
            const Text(
              '暂无历史记录',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            const Text(
              '在「生成」页面创建视频任务后，\n历史记录将显示在这里',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: () => _tabController.animateTo(0),
              icon: const Icon(Icons.auto_awesome_rounded),
              label: const Text('去生成视频'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        await _loadHistory();
      },
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _historyTasks.length + 1, // +1 for header
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8, left: 4),
              child: Text(
                '共 ${_historyTasks.length} 条记录',
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 13,
                ),
              ),
            );
          }
          return _buildHistoryTaskCard(_historyTasks[index - 1]);
        },
      ),
    );
  }

  Widget _buildHistoryTaskCard(Map<String, dynamic> task) {
    final status = task['status'] as String? ?? 'unknown';
    final progress = task['progress'] as int? ?? 0;
    final errorMsg = task['errorMessage'] as String?;
    final createdAt = task['createdAt'] as String?;
    final hasVideo = task['hasVideo'] as bool? ?? false;
    final isFailed = status == 'failed';
    final isProcessing = status == 'processing';
    final isPending = status == 'pending';

    // 格式化时间
    String timeStr = '';
    if (createdAt != null) {
      try {
        final dt = DateTime.parse(createdAt);
        timeStr =
            '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {
        timeStr = createdAt;
      }
    }

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 第一行：状态 + 时间
            Row(
              children: [
                Icon(_statusIcon(status), color: _statusColor(status), size: 20),
                const SizedBox(width: 8),
                Text(
                  _statusLabel(status),
                  style: TextStyle(
                    color: _statusColor(status),
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const Spacer(),
                Text(
                  timeStr,
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // 进度条（仅 processing/pending 显示）
            if (isProcessing || isPending) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress / 100.0,
                  minHeight: 4,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation(_statusColor(status)),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '进度: $progress%',
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 8),
            ],

            // 错误信息（仅 failed 显示）
            if (isFailed && errorMsg != null && errorMsg.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.error_outline, size: 16, color: Colors.red),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        errorMsg,
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],

            // 操作按钮
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (isFailed)
                  TextButton.icon(
                    onPressed: () => _retryHistoryTask(task),
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('重试'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.primaryColor,
                    ),
                  ),
                if (hasVideo) ...[
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: () => _viewHistoryVideo(task),
                    icon: const Icon(Icons.play_arrow_rounded, size: 18),
                    label: const Text('查看视频'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.secondaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ],
                if (isProcessing || isPending)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: _statusColor(status),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}