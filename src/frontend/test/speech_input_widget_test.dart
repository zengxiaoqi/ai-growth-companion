import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/components/speech_input_widget.dart';
import 'package:lingxi_companion/theme/app_theme.dart';

/// 包裹 widget 的最小 Material 上下文。
Widget _wrap(Widget child) {
  return MaterialApp(
    home: Scaffold(body: Center(child: child)),
  );
}

/// pump 多帧而不等待动画停止（_waveController.repeat(reverse:true) 永不停止）。
Future<void> pumpSettle(WidgetTester tester) async {
  for (int i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  group('SpeechInputWidget', () {
    // ── 基础渲染 ──────────────────────────────────────────────────────

    testWidgets('renders idle state with mic icon by default',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_off_rounded), findsNothing);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
    });

    testWidgets('accepts custom size and localeId parameters',
        (WidgetTester tester) async {
      bool resultCalled = false;

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(
          onResult: (_) => resultCalled = true,
          localeId: 'en_US',
          size: 64,
          onListeningChange: (_) {},
        ),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(resultCalled, isFalse);
    });

    testWidgets('onResult callback is properly stored',
        (WidgetTester tester) async {
      String? capturedResult;

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (text) => capturedResult = text),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(capturedResult, isNull);
    });

    testWidgets('onListeningChange callback is properly stored',
        (WidgetTester tester) async {
      bool? capturedListening;

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(
          onResult: (_) {},
          onListeningChange: (isListening) => capturedListening = isListening,
        ),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(capturedListening, isNull);
    });

    // ── 权限被拒状态 ──────────────────────────────────────────────────

    testWidgets('shows permission denied UI when permission is permanently denied',
        (WidgetTester tester) async {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter.baseflow.com/permissions/methods'),
        (MethodCall methodCall) async {
          if (methodCall.method == 'checkPermissionStatus') {
            return 4; // permanentlyDenied
          }
          return null;
        },
      );

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);

      await tester.longPress(find.byIcon(Icons.mic_rounded));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_off_rounded), findsOneWidget);
    });

    testWidgets('permission denied dialog shows correct messaging',
        (WidgetTester tester) async {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter.baseflow.com/permissions/methods'),
        (MethodCall methodCall) async {
          if (methodCall.method == 'checkPermissionStatus') {
            return 4;
          }
          return null;
        },
      );

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      await tester.longPress(find.byIcon(Icons.mic_rounded));
      await pumpSettle(tester);

      await tester.tap(find.byIcon(Icons.mic_off_rounded));
      await pumpSettle(tester);

      expect(find.textContaining('麦克风权限'), findsOneWidget);
      expect(find.text('去设置'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
    });

    // ── 错误状态（mock speech_to_text 初始化失败）────────────────────

    /// 注册 mock：权限通过但 speech_to_text 返回不可用 + isAvailable 检查也返回 false。
    void mockPermissionGrantedButSpeechUnavailable(WidgetTester tester) {
      // permission_handler: granted
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter.baseflow.com/permissions/methods'),
        (MethodCall methodCall) async {
          if (methodCall.method == 'checkPermissionStatus') {
            return 1; // granted
          }
          if (methodCall.method == 'requestPermission') {
            return 1; // granted
          }
          return null;
        },
      );
      // speech_to_text 的真实 channel 名
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugin.csdcorp.com/speech_to_text'),
        (MethodCall methodCall) async {
          // has_permission / initialize 都返回 false → 不可用
          if (methodCall.method == 'has_permission' ||
              methodCall.method == 'initialize') {
            return false;
          }
          return null;
        },
      );
    }

    testWidgets('shows error icon when speech initialization fails',
        (WidgetTester tester) async {
      mockPermissionGrantedButSpeechUnavailable(tester);

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);

      await tester.longPress(find.byIcon(Icons.mic_rounded));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
    });

    testWidgets('error state resets to idle on tap',
        (WidgetTester tester) async {
      mockPermissionGrantedButSpeechUnavailable(tester);

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      await tester.longPress(find.byIcon(Icons.mic_rounded));
      await pumpSettle(tester);
      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);

      await tester.tap(find.byIcon(Icons.error_outline_rounded));
      await pumpSettle(tester);

      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
    });

    // ── 主题颜色验证 ──────────────────────────────────────────────────

    testWidgets('idle button uses secondaryColor styling',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      final icon = tester.widget<Icon>(find.byIcon(Icons.mic_rounded));
      expect(icon.color, AppTheme.secondaryColor);
    });

    testWidgets('permission denied icon uses textSecondary color',
        (WidgetTester tester) async {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter.baseflow.com/permissions/methods'),
        (MethodCall methodCall) async {
          if (methodCall.method == 'checkPermissionStatus') {
            return 4;
          }
          return null;
        },
      );

      await tester.pumpWidget(_wrap(
        SpeechInputWidget(onResult: (_) {}),
      ));
      await pumpSettle(tester);

      await tester.longPress(find.byIcon(Icons.mic_rounded));
      await pumpSettle(tester);

      final icon = tester.widget<Icon>(find.byIcon(Icons.mic_off_rounded));
      expect(icon.color, AppTheme.textSecondary);
    });
  });
}