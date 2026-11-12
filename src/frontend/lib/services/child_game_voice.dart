import 'package:flutter/foundation.dart';

import 'tts_service.dart';

/// 可注入的播报实现，便于 widget 测试替换后端 TTS。
typedef ChildSpeakHandler = Future<void> Function(String text);

/// 幼儿游戏专用语音控制器。
///
/// 在 [TtsService]（后端 Edge TTS，不依赖系统朗读引擎）之上补齐游戏场景需要的三件事：
/// - 播报状态 [speaking] 可监听，供「听完再点」的点击锁定与喇叭脉冲动画使用；
/// - 每次播报带 generation，新的播报会取消旧的等待，dispose 时不会残留回调；
/// - 任何失败（无网络、音频加载失败、平台通道缺失）都立即降级为「文本常显 + 解锁」，
///   绝不把孩子卡在等待态里。
///
/// 语音不是答题的前置条件：所有指令文本始终在界面上可见。
class ChildGameVoice extends ChangeNotifier {
  ChildGameVoice({ChildSpeakHandler? speakHandler, bool enabled = true})
      : _speakHandler = speakHandler,
        _enabled = enabled {
    if (_speakHandler == null) {
      // init 只注册 onPlayerComplete 监听，重复调用会替换订阅，是安全的。
      // 游戏页可能先于 AI 陪聊页打开，所以这里主动注册一次。
      TtsService().init();
    }
  }

  final ChildSpeakHandler? _speakHandler;
  bool _enabled;
  bool _speaking = false;
  int _generation = 0;

  bool get enabled => _enabled;
  bool get speaking => _speaking;

  void _setSpeaking(bool value) {
    if (_speaking == value) return;
    _speaking = value;
    notifyListeners();
  }

  /// 播报一段文本。返回的 Future 在朗读结束、被后续播报打断或失败降级后完成。
  Future<void> speak(String text) async {
    final clean = text.trim();
    final generation = ++_generation;
    if (!_enabled || clean.isEmpty) {
      _setSpeaking(false);
      return;
    }

    _setSpeaking(true);
    try {
      if (_speakHandler != null) {
        await _speakHandler!(clean);
      } else {
        final tts = TtsService();
        await tts.speak(clean);
        // speak() 只等待播放启动；onComplete 才代表读完。
        // 12s 超时兜底：后端慢或播放卡住时放行，文本本来就在界面上。
        await tts.onComplete.timeout(
          const Duration(seconds: 12),
          onTimeout: () {},
        );
      }
    } catch (_) {
      // 静默降级：文本常显、立即解锁，不打断游戏。
    } finally {
      if (generation == _generation) _setSpeaking(false);
    }
  }

  /// 静音开关。关闭时立即停止当前播报。
  void toggle() {
    _enabled = !_enabled;
    if (!_enabled) {
      stop();
    } else {
      notifyListeners();
    }
  }

  /// 停止播报并让所有在飞的等待失效。
  void stop() {
    _generation++;
    if (_speakHandler == null) {
      TtsService().stop();
    }
    _setSpeaking(false);
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
