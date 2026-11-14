// AI 对话升级 — 添加会话管理和上下文摘要
// 原始功能（内联测验、TTS朗读、语音输入）已完整保留

import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import '../utils/web_html_stub.dart' if (dart.library.html) 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../theme/child_density.dart';
import '../theme/child_theme.dart';
import '../services/tts_service.dart';
import '../services/api_service.dart';
import '../providers/user_provider.dart';
import '../providers/chat_session_provider.dart';
import '../utils/chat_mode.dart';
import '../components/speech_input_widget.dart';
import '../components/chat_composer.dart';
import '../components/dictionary_sheet.dart';
import 'games/game_renderer.dart';
import 'voice_call_screen.dart';

// ═══════════════════════════════════════════════════════════════════════════
// 年龄密度档的首轮引导内容
// 与 Web 端 `AIChat.tsx` 的 CHILD_ROUND_PROMPTS / CHILD_SUGGESTIONS 同一份口径。
// ═══════════════════════════════════════════════════════════════════════════

/// 低龄档（3–4 岁）的图形提问：不依赖识字，emoji + 两字标签 + 完整问句。
const List<({String em, String label, String q})> _kChildRoundPrompts = [
  (em: '☁️', label: '下雨', q: '云为什么会下雨呀？'),
  (em: '🐘', label: '大象', q: '大象的鼻子为什么这么长呀？'),
  (em: '🎵', label: '唱歌', q: '唱首小星星给我听'),
  (em: '🔢', label: '考我', q: '考我 3 道数学题'),
];

/// 中高年龄档的文字快捷提问（按 density.quickPrompts 截断）。
const List<({String em, String label, String q})> _kChildPrompts = [
  (em: '📅', label: '安排学习计划', q: '帮我安排今天的学习计划'),
  (em: '🎲', label: '出数学小游戏', q: '出3道数学小游戏'),
  (em: '📖', label: '讲睡前故事', q: '讲一个简短睡前故事'),
  (em: '🌤️', label: '天空为什么蓝', q: '为什么天是蓝色的？'),
];

/// 高龄档（5–6 岁）的长尾建议，只在 level 2 出现。
const List<({String em, String label, String q})> _kChildSuggestions = [
  (em: '😄', label: '再讲个笑话', q: '再讲一个笑话吧'),
  (em: '3️⃣', label: '教我认数字 3', q: '教我认数字 3'),
  (em: '✏️', label: '出个小测验', q: '给我出个小测验'),
];

const List<({String em, String label, String q})> _kParentPrompts = [
  (em: '', label: '看看孩子这周学得怎么样', q: '看看孩子这周学得怎么样'),
  (em: '', label: '根据学情调整下周学习计划', q: '根据学情调整下周学习计划'),
  (em: '', label: '给孩子安排今天的学习任务', q: '给孩子安排今天的学习任务'),
];

// ═══════════════════════════════════════════════════════════════════════════
// 内联答题卡 Widget
// ═══════════════════════════════════════════════════════════════════════════

class _InlineQuizCard extends StatefulWidget {
  final List<Map<String, dynamic>> questions;
  final int messageIndex;
  final void Function(int questionIndex, int selectedOption) onAnswered;

  const _InlineQuizCard({
    required this.questions,
    required this.messageIndex,
    required this.onAnswered,
  });

  @override
  State<_InlineQuizCard> createState() => _InlineQuizCardState();
}

class _InlineQuizCardState extends State<_InlineQuizCard> {
  int _currentIndex = 0;
  int? _selectedOption;
  bool _revealed = false;
  int _correctCount = 0;
  bool _completed = false;

  final TtsService _tts = TtsService();

  List<Map<String, dynamic>> get _questions => widget.questions;

  @override
  void initState() {
    super.initState();
    // 首帧后播报第一道题目
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _speakCurrentQuestion();
    });
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  /// 朗读当前题目：题干 + 各选项
  Future<void> _speakCurrentQuestion() async {
    if (!mounted || _revealed || _completed) return;
    final current = _questions[_currentIndex];
    final questionText = current['question']?.toString() ?? '';
    final options = (current['options'] as List?)?.cast<String>() ?? [];

    final parts = <String>['第${_currentIndex + 1}题。$questionText'];
    for (var i = 0; i < options.length; i++) {
      parts.add('选项${String.fromCharCode(65 + i)}。${options[i]}');
    }
    final text = parts.join('。');
    await _tts.stop();
    await _tts.speak(text);
  }

  /// 朗读答题反馈：答对/答错 + 正确答案
  Future<void> _speakFeedback(
      bool isCorrect, int correctIndex, List<String> options) async {
    final String text;
    if (isCorrect) {
      text = '答对啦！太棒了！';
    } else {
      final correctOption = String.fromCharCode(65 + correctIndex);
      final correctText =
          correctIndex < options.length ? options[correctIndex] : '';
      text = '答错了。正确答案是选项$correctOption。$correctText';
    }
    await _tts.stop();
    await _tts.speak(text);
  }

  void _selectOption(int index) {
    if (_revealed) return;
    final current = _questions[_currentIndex];
    final correctIndex = current['correctIndex'] as int? ?? 0;
    final isCorrect = index == correctIndex;
    final options = (current['options'] as List?)?.cast<String>() ?? [];
    setState(() {
      _selectedOption = index;
      _revealed = true;
      if (isCorrect) _correctCount++;
    });
    widget.onAnswered(_currentIndex, index);
    // 语音播报答题反馈
    _speakFeedback(isCorrect, correctIndex, options);
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (!mounted) return;
      if (_currentIndex >= _questions.length - 1) {
        setState(() => _completed = true);
      } else {
        setState(() {
          _currentIndex++;
          _selectedOption = null;
          _revealed = false;
        });
        // 播报下一道题目（等待反馈朗读完毕后再播报，避免打断）
        _tts.onComplete.then((_) {
          if (mounted && !_revealed && !_completed) {
            _speakCurrentQuestion();
          }
        });
      }
    });
  }

  void _goToNext() {
    if (_currentIndex >= _questions.length - 1) {
      setState(() => _completed = true);
    } else {
      setState(() {
        _currentIndex++;
        _selectedOption = null;
        _revealed = false;
      });
      // 播报下一道题目
      _tts.onComplete.then((_) {
        if (mounted && !_revealed && !_completed) {
          _speakCurrentQuestion();
        }
      });
    }
  }

  void _reset() {
    setState(() {
      _currentIndex = 0;
      _selectedOption = null;
      _revealed = false;
      _completed = false;
      _correctCount = 0;
    });
    // 重新播报第一道题目
    _tts.onComplete.then((_) {
      if (mounted && !_revealed && !_completed) {
        _speakCurrentQuestion();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_completed) return _buildCompletionCard();
    final current = _questions[_currentIndex];
    final questionText = current['question']?.toString() ?? '';
    final options = (current['options'] as List?)?.cast<String>() ?? [];
    final correctIndex = current['correctIndex'] as int? ?? 0;
    final explanation = current['explanation']?.toString();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.softYellow.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppTheme.softOrange.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '第 ${_currentIndex + 1}/${_questions.length} 题',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor),
                ),
              ),
              const Spacer(),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                    width: 60,
                    height: 6,
                    child: LinearProgressIndicator(
                      value: (_currentIndex + 1) / _questions.length,
                      backgroundColor: AppTheme.softPink.withValues(alpha: 0.3),
                      color: AppTheme.primaryColor,
                    )),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(questionText,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textColor,
                  height: 1.4)),
          const SizedBox(height: 12),
          ...List.generate(options.length, (index) {
            final isSelected = _selectedOption == index;
            final isCorrect = index == correctIndex;
            Color bgColor, borderColor;
            Widget? trailingIcon;
            if (_revealed) {
              if (isCorrect) {
                bgColor = AppTheme.accentColor.withValues(alpha: 0.15);
                borderColor = AppTheme.accentColor;
                trailingIcon = Icon(Icons.check_circle_rounded,
                    color: AppTheme.accentColor, size: 22);
              } else if (isSelected) {
                bgColor = AppTheme.active.dangerAccent.withValues(alpha: 0.18);
                borderColor = AppTheme.active.dangerAccent;
                trailingIcon = Icon(Icons.cancel_rounded,
                    color: AppTheme.active.dangerAccent, size: 22);
              } else {
                bgColor = AppTheme.active.card;
                borderColor = AppTheme.active.line;
              }
            } else {
              bgColor = isSelected
                  ? AppTheme.softPink.withValues(alpha: 0.25)
                  : AppTheme.active.card;
              borderColor =
                  isSelected ? AppTheme.primaryColor : AppTheme.active.line;
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GestureDetector(
                onTap: _revealed ? null : () => _selectOption(index),
                child: AnimatedScale(
                  scale: isSelected ? 1.02 : 1.0,
                  duration: const Duration(milliseconds: 150),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOut,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 13),
                    decoration: BoxDecoration(
                        color: bgColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: borderColor, width: 2)),
                    child: Row(children: [
                      CircleAvatar(
                          radius: 14,
                          backgroundColor: borderColor.withValues(alpha: 0.12),
                          child: Text(String.fromCharCode(65 + index),
                              style: TextStyle(
                                  color: borderColor,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14))),
                      const SizedBox(width: 10),
                      Expanded(
                          child: Text(options[index],
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.textColor))),
                      if (trailingIcon != null) trailingIcon,
                    ]),
                  ),
                ),
              ),
            );
          }),
          if (_revealed) ...[
            const SizedBox(height: 6),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (_selectedOption == correctIndex)
                    ? AppTheme.accentColor.withValues(alpha: 0.12)
                    : AppTheme.active.dangerAccent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((_selectedOption == correctIndex) ? '✅' : '❌',
                    style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(
                        (_selectedOption == correctIndex)
                            ? '答对啦！太棒了 🎉'
                            : '正确答案是 ${String.fromCharCode(65 + correctIndex)}',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textColor),
                      ),
                      if (explanation != null && explanation.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(explanation,
                            style: TextStyle(
                                fontSize: 13,
                                color: AppTheme.textSecondary,
                                height: 1.3)),
                      ],
                    ])),
              ]),
            ),
            if (_revealed && _currentIndex < _questions.length - 1) ...[
              const SizedBox(height: 8),
              Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _goToNext,
                    icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                    label: const Text('下一题', style: TextStyle(fontSize: 13)),
                    style: TextButton.styleFrom(
                        foregroundColor: AppTheme.primaryColor,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6)),
                  )),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildCompletionCard() {
    final total = _questions.length;
    final score = _correctCount;
    final allCorrect = score == total;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: allCorrect
            ? (AppTheme.active.isDarkSurface
                ? AppTheme.accentColor.withValues(alpha: 0.18)
                : const Color(0xFFE8F5E9))
            : (AppTheme.active.isDarkSurface
                ? AppTheme.active.dangerAccent.withValues(alpha: 0.18)
                : const Color(0xFFFFF3E0)),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: allCorrect
                ? AppTheme.accentColor.withValues(alpha: 0.4)
                : AppTheme.active.dangerAccent.withValues(alpha: 0.4)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(allCorrect ? '🎉 全部答对！' : '🌟 答题完成！',
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppTheme.textColor)),
        const SizedBox(height: 8),
        Text('答对 $score / $total 题',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: allCorrect
                    ? AppTheme.accentColor
                    : AppTheme.active.dangerAccent)),
        const SizedBox(height: 10),
        GestureDetector(
            onTap: _reset,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                  color: AppTheme.active.gameCardSurface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: AppTheme.primaryColor.withValues(alpha: 0.4))),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.refresh_rounded,
                    size: 16, color: AppTheme.primaryColor),
                SizedBox(width: 4),
                Text('再做一次',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.primaryColor)),
              ]),
            )),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 内联游戏卡 Widget — 非 quiz 类型的游戏渲染（matching/fill_blank/sequencing/connection/puzzle/true_false）
// ═══════════════════════════════════════════════════════════════════════════

class _InlineMusicCard extends StatelessWidget {
  final List<Map<String, dynamic>> tracks;
  final int activeTrackIndex; // -1 = 本卡片没有在播的曲目
  final bool isPlaying;
  final void Function(int index) onPlayTrack;

  const _InlineMusicCard({
    required this.tracks,
    required this.activeTrackIndex,
    required this.isPlaying,
    required this.onPlayTrack,
  });

  String _durationLabel(dynamic seconds) {
    final s = seconds is num ? seconds.toInt() : 0;
    if (s <= 0) return '';
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.softYellow.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppTheme.softOrange.withValues(alpha: 0.5), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '点歌',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor),
                ),
              ),
              const Spacer(),
              const Text('🎵', style: TextStyle(fontSize: 20)),
            ],
          ),
          for (var i = 0; i < tracks.length; i++) _buildTrack(i),
        ],
      ),
    );
  }

  Widget _buildTrack(int i) {
    final t = tracks[i];
    final active = i == activeTrackIndex;
    final artist = t['artist']?.toString() ?? '';
    final duration = _durationLabel(t['duration_s']);
    return GestureDetector(
      onTap: () => onPlayTrack(i),
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: active
              ? AppTheme.softYellow
              : AppTheme.active.card.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              active && isPlaying
                  ? Icons.pause_rounded
                  : Icons.play_arrow_rounded,
              size: 22,
              color: AppTheme.primaryColor,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t['title']?.toString() ?? '未知歌曲',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textColor),
                  ),
                  if (artist.isNotEmpty)
                    Text(
                      artist,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12, color: AppTheme.textSecondary),
                    ),
                ],
              ),
            ),
            if (duration.isNotEmpty)
              Text(duration,
                  style:
                      TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class _InlineGameCard extends StatefulWidget {
  final String gameType;
  final Map<String, dynamic> gameData;

  const _InlineGameCard({
    required this.gameType,
    required this.gameData,
  });

  @override
  State<_InlineGameCard> createState() => _InlineGameCardState();
}

class _InlineGameCardState extends State<_InlineGameCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (!_expanded) {
      // 收起状态：显示一个"点击开始游戏"按钮
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.softYellow.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: AppTheme.softOrange.withValues(alpha: 0.5), width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _gameTypeLabel(widget.gameType),
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.primaryColor),
                  ),
                ),
                const Spacer(),
                const Text('🎮', style: TextStyle(fontSize: 20)),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              widget.gameData['title']?.toString() ?? '互动游戏',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textColor),
            ),
            const SizedBox(height: 10),
            GestureDetector(
              onTap: () => setState(() => _expanded = true),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.play_arrow_rounded,
                        size: 20, color: AppTheme.active.onPrimary),
                    const SizedBox(width: 4),
                    Text('开始游戏',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.active.onPrimary)),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    // 展开状态：直接渲染 GameRenderer
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.6,
        ),
        child: GameRenderer(
          activityType: widget.gameType,
          initialData: widget.gameData,
          onExit: () => setState(() => _expanded = false),
        ),
      ),
    );
  }

  String _gameTypeLabel(String type) {
    const labels = {
      'quiz': '选择题',
      'true_false': '判断题',
      'matching': '配对游戏',
      'fill_blank': '填空游戏',
      'sequencing': '排序游戏',
      'connection': '连线游戏',
      'puzzle': '拼图游戏',
      'drag_sort': '分类游戏',
      'memory_flip': '记忆翻牌',
      'pattern_next': '规律接龙',
      'trace_path': '描红游戏',
      'color_fill': '涂色游戏',
      'tap_target': '听指令点一点',
    };
    return labels[type] ?? '互动游戏';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 作业草稿预览卡片 Widget — 显示 assignActivity 生成的草稿，附带发布按钮
// ═══════════════════════════════════════════════════════════════════════════

class _DraftPreviewCard extends StatelessWidget {
  final List<Map<String, dynamic>> drafts;
  final VoidCallback onPublish;

  const _DraftPreviewCard({
    required this.drafts,
    required this.onPublish,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue.shade200, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Text('📋', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Text(
                '作业草稿',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textColor),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.blue.shade100,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${drafts.length} 个',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue.shade700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...drafts.map((draft) => _DraftItem(draft: draft)),
          const SizedBox(height: 10),
          // 发布按钮
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onPublish,
              icon: const Icon(Icons.cloud_upload_outlined, size: 18),
              label: const Text('确认发布全部作业',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DraftItem extends StatelessWidget {
  final Map<String, dynamic> draft;

  const _DraftItem({required this.draft});

  @override
  Widget build(BuildContext context) {
    final topic = draft['topic']?.toString() ?? '';
    final typeLabel = draft['activityTypeLabel']?.toString() ??
        draft['activityType']?.toString() ??
        '';
    final difficulty = draft['difficulty'];
    final domain = draft['domain']?.toString() ?? '';
    final difficultyStars = difficulty is num ? '⭐' * difficulty.toInt() : '⭐';

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.active.card.withValues(alpha: 0.8),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                typeLabel,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryColor),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                topic,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textColor),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (domain.isNotEmpty) ...[
              const SizedBox(width: 4),
              Text(domain,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            ],
            const SizedBox(width: 4),
            Text(difficultyStars, style: const TextStyle(fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 会话抽屉面板
// ═══════════════════════════════════════════════════════════════════════════

/// 侧边会话列表抽屉
class _SessionDrawer extends StatelessWidget {
  final ChatSessionSummary? activeSession;
  final List<ChatSessionSummary> sessions;
  final bool loadingSessions;
  final void Function() onCreateNew;
  final void Function(ChatSessionSummary session) onSelectSession;
  final VoidCallback onClose;

  const _SessionDrawer({
    required this.activeSession,
    required this.sessions,
    required this.loadingSessions,
    required this.onCreateNew,
    required this.onSelectSession,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: MediaQuery.of(context).size.width * 0.82,
      constraints:
          BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: BoxDecoration(
        color: AppTheme.active.card,
        borderRadius: const BorderRadius.only(
            topRight: Radius.circular(20), bottomRight: Radius.circular(20)),
        boxShadow: const [
          BoxShadow(
              color: Colors.black26, blurRadius: 20, offset: Offset(-5, 0))
        ],
      ),
      child: Column(
        children: [
          // 头部
          Container(
            padding: const EdgeInsets.fromLTRB(20, 20, 16, 16),
            decoration: BoxDecoration(
              color: AppTheme.backgroundColor,
              borderRadius: BorderRadius.only(topRight: Radius.circular(20)),
            ),
            child: Row(children: [
              IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: onClose,
                  color: AppTheme.textSecondary,
                  splashRadius: 20),
              const Spacer(),
              Text('历史对话',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textColor)),
              const Spacer(),
              IconButton(
                  icon: const Icon(Icons.add_rounded),
                  onPressed: onCreateNew,
                  color: AppTheme.primaryColor,
                  tooltip: '新建对话',
                  splashRadius: 20),
            ]),
          ),
          // 会话列表
          Expanded(
            child: loadingSessions
                ? const Center(child: CircularProgressIndicator())
                : sessions.isEmpty
                    ? _buildEmptySessions(context)
                    : RefreshIndicator(
                        onRefresh: () async {},
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: sessions.length,
                          separatorBuilder: (_, __) =>
                              const Divider(height: 1, indent: 20),
                          itemBuilder: (context, index) =>
                              _buildSessionTile(sessions[index], index == 0),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptySessions(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('💬', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 12),
        Text('还没有对话记录哦～',
            style: TextStyle(fontSize: 15, color: AppTheme.textSecondary)),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: onCreateNew,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('开始新对话'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryColor,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
          ),
        ),
      ]),
    );
  }

  Widget _buildSessionTile(ChatSessionSummary session, bool isActive) {
    return InkWell(
      onTap: () {
        onSelectSession(session);
        onClose();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 头像图标
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isActive
                  ? AppTheme.primaryColor.withValues(alpha: 0.15)
                  : AppTheme.softPink.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
                child: Text(isActive ? '🦄' : '💬',
                    style: const TextStyle(fontSize: 20))),
          ),
          const SizedBox(width: 12),
          // 内容
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text(session.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight:
                                isActive ? FontWeight.w700 : FontWeight.w500,
                            color: isActive
                                ? AppTheme.primaryColor
                                : AppTheme.textColor))),
                const SizedBox(width: 8),
                Text(session.formattedDate,
                    style:
                        TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
              ]),
              if (session.messageCount > 0)
                Text('${session.messageCount} 条消息',
                    style:
                        TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
            ]),
          ),
          if (isActive)
            Icon(Icons.check_circle_rounded,
                color: AppTheme.primaryColor, size: 18),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主屏幕
// ═══════════════════════════════════════════════════════════════════════════

class AIChatScreen extends StatefulWidget {
  final bool isParentMode;
  final int? bookId;
  final String? bookTitle;

  const AIChatScreen(
      {super.key, this.isParentMode = false, this.bookId, this.bookTitle});

  @override
  State<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends State<AIChatScreen>
    with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  ApiService get _api => context.read<ApiService>();
  final bool _autoPlay = true;
  bool _isListening = false;
  int? _speakingMessageIndex;

  /// 低龄档是否已手动展开文字输入（默认只给语音，避免不识字的孩子卡住）。
  bool _forceTextInput = false;

  /// 输入框上方的工具面板是否展开（＋ / 相机钮切换）。
  bool _toolsOpen = false;

  /// 当前年龄密度档；家长端固定中档，不受孩子端换肤影响。
  ChildDensity get _density => widget.isParentMode
      ? childDensityForLevel(1)
      : ChildThemePalette.of(context).density;

  // ─── AI 点歌：屏幕级单个播放器，所有音乐卡片共享 ───
  AudioPlayer? _musicPlayer;
  int? _musicMessageIndex;
  int _musicTrackIndex = -1;
  bool _musicPlaying = false;

  /// 每条消息的答题记录（用于思考内容折叠状态）
  final Map<int, bool> _thinkingExpanded = {};

  /// 切换思考区域展开/折叠
  void _toggleThinking(int index) {
    setState(() {
      _thinkingExpanded[index] = !(_thinkingExpanded[index] ?? false);
    });
  }

  @override
  void initState() {
    super.initState();
    TtsService().init();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<ChatSessionProvider>();
      final userProvider = context.read<UserProvider>();

      // 设置家长模式。ChatSessionProvider 是全局单例（在 bootstrap 中创建，
      // 位于 LingxiApp 之上），双端切换不会重建它：孩子端必须显式复位 false，
      // 否则从家长端切回后开场白与 parentId 参数会残留家长模式。
      provider.setParentMode(widget.isParentMode);

      final childId = userProvider.activeChildId;
      if (childId != null) {
        provider.setChildId(childId);
      } else if (widget.isParentMode &&
          userProvider.currentUser?['id'] != null) {
        // 家长模式：后端忽略 childId 参数，改用 viewerId 查询家长自己的会话
        // 用家长自己的用户 ID 让前端守卫通过，防止 refresh 后 activeChildId 未加载导致历史记录消失
        final parentId = userProvider.currentUser!['id'] as int;
        provider.setChildId(parentId);
      }

      // 传递知识书上下文（从知识书详情页 AI 提问按钮进入时）
      if (widget.bookId != null) {
        provider.setBookContext(widget.bookId, widget.bookTitle);
      }

      // 加载会话列表后，自动选中最近会话
      // 避免浏览器切换/页面重建后每次创建新会话
      provider.loadSessions().then((_) {
        if (provider.sessions.isNotEmpty) {
          // 自动选中最近会话（第一个 = 最新）
          final latest = provider.sessions.first;
          provider.switchToSession(latest);
        } else {
          provider.resetGreeting();
        }
      });
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _musicPlayer?.dispose();
    super.dispose();
  }

  // ─── AI 点歌播放 ──────────────────────────────────────────────────

  AudioPlayer _ensureMusicPlayer() {
    final existing = _musicPlayer;
    if (existing != null) return existing;
    final player = AudioPlayer();
    player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => _musicPlaying = state == PlayerState.playing);
    });
    player.onPlayerComplete.listen((_) {
      if (!mounted) return;
      setState(() {
        _musicPlaying = false;
        _musicMessageIndex = null;
        _musicTrackIndex = -1;
      });
    });
    _musicPlayer = player;
    return player;
  }

  Future<void> _playMusicTrack(
      int messageIndex, int trackIndex, Map<String, dynamic> track) async {
    final url = track['url']?.toString() ?? '';
    if (url.isEmpty) return;
    await TtsService().stop();
    if (!mounted) return;
    if (_speakingMessageIndex != null) {
      setState(() => _speakingMessageIndex = null);
    }
    final player = _ensureMusicPlayer();
    // 同一首再点 = 暂停/继续
    if (_musicMessageIndex == messageIndex && _musicTrackIndex == trackIndex) {
      if (_musicPlaying) {
        await player.pause();
      } else {
        await player.resume();
      }
      return;
    }
    try {
      await player.play(UrlSource('${ApiService.baseUrl}$url'));
      if (!mounted) return;
      setState(() {
        _musicMessageIndex = messageIndex;
        _musicTrackIndex = trackIndex;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _musicMessageIndex = null;
        _musicTrackIndex = -1;
        _musicPlaying = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('播放失败，换一首试试')),
      );
    }
  }

  bool _isLoading = false;

  // ─── 消息发送（使用 Provider）─────────────────────────────────────

  Future<void> _sendMessage({String? text}) async {
    final message = (text ?? _controller.text).trim();
    if (message.isEmpty) return;

    _controller.clear();

    final provider = context.read<ChatSessionProvider>();

    // 先设置 loading 状态（禁用发送按钮）
    setState(() => _isLoading = true);

    // 启动发送流程 - provider.sendMessage 会同步添加用户消息和 AI 占位符
    // 然后异步等待 SSE 流
    final sendFuture = provider.sendMessage(message);

    // 等待当前帧完成，确保消息已添加到列表并渲染
    // 使用 addPostFrameCallback 确保 ListView 已布局完成
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottomImmediate();
    });

    sendFuture.then((msgIndex) {
      if (mounted) {
        setState(() => _isLoading = false);
        _scrollToBottom();
        final provider = context.read<ChatSessionProvider>();
        final msg = msgIndex >= 0 && msgIndex < provider.localMessages.length
            ? provider.localMessages[msgIndex]
            : null;
        if (msg != null && msg.musicTracks.isNotEmpty) {
          // 点歌消息：自动播第一首，不朗读（避免与音乐重叠）
          _playMusicTrack(msgIndex, 0, msg.musicTracks.first);
        } else if (_autoPlay) {
          _autoSpeakMessage(msgIndex);
        }
      }
    }).catchError((e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    });
  }

  /// 重答最后一条回复：原地替换成新回答，不新增用户气泡。
  ///
  /// 后端会把这一轮先回退再重跑，所以历史里始终只有一份提问。
  Future<void> _regenerateLast() async {
    if (_isLoading) return;
    final provider = context.read<ChatSessionProvider>();
    if (provider.isRegenerating) return;

    setState(() => _isLoading = true);
    _scrollToBottom();

    provider.regenerateLast().then((msgIndex) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      if (msgIndex < 0) {
        _showSnack('这条还没法重答，再问一次试试');
        return;
      }
      _scrollToBottom();
      final messages = context.read<ChatSessionProvider>().localMessages;
      final msg = msgIndex < messages.length ? messages[msgIndex] : null;
      if (msg != null && msg.musicTracks.isNotEmpty) {
        _playMusicTrack(msgIndex, 0, msg.musicTracks.first);
      } else if (_autoPlay) {
        _autoSpeakMessage(msgIndex);
      }
    }).catchError((e) {
      if (mounted) setState(() => _isLoading = false);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// 立即滚动到底部（用于消息发送后确保新消息可见）
  /// 与 _scrollToBottom 不同，这个方法会重试直到滚动成功
  void _scrollToBottomImmediate() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    } else {
      // ListView 还没布局完成，延迟重试
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  // ─── 语音输出 ──────────────────────────────────────────────────────

  Future<void> _autoSpeakMessage(int index) async {
    if (index < 0) return;
    final provider = context.read<ChatSessionProvider>();
    if (index >= provider.localMessages.length) return;
    final msg = provider.localMessages[index];
    if (msg.role != 'assistant') return;
    // 点歌消息不自动朗读，避免与音乐重叠
    if (msg.musicTracks.isNotEmpty) return;

    final content = (msg.displayText ?? msg.content).trim();
    if (content.isEmpty) return;

    final tts = TtsService();
    if (!tts.isAvailable) return;

    if (_musicPlaying) await _musicPlayer?.pause();
    await tts.stop();
    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted && _speakingMessageIndex == index) {
      setState(() => _speakingMessageIndex = null);
    }
  }

  Future<void> _speakMessage(int index) async {
    final tts = TtsService();
    if (_speakingMessageIndex == index) {
      await tts.stop();
      setState(() => _speakingMessageIndex = null);
      return;
    }
    if (_speakingMessageIndex != null) await tts.stop();
    if (!mounted) return;

    final provider = context.read<ChatSessionProvider>();
    if (index >= provider.localMessages.length) return;
    final msg = provider.localMessages[index];
    final content = (msg.displayText ?? msg.content).trim();
    if (content.isEmpty) return;

    if (_musicPlaying) await _musicPlayer?.pause();
    setState(() => _speakingMessageIndex = index);
    await tts.speak(content);
    await tts.onComplete;
    if (mounted) setState(() => _speakingMessageIndex = null);
  }

  // ─── 语音输入回调 ──────────────────────────────────────────────────

  void _onSpeechResult(String text) {
    if (text.trim().isNotEmpty) {
      _sendMessage(text: text.trim());
    }
  }

  void _onListeningChange(bool isListening) {
    setState(() => _isListening = isListening);
  }

  /// 选择并上传聊天文件（PDF/图片等），然后以消息形式发送
  ///
  /// [imagesOnly] 只允许图片（相册 / 拍照）；[camera] 走系统相机（移动端）。
  Future<void> _pickChatFile(
      {bool imagesOnly = false, bool camera = false}) async {
    setState(() => _toolsOpen = false);
    try {
      // Use platform file picker
      final result = await _pickFile(imagesOnly: imagesOnly, camera: camera);
      if (result == null) return;

      // Upload to server
      final uploadResult = await _api.uploadFile(
        '/ai/chat/upload',
        result.path,
        result.name,
      );

      if (uploadResult['fileUrl'] == null) {
        _showSnack('文件上传失败');
        return;
      }

      final fileUrl = uploadResult['fileUrl'] as String;
      final fileName = uploadResult['fileName'] as String? ?? result.name;
      final fileType = uploadResult['fileType'] as String? ?? '';

      // Send message with file reference
      final isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].contains(fileType);
      if (isImage) {
        _sendMessage(text: '我上传了一张图片: $fileName [$fileUrl]');
      } else {
        _sendMessage(text: '我上传了一个文件: $fileName [$fileUrl] 请帮我看看这个文件的内容');
      }
    } catch (e) {
      debugPrint('File pick error: $e');
      _showSnack('选择文件失败');
    }
  }

  static const _kImageAccept = '.png,.jpg,.jpeg,.gif,.webp';

  /// Simple file picker abstraction
  Future<({String path, String name})?> _pickFile(
      {bool imagesOnly = false, bool camera = false}) async {
    try {
      // Dynamic import to avoid hard dependency
      // For Flutter Web, we use a file input element
      final comp =
          await _pickFileWeb(imagesOnly: imagesOnly, camera: camera);
      return comp;
    } catch (e) {
      debugPrint('_pickFile fallback: $e');
      return null;
    }
  }

  /// Web file picker using JS interop
  Future<({String path, String name})?> _pickFileWeb(
      {bool imagesOnly = false, bool camera = false}) async {
    final completer = Completer<({String path, String name})?>();
    // Use dart:html FileReader on web
    try {
      // Create a hidden file input
      final input = html.FileUploadInputElement()
        ..accept = imagesOnly
            ? _kImageAccept
            : '$_kImageAccept,.pdf,.epub,.docx,.txt';
      // 拍照：让移动端浏览器直接开相机而不是相册
      if (camera) input.attributes['capture'] = 'environment';
      input.click();
      input.onChange.listen((_) {
        final files = input.files;
        if (files != null && files.isNotEmpty) {
          final file = files[0];
          final reader = html.FileReader();
          reader.readAsDataUrl(file);
          reader.onLoadEnd.listen((_) {
            final dataUrl = reader.result as String;
            completer.complete((path: dataUrl, name: file.name));
          });
        } else {
          completer.complete(null);
        }
      });
    } catch (e) {
      completer.complete(null);
    }
    return completer.future;
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ─── 构建 ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return Scaffold(
      backgroundColor: palette.paper,
      body: Container(
        decoration: BoxDecoration(color: palette.paper),
        child: SafeArea(
          child: Column(children: [
            // 顶栏：会话级动作（新建 / 通话 / 历史）
            _buildTopBar(palette),
            // 主消息列表
            Expanded(child: _buildMessageList()),
            // 输入区域
            _buildInputArea(),
          ]),
        ),
      ),
    );
  }

  /// 顶栏：头像 + 名字 + 三个会话级按钮。
  ///
  /// 这三件事都属于「换一个对话」而不是「往对话里加东西」，
  /// 所以从输入区上移到顶部，输入区只留真正影响这条消息的动作。
  Widget _buildTopBar(ChildThemePalette palette) {
    return Consumer<ChatSessionProvider>(
      builder: (ctx, provider, _) {
        final isEnglish = provider.isEnglishMode;
        final isKid = !widget.isParentMode && _density.level == 0;
        final sub = widget.isParentMode
            ? '家长模式'
            : isEnglish
                ? '英语陪练 · ${_englishLevelLabel(provider.englishLevel)}'
                : isKid
                    ? '陪你说话'
                    : '成长伙伴 · 在线';
        final canPop = Navigator.of(context).canPop();

        return Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 8),
          child: Row(
            children: [
              if (canPop) ...[
                GestureDetector(
                  onTap: () => Navigator.of(context).maybePop(),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: palette.card,
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: palette.edge.withValues(alpha: 0.55),
                          width: 1.6),
                    ),
                    child: Icon(Icons.arrow_back_rounded,
                        size: 19, color: palette.ink),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              // 头像
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      palette.cta.withValues(alpha: 0.9),
                      palette.pop,
                    ],
                  ),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: palette.edge.withValues(alpha: 0.9),
                      width: palette.isCartoon ? 2 : 1.4),
                ),
                alignment: Alignment.center,
                child: const Text('🦄', style: TextStyle(fontSize: 16)),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(widget.isParentMode ? '小犀 · 家长端' : '小犀',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                            color: palette.ink)),
                    const SizedBox(height: 1),
                    Text(sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 10.5,
                            height: 1.2,
                            color: palette.ink2.withValues(alpha: 0.85))),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _TopIcon(
                palette: palette,
                tooltip: '新建会话',
                filled: true,
                onTap: () => _newSession(provider),
                icon: Icons.add_rounded,
                iconSize: 20,
              ),
              const SizedBox(width: 6),
              _TopIcon(
                palette: palette,
                tooltip: '语音通话',
                onTap: () => _openVoiceCall(englishMode: isEnglish),
                icon: Icons.call_rounded,
              ),
              const SizedBox(width: 6),
              _TopIcon(
                palette: palette,
                tooltip: '历史会话',
                onTap: _openSessionDrawer,
                icon: Icons.format_list_bulleted_rounded,
              ),
            ],
          ),
        );
      },
    );
  }

  /// 新建会话：清空当前上下文，回到首轮引导。
  Future<void> _newSession(ChatSessionProvider provider) async {
    // 不带 mode 参数，英语模式下也回到普通会话，避免一直锁在英语教练里
    await provider.createNewSession();
    if (!mounted) return;
    setState(() {
      _toolsOpen = false;
      _forceTextInput = false;
    });
    _scrollToBottomImmediate();
  }

  /// 打开会话抽屉（用 OverlayEntry 替代 Stack，避免 Web 端渲染问题）
  void _openSessionDrawer() {
    // 每次打开都刷新：进页面时只加载一次，若那次网络抖动失败，
    // 抽屉会一直显示空状态，没有任何重试入口。
    context.read<ChatSessionProvider>().loadSessions();
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) => _SessionDrawerOverlay(
        onClose: () => entry.remove(),
      ),
    );
    overlay.insert(entry);
  }

  Widget _buildMessageList() {
    return Consumer<ChatSessionProvider>(
      builder: (ctx, provider, _) {
        try {
          final messages = provider.localMessages;
          // 始终显示 ListView，不因 isLoadingMessages 替换为骨架屏
          // 这样用户消息和已有消息始终可见，加载状态用顶部小指示器表示
          return Column(children: [
            // 加载历史消息时显示顶部小进度条
            if (provider.isLoadingMessages)
              const LinearProgressIndicator(
                  minHeight: 2, backgroundColor: Colors.transparent),
            Expanded(
              child: () {
                final stillGreeting = !provider.isLoadingMessages &&
                    !messages.any((m) => m.role == 'user');
                final itemCount = messages.length + (stillGreeting ? 1 : 0);
                return ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  itemCount: itemCount,
                  itemBuilder: (context, index) {
                    if (index >= messages.length) {
                      return _buildStarterPanel();
                    }
                    final message = messages[index];
                    final isUser = message.role == 'user';
                    // 只有末尾这条 AI 回复能重答：前面几轮早就被后续提问
                    // 覆盖了，重答它们会和历史打架。开场白没有对应的提问，
                    // 也就没有可重答的东西。
                    final hasQuestion =
                        message.role != 'user' &&
                        messages.take(index).any((m) => m.role == 'user');
                    final canRegenerate = !isUser &&
                        hasQuestion &&
                        index == messages.length - 1 &&
                        !message.isStreaming &&
                        !provider.isRegenerating;
                    return _buildMessageBubble(message, isUser, index,
                        canRegenerate: canRegenerate,
                        regenerating: provider.isRegenerating);
                  },
                );
              }(),
            ),
          ]);
        } catch (e, s) {
          debugPrint('🔥 [MessageList] EXCEPTION: $e');
          debugPrint('🔥 [MessageList] STACK: $s');
          return Center(
              child: Text('⚠️ 消息列表渲染错误: $e',
                  style: const TextStyle(color: Colors.red)));
        }
      },
    );
  }

  /// 首轮引导区：还没有用户发言时，在消息流尾部给出「点一下就能问」的入口。
  ///
  /// - 家长端：三条家长向胶囊，保持中档行为；
  /// - level 0：图形圆按钮（emoji + 两字标签），不依赖识字；
  /// - level 1 / 2：文字胶囊，数量按 [ChildDensity.quickPrompts]；
  /// - level 2：额外一行长尾建议。
  Widget _buildStarterPanel() {
    final density = _density;
    final palette = ChildThemePalette.of(context);
    final isLowAge = !widget.isParentMode && density.level == 0;
    final isHighAge = !widget.isParentMode && density.level == 2;

    final prompts = widget.isParentMode
        ? _kParentPrompts
        : isLowAge
            ? _kChildRoundPrompts.take(density.quickPrompts).toList()
            : _kChildPrompts.take(density.quickPrompts).toList();

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!widget.isParentMode)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(children: [
                const Text('🦄', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    isLowAge ? '想聊什么？点一个就好' : '今天想聊点什么？',
                    style: TextStyle(
                        fontSize: isLowAge ? 17 : 15,
                        fontWeight: FontWeight.w600,
                        color: palette.ink2),
                  ),
                ),
              ]),
            ),
          if (isLowAge)
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final p in prompts) _buildRoundPrompt(p),
              ],
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in prompts)
                  _buildPromptChip(p.label, p.q, palette: palette),
              ],
            ),
          if (isHighAge) ...[
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final s in _kChildSuggestions)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _buildPromptChip(s.label, s.q,
                        palette: palette, soft: true),
                  ),
              ]),
            ),
          ],
        ],
      ),
    );
  }

  /// 低龄档图形圆按钮：72px 起，emoji 大字 + 两字标签。
  Widget _buildRoundPrompt(({String em, String label, String q}) p) {
    final palette = ChildThemePalette.of(context);
    final size = _density.level == 0 ? 76.0 : 72.0;
    return GestureDetector(
      onTap: _isLoading ? null : () => _sendMessage(text: p.q),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: palette.soft,
          shape: BoxShape.circle,
          border: Border.all(color: palette.line, width: 2),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(p.em, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 2),
            Text(p.label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: palette.ink)),
          ],
        ),
      ),
    );
  }

  /// 中高年龄档文字胶囊：最小 44px 触控高度，宽度跟随文字（不要撑满整行）。
  Widget _buildPromptChip(String label, String q,
      {required ChildThemePalette palette, bool soft = false}) {
    return GestureDetector(
      onTap: _isLoading ? null : () => _sendMessage(text: q),
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        decoration: BoxDecoration(
          color: soft ? palette.soft : palette.card,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
              color: soft ? palette.line : palette.line.withValues(alpha: 0.9)),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: soft ? palette.ink2 : palette.ink)),
      ),
    );
  }

  /// 英语陪练 chip：开 / 关当前模式。
  /// 开启时新建一个英语会话（后端锁定英语教练），关闭时回到普通会话。
  Future<void> _toggleEnglishMode(ChatSessionProvider provider) async {
    if (provider.isEnglishMode) {
      await _exitEnglishPractice(provider);
    } else {
      await _enterEnglishPractice(provider);
    }
    if (mounted) setState(() => _toolsOpen = false);
  }

  String _englishLevelLabel(String? level) {
    switch (level) {
      case 'L1':
        return 'L1 启蒙';
      case 'L3':
        return 'L3 进阶';
      default:
        return 'L2 入门';
    }
  }

  Future<void> _enterEnglishPractice(ChatSessionProvider provider) async {
    if (provider.isEnglishMode) return;
    await provider.createNewSession(mode: ChatMode.english.wire);
  }

  Future<void> _exitEnglishPractice(ChatSessionProvider provider) async {
    await provider.createNewSession();
  }

  /// 打开语音通话界面（连续听-说对话；英语模式走英语教练）
  void _openVoiceCall({bool englishMode = false}) {
    Navigator.of(context).push(
      MaterialPageRoute(
          builder: (_) => VoiceCallScreen(englishMode: englishMode)),
    );
  }

  Widget _buildMessageBubble(ChatMessageEntry message, bool isUser, int index,
      {bool canRegenerate = false, bool regenerating = false}) {
    final isSpeaking = _speakingMessageIndex == index;
    final quizQuestions = message.quizQuestions;
    final displayText = message.displayText ?? message.content;
    final hasQuiz = quizQuestions != null && quizQuestions.isNotEmpty;
    final hasGame = message.gameDatas.isNotEmpty;
    final isStreaming = message.isStreaming;
    final isEmpty = displayText.isEmpty;
    final thinkingContent = message.thinkingContent?.trim();
    final showThinking = thinkingContent != null && thinkingContent.isNotEmpty;
    final expanded = _thinkingExpanded[index] ?? false;
    debugPrint(
        '🔍 [UI] buildBubble idx=$index role=${message.role} isEmpty=$isEmpty isStreaming=$isStreaming displayText="${displayText.length > 50 ? displayText.substring(0, 50) : displayText}" hasGame=$hasGame hasQuiz=$hasQuiz showThinking=$showThinking');

    try {
      return _buildMessageBubbleInner(
          message,
          isUser,
          index,
          isSpeaking,
          quizQuestions,
          displayText,
          hasQuiz,
          hasGame,
          isStreaming,
          isEmpty,
          thinkingContent,
          showThinking,
          expanded,
          canRegenerate,
          regenerating);
    } catch (e, s) {
      debugPrint('🔥 [UI] EXCEPTION in buildBubble idx=$index: $e');
      debugPrint('🔥 [UI] STACK: $s');
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12)),
              child: Text('⚠️ 渲染错误: $e',
                  style: TextStyle(fontSize: 13, color: Colors.red)),
            )),
      );
    }
  }

  Widget _buildMessageBubbleInner(
      ChatMessageEntry message,
      bool isUser,
      int index,
      bool isSpeaking,
      dynamic quizQuestions,
      String displayText,
      bool hasQuiz,
      bool hasGame,
      bool isStreaming,
      bool isEmpty,
      String? thinkingContent,
      bool showThinking,
      bool expanded,
      bool canRegenerate,
      bool regenerating) {
    final palette = ChildThemePalette.of(context);

    // 低龄档把正文字号放大、行距放松，减少阅读压力；高龄档略收紧以多容纳信息。
    final bodySize = _density.level == 0
        ? 18.0
        : _density.level == 2
            ? 15.0
            : 15.5;
    final bodyHeight = _density.level == 0 ? 1.72 : 1.62;

    if (isUser) return _buildUserBubble(displayText, bodySize, bodyHeight);

    return _buildAiMessage(
      message: message,
      index: index,
      isSpeaking: isSpeaking,
      displayText: displayText,
      isStreaming: isStreaming,
      isEmpty: isEmpty,
      thinkingContent: thinkingContent,
      showThinking: showThinking,
      expanded: expanded,
      hasQuiz: hasQuiz,
      quizQuestions: quizQuestions,
      hasGame: hasGame,
      bodySize: bodySize,
      bodyHeight: bodyHeight,
      palette: palette,
      canRegenerate: canRegenerate,
      regenerating: regenerating,
    );
  }

  /// 用户消息：橙色气泡，右下角收 6px 形成指向。
  Widget _buildUserBubble(String text, double bodySize, double bodyHeight) {
    final palette = ChildThemePalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 2),
      child: Align(
        alignment: Alignment.centerRight,
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.76),
          child: Container(
            padding: const EdgeInsets.fromLTRB(15, 10, 15, 10),
            decoration: BoxDecoration(
              color: palette.pop,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(20),
                topRight: Radius.circular(20),
                bottomLeft: Radius.circular(20),
                bottomRight: Radius.circular(6),
              ),
              boxShadow: [
                BoxShadow(
                    color: palette.pop.withValues(alpha: 0.22),
                    blurRadius: 12,
                    offset: const Offset(0, 4)),
              ],
            ),
            child: SelectableText(
              text,
              style: TextStyle(
                color: palette.onPrimary,
                fontSize: bodySize,
                height: bodyHeight > 1.6 ? 1.5 : bodyHeight,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// AI 消息：不套白卡，正文直接排在纸面上，靠头像与留白区分。
  Widget _buildAiMessage({
    required ChatMessageEntry message,
    required int index,
    required bool isSpeaking,
    required String displayText,
    required bool isStreaming,
    required bool isEmpty,
    required String? thinkingContent,
    required bool showThinking,
    required bool expanded,
    required bool hasQuiz,
    required dynamic quizQuestions,
    required bool hasGame,
    required double bodySize,
    required double bodyHeight,
    required ChildThemePalette palette,
    bool canRegenerate = false,
    bool regenerating = false,
  }) {
    final children = <Widget>[];
    final isKid = !widget.isParentMode && _density.level == 0;

    // 思考过程：压成 28px 胶囊，默认收起。3–4 岁看不到这一层。
    if (showThinking && !isKid) {
      children.addAll(_buildThinkingSection(
          thinkingContent, expanded, isStreaming, index));
    }

    // 正文
    if (isEmpty && isStreaming) {
      children.add(const Padding(
        padding: EdgeInsets.symmetric(vertical: 4),
        child: _ThinkingDots(),
      ));
    } else {
      children.add(SelectionArea(
        child: MarkdownBody(
          data: displayText,
          styleSheet: MarkdownStyleSheet(
            p: TextStyle(
                fontSize: bodySize, height: bodyHeight, color: palette.ink),
            strong: TextStyle(
                fontSize: bodySize,
                height: bodyHeight,
                fontWeight: FontWeight.w700,
                color: palette.ink),
            horizontalRuleDecoration: BoxDecoration(
              border: Border(
                  top: BorderSide(
                      color: palette.ink2.withValues(alpha: 0.2), width: 1)),
            ),
            code: TextStyle(
                fontSize: bodySize - 2,
                fontFamily: 'monospace',
                color: palette.pop),
            codeblockDecoration: BoxDecoration(
              color: palette.soft,
              borderRadius: BorderRadius.circular(8),
            ),
            blockquoteDecoration: BoxDecoration(
              color: palette.ink2.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ));
      if (isStreaming) {
        children.add(const SizedBox(height: 6));
        children.add(_buildStreamingDots());
      }
    }

    // ── Quiz card ──
    if (hasQuiz) {
      children.add(const SizedBox(height: 12));
      children.add(_InlineQuizCard(
        questions: quizQuestions,
        messageIndex: index,
        onAnswered: (qIdx, selected) {},
      ));
    }

    // ── 游戏卡：首个完整，其余折叠成一行 mini ──
    if (hasGame) {
      children.add(const SizedBox(height: 12));
      children.add(_InlineGameGroup(
        types: message.gameTypes,
        datas: message.gameDatas,
      ));
    }

    // ── AI 点歌卡片 ──
    if (message.musicTracks.isNotEmpty) {
      children.add(const SizedBox(height: 12));
      children.add(_InlineMusicCard(
        tracks: message.musicTracks,
        activeTrackIndex: _musicMessageIndex == index ? _musicTrackIndex : -1,
        isPlaying: _musicPlaying,
        onPlayTrack: (i) => _playMusicTrack(index, i, message.musicTracks[i]),
      ));
    }

    // ── 作业草稿预览卡片（含发布按钮）──
    if (message.drafts.isNotEmpty) {
      children.add(const SizedBox(height: 12));
      children.add(_DraftPreviewCard(
        drafts: message.drafts,
        onPublish: () {
          context.read<ChatSessionProvider>().sendMessage('确认发布');
        },
      ));
    }

    // ── 底部动作：低龄档只留一个大喇叭，其余收进家长端 ──
    if (!isStreaming) {
      children.add(const SizedBox(height: 8));
      children.add(isKid
          ? _KidSpeakButton(
              palette: palette,
              isSpeaking: isSpeaking,
              onTap: () => _speakMessage(index),
            )
          : _MessageActionRow(
              palette: palette,
              isSpeaking: isSpeaking,
              onCopy: () {
                Clipboard.setData(ClipboardData(text: displayText));
                _showSnack('已复制到剪贴板');
              },
              onSpeak: () => _speakMessage(index),
              onMore: () => _showAiMessageActions(index, displayText),
              onRegenerate: canRegenerate ? _regenerateLast : null,
              regenerating: regenerating,
            ));
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 小犀头像
          Container(
            width: 26,
            height: 26,
            margin: const EdgeInsets.only(top: 2, right: 9),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [palette.cta.withValues(alpha: 0.9), palette.pop],
              ),
              shape: BoxShape.circle,
              border: Border.all(
                  color: palette.edge.withValues(alpha: 0.85),
                  width: palette.isCartoon ? 2 : 1.2),
            ),
            alignment: Alignment.center,
            child: const Text('🦄', style: TextStyle(fontSize: 12)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isKid) ...[
                  _buildAiMeta(palette, isStreaming),
                  const SizedBox(height: 6),
                ],
                GestureDetector(
                  onLongPress: () => _showAiMessageActions(index, displayText),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: children,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 消息头：名字 + 状态。消息模型没有时间戳，状态位比假时间更有信息量。
  Widget _buildAiMeta(ChildThemePalette palette, bool isStreaming) {
    return Row(children: [
      Text('小犀',
          style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: palette.ink2)),
      const SizedBox(width: 6),
      Text(isStreaming ? '正在想…' : '成长伙伴',
          style: TextStyle(
              fontSize: 10.5,
              color: palette.ink2.withValues(alpha: 0.6))),
    ]);
  }

  /// AI 消息长按操作菜单：查词、复制、TTS
  void _showAiMessageActions(int index, String text) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(8),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.active.card,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Text('📖', style: TextStyle(fontSize: 22)),
              title: const Text('查英文单词'),
              subtitle: const Text('打开词典查一个英文单词的意思'),
              onTap: () {
                Navigator.pop(ctx);
                _showDictionaryPrompt();
              },
            ),
            ListTile(
              leading: const Text('📋', style: TextStyle(fontSize: 22)),
              title: const Text('复制消息'),
              onTap: () {
                Navigator.pop(ctx);
                Clipboard.setData(ClipboardData(text: text));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('已复制到剪贴板'),
                    duration: Duration(seconds: 1),
                  ),
                );
              },
            ),
            ListTile(
              leading:
                  Icon(Icons.volume_up_rounded, color: AppTheme.primaryColor),
              title: const Text('朗读消息'),
              onTap: () {
                Navigator.pop(ctx);
                _speakMessage(index);
              },
            ),
          ],
        ),
      ),
    );
  }

  /// 词典查词输入对话框：用户输入要查的英文单词
  void _showDictionaryPrompt() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: const Row(
            children: [
              Text('📖', style: TextStyle(fontSize: 24)),
              SizedBox(width: 8),
              Text('查英文单词'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '输入一个英文单词，看看它的意思吧~',
                style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: '例如：hello',
                  prefixText: '🔤 ',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide:
                        BorderSide(color: AppTheme.primaryColor, width: 2),
                  ),
                ),
                onSubmitted: (_) =>
                    _submitDictionaryQuery(dialogContext, controller.text),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('取消'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
              ),
              onPressed: () =>
                  _submitDictionaryQuery(dialogContext, controller.text),
              child: const Text('查询'),
            ),
          ],
        ),
      ),
    );
  }

  void _submitDictionaryQuery(BuildContext dialogContext, String text) {
    final word = text.trim().toLowerCase();
    // 简单校验：英文单词（允许连字符）
    final valid = RegExp(r'^[a-z][a-z\-]*$').hasMatch(word);
    if (word.isEmpty || !valid) {
      // 显示错误（StatefulBuilder 状态在外层管理；这里用 snackbar 简化）
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('请输入有效的英文单词（仅字母）'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }
    Navigator.pop(dialogContext);
    // 关闭输入对话框后弹出词典 sheet
    WidgetsBinding.instance.addPostFrameCallback((_) {
      DictionarySheet.show(context, word: word);
    });
  }

  /// 思考过程：28px 高的胶囊，默认收起，点开才展开正文。
  /// 不再占一整块 40px 灰框 —— 孩子关心的是答案，不是思考链路。
  List<Widget> _buildThinkingSection(
      String? thinkingContent, bool expanded, bool isStreaming, int index) {
    final palette = ChildThemePalette.of(context);
    final count = (thinkingContent ?? '').replaceAll(RegExp(r'\s+'), '').length;
    return [
      GestureDetector(
        onTap: () => _toggleThinking(index),
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: 28,
          padding: const EdgeInsets.symmetric(horizontal: 11),
          decoration: BoxDecoration(
            color: palette.ink2.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('✨', style: TextStyle(fontSize: 11)),
              const SizedBox(width: 5),
              Text(
                isStreaming ? '思考中…' : '思考过程',
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: palette.ink2),
              ),
              if (!isStreaming && count > 0) ...[
                Text(' · $count 字',
                    style: TextStyle(
                        fontSize: 11,
                        color: palette.ink2.withValues(alpha: 0.55))),
              ],
              const SizedBox(width: 2),
              AnimatedRotation(
                turns: expanded ? 0.5 : 0,
                duration: const Duration(milliseconds: 160),
                child: Icon(Icons.keyboard_arrow_down_rounded,
                    size: 15, color: palette.ink2.withValues(alpha: 0.7)),
              ),
            ],
          ),
        ),
      ),
      if (expanded) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.fromLTRB(11, 9, 11, 9),
          decoration: BoxDecoration(
            color: palette.ink2.withValues(alpha: 0.045),
            borderRadius: BorderRadius.circular(12),
          ),
          child: MarkdownBody(
            data: thinkingContent ?? '',
            styleSheet: MarkdownStyleSheet(
              p: TextStyle(
                  fontSize: 12.5,
                  height: 1.55,
                  color: palette.ink2.withValues(alpha: 0.8)),
              code: TextStyle(
                  fontSize: 11.5,
                  fontFamily: 'monospace',
                  color: palette.ink2),
              codeblockDecoration: BoxDecoration(
                color: palette.ink2.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              blockquoteDecoration: BoxDecoration(
                color: palette.ink2.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              blockquote: TextStyle(
                  fontSize: 12.5,
                  fontStyle: FontStyle.italic,
                  color: palette.ink2.withValues(alpha: 0.65)),
            ),
          ),
        ),
      ],
      const SizedBox(height: 10),
    ];
  }

  /// 流式输出时文末的小跳动点
  Widget _buildStreamingDots() {
    return SizedBox(
      width: 16,
      height: 20,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _SimpleDot(size: 4),
        const SizedBox(width: 2),
        _SimpleDot(size: 4),
      ]),
    );
  }

  // ─── 输入区 ────────────────────────────────────────────────────────

  Widget _buildInputArea() {
    final palette = ChildThemePalette.of(context);
    final density = _density;
    // 低龄档（level 0）：默认只给一个大话筒，不识字也不会卡住；
    // 点右侧键盘可展开文字输入，保证语音不可用时仍有出路。
    final isKid = !widget.isParentMode && density.level == 0;
    final voiceOnly = isKid && !_forceTextInput;
    final isLowAge = !widget.isParentMode && density.level == 0;

    return Container(
      // 底部渐变到纸面，让胶囊像是浮在对话流上，而不是压一条白底横栏
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [
            palette.paper,
            palette.paper.withValues(alpha: 0),
          ],
          stops: const [0.62, 1.0],
        ),
      ),
      padding: EdgeInsets.fromLTRB(14, 8, 14, isKid ? 12 : 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 工具面板：从输入胶囊上方弹出
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            alignment: Alignment.bottomCenter,
            child: _toolsOpen
                ? ChatToolPanel(
                    palette: palette,
                    title: isKid ? '给小犀看看' : '添加到对话',
                    style: isKid ? ChatToolStyle.rows : ChatToolStyle.grid,
                    items: _buildToolItems(palette, isKid: isKid),
                  )
                : const SizedBox(width: double.infinity),
          ),
          if (voiceOnly)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _isListening ? '我在听… 说完等一下就好' : '点一下话筒，说给我听',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: _isListening ? palette.pop : palette.ink2),
              ),
            ),
          isKid
              ? KidChatComposer(
                  controller: _controller,
                  palette: palette,
                  mic: _buildMic(palette,
                      size: 64,
                      bright: true,
                      silence: const Duration(seconds: 2)),
                  onSend: () => _sendMessage(),
                  onToggleTools: _toggleTools,
                  onSwitchToText: () => setState(() => _forceTextInput = true),
                  onSwitchToVoice: () =>
                      setState(() => _forceTextInput = false),
                  onPickAlbum: () => _pickChatFile(imagesOnly: true),
                  toolsOpen: _toolsOpen,
                  textMode: !voiceOnly,
                  listening: _isListening,
                  isLoading: _isLoading,
                )
              : ChatComposer(
                  controller: _controller,
                  palette: palette,
                  hint: widget.isParentMode
                      ? '问问小犀孩子的学习情况~'
                      : (isLowAge ? '和小犀聊天吧~' : '和小犀聊点什么…'),
                  mic: _buildMic(palette, size: 32),
                  onSend: () => _sendMessage(),
                  onToggleTools: _toggleTools,
                  onToggleEnglish: _toggleEnglish,
                  toolsOpen: _toolsOpen,
                  isEnglishMode: _englishMode,
                  isLoading: _isLoading,
                  fontSize: isLowAge ? 17 : 14.5,
                ),
          if (!isKid)
            Padding(
              padding: const EdgeInsets.only(top: 7),
              child: Text(
                _isListening ? '正在听你说话…说完会自动发送' : '「＋」里有拍照、相册、文件',
                style: TextStyle(
                    fontSize: 9.5,
                    color: palette.ink2.withValues(alpha: 0.6)),
              ),
            ),
        ],
      ),
    );
  }

  /// 工具面板内容：标准版 4 格（拍照 / 相册 / 文件 / 英语陪练），
  /// 低龄版 2 格（拍照 / 相册）—— 孩子用不到文件，误触代价却很高。
  List<ChatToolItem> _buildToolItems(ChildThemePalette palette,
      {required bool isKid}) {
    final items = <ChatToolItem>[
      ChatToolItem(
        icon: Icons.photo_camera_rounded,
        label: '拍照',
        accent: _toolsOpen,
        onTap: () => _pickChatFile(camera: true, imagesOnly: true),
      ),
      ChatToolItem(
        icon: Icons.photo_library_rounded,
        label: '相册',
        onTap: () => _pickChatFile(imagesOnly: true),
      ),
    ];
    if (!isKid) {
      items
        ..add(ChatToolItem(
          icon: Icons.description_rounded,
          label: '文件',
          onTap: _pickChatFile,
        ))
        ..add(ChatToolItem(
          icon: Icons.translate_rounded,
          label: '英语陪练',
          accent: _englishMode,
          onTap: _toggleEnglish,
        ));
    }
    return items;
  }

  bool get _englishMode => context.read<ChatSessionProvider>().isEnglishMode;

  void _toggleTools() => setState(() => _toolsOpen = !_toolsOpen);

  Future<void> _toggleEnglish() async {
    final provider = context.read<ChatSessionProvider>();
    await _toggleEnglishMode(provider);
  }

  /// 统一话筒：紧凑圆钮，颜色跟皮肤走。
  Widget _buildMic(ChildThemePalette palette,
      {required double size,
      bool bright = false,
      Duration silence = const Duration(seconds: 8)}) {
    return Consumer<ChatSessionProvider>(
      builder: (ctx, provider, _) => SpeechInputWidget(
        onResult: _onSpeechResult,
        onListeningChange: _onListeningChange,
        localeId: provider.isEnglishMode ? 'en_US' : 'zh_CN',
        size: size,
        compact: true,
        silenceTimeout: silence,
        idleBg: bright ? palette.pop : palette.soft,
        idleFg: bright ? palette.onPrimary : palette.ink,
        idleBorder:
            bright ? palette.edge : palette.edge.withValues(alpha: 0.9),
        activeBg: palette.pop,
        activeFg: palette.onPrimary,
      ),
    );
  }
}

/// 低龄档的大喇叭：44px，不识字也能认出「再听一遍」。
class _KidSpeakButton extends StatelessWidget {
  const _KidSpeakButton({
    required this.palette,
    required this.isSpeaking,
    required this.onTap,
  });

  final ChildThemePalette palette;
  final bool isSpeaking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: isSpeaking ? palette.pop : palette.soft,
          shape: BoxShape.circle,
          border: Border.all(color: palette.edge, width: 2.2),
          boxShadow: const [
            BoxShadow(
                color: Color(0x224A2A46), blurRadius: 0, offset: Offset(0, 3)),
          ],
        ),
        child: Icon(
          isSpeaking ? Icons.volume_up_rounded : Icons.volume_up_outlined,
          size: 22,
          color: isSpeaking ? palette.onPrimary : palette.ink,
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 顶栏按钮 / 消息动作条 / 思考中的点 / 游戏分组
// ═══════════════════════════════════════════════════════════════════════════

/// 顶栏圆钮：新建会话用填充色，其余描边；尺寸统一 31px。
class _TopIcon extends StatelessWidget {
  const _TopIcon({
    required this.palette,
    required this.icon,
    required this.onTap,
    this.filled = false,
    this.iconSize = 17,
    this.tooltip,
  });

  final ChildThemePalette palette;
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;
  final double iconSize;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final button = GestureDetector(
      onTap: onTap,
      child: Container(
        width: 31,
        height: 31,
        decoration: BoxDecoration(
          color: filled ? palette.pop : palette.card,
          shape: BoxShape.circle,
          border: filled
              ? null
              : Border.all(
                  color: palette.edge.withValues(alpha: 0.55), width: 1.6),
        ),
        child: Icon(icon,
            size: iconSize,
            color: filled ? palette.onPrimary : palette.ink),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/// 消息底部动作条：复制 / 朗读 / 重答（非末条时退化为「更多」）。
class _MessageActionRow extends StatelessWidget {
  const _MessageActionRow({
    required this.palette,
    required this.isSpeaking,
    required this.onCopy,
    required this.onSpeak,
    required this.onMore,
    this.onRegenerate,
    this.regenerating = false,
  });

  final ChildThemePalette palette;
  final bool isSpeaking;
  final VoidCallback onCopy;
  final VoidCallback onSpeak;
  final VoidCallback onMore;

  /// 非空表示这条回复可以重答（仅最后一条）。
  final VoidCallback? onRegenerate;
  final bool regenerating;

  @override
  Widget build(BuildContext context) {
    final canRegenerate = onRegenerate != null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ActionPill(
          palette: palette,
          icon: Icons.content_copy_rounded,
          label: '复制',
          onTap: onCopy,
        ),
        const SizedBox(width: 6),
        _ActionPill(
          palette: palette,
          icon: isSpeaking ? Icons.volume_up_rounded : Icons.volume_mute_rounded,
          label: isSpeaking ? '停止' : '朗读',
          active: isSpeaking,
          onTap: onSpeak,
        ),
        const SizedBox(width: 6),
        if (canRegenerate)
          _ActionPill(
            palette: palette,
            icon: Icons.refresh_rounded,
            label: regenerating ? '重答中' : '重答',
            active: regenerating,
            onTap: regenerating ? null : onRegenerate!,
          )
        else
          _ActionPill(
            palette: palette,
            icon: Icons.more_horiz_rounded,
            label: '更多',
            onTap: onMore,
          ),
      ],
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.palette,
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final ChildThemePalette palette;
  final IconData icon;
  final String label;

  /// 为 null 时按钮只是展示（比如重答进行中），不响应点击。
  final VoidCallback? onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 26,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        decoration: BoxDecoration(
          color: active
              ? palette.pop.withValues(alpha: 0.14)
              : palette.ink2.withValues(alpha: 0.045),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 13,
                color: active ? palette.pop : palette.ink2),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: active ? palette.pop : palette.ink2)),
          ],
        ),
      ),
    );
  }
}

/// 「小犀正在想」：三个呼吸的圆点，替代原来一排静止点。
class _ThinkingDots extends StatefulWidget {
  const _ThinkingDots();

  @override
  State<_ThinkingDots> createState() => _ThinkingDotsState();
}

class _ThinkingDotsState extends State<_ThinkingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            // 每个点错开 0.18 个周期，形成依次起伏
            final t = (_controller.value + i * 0.18) % 1.0;
            final wave = (1 - (t - 0.5).abs() * 2).clamp(0.0, 1.0);
            return Container(
              width: 6,
              height: 6,
              margin: EdgeInsets.only(right: i == 2 ? 0 : 4),
              decoration: BoxDecoration(
                color: palette.ink2.withValues(alpha: 0.25 + 0.5 * wave),
                shape: BoxShape.circle,
              ),
            );
          },
        );
      }),
    );
  }
}

/// 同批游戏：第一个给完整卡片，其余收成一行「还有 N 个」，点开后替换。
/// 避免一条回复里叠四五个「开始游戏」把对话顶出屏幕。
class _InlineGameGroup extends StatefulWidget {
  const _InlineGameGroup({required this.types, required this.datas});

  final List<String> types;
  final List<Map<String, dynamic>> datas;

  @override
  State<_InlineGameGroup> createState() => _InlineGameGroupState();
}

class _InlineGameGroupState extends State<_InlineGameGroup> {
  int? _picked;

  static const _labels = {
    'quiz': '选择题',
    'true_false': '判断题',
    'matching': '配对游戏',
    'fill_blank': '填空游戏',
    'sequencing': '排序游戏',
    'connection': '连线游戏',
    'puzzle': '拼图游戏',
    'drag_sort': '分类游戏',
    'memory_flip': '记忆翻牌',
    'pattern_next': '规律接龙',
    'trace_path': '描红游戏',
    'color_fill': '涂色游戏',
    'tap_target': '听指令点一点',
  };

  String _label(int i) => _labels[widget.types[i]] ?? '互动游戏';

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final n = widget.datas.length;
    if (n == 1) {
      return _InlineGameCard(
        gameType: widget.types[0],
        gameData: widget.datas[0],
      );
    }

    final picked = _picked;
    if (picked != null && picked < n) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _InlineGameCard(
              gameType: widget.types[picked], gameData: widget.datas[picked]),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: () => setState(() => _picked = null),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text('收起，还有 ${n - 1} 个游戏',
                  style: TextStyle(
                      fontSize: 11, color: palette.ink2)),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _InlineGameCard(
            gameType: widget.types[0], gameData: widget.datas[0]),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: palette.ink2.withValues(alpha: 0.045),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 1; i < n; i++)
                InkWell(
                  onTap: () => setState(() => _picked = i),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    child: Row(children: [
                      Icon(Icons.sports_esports_rounded,
                          size: 15, color: palette.pop),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_label(i),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: palette.ink)),
                      ),
                      Text('开始',
                          style: TextStyle(
                              fontSize: 11, color: palette.ink2)),
                      Icon(Icons.chevron_right_rounded,
                          size: 16,
                          color: palette.ink2.withValues(alpha: 0.7)),
                    ]),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// 跳动圆点动画组件（用于打字指示器）
class _SimpleDot extends StatelessWidget {
  final double size;
  const _SimpleDot({this.size = 8});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppTheme.primaryColor,
        shape: BoxShape.circle,
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 会话抽屉覆盖层 — 用 Overlay 替代 Stack，避免 Web 端渲染问题
// ═══════════════════════════════════════════════════════════════════════════

class _SessionDrawerOverlay extends StatelessWidget {
  final VoidCallback onClose;

  const _SessionDrawerOverlay({required this.onClose});

  @override
  Widget build(BuildContext context) {
    // OverlayEntry 挂在根 Overlay 上，不在 Navigator/页面的 Material 树里，
    // 而 IconButton / RefreshIndicator / InkWell 都需要 Material 祖先渲染墨水
    // 效果，缺了会抛 "No Material widget found"。
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          // 半透明背景
          Positioned.fill(
            child: GestureDetector(
              onTap: onClose,
              child: Container(color: Colors.black26),
            ),
          ),
          // 抽屉面板
          Positioned(
            top: 0,
            bottom: 0,
            left: 0,
            child: Consumer<ChatSessionProvider>(
              builder: (ctx, provider, _) => _SessionDrawer(
              activeSession: provider.activeSession,
              sessions: provider.sessions,
              loadingSessions: provider.loadingSessions,
              onCreateNew: () async {
                await provider.createNewSession();
                onClose();
              },
              onSelectSession: (session) async {
                await provider.switchToSession(session);
              },
              onClose: onClose,
            ),
          ),
        ),
        ],
      ),
    );
  }
}
