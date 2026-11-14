import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/app.dart';
import 'package:lingxi_companion/providers/chat_session_provider.dart';
import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/providers/learning_provider.dart';
import 'package:lingxi_companion/providers/reward_provider.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/providers/video_download_provider.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 双端切换回归。
///
/// 历史 bug：`showSwitchToParentDialog` 在 `await showDialog(...)` 之后立刻
/// `pinController.dispose()`。showDialog 的 future 在 pop 瞬间就完成，而对话框
/// 还要播完退场动画才从树上摘掉；这期间它仍会重建（切端时 MaterialApp 主题从
/// 孩子皮肤换成 parentTheme，整棵树都要重建），TextField 碰到已释放的 controller
/// 直接抛 "A TextEditingController was used after being disposed."，接着 Overlay
/// 反激活又炸出 `framework.dart: Failed assertion: '_dependents.isEmpty'` ——
/// 用户看到的就是那块「渲染错误」红屏。
///
/// 这里守住两条线：切换流程整体不抛异常；对话框在退场动画期间能安全重建。

class _EmptyApi extends ApiService {
  @override
  Future<List<dynamic>> getChildren() async => <dynamic>[];

  @override
  Future<List<dynamic>> getChildrenByParent(int parentId) async =>
      <dynamic>[];

  @override
  Future<List<dynamic>> getContents({
    String? ageRange,
    String? domain,
    int? childId,
    int page = 1,
    int limit = 20,
  }) async =>
      <dynamic>[];

  @override
  Future<Map<String, dynamic>?> getTodayStatsDetail(int userId) async => null;

  @override
  Future<List<dynamic>> getLearningHistory(int userId,
          {int limit = 10}) async =>
      <dynamic>[];

  @override
  Future<dynamic> get(String path, {Map<String, String>? queryParams}) async =>
      <String, dynamic>{'data': <dynamic>[]};
}

/// 可切换角色的 UserProvider：避开真实网络与后端。
class _SwitchableUserProvider extends UserProvider {
  // ignore: use_super_parameters
  _SwitchableUserProvider(StorageService storage) : super(storage);

  String role = 'child';

  @override
  String? get activeRole => role;

  @override
  String get activeUserType => role;

  @override
  bool get isLoggedIn => true;

  @override
  bool get isLoading => false;

  @override
  int? get activeChildId => 2;

  @override
  Map<String, dynamic>? get currentUser => role == 'parent'
      ? <String, dynamic>{
          'id': 1,
          'name': '测试家长',
          'type': 'parent',
          'phone': '13800000001',
        }
      : <String, dynamic>{
          'id': 2,
          'name': '测试孩子',
          'type': 'child',
          'parentId': 1,
          'age': 4,
        };

  /// 与后端 switch-to-parent 行为一致：校验密码 → 切角色 → 通知。
  @override
  Future<String> switchToParentMode(String password) async {
    if (password != 'password123') return '家长密码不正确';
    role = 'parent';
    notifyListeners();
    return '';
  }

  @override
  Future<String> switchToChildMode({int? childId}) async {
    role = 'child';
    notifyListeners();
    return '';
  }
}

Future<Widget> _app() async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);
  final api = _EmptyApi();

  return MultiProvider(
    providers: [
      Provider<StorageService>.value(value: storage),
      Provider<ApiService>.value(value: api),
      ChangeNotifierProvider<UserProvider>(
        create: (_) => _SwitchableUserProvider(storage),
      ),
      ChangeNotifierProvider(create: (_) => LearningProvider(storage)),
      ChangeNotifierProvider(create: (_) => ContentProvider(api)),
      ChangeNotifierProvider(create: (_) => ChatSessionProvider(api)),
      ChangeNotifierProvider(create: (_) => RewardProvider(api)),
      ChangeNotifierProvider(create: (_) => VideoDownloadProvider(api)),
      ChangeNotifierProvider<ChildThemeController>(
        create: (_) => ChildThemeController(storage),
      ),
    ],
    child: const LingxiApp(),
  );
}

/// 进入「我的」tab 并打开切换家长端对话框。
Future<void> _openSwitchDialog(WidgetTester tester) async {
  await tester.tap(find.text('我的').last);
  await tester.pumpAndSettle();
  await tester.tap(find.byTooltip('切换到家长端'));
  await tester.pumpAndSettle();
  expect(find.byType(TextField), findsOneWidget);
}

void main() {
  testWidgets('输入正确 PIN 切换到家长端，全程不抛异常', (tester) async {
    await tester.pumpWidget(await _app());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(tester.takeException(), isNull);

    await _openSwitchDialog(tester);

    await tester.enterText(find.byType(TextField), 'password123');
    await tester.tap(find.text('确认切换'));
    // 切端 + 对话框退场动画 + AnimatedSwitcher 交叉淡出
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 600));

    expect(tester.takeException(), isNull);
    // 已进入家长端：家长首页的「常用工具」分组可见
    expect(find.text('常用工具'), findsOneWidget);
    expect(find.textContaining('渲染错误'), findsNothing);
  });

  testWidgets('PIN 错误时留在对话框并提示', (tester) async {
    await tester.pumpWidget(await _app());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    await _openSwitchDialog(tester);
    await tester.enterText(find.byType(TextField), 'wrong');
    await tester.tap(find.text('确认切换'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(tester.takeException(), isNull);
    expect(find.text('家长密码不正确'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('打开后取消，再走一次切换也不炸', (tester) async {
    await tester.pumpWidget(await _app());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    await _openSwitchDialog(tester);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await _openSwitchDialog(tester);
    await tester.enterText(find.byType(TextField), 'password123');
    await tester.tap(find.text('确认切换'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 600));

    expect(tester.takeException(), isNull);
    expect(find.text('常用工具'), findsOneWidget);
  });
}
