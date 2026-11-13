import 'package:flutter/services.dart';
import 'package:stroke_order_animator/stroke_order_animator.dart';

/// 离线汉字笔顺数据：rootBundle 加载 hanzi-writer-data JSON 并缓存。
class HanziDataService {
  HanziDataService._();

  static final Map<String, StrokeOrder?> _cache = {};
  static final Map<String, Future<StrokeOrder?>> _pending = {};

  static Future<StrokeOrder?> load(String char) {
    if (_cache.containsKey(char)) return Future.value(_cache[char]);
    return _pending.putIfAbsent(char, () async {
      StrokeOrder? order;
      try {
        final json = await rootBundle.loadString('assets/hanzi/$char.json');
        order = StrokeOrder(json);
      } catch (_) {
        order = null;
      }
      _cache[char] = order;
      _pending.remove(char);
      return order;
    });
  }
}