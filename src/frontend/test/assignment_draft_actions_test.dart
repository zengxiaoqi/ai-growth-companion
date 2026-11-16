import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/screens/learning/structured_lesson_screen.dart';
import 'package:lingxi_companion/screens/parent/assignment_manager_screen.dart';
import 'package:lingxi_companion/screens/parent/lesson_generator_screen.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 作业管理页草稿卡片的操作接线测试。
///
/// structured_lesson 草稿曾经整张卡片没有任何按钮（点击无反应），
/// 这里守住两条入口：预览 → 学生端播放器 previewMode，
/// 编辑 → 课程生成器携带 draftContentId 载入草稿。
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
      // 不带正文：预览时 _extractStepText 为空，跳过自动 TTS，避免测试挂定时器
      'module': <String, dynamic>{'type': 'reading'},
    },
  ],
};

class _DraftApi extends ApiService {
  final List<int> contentDetailCalls = <int>[];

  @override
  Future<List<dynamic>> getChildrenByParent(int parentId) async =>
      <dynamic>[
        <String, dynamic>{'id': 2, 'name': '小明', 'age': 5, 'type': 'child'},
      ];

  @override
  Future<List<dynamic>> getAssignmentsByParent(int parentId) async =>
      <dynamic>[];

  @override
  Future<List<dynamic>> getDraftLessons(int childId,
          {bool includeFailed = false}) async =>
      <dynamic>[
        <String, dynamic>{
          'id': 47,
          'title': '四季：春夏秋冬',
          'subtitle': null,
          'domain': 'science',
          'status': 'draft',
          'contentType': 'structured_lesson',
          'childId': childId,
          'content': jsonEncode(_lessonJson),
          'createdAt': '2026-11-15T10:00:00.000Z',
          'updatedAt': '2026-11-15T10:00:00.000Z',
        },
        <String, dynamic>{
          'id': 9,
          'title': '日月山川课程包',
          'subtitle': null,
          'domain': '',
          'status': 'active',
          'contentType': 'course_pack',
          'childId': childId,
          'content': <String, dynamic>{'title': '日月山川'},
          'createdAt': '2026-11-14T10:00:00.000Z',
          'updatedAt': '2026-11-14T10:00:00.000Z',
        },
      ];

  @override
  Future<Map<String, dynamic>?> getContentDetail(int contentId) async {
    contentDetailCalls.add(contentId);
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

Future<_DraftApi> _pumpPage(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);
  final api = _DraftApi();

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
        home: const AssignmentManagerScreen(),
        onGenerateRoute: (settings) {
          if (settings.name == '/parent/lessonGenerator') {
            final args = settings.arguments as Map?;
            return MaterialPageRoute(
              builder: (_) => LessonGeneratorScreen(
                draftContentId: args?['draftContentId'] as int?,
              ),
            );
          }
          return null;
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return api;
}

Finder _lessonCardButton(String label) {
  final card = find
      .ancestor(
        of: find.text('四季：春夏秋冬'),
        matching: find.byType(Card),
      )
      .first;
  return find.descendant(of: card, matching: find.text(label));
}

void main() {
  setUpAll(() {
    // audioplayers 平台通道：预览页 initState 会注册播放完成监听
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

  group('作业管理页草稿卡片操作', () {
    testWidgets('structured_lesson 草稿有预览/编辑，课程包草稿有查看/编辑',
        (tester) async {
      await _pumpPage(tester);

      expect(find.text('四季：春夏秋冬'), findsOneWidget);
      expect(_lessonCardButton('预览'), findsOneWidget);
      expect(_lessonCardButton('编辑'), findsOneWidget);
      expect(find.text('查看'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('编辑进入课程生成器并加载该草稿', (tester) async {
      final api = await _pumpPage(tester);

      await tester.tap(_lessonCardButton('编辑'));
      await tester.pumpAndSettle();

      expect(find.byType(LessonGeneratorScreen), findsOneWidget);
      expect(api.contentDetailCalls, contains(47));
      expect(tester.takeException(), isNull);
    });

    testWidgets('预览以学生视角打开播放器（previewMode 不写进度）',
        (tester) async {
      final api = await _pumpPage(tester);

      await tester.tap(_lessonCardButton('预览'));
      await tester.pumpAndSettle();

      expect(find.byType(StructuredLessonScreen), findsOneWidget);
      expect(find.text('四季：春夏秋冬 [预览]'), findsOneWidget);
      expect(api.contentDetailCalls, contains(47));
      expect(tester.takeException(), isNull);
    });
  });
}