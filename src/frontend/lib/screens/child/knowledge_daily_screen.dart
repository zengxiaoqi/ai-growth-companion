import 'package:flutter/material.dart';

import '../../components/child_fun_page.dart';
import '../../components/country_card.dart';
import '../../components/fact_card.dart';
import '../../components/joke_card.dart';
import '../../components/number_fact_card.dart';
import '../../components/weather_card.dart';
import '../../theme/child_theme.dart';

/// 「每日知识」聚合页。
///
/// 首页重排后不再把天气 / 每日一国 / 今日数字 / 冷知识 / 笑话这五张
/// 数据卡铺在首屏（它们失败时的空状态会让首页显得很素），改为从
/// 「更多好玩 → 每日知识」进入。组件本身零改动，功能不丢。
class KnowledgeDailyScreen extends StatelessWidget {
  const KnowledgeDailyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);

    return ChildFunPage(
      title: '每日知识',
      subtitle: '每天涨一点点小知识',
      icon: Icons.wb_sunny_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const WeatherCard(),
          const SizedBox(height: 16),
          const CountryCard(),
          const SizedBox(height: 16),
          const NumberFactCard(),
          const SizedBox(height: 16),
          const FactCard(),
          const SizedBox(height: 16),
          const JokeCard(),
          const SizedBox(height: 12),
          Center(
            child: Text(
              '知识由小犀每天更新',
              style: TextStyle(fontSize: 11.5, color: palette.ink2),
            ),
          ),
        ],
      ),
    );
  }
}
