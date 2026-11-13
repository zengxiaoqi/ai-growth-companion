import 'package:flutter/material.dart';
import 'package:stroke_order_animator/stroke_order_animator.dart';

import '../../../theme/app_theme.dart';
import '../../../services/tts_service.dart';
import '../../games/game_renderer.dart';
import 'hanzi_data_service.dart';

/// 汉字学习卡：横滑字卡（大字+拼音+释义+词语+字形故事），
/// 每张卡提供朗读、笔顺动画、描红三个入口。
class HanziCard extends StatelessWidget {
  final List<Map<String, dynamic>> characters;

  const HanziCard({super.key, required this.characters});

  @override
  Widget build(BuildContext context) {
    final valid = characters
        .where((c) => (c['char']?.toString().trim().isNotEmpty ?? false))
        .toList();
    if (valid.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 368,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 2),
        itemCount: valid.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) => _HanziTile(data: valid[index]),
      ),
    );
  }
}

class _HanziTile extends StatelessWidget {
  final Map<String, dynamic> data;

  const _HanziTile({required this.data});

  String get _char => data['char']?.toString() ?? '';
  String get _pinyin => data['pinyin']?.toString() ?? '';
  String get _meaning => data['meaning']?.toString() ?? '';
  String get _story => data['story']?.toString() ?? '';
  List<String> get _words => (data['words'] is List)
      ? (data['words'] as List).map((e) => e.toString()).toList()
      : const [];

  Future<void> _speak() async {
    final parts = <String>[_char];
    if (_meaning.isNotEmpty) parts.add(_meaning);
    if (_words.isNotEmpty) parts.add('组词：${_words.join('，')}');
    if (_story.isNotEmpty) parts.add(_story);
    await TtsService().speak(parts.join('。'));
  }

  void _openStrokeOrder(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: _StrokeOrderDialog(char: _char),
      ),
    );
  }

  void _openTracing(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(
            title: Text('描红「$_char」'),
            leading: IconButton(
              icon: const Icon(Icons.close_rounded),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          body: GameRenderer(
            activityType: 'trace_path',
            initialData: {
              'title': '描红「$_char」',
              'targets': [
                {'id': 'g1', 'kind': 'glyph', 'text': _char, 'label': _char},
              ],
              'prompt': '用手指描一描「$_char」',
            },
            onExit: () => Navigator.of(context).pop(),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    return Container(
      width: 272,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: palette.isCartoon
            ? Border.all(color: palette.line, width: 2)
            : null,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _char,
                style: TextStyle(
                  fontSize: 56,
                  height: 1.05,
                  fontWeight: FontWeight.w800,
                  color: palette.ink,
                ),
              ),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_pinyin.isNotEmpty)
                      Text(
                        _pinyin,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: palette.pop,
                        ),
                      ),
                    if (_meaning.isNotEmpty)
                      Text(
                        _meaning,
                        style: TextStyle(fontSize: 12, color: palette.ink2),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (_words.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final word in _words)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: palette.pop.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      word,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: palette.pop,
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if (_story.isNotEmpty) ...[
            const SizedBox(height: 8),
            Expanded(
              child: SingleChildScrollView(
                child: Text(
                  _story,
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.6,
                    color: palette.ink2,
                  ),
                ),
              ),
            ),
          ] else
            const Spacer(),
          const SizedBox(height: 8),
          Row(
            children: [
              _ActionButton(
                icon: Icons.volume_up_rounded,
                label: '朗读',
                onTap: _speak,
              ),
              const SizedBox(width: 8),
              _ActionButton(
                icon: Icons.animation_rounded,
                label: '笔顺',
                onTap: () => _openStrokeOrder(context),
              ),
              const SizedBox(width: 8),
              _ActionButton(
                icon: Icons.draw_rounded,
                label: '描红',
                onTap: () => _openTracing(context),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: palette.pop.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: palette.pop),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: palette.pop,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 笔顺动画弹层：逐笔动画 + 跟写测验，数据来自离线 hanzi-writer-data。
class _StrokeOrderDialog extends StatefulWidget {
  final String char;

  const _StrokeOrderDialog({required this.char});

  @override
  State<_StrokeOrderDialog> createState() => _StrokeOrderDialogState();
}

class _StrokeOrderDialogState extends State<_StrokeOrderDialog>
    with TickerProviderStateMixin {
  StrokeOrderAnimationController? _controller;
  String? _error;
  bool _quizzing = false;
  String _quizResult = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final order = await HanziDataService.load(widget.char);
    if (!mounted) return;
    if (order == null) {
      setState(() => _error = '暂无「${widget.char}」的笔顺数据');
      return;
    }
    final controller = StrokeOrderAnimationController(
      order,
      this,
      strokeAnimationSpeed: 1,
      showOutline: true,
      strokeColor: AppTheme.primaryColor,
      outlineColor: AppTheme.textSecondary,
      onQuizCompleteCallback: (summary) {
        if (!mounted) return;
        setState(() {
          _quizzing = false;
          _quizResult = summary.nTotalMistakes == 0
              ? '🎉 全对！「${widget.char}」写得太棒了！'
              : '写完了！有 ${summary.nTotalMistakes} 笔需要再练练。';
        });
      },
    );
    controller.addListener(_onControllerChanged);
    setState(() => _controller = controller);
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerChanged);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppTheme.active;
    final controller = _controller;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(
                '「${widget.char}」的笔顺',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: palette.ink,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_error!, style: TextStyle(color: palette.ink2)),
            )
          else if (controller == null)
            const Padding(
              padding: EdgeInsets.all(40),
              child: CircularProgressIndicator(),
            )
          else ...[
            Container(
              decoration: BoxDecoration(
                color: palette.soft,
                borderRadius: BorderRadius.circular(16),
              ),
              padding: const EdgeInsets.all(8),
              child: StrokeOrderAnimator(
                controller,
                size: const Size(260, 260),
              ),
            ),
            const SizedBox(height: 10),
            if (_quizResult.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _quizResult,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: palette.pop,
                  ),
                ),
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                FilledButton.tonalIcon(
                  onPressed: () {
                    setState(() => _quizResult = '');
                    controller.startAnimation();
                  },
                  icon: const Icon(Icons.play_arrow_rounded, size: 18),
                  label: const Text('看笔顺'),
                ),
                FilledButton.tonalIcon(
                  onPressed: () {
                    setState(() {
                      _quizResult = '';
                      _quizzing = !_quizzing;
                    });
                    if (_quizzing) {
                      controller.startQuiz();
                    } else {
                      controller.stopQuiz();
                    }
                  },
                  icon: Icon(
                    _quizzing ? Icons.stop_rounded : Icons.draw_rounded,
                    size: 18,
                  ),
                  label: Text(_quizzing ? '停止跟写' : '跟我写'),
                ),
                FilledButton.tonalIcon(
                  onPressed: () {
                    controller.stopAnimation();
                    controller.reset();
                  },
                  icon: const Icon(Icons.replay_rounded, size: 18),
                  label: const Text('重置'),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '「跟我写」时用手指在田字格里按笔顺描写',
              style: TextStyle(fontSize: 11, color: palette.ink2),
            ),
          ],
        ],
      ),
    );
  }
}