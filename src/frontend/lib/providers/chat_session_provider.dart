import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import '../services/api_service.dart';

// ─── 数据模型 ──────────────────────────────────────────────────────────────

/// 会话概要信息（用于会话列表展示）
class ChatSessionSummary {
  final String uuid;
  final String title;        // 会话标题，从首条用户消息提取
  final DateTime createdAt;
  final DateTime updatedAt;
  final int messageCount;

  ChatSessionSummary({
    required this.uuid,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
  });

  factory ChatSessionSummary.fromJson(Map<String, dynamic> json) {
    return ChatSessionSummary(
      uuid: json['uuid'] as String? ?? '',
      title: (json['title'] ?? _extractTitleFromFirstMessage(json)).toString().trim(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? '') ?? DateTime.now(),
      messageCount: json['messageCount'] as int? ?? 0,
    );
  }

  static String _extractTitleFromFirstMessage(Map<String, dynamic> json) {
    final firstMsg = json['firstMessage'];
    if (firstMsg is Map && firstMsg['content'] != null) {
      final text = firstMsg['content'].toString();
      if (text.length > 30) {
        return '${text.substring(0, 30)}...';
      }
      return text;
    }
    return '新对话';
  }

  /// 格式化时间显示
  String get formattedDate {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final updated = DateTime(updatedAt.year, updatedAt.month, updatedAt.day);

    if (updated == today) {
      final hour = updatedAt.hour.toString().padLeft(2, '0');
      final min = updatedAt.minute.toString().padLeft(2, '0');
      return '今天 $hour:$min';
    } else if (updated.day == today.day - 1) {
      final hour = updatedAt.hour.toString().padLeft(2, '0');
      final min = updatedAt.minute.toString().padLeft(2, '0');
      return '昨天 $hour:$min';
    }
    return '${updatedAt.month}-${updatedAt.day} ${updatedAt.hour.toString().padLeft(2, '0')}:${updatedAt.minute.toString().padLeft(2, '0')}';
  }
}

/// 一条聊天消息（统一格式）
class ChatMessageEntry {
  final String role;       // 'user' | 'assistant'
  final String content;    // 消息内容
  final List<Map<String, dynamic>>? quizQuestions; // 内联测验（如果有）
  final String? displayText; // 用于展示的文本（不含 JSON）

  ChatMessageEntry({
    required this.role,
    required this.content,
    this.quizQuestions,
    this.displayText,
  });

  factory ChatMessageEntry.fromJson(Map<String, dynamic> json) {
    final content = json['content']?.toString() ?? '';
    final rawContent = json['rawContent']?.toString();
    return ChatMessageEntry(
      role: json['role']?.toString() ?? 'assistant',
      content: rawContent ?? content,
      displayText: rawContent ?? content,
    );
  }
}

// ─── 上下文摘要服务 ───────────────────────────────────────────────────────

/// 上下文摘要阈值配置
class SummarizationConfig {
  /// 消息数超过此值时触发自动摘要
  final int maxMessagesBeforeSummarize;
  /// 保留最近的消息数（摘要 + 原始消息）
  final int recentMessagesKeep;

  const SummarizationConfig({
    this.maxMessagesBeforeSummarize = 16, // 8轮对话 ≈ 16条
    this.recentMessagesKeep = 10,        // 保留最近 5 轮对话原文
  });
}

/// 管理对话上下文摘要的工具类
class ContextSummarizer {
  final SummarizationConfig config;

  ContextSummarizer({this.config = const SummarizationConfig()});

  /// 判断是否需要触发摘要
  bool needsSummarization(List<ChatMessageEntry> messages) {
    return messages.length >= config.maxMessagesBeforeSummarize;
  }

  /// 返回需要发送的上下文消息（摘要 + 最近的原始消息）
  ({String? summary, List<ChatMessageEntry> recent}) buildContextWindow(
    List<ChatMessageEntry> messages,
  ) {
    if (!needsSummarization(messages)) {
      return (summary: null, recent: messages.toList());
    }

    final cutoff = messages.length - config.recentMessagesKeep;
    if (cutoff <= 0) {
      return (summary: null, recent: messages.toList());
    }

    final truncatedMsgs = messages.sublist(cutoff);
    final summary = _generateSummaryText(truncatedMsgs);
    final recentMessages = messages.sublist(cutoff);
    return (summary: summary, recent: recentMessages);
  }

  /// 根据截断的消息生成摘要文本
  String _generateSummaryText(List<ChatMessageEntry> truncated) {
    final userMessages = truncated.where((m) => m.role == 'user').toList();
    final topics = <String>{};

    for (final msg in userMessages) {
      final text = msg.content.trim();
      if (text.isNotEmpty) {
        final topic = text.length > 20
            ? '${text.substring(0, 20)}...'
            : text;
        topics.add(topic);
      }
    }

    if (topics.isEmpty) return '';

    final topicList = topics.take(5).join('、');
    return '[对话摘要]\n之前的对话围绕以下话题展开：$topicList\n\n请保持连贯性继续对话。';
  }
}

// ─── 测验解析工具（与 ai_chat_screen.dart 保持一致） ─────────────────────────

/// 从消息文本中提取测验数据
(String?, List<Map<String, dynamic>>?) _parseQuizFromAIResponse(String raw) {
  try {
    final decoded = json.decode(raw);
    if (decoded is Map<String, dynamic>) {
      final qs = _extractQuestions(decoded);
      if (qs != null) {
        return (_buildDisplayText(decoded), qs);
      }
    }
  } catch (_) {}

  // 查找末尾 JSON 块
  final lastBrace = raw.lastIndexOf('{');
  final lastBracket = raw.lastIndexOf('[');
  final start = lastBrace > lastBracket ? lastBrace : lastBracket;
  if (start >= 0) {
    final candidate = raw.substring(start).trim();
    try {
      final decoded = json.decode(candidate);
      if (decoded is Map<String, dynamic>) {
        final qs = _extractQuestions(decoded);
        if (qs != null) {
          final textPart = raw.substring(0, raw.lastIndexOf(candidate)).trim();
          return (textPart.isEmpty ? null : textPart, qs);
        }
      }
    } catch (_) {}
  }

  return (raw, null);
}

List<Map<String, dynamic>>? _extractQuestions(Map<String, dynamic> decoded) {
  if (decoded['questions'] is List) {
    return _normalizeQuestions(decoded['questions'] as List);
  }
  if (decoded['data'] is Map<String, dynamic>) {
    final data = decoded['data'] as Map<String, dynamic>;
    if (data['questions'] is List) {
      return _normalizeQuestions(data['questions'] as List);
    }
  }
  return null;
}

List<Map<String, dynamic>> _normalizeQuestions(List rawQuestions) {
  return rawQuestions
      .whereType<Map>()
      .map((q) => q.map((k, v) => MapEntry(k.toString(), v)))
      .where((q) {
        final question = q['question']?.toString().trim();
        if (question == null || question.isEmpty) return false;
        final optionsRaw = q['options'];
        if (optionsRaw is! List || optionsRaw.length < 2) return false;
        return true;
      })
      .map((q) {
        final options = (q['options'] as List)
            .map((e) => e.toString().trim())
            .where((e) => e.isNotEmpty)
            .toList();
        var correctIndex = int.tryParse(
                q['correctIndex']?.toString() ?? q['correctAnswer']?.toString() ?? '') ??
            0;
        if (correctIndex < 0 || correctIndex >= options.length) {
          final oneBased = correctIndex - 1;
          correctIndex = (oneBased >= 0 && oneBased < options.length) ? oneBased : 0;
        }
        return <String, dynamic>{
          'question': q['question'].toString().trim(),
          'options': options,
          'correctIndex': correctIndex,
          'explanation': q['explanation']?.toString(),
        };
      })
      .toList();
}

String _buildDisplayText(Map<String, dynamic> decoded) {
  final topic = decoded['topic']?.toString();
  final ageGroup = decoded['ageGroup']?.toString();
  if (topic != null && topic.isNotEmpty) {
    final parts = <String>['来挑战几道$topic 题目吧！📝'];
    if (ageGroup != null && ageGroup.isNotEmpty) {
      parts.add('（适合 $ageGroup）');
    }
    final questions = decoded['questions'];
    if (questions is List && questions.any((q) => q is Map && q['explanation'] != null)) {
      parts.add('\n答完后有解析哦~');
    }
    return parts.join('');
  }
  return '来做几道题目吧！📝';
}

// ─── Provider ──────────────────────────────────────────────────────────────

/// 聊天会话 Provider — 管理会话历史、消息上下文和发送逻辑
class ChatSessionProvider extends ChangeNotifier {
  final ApiService _apiService;

  /// 当前活跃会话
  ChatSessionSummary? _activeSession;
  bool _isCreatingSession = false;

  /// 会话列表
  List<ChatSessionSummary> _sessions = [];
  bool _loadingSessions = false;
  int _sessionPage = 1;
  bool _hasMoreSessions = true;

  /// 是否正在加载消息
  bool _isLoadingMessages = false;

  /// 本地缓存的消息（供 UI 快速渲染）
  final List<ChatMessageEntry> _localMessages = [];

  /// 子ID（由外部调用者设置）
  int? _childId;

  // Getters
  ChatSessionSummary? get activeSession => _activeSession;
  bool get isCreatingSession => _isCreatingSession;
  List<ChatSessionSummary> get sessions => _sessions;
  bool get loadingSessions => _loadingSessions;
  bool get hasMoreSessions => _hasMoreSessions;
  bool get isLoadingMessages => _isLoadingMessages;
  List<ChatMessageEntry> get localMessages => _localMessages;
  int? get childId => _childId;

  // 上下文摘要器
  final ContextSummarizer _summarizer = ContextSummarizer();

  ChatSessionProvider(this._apiService);

  /// 设置子 ID（必须在获取会话之前调用）
  void setChildId(int childId) {
    _childId = childId;
  }

  // ─── 会话管理 ──────────────────────────────────────────────────────

  Future<void> loadSessions({int page = 1}) async {
    if (_childId == null) return;

    _loadingSessions = true;
    notifyListeners();

    try {
      final rawSessions = await _apiService.getAIChatSessions(_childId!);
      final loaded = rawSessions
          .whereType<Map<String, dynamic>>()
          .map((json) => ChatSessionSummary.fromJson(json))
          .where((s) => s.uuid.isNotEmpty)
          .toList();

      if (page == 1) {
        _sessions = loaded;
      } else {
        _sessions.addAll(loaded);
      }

      _hasMoreSessions = loaded.length >= 10;
      _sessionPage = page;
    } catch (e) {
      debugPrint('⚠️ 加载会话列表失败: $e');
    } finally {
      _loadingSessions = false;
      notifyListeners();
    }
  }

  Future<void> loadMoreSessions() async {
    if (!_hasMoreSessions || _loadingSessions) return;
    await loadSessions(page: _sessionPage + 1);
  }

  /// 开始创建新会话（清空本地状态）
  Future<void> createNewSession() async {
    _isCreatingSession = true;
    notifyListeners();
    _clearLocalMessages();
    _activeSession = null;
    _isCreatingSession = false;
    notifyListeners();
  }

  /// 切换到已有会话
  Future<void> switchToSession(ChatSessionSummary session) async {
    if (_activeSession?.uuid == session.uuid) return;

    _activeSession = session;
    _isLoadingMessages = true;
    _clearLocalMessages();
    notifyListeners();

    await _loadSessionMessages(session.uuid);
  }

  /// 删除指定会话
  Future<void> deleteSession(String uuid) async {
    _sessions.removeWhere((s) => s.uuid == uuid);
    if (_activeSession?.uuid == uuid) {
      _activeSession = null;
      _clearLocalMessages();
    }
    notifyListeners();
  }

  // ─── 消息加载 ──────────────────────────────────────────────────────

  Future<void> _loadSessionMessages(String sessionId) async {
    try {
      final rawMessages = await _apiService.getAIChatMessages(sessionId as int);
      final messages = rawMessages
          .whereType<Map<String, dynamic>>()
          .where((m) => m['role'] != null)
          .map((json) => ChatMessageEntry.fromJson(json))
          .toList();

      _localMessages.clear();
      if (messages.isNotEmpty) {
        _localMessages.addAll(messages);
      }
    } catch (e) {
      debugPrint('⚠️ 加载会话消息失败: $e');
      _localMessages.add(ChatMessageEntry(
        role: 'assistant',
        content: '你好呀！我是小犀 🦄\n有什么想聊的吗？',
      ));
    } finally {
      _isLoadingMessages = false;
      notifyListeners();
    }
  }

  /// 重置为默认开场白
  void resetGreeting() {
    _activeSession = null;
    _clearLocalMessages();
    _localMessages.add(ChatMessageEntry(
      role: 'assistant',
      content: '你好呀！我是小犀 🦄\n有什么想聊的吗？',
    ));
    notifyListeners();
  }

  void _clearLocalMessages() {
    _localMessages.clear();
  }

  // ─── 消息发送 ──────────────────────────────────────────────────────

  /// 发送消息（支持上下文摘要 + 会话持久化）
  ///
  /// [onAnswered] 可选回调，在检测到测验答案时通知
  /// 返回助手消息在 [_localMessages] 中的索引
  Future<int> sendMessage(String text, {void Function(int qIdx, int sel)? onAnswered}) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return -1;

    final targetSession = _activeSession;

    // 添加用户消息到本地缓存
    _localMessages.add(ChatMessageEntry(role: 'user', content: trimmed));
    notifyListeners();

    try {
      Map<String, dynamic>? response;
      if (targetSession != null) {
        response = await _apiService.sendAIChatMessage(
          trimmed,
          childId: _childId,
          sessionId: int.tryParse(targetSession.uuid),
        );
      } else {
        response = await _apiService.sendAIChatMessage(trimmed, childId: _childId);
      }

      final reply = response?['reply'] as String? ??
          response?['content'] as String? ??
          '抱歉，我暂时无法回复 ~';

      // 解析测验数据
      final (displayText, quizQuestions) = _parseQuizFromAIResponse(reply);
      final assistantMsg = ChatMessageEntry(
        role: 'assistant',
        content: reply,
        quizQuestions: quizQuestions,
        displayText: displayText ?? reply,
      );

      _localMessages.add(assistantMsg);

      // 更新会话信息
      final sessionId = response?['sessionId'] as String?;
      final suggestions = response?['suggestions'] as List<dynamic>?;
      if (sessionId != null && targetSession == null) {
        // 后端创建了新的会话
        _activeSession = ChatSessionSummary(
          uuid: sessionId,
          title: trimmed.length > 30 ? '${trimmed.substring(0, 30)}...' : trimmed,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        _sessions.insert(0, _activeSession!);
      } else if (sessionId != null && _activeSession != null) {
        _activeSession = ChatSessionSummary(
          uuid: _activeSession!.uuid,
          title: _activeSession!.title,
          createdAt: _activeSession!.createdAt,
          updatedAt: DateTime.now(),
          messageCount: _localMessages.length ~/ 2,
        );
        // 更新会话列表中的位置
        final idx = _sessions.indexWhere((s) => s.uuid == sessionId);
        if (idx >= 0) {
          _sessions[idx] = _activeSession!;
        }
      }

      notifyListeners();
      return _localMessages.length - 1;
    } catch (e) {
      debugPrint('⚠️ AI chat send error: $e');
      _localMessages.add(ChatMessageEntry(
        role: 'assistant',
        content: '哎呀，网络不太好，再试一次吧 🌐',
      ));
      notifyListeners();
      return _localMessages.length - 1;
    }
  }

  @override
  void dispose() {
    super.dispose();
  }
}
