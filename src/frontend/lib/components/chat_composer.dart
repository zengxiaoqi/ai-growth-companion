// 对话页输入区组件
//
// 设计稿：docs/ai-chat-redesign-v3.html（标准版）、docs/ai-chat-lowage-v3.html（低龄版）
//
// 与原实现的差别：功能不再是输入框旁边一排各自独立的圆钮，
// 而是收进一个圆角胶囊 —— 上行写字，下行放＋/模式 chip/话筒/发送；
// 「往对话里加东西」的动作收进胶囊上方弹出的工具面板。
//
// 两个组件都只管画，状态由 [AIChatScreen] 持有：
//   - [ChatComposer]     标准版（含家长端）
//   - [KidChatComposer]  3–4 岁低龄版（大话筒，无 chip，面板只两格）

import 'package:flutter/material.dart';

import '../theme/child_theme.dart';

// ─── 工具面板 ────────────────────────────────────────────────────────────────

/// 工具面板的一格。
class ChatToolItem {
  const ChatToolItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  /// 强调格（英语陪练 / 拍照），用 pop 淡底区分。
  final bool accent;
}

/// 面板排布：标准版 4 列方格，低龄版整行两格。
enum ChatToolStyle { grid, rows }

class ChatToolPanel extends StatelessWidget {
  const ChatToolPanel({
    super.key,
    required this.palette,
    required this.title,
    required this.items,
    this.style = ChatToolStyle.grid,
  });

  final ChildThemePalette palette;
  final String title;
  final List<ChatToolItem> items;
  final ChatToolStyle style;

  @override
  Widget build(BuildContext context) {
    final isGrid = style == ChatToolStyle.grid;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: EdgeInsets.fromLTRB(12, 13, 12, isGrid ? 12 : 13),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(isGrid ? 24 : 26),
        border: palette.isCartoon
            ? Border.all(color: palette.edge, width: palette.borderW)
            : null,
        boxShadow: [
          BoxShadow(
              color: palette.pop.withValues(alpha: 0.16),
              blurRadius: 30,
              offset: const Offset(0, 16)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 11),
            child: Text(
              title,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .6,
                  color: palette.ink2.withValues(alpha: 0.8)),
            ),
          ),
          if (isGrid)
            Row(
              children: [
                for (final item in items)
                  Expanded(child: _GridTile(palette: palette, item: item)),
              ],
            )
          else
            Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0) const SizedBox(height: 9),
                  _RowTile(palette: palette, item: items[i]),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

/// 方格：46px 图标块 + 9.5px 标签。
class _GridTile extends StatelessWidget {
  const _GridTile({required this.palette, required this.item});

  final ChildThemePalette palette;
  final ChatToolItem item;

  @override
  Widget build(BuildContext context) {
    final bg = item.accent
        ? palette.pop.withValues(alpha: 0.14)
        : palette.soft;
    final fg = item.accent ? palette.pop : palette.ink;
    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                    color: item.accent
                        ? palette.pop.withValues(alpha: 0.45)
                        : palette.edge.withValues(alpha: 0.85),
                    width: palette.isCartoon ? 2 : 1.4),
              ),
              child: Icon(item.icon, size: 21, color: fg),
            ),
            const SizedBox(height: 6),
            Text(
              item.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  color: palette.ink2),
            ),
          ],
        ),
      ),
    );
  }
}

/// 整行格（低龄版）：56px 高，图标 + 15px 大字。
class _RowTile extends StatelessWidget {
  const _RowTile({required this.palette, required this.item});

  final ChildThemePalette palette;
  final ChatToolItem item;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: palette.soft,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: palette.edge.withValues(alpha: 0.9),
              width: palette.isCartoon ? 2 : 1.4),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: item.accent
                    ? palette.pop.withValues(alpha: 0.16)
                    : palette.card,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(item.icon,
                  size: 20, color: item.accent ? palette.pop : palette.ink),
            ),
            const SizedBox(width: 10),
            Text(item.label,
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: palette.ink)),
          ],
        ),
      ),
    );
  }
}

// ─── 标准版输入胶囊 ──────────────────────────────────────────────────────────

class ChatComposer extends StatelessWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.palette,
    required this.hint,
    required this.mic,
    required this.onSend,
    required this.onToggleTools,
    required this.onToggleEnglish,
    required this.toolsOpen,
    required this.isEnglishMode,
    this.isLoading = false,
    this.fontSize = 14.5,
    this.canSend = true,
  });

  final TextEditingController controller;
  final ChildThemePalette palette;
  final String hint;

  /// 由页面注入的 [SpeechInputWidget]，统一由屏幕层处理语言与回调。
  final Widget mic;

  final VoidCallback onSend;
  final VoidCallback onToggleTools;
  final VoidCallback onToggleEnglish;
  final bool toolsOpen;
  final bool isEnglishMode;
  final bool isLoading;

  /// 正文与输入框字号：低龄档放大到 17。
  final double fontSize;

  /// 家长端只读等场景可关闭输入。
  final bool canSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 9, 8),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(26),
        border: palette.isCartoon
            ? Border.all(color: palette.edge, width: palette.borderW)
            : null,
        boxShadow: [
          BoxShadow(
              color: palette.pop.withValues(alpha: 0.13),
              blurRadius: 26,
              offset: const Offset(0, 10)),
          BoxShadow(
              color: palette.ink2.withValues(alpha: 0.05),
              blurRadius: 3,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 2, 6, 4),
            child: TextField(
              controller: controller,
              enabled: canSend,
              maxLines: 4,
              minLines: 1,
              cursorColor: palette.pop,
              style: TextStyle(
                  fontSize: fontSize, height: 1.45, color: palette.ink),
              decoration: InputDecoration(
                isDense: true,
                hintText: hint,
                hintStyle: TextStyle(
                    fontSize: fontSize,
                    color: palette.ink2.withValues(alpha: 0.55)),
                // 主题里带 focusedBorder，不逐个置空的话聚焦时会冒出一圈描边
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              onTap: () {
                if (toolsOpen) onToggleTools();
              },
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              // ＋ 是唯一的功能入口，展开时旋转成 ×
              _RoundButton(
                palette: palette,
                onTap: isEnglishMode && isLoading ? null : onToggleTools,
                filled: toolsOpen,
                child: AnimatedRotation(
                  duration: const Duration(milliseconds: 180),
                  turns: toolsOpen ? 0.125 : 0,
                  child: Icon(Icons.add_rounded,
                      size: 20, color: palette.ink),
                ),
              ),
              const SizedBox(width: 7),
              _ModeChip(
                palette: palette,
                label: isEnglishMode ? '英语陪练中' : '英语陪练',
                on: isEnglishMode,
                onTap: onToggleEnglish,
              ),
              const Spacer(),
              mic,
              const SizedBox(width: 6),
              _SendButton(
                palette: palette,
                loading: isLoading,
                controller: controller,
                onTap: onSend,
                enabled: canSend,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── 低龄版输入胶囊 ──────────────────────────────────────────────────────────

class KidChatComposer extends StatelessWidget {
  const KidChatComposer({
    super.key,
    required this.controller,
    required this.palette,
    required this.mic,
    required this.onSend,
    required this.onToggleTools,
    required this.onSwitchToText,
    required this.onSwitchToVoice,
    required this.onPickAlbum,
    required this.toolsOpen,
    required this.textMode,
    required this.listening,
    this.isLoading = false,
  });

  final TextEditingController controller;
  final ChildThemePalette palette;
  final Widget mic;
  final VoidCallback onSend;
  final VoidCallback onToggleTools;
  final VoidCallback onSwitchToText;
  final VoidCallback onSwitchToVoice;
  final VoidCallback onPickAlbum;
  final bool toolsOpen;

  /// true = 键盘态（家长帮忙打字）；false = 大话筒语音态。
  final bool textMode;
  final bool listening;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(10, textMode ? 10 : 9, 10, 9),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(textMode ? 28 : 34),
        border: palette.isCartoon
            ? Border.all(color: palette.edge, width: palette.borderW)
            : null,
        boxShadow: [
          BoxShadow(
              color: palette.pop.withValues(alpha: 0.13),
              blurRadius: 24,
              offset: const Offset(0, 10)),
          BoxShadow(
              color: palette.ink2.withValues(alpha: 0.06),
              blurRadius: 3,
              offset: const Offset(0, 3)),
        ],
      ),
      child: textMode ? _buildTextMode() : _buildVoiceMode(),
    );
  }

  /// 语音态：相机 / 64px 大话筒 / 键盘，三者对称居中。
  /// 入口画相机而不是 ＋：3–4 岁不认识「加号代表更多」，所见即所得。
  Widget _buildVoiceMode() {
    return Row(
      children: [
        _KidBtn(
          palette: palette,
          size: 48,
          icon: Icons.photo_camera_rounded,
          active: toolsOpen,
          onTap: onToggleTools,
        ),
        const Spacer(),
        mic,
        const Spacer(),
        _KidBtn(
          palette: palette,
          size: 48,
          icon: Icons.keyboard_alt_rounded,
          onTap: onSwitchToText,
        ),
      ],
    );
  }

  /// 键盘态：上行大字输入，下行相册 / 话筒 / 发送。
  Widget _buildTextMode() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 2, 8, 8),
          child: TextField(
            controller: controller,
            maxLines: 3,
            minLines: 1,
            autofocus: true,
            cursorColor: palette.pop,
            style: TextStyle(
                fontSize: 19, height: 1.4, color: palette.ink),
            decoration: InputDecoration(
              isDense: true,
              hintText: '想让爸爸妈妈帮你打字也可以～',
              hintStyle: TextStyle(
                  fontSize: 17, color: palette.ink2.withValues(alpha: 0.55)),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
            onSubmitted: (_) => onSend(),
          ),
        ),
        Row(
          children: [
            _KidBtn(
              palette: palette,
              size: 44,
              icon: Icons.photo_library_rounded,
              onTap: onPickAlbum,
            ),
            const Spacer(),
            _KidBtn(
              palette: palette,
              size: 44,
              icon: Icons.mic_rounded,
              onTap: onSwitchToVoice,
            ),
            const SizedBox(width: 8),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) {
                final ready = value.text.trim().isNotEmpty && !isLoading;
                return Opacity(
                  opacity: ready ? 1 : 0.45,
                  child: GestureDetector(
                    onTap: ready ? onSend : null,
                    child: Container(
                      height: 56,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      decoration: BoxDecoration(
                        color: palette.cta,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: palette.edge, width: 2),
                        boxShadow: const [
                          BoxShadow(
                              color: Color(0x334A2A46),
                              blurRadius: 0,
                              offset: Offset(0, 3)),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('发送',
                              style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: palette.ctaInk)),
                          const SizedBox(width: 6),
                          Icon(Icons.arrow_upward_rounded,
                              size: 20, color: palette.ctaInk),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

/// 低龄版圆钮：48 / 44px，soft 底 + 粗描边，按下时填充 pop。
class _KidBtn extends StatelessWidget {
  const _KidBtn({
    required this.palette,
    required this.size,
    required this.icon,
    required this.onTap,
    this.active = false,
  });

  final ChildThemePalette palette;
  final double size;
  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: active ? palette.pop : palette.soft,
          shape: BoxShape.circle,
          border: Border.all(
              color: palette.edge, width: palette.isCartoon ? 2.5 : 1.6),
        ),
        child: Icon(icon,
            size: size * 0.46, color: active ? palette.onPrimary : palette.ink),
      ),
    );
  }
}

// ─── 通用零件 ────────────────────────────────────────────────────────────────

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.palette,
    required this.onTap,
    required this.child,
    this.filled = false,
  });

  final ChildThemePalette palette;
  final VoidCallback? onTap;
  final Widget child;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: filled ? palette.pop.withValues(alpha: 0.16) : palette.soft,
          shape: BoxShape.circle,
          border: Border.all(
              color: palette.edge.withValues(alpha: 0.9),
              width: palette.isCartoon ? 2 : 1.6),
        ),
        child: child,
      ),
    );
  }
}

/// 「英语陪练」chip：关 = 浅底描边，开 = 填色。
class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.palette,
    required this.label,
    required this.on,
    required this.onTap,
  });

  final ChildThemePalette palette;
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        height: 26,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: on ? palette.pop : palette.soft,
          borderRadius: BorderRadius.circular(999),
          border: on
              ? null
              : Border.all(
                  color: palette.edge.withValues(alpha: 0.35), width: 1.2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.translate_rounded,
                size: 13, color: on ? palette.onPrimary : palette.ink2),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: on ? palette.onPrimary : palette.ink2),
            ),
          ],
        ),
      ),
    );
  }
}

/// 发送钮：空输入时 10% 灰底不可点，有字才点亮成 cta 实心。
class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.palette,
    required this.loading,
    required this.controller,
    required this.onTap,
    required this.enabled,
  });

  final ChildThemePalette palette;
  final bool loading;
  final TextEditingController controller;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) {
        final hasText = value.text.trim().isNotEmpty;
        final active = enabled && hasText;
        return GestureDetector(
          onTap: active && !loading ? onTap : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: loading
                  ? palette.cta.withValues(alpha: 0.5)
                  : (active
                      ? palette.cta
                      : palette.ink2.withValues(alpha: 0.10)),
              shape: BoxShape.circle,
              border: active && !loading
                  ? Border.all(
                      color: palette.edge.withValues(alpha: 0.85), width: 2)
                  : null,
              boxShadow: active && !loading
                  ? const [
                      BoxShadow(
                          color: Color(0x334A2A46),
                          blurRadius: 0,
                          offset: Offset(0, 3)),
                    ]
                  : null,
            ),
            child: loading
                ? Padding(
                    padding: const EdgeInsets.all(9),
                    child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: palette.ctaInk.withValues(alpha: 0.7)),
                  )
                : Icon(
                    Icons.arrow_upward_rounded,
                    size: 19,
                    color: active
                        ? palette.ctaInk
                        : palette.ink2.withValues(alpha: 0.45),
                  ),
          ),
        );
      },
    );
  }
}
