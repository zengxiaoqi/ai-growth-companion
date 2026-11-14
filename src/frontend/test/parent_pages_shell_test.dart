import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lingxi_companion/components/child_fun_page.dart';
import 'package:lingxi_companion/providers/user_provider.dart';
import 'package:lingxi_companion/screens/parent/ability_radar_screen.dart';
import 'package:lingxi_companion/screens/parent/ability_trend_screen.dart';
import 'package:lingxi_companion/screens/parent/ai_insights_panel.dart';
import 'package:lingxi_companion/screens/parent/book_skill_upload_screen.dart';
import 'package:lingxi_companion/screens/parent/child_manager_screen.dart';
import 'package:lingxi_companion/services/api_service.dart';
import 'package:lingxi_companion/services/storage_service.dart';
import 'package:lingxi_companion/theme/app_theme.dart';
import 'package:lingxi_companion/theme/child_theme.dart';

/// 家长端二级页统一外壳（ChildFunPage）后的冒烟测试。
///
/// 这些页面原来是各自 `Scaffold + TopBar/AppBar + Column(Expanded)`，
/// 换成 ChildFunPage 之后 body 落在 `Expanded(Padding(...))` 里且
/// `scrollable: false`（body 自带 ListView / RefreshIndicator）。
/// 一旦漏传 scrollable，ListView 会被塞进 SingleChildScrollView 里
/// 拿到无界高度并直接崩溃 —— 这里用空数据把每个页面渲染一遍守住这条线。

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
        'name': '测试家长',
        'type': 'parent',
        'phone': '13800000001',
      };
}

/// 所有接口返回空数据：只验证外壳与布局，不碰网络。
class _EmptyApi extends ApiService {
  @override
  Future<List<dynamic>> getChildren() async => <dynamic>[];

  @override
  Future<List<dynamic>> getChildrenByParent(int parentId) async =>
      <dynamic>[];

  @override
  Future<dynamic> get(String path, {Map<String, String>? queryParams}) async =>
      <String, dynamic>{'data': <dynamic>[]};
}

ThemeData _parentTheme() => AppTheme.lightTheme.copyWith(
      extensions: <ThemeExtension<dynamic>>[ChildThemePalette.honey],
    );

Future<void> _pumpPage(WidgetTester tester, Widget page) async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<UserProvider>.value(
          value: _ParentUserProvider(storage),
        ),
        Provider<ApiService>.value(value: _EmptyApi()),
        Provider<StorageService>.value(value: storage),
        ChangeNotifierProvider<ChildThemeController>.value(
          value: ChildThemeController(storage),
        ),
      ],
      child: MaterialApp(theme: _parentTheme(), home: page),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('家长端二级页统一外壳', () {
    testWidgets('能力雷达：外壳标题 + 空态不崩溃', (tester) async {
      await _pumpPage(tester, const AbilityRadarScreen());

      expect(find.byType(ChildFunPage), findsOneWidget);
      expect(find.text('能力雷达'), findsOneWidget);
      expect(find.text('当前 vs 上月'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('能力趋势：外壳标题 + 空态不崩溃', (tester) async {
      await _pumpPage(tester, const AbilityTrendScreen());

      expect(find.byType(ChildFunPage), findsOneWidget);
      expect(find.text('能力趋势'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('AI 洞察：自带 Scaffold 与返回键（原本没有）', (tester) async {
      await _pumpPage(tester, const AIInsightsPanel());

      expect(find.byType(ChildFunPage), findsOneWidget);
      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
      expect(find.text('AI 洞察'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('孩子管理：两个头部动作按钮都在', (tester) async {
      await _pumpPage(tester, const ChildManagerScreen());

      expect(find.byType(ChildFunPage), findsOneWidget);
      expect(find.text('孩子管理'), findsOneWidget);
      expect(find.byIcon(Icons.link_rounded), findsOneWidget);
      expect(find.byIcon(Icons.add_rounded), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('知识书：上传入口在头部而不是 AppBar', (tester) async {
      await _pumpPage(tester, const BookSkillUploadScreen());

      expect(find.byType(ChildFunPage), findsOneWidget);
      expect(find.text('知识书'), findsOneWidget);
      expect(find.byType(AppBar), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
