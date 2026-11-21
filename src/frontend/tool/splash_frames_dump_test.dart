import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lingxi_companion/screens/splash_screen.dart';

Future<void> _loadFont() async {
  final loader = FontLoader('NotoSans');
  final file = File('assets/fonts/NotoSansCJK-Regular.ttc');
  final bytes = await file.readAsBytes();
  loader.addFont(Future.value(ByteData.view(bytes.buffer)));
  await loader.load();
}

Future<void> _dump(WidgetTester tester, GlobalKey key, String name) async {
  final boundary =
      key.currentContext!.findRenderObject() as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1.5);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    File('build/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
  });
}

void main() {
  testWidgets('splash frame dump', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.runAsync(_loadFont);
    await tester.runAsync(() => SplashScreen.precacheLogo());

    final key = GlobalKey();
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(fontFamily: 'NotoSans'),
        home: RepaintBoundary(key: key, child: const SplashScreen()),
      ),
    );

    await _dump(tester, key, 'splash3_0000');
    await tester.pump(const Duration(milliseconds: 300));
    await _dump(tester, key, 'splash3_0300');
    await tester.pump(const Duration(milliseconds: 1600));
    await _dump(tester, key, 'splash3_1900');
  });
}
