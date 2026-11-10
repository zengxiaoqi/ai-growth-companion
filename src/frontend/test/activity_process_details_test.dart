import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/activity_process_details.dart';

Map<String, dynamic> _record(
  String type,
  Map<String, dynamic> interaction, {
  int id = 1,
  String? title,
  int score = 100,
  int durationSeconds = 180,
}) {
  return {
    'id': id,
    'startedAt': '2026-11-10T10:00:00.000Z',
    'durationSeconds': durationSeconds,
    'score': score,
    'status': 'completed',
    if (title != null) 'content': {'id': 9, 'title': title},
    'interactionData': {'activityType': type, ...interaction},
  };
}

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('summarizeInteraction — 与 Web 端口径一致', () {
    test('six parameterized activity types', () {
      expect(
        summarizeInteraction({
          'activityType': 'drag_sort',
          'totalErrors': 1,
          'placements': [
            {'itemId': 'a', 'correctOnFirstTry': true},
            {'itemId': 'b', 'correctOnFirstTry': true},
            {'itemId': 'c', 'correctOnFirstTry': false},
          ],
        }),
        '放错 1 次 · 2/3 个物品首次放对',
      );
      expect(
        summarizeInteraction({
          'activityType': 'memory_flip',
          'moves': 8,
          'mismatches': 2,
        }),
        '8 步完成全部配对 · 翻错 2 次',
      );
      expect(
        summarizeInteraction({
          'activityType': 'pattern_next',
          'attempts': 1,
          'firstTryCorrect': true,
        }),
        '每个规律一次接对',
      );
      expect(
        summarizeInteraction({
          'activityType': 'pattern_next',
          'attempts': 3,
          'firstTryCorrect': false,
        }),
        '共尝试 3 次后接对全部规律',
      );
      expect(
        summarizeInteraction({
          'activityType': 'trace_path',
          'minCoverage': 0.7,
          'perTarget': [
            {'id': 't1', 'firstTry': true},
            {'id': 't2', 'firstTry': false},
          ],
        }),
        '描红 2 个字（达标线 70% 覆盖）· 1/2 个字一次完成',
      );
      expect(
        summarizeInteraction({
          'activityType': 'color_fill',
          'regionResults': [
            {'id': 'r1', 'firstTry': true},
            {'id': 'r2', 'firstTry': false},
          ],
        }),
        '1/2 个区域一次涂对',
      );
      expect(
        summarizeInteraction({
          'activityType': 'tap_target',
          'roundResults': [
            {'roundId': 'r1', 'firstTry': true},
            {'roundId': 'r2', 'firstTry': true},
            {'roundId': 'r3', 'firstTry': false},
          ],
        }),
        '2/3 轮一次听对指令',
      );
    });

    test('returns null for legacy or incomplete data', () {
      expect(summarizeInteraction({'activityType': 'quiz'}), isNull);
      expect(
        summarizeInteraction({'activityType': 'drag_sort', 'placements': []}),
        isNull,
      );
      expect(summarizeInteraction({}), isNull);
    });
  });

  group('filterProcessRecords', () {
    test('whitelists parameterized types only and caps at 8 records', () {
      final raw = <dynamic>[
        _record('tap_target', {
          'roundResults': [
            {'roundId': 'r1', 'firstTry': true},
          ],
        }),
        // legacy 题型也带 activityType，必须排除
        _record('quiz', {}),
        {'id': 3, 'interactionData': null},
        'not a map',
        for (var i = 0; i < 12; i++)
          _record('color_fill', {
            'regionResults': [
              {'id': 'r1', 'firstTry': true},
            ],
          }, id: 100 + i),
      ];
      final filtered = filterProcessRecords(raw);
      expect(filtered.length, 8);
      expect(filtered.first['interactionData']['activityType'], 'tap_target');
      expect(
        filtered.every((r) => r['interactionData']['activityType'] != 'quiz'),
        isTrue,
      );
    });
  });

  group('ActivityProcessDetails widget', () {
    testWidgets('renders labels and process summaries', (tester) async {
      final records = [
        _record('tap_target', {
          'roundResults': [
            {'roundId': 'r1', 'firstTry': true},
          ],
        }, title: '动物听指令'),
        _record('color_fill', {
          'regionResults': [
            {'id': 'r1', 'firstTry': true},
          ],
        }),
      ];
      await tester.pumpWidget(
        _wrap(ActivityProcessDetails(records: records)),
      );

      expect(find.text('活动过程明细'), findsOneWidget);
      expect(find.text('最近 2 次'), findsOneWidget);
      expect(find.text('听指令点一点'), findsOneWidget);
      expect(find.text('1/1 轮一次听对指令'), findsOneWidget);
      expect(find.text('涂色游戏'), findsOneWidget);
      expect(find.text('1/1 个区域一次涂对'), findsOneWidget);
      expect(find.text('动物听指令'), findsOneWidget);
      expect(find.text('100分'), findsNWidgets(2));
    });

    testWidgets('shows empty state when no records', (tester) async {
      await tester.pumpWidget(
        _wrap(const ActivityProcessDetails(records: [])),
      );
      expect(find.text('暂无互动游戏记录'), findsOneWidget);
      expect(find.textContaining('每局的作答过程'), findsOneWidget);
    });
  });
}
