import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../components/app_card.dart';
import '../../components/shimmer_loading.dart';
import '../games/game_completion_screen.dart';
import '../games/game_renderer.dart';

/// 孩子端作业游戏页面：加载作业数据并渲染游戏，完成后调用 API 提交结果。
class AssignmentPlayScreen extends StatefulWidget {
  final Map<String, dynamic> assignment;

  const AssignmentPlayScreen({super.key, required this.assignment});

  @override
  State<AssignmentPlayScreen> createState() => _AssignmentPlayScreenState();
}

class _AssignmentPlayScreenState extends State<AssignmentPlayScreen> {
  bool _completed = false;
  int _finalScore = 0;
  int _finalTotal = 0;
  bool _submitting = false;

  Map<String, dynamic> get _assignment => widget.assignment;
  String get _activityType =>
      _assignment['activityType']?.toString() ?? 'quiz';
  Map<String, dynamic> get _activityData =>
      _assignment['activityData'] is Map
          ? Map<String, dynamic>.from(_assignment['activityData'])
          : {};
  String get _title =>
      _activityData['title']?.toString() ??
      _activityData['topic']?.toString() ??
      '作业';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _submitting
              ? null
              : () => Navigator.of(context).pop(),
        ),
      ),
      body: _completed ? _buildCompletion() : _buildGame(),
    );
  }

  Widget _buildGame() {
    return GameRenderer(
      activityType: _activityType,
      initialData: _activityData,
      onExit: () => Navigator.of(context).pop(),
      onCompleted: (result) async {
        final score = result['score'] as int? ?? 85;
        final total = result['total'] as int? ?? 0;
        final resultData = Map<String, dynamic>.from(result);

        setState(() {
          _completed = true;
          _finalScore = score;
          _finalTotal = total;
          _submitting = true;
        });

        // 提交完成结果到后端
        try {
          await context
              .read<ApiService>()
              .completeAssignment(_assignment['id'] as int, score,
                  resultData: resultData);
        } catch (_) {
          // 即使提交失败也不阻塞用户体验
        }

        setState(() => _submitting = false);
      },
    );
  }

  Widget _buildCompletion() {
    if (_submitting) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(),
            ),
            SizedBox(height: 16),
            Text('提交结果…', style: TextStyle(fontSize: 16, color: AppTheme.textSecondary)),
          ],
        ),
      );
    }

    return GameCompletionScreen(
      title: _title,
      score: _finalScore,
      total: _finalTotal,
      onPlayAgain: () {
        setState(() {
          _completed = false;
          _finalScore = 0;
          _finalTotal = 0;
        });
      },
      onBack: () => Navigator.of(context).pop(),
    );
  }
}