import 'dart:math';

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'game_completion_screen.dart';
import 'game_tts_helper.dart';

typedef GameFinishedCallback = void Function(Map<String, dynamic> result);

/// 连线题：左右两列配对，点击建立连线，CustomPainter 绘制曲线。
///
/// 布局约束（历史 bug：右侧长描述会把固定高度的容器撑爆，出现
/// 「BOTTOM OVERFLOWED BY N PIXELS」，且连线锚点按等分行高计算，
/// 卡片高度不一致时线会连到错误的位置）：
/// - 卡片区放在可滚动容器里、卡片高度随文字自适应，任何高度下都不溢出；
/// - 连线锚点由每张卡片的真实位置测量得到，长卡片也能精确对齐；
/// - 宿主给的高度偏小时自动进入紧凑模式（隐藏与页面标题重复的题目标题）；
/// - 每对连线用同一个主题色，左右卡片与曲线同色，孩子一眼看出配对关系。
class ConnectionGame extends StatefulWidget {
  final Map<String, dynamic> data;
  final VoidCallback onExit;
  final GameFinishedCallback? onFinished;

  const ConnectionGame({
    super.key,
    required this.data,
    required this.onExit,
    this.onFinished,
  });

  @override
  State<ConnectionGame> createState() => _ConnectionGameState();
}

class _ConnectionGameState extends State<ConnectionGame>
    with GameTtsHelper, SingleTickerProviderStateMixin {
  List<_ConnectionItem> _leftItems = const [];
  List<_ConnectionItem> _rightItems = const [];
  List<_ConnectionPair> _correctPairs = const [];
  // 用户连线：leftId → rightId
  final Map<String, String> _userConnections = {};
  // 选中的左侧 ID
  String? _selectedLeftId;
  bool _submitted = false;
  bool _finished = false;
  int _correctCount = 0;

  /// 卡片区容器：连线坐标以它为参照系（位于滚动内容内，滚动时不需要重算）。
  final GlobalKey _boardKey = GlobalKey();
  final Map<String, GlobalKey> _cardKeys = <String, GlobalKey>{};
  Map<String, Offset> _leftAnchors = const {};
  Map<String, Offset> _rightAnchors = const {};
  bool _measureScheduled = false;

  late final AnimationController _lineController;

  @override
  void initState() {
    super.initState();
    _lineController = AnimationController(
      duration: const Duration(milliseconds: 240),
      vsync: this,
      value: 1,
    );
    _prepareGame();
  }

  @override
  void dispose() {
    _lineController.dispose();
    disposeTts();
    super.dispose();
  }

  void _speakInstructions() {
    // small delay so UI renders first
    Future.microtask(() => speak('先点左边，再点右边，把它们连起来'));
  }

  void _prepareGame() {
    final leftItems = _parseItems(widget.data['leftItems'], 'l');
    final rightItems = _parseItems(widget.data['rightItems'], 'r');
    final rawConnections = widget.data['connections'];

    final correctPairs = <_ConnectionPair>[];
    if (rawConnections is List) {
      for (final raw in rawConnections) {
        if (raw is! Map) continue;
        final m = raw.map((k, v) => MapEntry(k.toString(), v));
        final left = m['left']?.toString();
        final right = m['right']?.toString();
        if (left != null && right != null) {
          correctPairs.add(_ConnectionPair(leftId: left, rightId: right));
        }
      }
    }

    // 打乱右侧顺序。
    final shuffledRight = [...rightItems]..shuffle(Random());

    setState(() {
      _leftItems = leftItems;
      _rightItems = shuffledRight;
      _correctPairs = correctPairs;
      _userConnections.clear();
      _selectedLeftId = null;
      _submitted = false;
      _finished = false;
      _correctCount = 0;
      _cardKeys.clear();
      _leftAnchors = const {};
      _rightAnchors = const {};
    });
    _speakInstructions();
  }

  List<_ConnectionItem> _parseItems(dynamic raw, String prefix) {
    if (raw is! List) return const [];
    final result = <_ConnectionItem>[];
    final usedIds = <String>{};
    for (var i = 0; i < raw.length; i++) {
      final item = raw[i];
      if (item is! Map) continue;
      final m = item.map((k, v) => MapEntry(k.toString(), v));
      final label = m['label']?.toString().trim() ?? '';
      final emoji = m['emoji']?.toString() ?? '';
      if (label.isEmpty && emoji.isEmpty) continue;
      // 同一侧出现重复 id 会让 GlobalKey 冲突，这里做一次去重兜底。
      var id = m['id']?.toString().trim() ?? '';
      if (id.isEmpty || usedIds.contains(id)) id = '${prefix}_$i';
      usedIds.add(id);
      result.add(_ConnectionItem(id: id, label: label, emoji: emoji));
    }
    return result;
  }

  void _tapLeft(String id) {
    if (_submitted) return;
    final item = _leftItems.firstWhere((i) => i.id == id);
    setState(() {
      _selectedLeftId = _selectedLeftId == id ? null : id;
    });
    Future.microtask(() => speak(item.label));
  }

  void _tapRight(String rightId) {
    if (_submitted) return;
    final leftId = _selectedLeftId;
    if (leftId == null) {
      // 没选左边直接点右边时，给一句口语提示，避免孩子以为点不动。
      Future.microtask(() => speak('先点左边的卡片，再点这里'));
      return;
    }

    final leftItem = _leftItems.firstWhere((i) => i.id == leftId);
    final rightItem = _rightItems.firstWhere((i) => i.id == rightId);

    setState(() {
      // 移除该右侧已有的连线。
      _userConnections.removeWhere((_, v) => v == rightId);
      _userConnections[leftId] = rightId;
      _selectedLeftId = null;
    });
    _lineController.forward(from: 0);
    Future.microtask(() => speak('${leftItem.label}连${rightItem.label}'));
  }

  void _submit() {
    if (_submitted) return;
    var correct = 0;
    for (final pair in _correctPairs) {
      if (_userConnections[pair.leftId] == pair.rightId) correct++;
    }
    final count = correct;
    setState(() {
      _correctCount = count;
      _submitted = true;
    });
    Future.microtask(() => speak('你连对了$count个'));
  }

  void _finish() {
    final result = {
      'score': _correctCount,
      'totalQuestions': _correctPairs.length,
      'correctAnswers': _correctCount,
      'interactionData': {
        'userConnections': _userConnections,
      },
    };
    widget.onFinished?.call(result);
    setState(() => _finished = true);
  }

  bool _isCorrectConnection(String leftId, String rightId) {
    return _correctPairs.any((p) => p.leftId == leftId && p.rightId == rightId);
  }

  // ─── 锚点测量 ─────────────────────────────────────────────────────────

  GlobalKey _cardKey(String id, bool isLeft) {
    return _cardKeys.putIfAbsent('${isLeft ? 'l' : 'r'}:$id', () => GlobalKey());
  }

  Color _pairColorAt(int leftIndex) {
    final colors = AppTheme.childColors;
    if (colors.isEmpty) return AppTheme.secondaryColor;
    // 学科色原始顺序里陶土红与琥珀相邻，两对同时出现时分不清；
    // 这里按「色相跳开」的顺序取色，四对之内颜色一眼可辨。
    const order = [0, 1, 4, 2, 5, 3];
    return colors[order[leftIndex.abs() % order.length] % colors.length];
  }

  void _scheduleAnchorMeasure() {
    if (_measureScheduled) return;
    _measureScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _measureScheduled = false;
      if (!mounted) return;
      _measureAnchors();
    });
  }

  void _measureAnchors() {
    final board = _boardKey.currentContext?.findRenderObject();
    if (board is! RenderBox || !board.hasSize) return;

    Map<String, Offset> collect(List<_ConnectionItem> items, bool isLeft) {
      final result = <String, Offset>{};
      for (final item in items) {
        final box = _cardKey(item.id, isLeft).currentContext?.findRenderObject();
        if (box is! RenderBox || !box.hasSize) continue;
        // 左侧取卡片右中点，右侧取卡片左中点，让线正好接到卡片边缘。
        final dx = isLeft ? box.size.width : 0.0;
        result[item.id] = box.localToGlobal(
          Offset(dx, box.size.height / 2),
          ancestor: board,
        );
      }
      return result;
    }

    final left = collect(_leftItems, true);
    final right = collect(_rightItems, false);
    if (_sameAnchors(left, _leftAnchors) && _sameAnchors(right, _rightAnchors)) {
      return;
    }
    setState(() {
      _leftAnchors = left;
      _rightAnchors = right;
    });
  }

  bool _sameAnchors(Map<String, Offset> a, Map<String, Offset> b) {
    if (a.length != b.length) return false;
    for (final entry in a.entries) {
      final other = b[entry.key];
      if (other == null) return false;
      if ((other - entry.value).distance > 0.5) return false;
    }
    return true;
  }

  // ─── 构建 ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_leftItems.isEmpty || _rightItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.link_off_rounded, size: 48, color: AppTheme.textSecondary),
            const SizedBox(height: 12),
            const Text('暂无连线题数据'),
            const SizedBox(height: 12),
            FilledButton(onPressed: widget.onExit, child: const Text('返回')),
          ],
        ),
      );
    }

    if (_finished) {
      return GameCompletionScreen(
        title: widget.data['title']?.toString() ?? '连线题游戏',
        score: _correctCount,
        total: _correctPairs.length,
        onPlayAgain: _prepareGame,
        onBack: widget.onExit,
      );
    }

    _scheduleAnchorMeasure();

    final title = widget.data['title']?.toString() ?? '连线题游戏';

    return LayoutBuilder(
      builder: (context, constraints) {
        // 高度紧张时（例如嵌在场景卡片里只有 280px）省掉与页面标题重复的行。
        final compact =
            constraints.maxHeight.isFinite && constraints.maxHeight < 330;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!compact) ...[
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textColor,
                ),
              ),
              const SizedBox(height: 8),
            ],
            _buildHintRow(),
            const SizedBox(height: 10),
            Expanded(child: _buildBoard()),
            const SizedBox(height: 10),
            _buildFooter(),
          ],
        );
      },
    );
  }

  /// 操作提示：把「先点左、再点右」拆成两步小胶囊，比一行说明更好懂。
  Widget _buildHintRow() {
    if (_submitted) {
      final total =
          _correctPairs.isNotEmpty ? _correctPairs.length : _leftItems.length;
      final allCorrect = total > 0 && _correctCount == total;
      final color = allCorrect ? AppTheme.successColor : AppTheme.warningColor;
      return Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: color.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  Icon(
                    allCorrect
                        ? Icons.emoji_events_rounded
                        : Icons.trending_up_rounded,
                    size: 17,
                    color: color,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      allCorrect ? '全部连对啦！' : '连对 $_correctCount / $total 组',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          _buildTtsButton(),
        ],
      );
    }

    final waitingRight = _selectedLeftId != null;
    final linked = _userConnections.length;
    final total = _leftItems.length;

    return Row(
      children: [
        _buildStepChip('1', '点左边', active: !waitingRight),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Icon(
            Icons.arrow_forward_rounded,
            size: 13,
            color: AppTheme.textSecondary.withValues(alpha: 0.7),
          ),
        ),
        _buildStepChip('2', '点右边', active: waitingRight),
        const Spacer(),
        Text(
          '$linked/$total',
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: AppTheme.textSecondary,
          ),
        ),
        _buildTtsButton(),
      ],
    );
  }

  Widget _buildStepChip(String step, String label, {required bool active}) {
    final fg = active ? AppTheme.active.onPrimary : AppTheme.textSecondary;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: const EdgeInsets.fromLTRB(6, 5, 10, 5),
      decoration: BoxDecoration(
        color: active
            ? AppTheme.primaryColor
            : AppTheme.active.card.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: active ? AppTheme.primaryColor : AppTheme.active.line,
          width: 1.2,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active
                  ? Colors.white.withValues(alpha: 0.24)
                  : AppTheme.primaryColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Text(
              step,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                height: 1,
                color: active ? fg : AppTheme.primaryColor,
              ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTtsButton() {
    final on = ttsEnabled;
    final color = on ? AppTheme.primaryColor : AppTheme.textSecondary;
    return IconButton(
      onPressed: toggleTts,
      tooltip: on ? '关闭语音' : '开启语音',
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
      icon: Icon(
        on ? Icons.volume_up_rounded : Icons.volume_off_rounded,
        size: 19,
        color: color.withValues(alpha: on ? 1 : 0.5),
      ),
    );
  }

  /// 卡片区：连线画在滚动内容里，滚动时线与卡片一起移动。
  Widget _buildBoard() {
    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 4),
      child: Stack(
        key: _boardKey,
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _lineController,
                builder: (context, _) => CustomPaint(
                  painter: _ConnectionPainter(
                    progress: _lineController.value,
                    connections: Map<String, String>.from(_userConnections),
                    leftAnchors: _leftAnchors,
                    rightAnchors: _rightAnchors,
                    correctPairs: _correctPairs,
                    submitted: _submitted,
                    leftColors: {
                      for (var i = 0; i < _leftItems.length; i++)
                        _leftItems[i].id: _pairColorAt(i),
                    },
                  ),
                ),
              ),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 左边是词、右边是长描述，按 4:6 分宽度能少一到两行换行，
              // 两列高度差也随之变小。
              Expanded(flex: 4, child: _buildColumn(_leftItems, isLeft: true)),
              const SizedBox(width: 36),
              Expanded(flex: 6, child: _buildColumn(_rightItems, isLeft: false)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildColumn(List<_ConnectionItem> items, {required bool isLeft}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == items.length - 1 ? 0 : 10),
            child: isLeft
                ? _buildLeftCard(items[i], i)
                : _buildRightCard(items[i]),
          ),
      ],
    );
  }

  Widget _buildLeftCard(_ConnectionItem item, int index) {
    final rightId = _userConnections[item.id];
    final connected = rightId != null;
    final selected = !_submitted && _selectedLeftId == item.id;
    final pairColor = _pairColorAt(index);

    Color fill;
    Color border;
    final bool? correct = !_submitted
        ? null
        : (rightId != null && _isCorrectConnection(item.id, rightId));

    if (_submitted) {
      fill = rightId == null
          ? AppTheme.active.card
          : (correct == true ? AppTheme.successColor : AppTheme.warningColor)
              .withValues(alpha: 0.10);
      border = rightId == null
          ? _idleBorder
          : (correct == true
              ? AppTheme.successColor
              : AppTheme.warningColor);
    } else if (selected) {
      fill = AppTheme.primaryColor;
      border = AppTheme.primaryColor;
    } else if (connected) {
      fill = Color.alphaBlend(
        pairColor.withValues(alpha: 0.10),
        AppTheme.active.card,
      );
      border = pairColor.withValues(alpha: 0.55);
    } else {
      fill = AppTheme.active.card;
      border = _idleBorder;
    }

    return GestureDetector(
      key: _cardKey(item.id, true),
      onTap: () => _tapLeft(item.id),
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOut,
        scale: selected ? 1.03 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: border, width: selected ? 2.4 : 1.5),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: AppTheme.primaryColor.withValues(alpha: 0.28),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              _buildIndexBadge(
                index + 1,
                selected: selected,
                accent: _submitted
                    ? (correct == true ? AppTheme.successColor : null)
                    : (connected ? pairColor : null),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 16,
                    height: 1.3,
                    fontWeight: FontWeight.w800,
                    color: selected
                        ? AppTheme.active.onPrimary
                        : AppTheme.textColor,
                  ),
                ),
              ),
              if (correct != null) ...[
                const SizedBox(width: 4),
                Icon(
                  correct ? Icons.check_circle_rounded : Icons.cancel_rounded,
                  size: 18,
                  color: correct
                      ? AppTheme.successColor
                      : AppTheme.warningColor,
                ),
              ] else if (item.emoji.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(item.emoji, style: const TextStyle(fontSize: 19)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRightCard(_ConnectionItem item) {
    final leftId = _leftIdConnectedTo(item.id);
    final connected = leftId != null;
    final leftIndex =
        connected ? _leftItems.indexWhere((e) => e.id == leftId) : -1;
    final pairColor =
        leftIndex >= 0 ? _pairColorAt(leftIndex) : AppTheme.textSecondary;
    final waiting = !_submitted && _selectedLeftId != null && !connected;

    Color fill = AppTheme.active.card;
    Color border = _idleBorder;
    final bool? correct = !_submitted
        ? null
        : (leftId != null && _isCorrectConnection(leftId, item.id));

    if (_submitted) {
      if (leftId != null) {
        fill = (correct == true ? AppTheme.successColor : AppTheme.warningColor)
            .withValues(alpha: 0.10);
        border = correct == true ? AppTheme.successColor : AppTheme.warningColor;
      }
    } else if (connected) {
      fill = Color.alphaBlend(
        pairColor.withValues(alpha: 0.09),
        AppTheme.active.card,
      );
      border = pairColor.withValues(alpha: 0.55);
    } else if (waiting) {
      // 左边已选中 → 右列整列抬一下亮度，提示「现在点这里」。
      fill = Color.alphaBlend(
        AppTheme.primaryColor.withValues(alpha: 0.05),
        AppTheme.active.card,
      );
      border = AppTheme.primaryColor.withValues(alpha: 0.5);
    }

    return GestureDetector(
      key: _cardKey(item.id, false),
      onTap: () => _tapRight(item.id),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.fromLTRB(11, 11, 11, 11),
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: border,
            width: (connected || waiting) ? 1.8 : 1.4,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 判分后把「配对圆点」换成对错图标：放在行首，
            // 卡片文字宽度不变，不会因为多一个尾巴图标而重新换行。
            if (correct != null)
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Icon(
                  correct ? Icons.check_circle_rounded : Icons.cancel_rounded,
                  size: 16,
                  color:
                      correct ? AppTheme.successColor : AppTheme.warningColor,
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    // 未连线时不画点，避免满屏小圆点看不出含义。
                    color: connected ? pairColor : Colors.transparent,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                item.label,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 反查某张右侧卡片当前连到的左侧卡片。
  String? _leftIdConnectedTo(String rightId) {
    for (final entry in _userConnections.entries) {
      if (entry.value == rightId) return entry.key;
    }
    return null;
  }

  /// 未连线卡片的描边：比皮肤的 soft line 稍实一点，白卡才不会「飘」在纸面上。
  Color get _idleBorder => Color.alphaBlend(
        AppTheme.primaryColor.withValues(alpha: 0.12),
        AppTheme.active.line,
      );

  Widget _buildIndexBadge(
    int number, {
    required bool selected,
    Color? accent,
  }) {
    Color bg;
    Color fg;
    if (selected) {
      bg = Colors.white.withValues(alpha: 0.22);
      fg = AppTheme.active.onPrimary;
    } else if (accent != null) {
      bg = accent.withValues(alpha: 0.16);
      fg = Color.lerp(accent, AppTheme.textColor, 0.35)!;
    } else {
      bg = AppTheme.textSecondary.withValues(alpha: 0.10);
      fg = AppTheme.textSecondary;
    }
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Text(
        '$number',
        style: TextStyle(
          fontSize: 12,
          height: 1,
          fontWeight: FontWeight.w800,
          color: fg,
        ),
      ),
    );
  }

  Widget _buildFooter() {
    if (_submitted) {
      return SizedBox(
        height: 52,
        child: FilledButton.icon(
          onPressed: _finish,
          icon: const Icon(Icons.emoji_events_rounded, size: 20),
          label: const Text(
            '查看结果',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          style: FilledButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: AppTheme.active.onPrimary,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      );
    }

    final canSubmit = _userConnections.isNotEmpty;
    return SizedBox(
      height: 52,
      child: FilledButton.icon(
        onPressed: canSubmit ? _submit : null,
        icon: Icon(
          canSubmit ? Icons.send_rounded : Icons.touch_app_rounded,
          size: 20,
        ),
        label: Text(
          canSubmit ? '提交连线' : '先连好一条线',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.primaryColor,
          foregroundColor: AppTheme.active.onPrimary,
          disabledBackgroundColor: AppTheme.active.card,
          disabledForegroundColor: AppTheme.textSecondary.withValues(alpha: 0.8),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ).copyWith(
          side: WidgetStateProperty.resolveWith((states) {
            final disabled = states.contains(WidgetState.disabled);
            return BorderSide(
              color: disabled ? AppTheme.active.line : Colors.transparent,
              width: 1.6,
            );
          }),
        ),
      ),
    );
  }
}

/// CustomPainter：在左右两列之间绘制连线。
///
/// 锚点使用实测坐标，而不是「容器高度 / 卡片数量」的等分估算，
/// 这样左右卡片行高不同、文字换行行数不同也能连到卡片正中。
class _ConnectionPainter extends CustomPainter {
  final double progress;
  final Map<String, String> connections;
  final Map<String, Offset> leftAnchors;
  final Map<String, Offset> rightAnchors;
  final List<_ConnectionPair> correctPairs;
  final bool submitted;
  final Map<String, Color> leftColors;

  _ConnectionPainter({
    required this.progress,
    required this.connections,
    required this.leftAnchors,
    required this.rightAnchors,
    required this.correctPairs,
    required this.submitted,
    required this.leftColors,
  });

  Color _colorFor(String leftId, String rightId) {
    final isCorrect = correctPairs
        .any((p) => p.leftId == leftId && p.rightId == rightId);
    if (submitted) {
      return isCorrect ? AppTheme.successColor : AppTheme.warningColor;
    }
    return leftColors[leftId] ?? AppTheme.secondaryColor;
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (connections.isEmpty) return;

    connections.forEach((leftId, rightId) {
      final start = leftAnchors[leftId];
      final end = rightAnchors[rightId];
      if (start == null || end == null) return;

      final color = _colorFor(leftId, rightId);
      final paint = Paint()
        ..color = color
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;

      final target = Offset.lerp(start, end, progress.clamp(0.0, 1.0))!;
      final dx = target.dx - start.dx;
      final path = Path()
        ..moveTo(start.dx, start.dy)
        ..cubicTo(
          start.dx + dx * 0.42,
          start.dy,
          start.dx + dx * 0.58,
          target.dy,
          target.dx,
          target.dy,
        );
      canvas.drawPath(path, paint);

      canvas.drawCircle(start, 3.2, Paint()..color = color);
      if (progress > 0.98) {
        canvas.drawCircle(end, 3.2, Paint()..color = color);
      }
    });
  }

  @override
  bool shouldRepaint(covariant _ConnectionPainter oldDelegate) {
    if (oldDelegate.progress != progress) return true;
    if (oldDelegate.submitted != submitted) return true;
    if (oldDelegate.leftAnchors.length != leftAnchors.length) return true;
    if (oldDelegate.rightAnchors.length != rightAnchors.length) return true;
    for (final entry in leftAnchors.entries) {
      final other = oldDelegate.leftAnchors[entry.key];
      if (other == null || (other - entry.value).distance > 0.5) return true;
    }
    for (final entry in rightAnchors.entries) {
      final other = oldDelegate.rightAnchors[entry.key];
      if (other == null || (other - entry.value).distance > 0.5) return true;
    }
    if (oldDelegate.connections.length != connections.length) return true;
    for (final entry in connections.entries) {
      if (oldDelegate.connections[entry.key] != entry.value) return true;
    }
    return false;
  }
}

class _ConnectionItem {
  final String id;
  final String label;
  final String emoji;

  const _ConnectionItem({
    required this.id,
    required this.label,
    required this.emoji,
  });
}

class _ConnectionPair {
  final String leftId;
  final String rightId;

  const _ConnectionPair({
    required this.leftId,
    required this.rightId,
  });
}
