/// 角色扮演环节的年龄适配语音参数（纯函数，无 Flutter 依赖，便于单测）。
library;

/// 后端 Edge TTS 默认语速 +12%，对学龄前儿童偏快。
/// 3-4 岁明显放慢，5-6 岁接近自然语速，未知年龄按 5-6 岁处理。
String roleplayTtsRate(String ageGroup) {
  final normalized = ageGroup.replaceAll(RegExp(r'[^0-9-]'), '');
  if (normalized.contains('3') || normalized.contains('4')) return '-10%';
  return '+0%';
}

/// 是否为低龄段（3-4 岁）；提示语更短、更口语化。
bool isYoungLearner(String ageGroup) {
  return roleplayTtsRate(ageGroup) == '-10%';
}

/// 角色台词播报时的状态提示。
String roleplayListenHint(String ageGroup) {
  return isYoungLearner(ageGroup)
      ? '小伙伴说话啦，仔细听哦！'
      : '小伙伴在说话，认真听…';
}

/// 选项播报时的状态提示。
String roleplayOptionHint(String ageGroup) {
  return isYoungLearner(ageGroup)
      ? '听一听选项，点一点答案'
      : '听一听选项，再选出你的回答';
}

/// 单次 TTS 的最长等待时间。
///
/// 底层 completion 事件在真机上可能丢失，必须有上限，否则界面会永久停在
/// 「正在说话」。慢速语按字数给更宽松的时间，但不超过 25 秒。
Duration roleplayTtsTimeout(String text, {required String rate}) {
  final perChar = rate.startsWith('-') ? 0.45 : 0.35;
  final seconds = (4 + text.length * perChar).round();
  if (seconds < 8) return const Duration(seconds: 8);
  if (seconds > 25) return const Duration(seconds: 25);
  return Duration(seconds: seconds);
}
