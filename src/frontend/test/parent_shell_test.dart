import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/components/bottom_nav.dart';
import 'package:lingxi_companion/providers/content_provider.dart';
import 'package:lingxi_companion/providers/learning_provider.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/screens/parent/parent_home_screen.dart';
import 'package:lingxi_companion/screens/profile/profile_screen.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 家长端对齐孩子端 v2 后的回归测试：
///   1. 底部导航从 5 项收敛到 4 项，「报告」改为「我的」里的独立子页面；
///   2. 「我的」页家长分支只显示家长身份与报告分组，不显示孩子徽章/换肤；
///   3. 孩子端「我的」表现不变（外观主题 / 徽章仍在）；
///   4. 首页不再出现写死的假统计数据，窄屏不溢出。

/// 与 app.dart 的 parentTheme 同构：lightTheme + honey 色板 extension。
ThemeData _parentTheme() => AppTheme.lightTheme.copyWith(
      extensions: <ThemeExtension<dynamic>>[ChildThemePalette.honey],
    );

/// 构造一个已登录的家长，避免依赖真实会话/网络。
class _ParentUserProvider extends UserProvider {
  // ignore: use_super_parameters
  _ParentUserProvider(StorageService storage) : super(storage);

  @override
  String? get activeRole => 'parent';

  // activeUserType 读的是私有 _activeRole，不受上面的 getter 覆盖影响，
  // 必须一并覆盖，否则「我的」页会按孩子端渲染。
  @override
  String get activeUserType => 'parent';

  @override
  Map<String, dynamic>? get currentUser => <String, dynamic>{
        'id': 1,
        'name': '测试家长',
        'type': 'parent',
        'phone': '13800000001',
      };
}

/// 首页数据全走接口：测试里用空数据，验证「不造假数字」。
class _EmptyApi extends ApiService {
  @override
  Future<List<dynamic>> getChildrenByParent(int parentId) async =>
      <dynamic>[];

  @override
  Future<Map<String, dynamic>?> getTodayStatsDetail(int userId) async => null;

  @override
  Future<List<dynamic>> getLearningHistory(int userId,
          {int limit = 10}) async =>
      <dynamic>[];
}

Widget _withProviders({
  required Widget child,
  required UserProvider user,
  required ApiService api,
  required StorageService storage,
  void Function(String? route)? onRoute,
}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<UserProvider>.value(value: user),
      ChangeNotifierProvider<LearningProvider>.value(
          value: LearningProvider(storage)),
      ChangeNotifierProvider<ContentProvider>.value(
          value: ContentProvider(api)),
      ChangeNotifierProvider<ChildThemeController>.value(
          value: ChildThemeController(storage)),
      Provider<StorageService>.value(value: storage),
      Provider<ApiService>.value(value: api),
    ],
    child: MaterialApp(
      theme: _parentTheme(),
      onGenerateRoute: onRoute == null
          ? null
          : (settings) {
              onRoute(settings.name);
              return MaterialPageRoute<void>(
                builder: (_) => const Scaffold(body: Text('子页面')),
              );
            },
      home: Scaffold(body: child),
    ),
  );
}

Future<StorageService> _storage() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return StorageService(prefs);
}

void main() {
  testWidgets('家长端底部导航收敛为 4 项，报告不再占 tab', (tester) async {
    expect(ParentHomeScreen.navItems.length, 4);
    expect(
      ParentHomeScreen.navItems.map((i) => i.key).toList(),
      <String>['home', 'learning', 'ai', 'profile'],
    );
    expect(ParentHomeScreen.navItems.any((i) => i.key == 'report'), isFalse);

    await tester.pumpWidget(MaterialApp(
      theme: _parentTheme(),
      home: Scaffold(
        body: BottomNav(
          items: ParentHomeScreen.navItems,
          currentIndex: 0,
          onTap: (_) {},
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('首页'), findsOneWidget);
    expect(find.text('我的'), findsOneWidget);
    expect(find.text('报告'), findsNothing);
  });

  group('家长「我的」页', () {
    testWidgets('显示成长与报告分组，进入的是独立子页面路由', (tester) async {
      final storage = await _storage();
      String? pushedRoute;

      await tester.pumpWidget(_withProviders(
        user: _ParentUserProvider(storage),
        api: _EmptyApi(),
        storage: storage,
        onRoute: (route) => pushedRoute = route,
        child: const ProfileScreen(),
      ));
      await tester.pump();

      expect(find.text('成长与报告'), findsOneWidget);
      expect(find.text('成长报告'), findsOneWidget);
      expect(find.text('测试家长'), findsOneWidget);
      // 家长不该看到孩子的徽章与换肤入口
      expect(find.text('我的徽章'), findsNothing);
      expect(find.text('外观主题'), findsNothing);
      // 设置分组仍然完整
      expect(find.text('设置'), findsOneWidget);
      expect(find.byIcon(Icons.settings_rounded), findsNothing);

      await tester.tap(find.text('成长报告'));
      await tester.pumpAndSettle();
      expect(pushedRoute, '/parent/growthReport');
    });

    testWidgets('320dp 窄屏不出现布局溢出', (tester) async {
      tester.view.physicalSize = const Size(320, 780);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final storage = await _storage();
      await tester.pumpWidget(_withProviders(
        user: _ParentUserProvider(storage),
        api: _EmptyApi(),
        storage: storage,
        child: const ProfileScreen(),
      ));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('成长与报告'), findsOneWidget);
    });
  });

  testWidgets('孩子端「我的」保持原样：徽章与换肤都在，无报告分组',
      (tester) async {
    final storage = await _storage();
    await tester.pumpWidget(_withProviders(
      user: UserProvider(storage),
      api: _EmptyApi(),
      storage: storage,
      child: const ProfileScreen(),
    ));
    await tester.pump();

    expect(find.text('我的徽章'), findsOneWidget);
    expect(find.text('外观主题'), findsOneWidget);
    expect(find.text('成长与报告'), findsNothing);
  });

  group('家长首页', () {
    testWidgets('概览数据为空时不编造数字，关键区块齐全', (tester) async {
      final storage = await _storage();
      await tester.pumpWidget(_withProviders(
        user: _ParentUserProvider(storage),
        api: _EmptyApi(),
        storage: storage,
        child: const ParentHomeContent(),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // 旧首页写死的三组假数据（含旧标签）必须消失；
      // 「能力雷达」是真实功能入口，仍在「全部功能」分组里，不应断言消失。
      expect(find.text('25分钟'), findsNothing);
      expect(find.text('3个'), findsNothing);
      expect(find.text('15颗'), findsNothing);
      expect(find.text('完成主题'), findsNothing);
      expect(find.text('获得星星'), findsNothing);

      expect(find.text('常用工具'), findsOneWidget);
      expect(find.text('亲子时光'), findsOneWidget);
      expect(find.text('全部功能'), findsOneWidget);
      expect(find.text('今天还没有学习记录，陪孩子开始第一课吧'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('320dp 窄屏不出现布局溢出', (tester) async {
      tester.view.physicalSize = const Size(320, 780);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final storage = await _storage();
      await tester.pumpWidget(_withProviders(
        user: _ParentUserProvider(storage),
        api: _EmptyApi(),
        storage: storage,
        child: const ParentHomeContent(),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(tester.takeException(), isNull);
      expect(find.text('常用工具'), findsOneWidget);
    });
  });
}
