import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// 只有这 6 种参数化题型的 interactionData 含过程数据。
/// legacy 题型（quiz 等）也可能带 activityType 字段，不能只判存在。
const Set<String> kParameterizedActivityTypes = {
  'drag_sort',
  'memory_flip',
  'pattern_next',
  'trace_path',
  'color_fill',
  'tap_target',
};

/// 与 Web 端 parent/constants.ts 的 ACTIVITY_TYPES 标签保持一致。
const Map<String, String> kActivityTypeLabels = {
  'drag_sort': '分类游戏',
  'memory_flip': '记忆翻牌',
  'pattern_next': '规律接龙',
  'trace_path': '描红游戏',
  'color_fill': '涂色游戏',
  'tap_target': '听指令点一点',
};

const int kMaxProcessRecords = 8;

int _intOf(Map<dynamic, dynamic> data, String key, [int fallback = 0]) {
  final value = data[key];
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

List<Map<dynamic, dynamic>> _mapsOf(dynamic raw) {
  if (raw is! List) return const [];
  return raw.whereType<Map>().toList();
}

int _firstTryCount(List<Map<dynamic, dynamic>> entries) =>
    entries.where((e) => e['firstTry'] == true).length;

/// 把一条记录的 interactionData 翻译成一句家长能读懂的过程摘要。
/// 口径与 Web 端 ActivityProcessDetails.summarizeInteraction 逐条一致。
String? summarizeInteraction(Map<String, dynamic> data) {
  switch (data['activityType']) {
    case 'drag_sort':
      final placements = _mapsOf(data['placements']);
      if (placements.isEmpty) return null;
      final first = placements.where((p) => p['correctOnFirstTry'] == true).length;
      return '放错 ${_intOf(data, 'totalErrors')} 次 · $first/${placements.length} 个物品首次放对';

    case 'memory_flip':
      if (data['moves'] is! num) return null;
      return '${_intOf(data, 'moves')} 步完成全部配对 · 翻错 ${_intOf(data, 'mismatches')} 次';

    case 'pattern_next':
      if (data['attempts'] is! num) return null;
      return data['firstTryCorrect'] == true
          ? '每个规律一次接对'
          : '共尝试 ${_intOf(data, 'attempts')} 次后接对全部规律';

    case 'trace_path':
      final perTarget = _mapsOf(data['perTarget']);
      if (perTarget.isEmpty) return null;
      final coverageValue = data['minCoverage'];
      final coverage = coverageValue is num ? coverageValue.toDouble() : 0.7;
      final first = _firstTryCount(perTarget);
      return '描红 ${perTarget.length} 个字（达标线 ${(coverage * 100).round()}% 覆盖）· '
          '$first/${perTarget.length} 个字一次完成';

    case 'color_fill':
      final regionResults = _mapsOf(data['regionResults']);
      if (regionResults.isEmpty) return null;
      final first = _firstTryCount(regionResults);
      return '$first/${regionResults.length} 个区域一次涂对';

    case 'tap_target':
      final roundResults = _mapsOf(data['roundResults']);
      if (roundResults.isEmpty) return null;
      final first = _firstTryCount(roundResults);
      return '$first/${roundResults.length} 轮一次听对指令';

    default:
      return null;
  }
}

/// 把 /learning/history 返回的裸 List 过滤成可展示的参数化题型记录。
List<Map<String, dynamic>> filterProcessRecords(List<dynamic> raw) {
  final result = <Map<String, dynamic>>[];
  for (final item in raw) {
    if (item is! Map) continue;
    final record = item.map((k, v) => MapEntry(k.toString(), v));
    final interaction = record['interactionData'];
    if (interaction is! Map) continue;
    final type = interaction['activityType']?.toString() ?? '';
    if (!kParameterizedActivityTypes.contains(type)) continue;
    result.add(record);
    if (result.length >= kMaxProcessRecords) break;
  }
  return result;
}

String _formatDate(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.month}月${d.day}日';
}

String _formatDuration(dynamic seconds) {
  final value = seconds is num ? seconds.toInt() : 0;
  if (value <= 0) return '';
  return '${(value / 60).round().clamp(1, 10000)} 分钟';
}

/// 家长端「活动过程明细」：展示最近若干次参数化题型学习记录的过程数据
/// （interactionData，已由后端存入 learning_records，经
/// GET /learning/history/:userId 返回）。本组件不发起网络请求，
/// 由页面加载后传入 [records]（用 [filterProcessRecords] 过滤）。
class ActivityProcessDetails extends StatelessWidget {
  final List<Map<String, dynamic>> records;

  const ActivityProcessDetails({super.key, required this.records});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.list_alt_rounded, color: AppTheme.primaryColor),
                const SizedBox(width: 8),
                Text(
                  '活动过程明细',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                if (records.isNotEmpty)
                  Text(
                    '最近 ${records.length} 次',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (records.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '暂无互动游戏记录',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '孩子完成互动小游戏后，这里会展示每局的作答过程。',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              )
            else
              ...records.map((record) => _buildRecordRow(context, record)),
          ],
        ),
      ),
    );
  }

  Widget _buildRecordRow(BuildContext context, Map<String, dynamic> record) {
    final theme = Theme.of(context);
    final interaction = record['interactionData'] as Map;
    final type = interaction['activityType']?.toString() ?? '';
    final label = kActivityTypeLabels[type] ?? type;
    final summary = summarizeInteraction(
      interaction.map((k, v) => MapEntry(k.toString(), v)),
    );

    final content = record['content'];
    final title = content is Map ? content['title']?.toString() ?? '' : '';
    final date = _formatDate(record['startedAt']?.toString() ?? '');
    final duration = _formatDuration(record['durationSeconds']);
    final meta = [date, if (duration.isNotEmpty) duration].join(' · ');
    final score = record['score'];

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.backgroundColor.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  label,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppTheme.primaryColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (title.isNotEmpty)
                Text(
                  title,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              if (meta.isNotEmpty)
                Text(
                  meta,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
                ),
              if (score is num)
                Text(
                  '${score.toInt()}分',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppTheme.secondaryColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          if (summary != null) ...[
            const SizedBox(height: 6),
            Text(
              summary,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
