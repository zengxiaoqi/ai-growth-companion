import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/screens/learning/structured_lesson_screen.dart';
import 'package:lingxi_companion/screens/parent/lesson_generator_screen.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 课程生成页「生成 / 历史记录」页签与后台异步生成的接线测试。
///
/// 守住：历史页签只列 structured_lesson（含失败态）、编辑/预览/重试/删除入口、
/// 提交后不锁页（后台任务卡 + 再生成一个），任务离开页面后仍可在历史跟踪。
class _ParentUserProvider extends UserProvider {
  // ignore: use_super_parameters
  _ParentUserProvider(StorageService storage) : super(storage);

  @override
  String? get activeRole => 'parent';

  @override
  String get activeUserType => 'parent';

  @override
  Map<String, dynamic>? get currentUser => <String, dynamic>{
        'id': 1,
        'type': 'parent',
      };
}

const Map<String, dynamic> _lessonJson = <String, dynamic>{
  'ageGroup': '5-6',
  'steps': <Map<String, dynamic>>[
    <String, dynamic>{
      'id': 'step-1',
      'title': '认识四季',
      // 不带正文：预览时跳过自动 TTS，避免测试挂定时器
      'module': <String, dynamic>{'type': 'reading'},
    },
  ],
};

Map<String, dynamic> _row(
  int id,
  String title,
  String status, {
  String? subtitle,
  String contentType = 'structured_lesson',
}) =>
    <String, dynamic>{
      'id': id,
      'title': title,
      'subtitle': subtitle,
      'domain': 'science',
      'status': status,
      'contentType': contentType,
      'childId': 2,
      'content': jsonEncode(_lessonJson),
      'createdAt': '2026-11-15T10:00:00.000Z',
      'updatedAt': '2026-11-15T10:00:00.000Z',
    };

class _GeneratorApi extends ApiService {
  final List<bool> includeFailedCalls = <bool>[];
  final List<int> contentDetailCalls = <int>[];
  final List<int> retryCalls = <int>[];
  final List<int> deleteCalls = <int>[];
  final List<String> generateTopics = <String>[];

  late final List<Map<String, dynamic>> rows = <Map<String, dynamic>>[
    _row(51, '太空探险', 'generating', subtitle: '正在生成课程内容...'),
    _row(47, '四季：春夏秋冬', 'draft'),
    _row(52, '恐龙世界', 'generation_failed', subtitle: '生成失败: LLM 超时'),
    _row(9, '日月山川课程包', 'active', contentType: 'course_pack'),
  ];

  @override
  Future<List<dynamic>> getChildrenByParent(int parentId) async =>
      <dynamic>[
        <String, dynamic>{'id': 2, 'name': '小明', 'age': 5, 'type': 'child'},
      ];

  @override
  Future<List<dynamic>> getDraftLessons(int childId,
      {bool includeFailed = false}) async {
    includeFailedCalls.add(includeFailed);
    return rows;
  }

  @override
  Future<Map<String, dynamic>?> getContentDetail(int contentId) async {
    contentDetailCalls.add(contentId);
    if (contentId == 60) {
      return <String, dynamic>{
        'id': 60,
        'title': '海洋动物 全方位学习课',
        'status': 'generating',
        'subtitle': '正在生成课程内容...',
        'contentType': 'structured_lesson',
        'content': jsonEncode(_lessonJson),
      };
    }
    return <String, dynamic>{
      'id': contentId,
      'title': '四季：春夏秋冬',
      'status': 'draft',
      'contentType': 'structured_lesson',
      'content': jsonEncode(_lessonJson),
      'age_range': '5-6',
    };
  }

  @override
  Future<Map<String, dynamic>?> generateLesson({
    required String topic,
    required int childId,
    String? domain,
    String focus = 'mixed',
    String ageGroup = '5-6',
    int difficulty = 1,
    int durationMinutes = 20,
    String? parentPrompt,
  }) async {
    generateTopics.add(topic);
    rows.insert(0, _row(60, '$topic 全方位学习课', 'generating'));
    return <String, dynamic>{
      'id': 60,
      'title': '$topic 全方位学习课',
      'status': 'generating',
      'subtitle': '正在生成课程内容...',
      'contentType': 'structured_lesson',
    };
  }

  @override
  Future<Map<String, dynamic>?> retryLessonGeneration(int contentId) async {
    retryCalls.add(contentId);
    return <String, dynamic>{'id': contentId, 'status': 'generating'};
  }

  @override
  Future<bool> deleteLessonDraft(int contentId) async {
    deleteCalls.add(contentId);
    rows.removeWhere((r) => r['id'] == contentId);
    return true;
  }

  @override
  Future<Map<String, dynamic>?> getVideoStatus(
    int lessonId,
    int childId, {
    int? taskId,
  }) async =>
      null;
}

ThemeData _parentTheme() => AppTheme.lightTheme.copyWith(
      extensions: <ThemeExtension<dynamic>>[ChildThemePalette.honey],
    );

/// 页面存在不定态进度环（后台生成横幅/生成中行），pumpAndSettle 永不收敛，
/// 改用定步长 pump：足够完成路由/页签动画与微任务加载。
Future<void> _pumpFrames(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 400));
}

Future<_GeneratorApi> _pumpPage(WidgetTester tester) async {
  // 默认 800x600 视口装不下表单底部按钮与历史卡操作行，放大视口保证可点中
  tester.view.physicalSize = const Size(1000, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);
  final api = _GeneratorApi();

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<UserProvider>.value(
          value: _ParentUserProvider(storage),
        ),
        Provider<ApiService>.value(value: api),
        Provider<StorageService>.value(value: storage),
        ChangeNotifierProvider<ChildThemeController>.value(
          value: ChildThemeController(storage),
        ),
        ChangeNotifierProvider<ContentProvider>.value(
          value: ContentProvider(api),
        ),
      ],
      child: MaterialApp(
        theme: _parentTheme(),
        home: const LessonGeneratorScreen(),
      ),
    ),
  );
  await _pumpFrames(tester);
  return api;
}

Finder _historyCardButton(String title, String label) {
  final card = find
      .ancestor(of: find.text(title), matching: find.byType(Card))
      .first;
  return find.descendant(of: card, matching: find.text(label));
}

void main() {
  setUpAll(() {
    const methodChannel = MethodChannel('xyz.luan/audioplayers');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(methodChannel, (call) async => null);
    const eventChannel = EventChannel('xyz.luan/audioplayers/events');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(
      eventChannel,
      MockStreamHandler.inline(
        onListen: (arguments, sink) {},
        onCancel: (arguments) {},
      ),
    );
  });

  group('课程生成页历史页签', () {
    testWidgets('双页签存在，生成页提示后台任务，历史只列结构化课程含失败态',
        (tester) async {
      final api = await _pumpPage(tester);

      expect(find.text('生成'), findsOneWidget);
      expect(find.text('历史记录'), findsOneWidget);
      // 上次会话遗留的生成中任务 → 生成页横幅
      expect(find.text('1 个课程正在后台生成'), findsOneWidget);

      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);

      expect(api.includeFailedCalls, contains(true));
      expect(find.text('太空探险'), findsOneWidget);
      expect(find.text('四季：春夏秋冬'), findsOneWidget);
      expect(find.text('恐龙世界'), findsOneWidget);
      expect(find.text('日月山川课程包'), findsNothing);
      expect(find.text('生成中'), findsOneWidget);
      expect(find.text('草稿'), findsOneWidget);
      expect(find.text('失败'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('历史草稿编辑回到生成页签并载入草稿', (tester) async {
      final api = await _pumpPage(tester);
      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);

      await tester.tap(_historyCardButton('四季：春夏秋冬', '编辑'));
      await _pumpFrames(tester);

      expect(api.contentDetailCalls, contains(47));
      expect(find.text('课程四步预览'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('历史草稿预览以学生视角打开播放器', (tester) async {
      final api = await _pumpPage(tester);
      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);

      await tester.tap(_historyCardButton('四季：春夏秋冬', '预览'));
      await _pumpFrames(tester);

      expect(find.byType(StructuredLessonScreen), findsOneWidget);
      expect(find.text('四季：春夏秋冬 [预览]'), findsOneWidget);
      expect(api.contentDetailCalls, contains(47));
      expect(tester.takeException(), isNull);
    });

    testWidgets('失败任务可重试', (tester) async {
      final api = await _pumpPage(tester);
      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);

      await tester.tap(_historyCardButton('恐龙世界', '重试'));
      await _pumpFrames(tester);

      expect(api.retryCalls, contains(52));
      expect(tester.takeException(), isNull);
    });

    testWidgets('失败任务确认后删除', (tester) async {
      final api = await _pumpPage(tester);
      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);

      await tester.tap(_historyCardButton('恐龙世界', '删除'));
      await _pumpFrames(tester);
      await tester.tap(find.descendant(
          of: find.byType(AlertDialog), matching: find.text('删除')));
      await _pumpFrames(tester);

      expect(api.deleteCalls, contains(52));
      expect(find.text('恐龙世界'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('课程生成页异步生成', () {
    testWidgets('提交后显示后台任务卡不锁页，再生成一个后历史仍可跟踪',
        (tester) async {
      final api = await _pumpPage(tester);

      await tester.enterText(find.byType(TextField).first, '海洋动物');
      await tester.pump();
      await tester.tap(find.text('生成学习课程'));
      await _pumpFrames(tester);

      expect(api.generateTopics, <String>['海洋动物']);
      // 表单让位给后台任务卡
      expect(find.text('学习主题'), findsNothing);
      expect(find.text('查看历史记录'), findsOneWidget);
      expect(find.text('再生成一个'), findsOneWidget);

      // 放弃前台等待，服务端任务继续
      await tester.tap(find.text('再生成一个'));
      await _pumpFrames(tester);
      expect(find.text('学习主题'), findsOneWidget);

      await tester.tap(find.text('历史记录'));
      await _pumpFrames(tester);
      expect(find.text('海洋动物 全方位学习课'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}