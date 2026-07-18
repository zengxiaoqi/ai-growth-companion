import 'package:flutter/material.dart';

import '../utils/app_logger.dart';
import '../services/public_api_service.dart';

final _log = AppLogger('FactCard');

/// 今日趣闻卡片
///
/// 从 Useless Facts API 拉取每日/随机趣闻，展示在儿童首页。
/// 英文趣闻通过后端 translate 端点（MyMemory）自动翻译为中文。
class FactCard extends StatefulWidget {
  const FactCard({super.key});

  @override
  State<FactCard> createState() => _FactCardState();
}

class _FactCardState extends State<FactCard> {
  String? _factText;
  String? _translation;
  bool _loading = false;
  bool _error = false;
  bool _showOriginal = false;
  bool _translating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
      _translation = null;
      _showOriginal = false;
    });
    try {
      final fact = await PublicApiService.instance.getTodayFact();
      if (!mounted) return;
      if (fact == null) {
        setState(() {
          _error = true;
          _loading = false;
        });
        return;
      }
      final text = fact['text'] as String? ?? '';
      setState(() {
        _factText = text;
        _loading = false;
      });
      // 自动翻译为中文
      _translate(text);
    } catch (e) {
      _log.warning('load failed: $e');
      if (!mounted) return;
      setState(() {
        _error = true;
        _loading = false;
      });
    }
  }

  Future<void> _translate(String text) async {
    setState(() => _translating = true);
    try {
      final result = await PublicApiService.instance.translate(text);
      if (!mounted) return;
      if (result != null) {
        final responseData = result['responseData'] as Map?;
        final translated = responseData?['translatedText'] as String?;
        if (translated != null && translated.isNotEmpty) {
          setState(() {
            _translation = translated;
            _translating = false;
          });
          return;
        }
      }
      setState(() => _translating = false);
    } catch (e) {
      _log.warning('translate failed: $e');
      if (!mounted) return;
      setState(() => _translating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE3F2FD), Color(0xFFBBDEFB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.blue.withValues(alpha: 0.15),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题行
            Row(
              children: [
                const Text('🧠', style: TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '今日冷知识',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0D47A1),
                        ),
                      ),
                      Text(
                        '每天一个小知识',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF1976D2),
                        ),
                      ),
                    ],
                  ),
                ),
                if (!_loading)
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF0D47A1)),
                    onPressed: _load,
                    tooltip: '换一个',
                  ),
              ],
            ),
            const SizedBox(height: 16),
            _buildContent(),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    if (_loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 16),
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              color: Color(0xFF1976D2),
              strokeWidth: 2.5,
            ),
          ),
        ),
      );
    }

    if (_error || _factText == null) {
      return Column(
        children: [
          const Text('📚', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 8),
          const Text(
            '暂时无法获取趣闻',
            style: TextStyle(color: Color(0xFF1976D2)),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _load,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1976D2),
              foregroundColor: Colors.white,
            ),
            child: const Text('重试'),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 中文翻译（主展示）
        if (_translating && _translation == null)
          const Row(
            children: [
              SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF1976D2),
                ),
              ),
              SizedBox(width: 8),
              Text(
                '正在翻译...',
                style: TextStyle(fontSize: 12, color: Color(0xFF1976D2)),
              ),
            ],
          ),
        if (_translation != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              _translation!,
              style: const TextStyle(
                fontSize: 15,
                height: 1.6,
                color: Color(0xFF0D1B2A),
              ),
            ),
          ),
        // 切换原文
        if (_factText != null) ...[
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => setState(() => _showOriginal = !_showOriginal),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _showOriginal ? '收起原文' : '查看英文原文',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF1976D2),
                      decoration: TextDecoration.underline,
                    ),
                  ),
                  Icon(
                    _showOriginal
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: const Color(0xFF1976D2),
                  ),
                ],
              ),
            ),
          ),
          if (_showOriginal)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: const Color(0xFF90CAF9).withValues(alpha: 0.4),
                ),
              ),
              child: Text(
                _factText!,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.5,
                  color: Colors.grey.shade700,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ],
    );
  }
}
