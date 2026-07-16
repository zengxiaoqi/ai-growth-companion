import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
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
  String content;    // 消息内容（流式时动态更新）
  final List<Map<String, dynamic>>? quizQuestions; // 内联测验（如果有）
  String? displayText; // 用于展示的文本（不含 JSON），流式时动态更新
  bool isStreaming;  // 是否正在流式输出

  // ── 思考内容（AI 回复的思考链）──
  String? thinkingContent;   // 存储 thinking 事件的内容
  bool isThinkingExpanded;   // 控制思考区域展开/折叠

  // ── 非测验类游戏数据（matching/fill_blank/sequencing/connection/puzzle/true_false）──
  // 支持多条游戏数据（AI 可能在一次回复中生成多个游戏）
  final List<String> gameTypes;           // 游戏类型列表
  final List<Map<String, dynamic>> gameDatas; // 游戏原始数据列表

  // 兼容旧代码的单值访问器
  String? get gameType => gameTypes.isNotEmpty ? gameTypes.first : null;
  Map<String, dynamic>? get gameData => gameDatas.isNotEmpty ? gameDatas.first : null;

  ChatMessageEntry({
    required this.role,
    required this.content,
    this.quizQuestions,
    this.displayText,
    this.isStreaming = false,
    this.thinkingContent,
    this.isThinkingExpanded = false,
    List<String>? gameTypes,
    List<Map<String, dynamic>>? gameDatas,
  }) : gameTypes = gameTypes ?? const [],
       gameDatas = gameDatas ?? const [];

  factory ChatMessageEntry.fromJson(Map<String, dynamic> json) {
    final content = json['content']?.toString() ?? '';
    final rawContent = json['rawContent']?.toString();
    return ChatMessageEntry(
      role: json['role']?.toString() ?? 'assistant',
      content: rawContent ?? content,
      displayText: rawContent ?? content,
      thinkingContent: json['thinkingContent']?.toString(),
      isThinkingExpanded: json['isThinkingExpanded'] as bool? ?? false,
    );
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

/// 根据数据结构推断游戏类型（与 GameRenderer._normalizeGameType 的推断逻辑一致）
String _inferGameType(Map<String, dynamic> data) {
  if (data['pairs'] is List || (data['items'] is List && data['targets'] is List)) {
    return 'matching';
  }
  if (data['sentences'] is List) return 'fill_blank';
  if (data['connections'] is List || (data['leftItems'] is List && data['rightItems'] is List)) {
    return 'connection';
  }
  if (data['pieces'] is List || data['gridSize'] is Map) return 'puzzle';
  if (data['items'] is List) return 'sequencing';
  if (data['statements'] is List) return 'true_false';
  if (data['questions'] is List) return 'quiz';
  return 'quiz';
}

// ── 思考内容清理工具 ──────────────────────────────────────────────────────

/// 从文本中移除 `<thinking>...</thinking>` 标签对及其内容
/// 用于防止后端返回的 thinking 内容混入 displayText
String _stripThinkingFromText(String text) {
  // 移除 <thinking>...</thinking> 块
  final cleaned = text.replaceAll(RegExp(r'<thinking>.*?</thinking>', dotAll: true), '').trim();
  return cleaned;
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
      final rawMessages = await _apiService.getAIChatMessages(sessionId);
      final rawList = rawMessages
          .whereType<Map<String, dynamic>>()
          .where((m) => m['role'] != null)
          .toList();

      // Build display messages: skip 'tool' and 'system' roles, but attach
      // game data from tool messages to the nearest assistant message.
      //
      // 统一走 _InlineGameCard 路径（含"开始游戏"按钮），与实时流式路径一致。
      // 所有游戏类型（quiz/true_false/matching/fill_blank/sequencing/connection/puzzle）
      // 都存入 pendingGameTypes/pendingGameDatas，不再使用 _parseQuizFromAIResponse
      // 和 pendingQuiz（旧路径的 quiz 解析过于严格，导致大量有效 quiz 游戏数据被丢弃）。
      final List<ChatMessageEntry> messages = [];
      final List<String> pendingGameTypes = [];
      final List<Map<String, dynamic>> pendingGameDatas = [];

      for (final json in rawList) {
        final role = json['role']?.toString() ?? 'assistant';

        if (role == 'tool' || role == 'system') {
          // Try to extract game data from tool message content
          if (role == 'tool') {
            final toolName = json['toolName']?.toString() ?? '';
            final content = json['content']?.toString() ?? '';
            if ((toolName == 'generateActivity' || toolName == 'generateQuiz') && content.isNotEmpty) {
              // 跳过错误的 tool 结果
              if (content.contains('"error"')) {
                continue;
              }
              // 统一解析为 game data，不再区分 quiz vs non-quiz
              try {
                final gameMap = jsonDecode(content) as Map<String, dynamic>;
                // Determine game type from the data structure
                final gameType = gameMap['type']?.toString() ??
                    gameMap['activityType']?.toString() ??
                    _inferGameType(gameMap);
                if (gameType.isNotEmpty) {
                  pendingGameTypes.add(gameType);
                  pendingGameDatas.add(gameMap);
                }
              } catch (_) {
                // JSON parse failed, skip
              }
            }
          }
          // Don't add tool/system messages to the visible list
          continue;
        }

        final entry = ChatMessageEntry.fromJson(json);

        // If we have game data from tool messages, attach it to this
        // assistant message (the tool result comes after the assistant
        // message that triggered the tool call, but for display purposes
        // the game card should appear with the assistant's text)
        if (role == 'assistant' && pendingGameDatas.isNotEmpty) {
          // If assistant text is empty or just a placeholder, use the
          // display text from the game data
          if (entry.content.trim().isEmpty) {
            entry.content = '来玩个互动游戏吧！🎮';
          }
          entry.displayText = entry.content;
          // Re-create with game data (final fields)
          messages.add(ChatMessageEntry(
            role: 'assistant',
            content: entry.content,
            displayText: entry.displayText,
            thinkingContent: entry.thinkingContent,
            isThinkingExpanded: entry.isThinkingExpanded,
            gameTypes: pendingGameTypes,
            gameDatas: pendingGameDatas,
          ));
          pendingGameTypes.clear();
          pendingGameDatas.clear();
        } else {
          messages.add(entry);
        }
      }

      // If game data wasn't attached to any assistant message (e.g. assistant
      // text wasn't stored), create a synthetic assistant message with the game
      if (pendingGameDatas.isNotEmpty) {
        messages.add(ChatMessageEntry(
          role: 'assistant',
          content: '来玩个互动游戏吧！🎮',
          gameTypes: pendingGameTypes,
          gameDatas: pendingGameDatas,
          displayText: '来玩个互动游戏吧！🎮',
        ));
      }

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

  // ─── 消息发送（流式输出）──────────────────────────────────────

  /// 等待 Flutter 完成一帧的构建和绘制
  /// 用于确保 notifyListeners() 触发的 UI 更新在屏幕上可见后再继续
  Future<void> _waitForFramePaint() async {
    // 第一帧：build 阶段（widget tree 重建）
    await _nextFrame();
    // 第二帧：paint 阶段（光栅化到屏幕）
    // 两个帧确保 build→layout→paint→composite 全部完成
    await _nextFrame();
  }

  static Future<void> _nextFrame() {
    final completer = Completer<void>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      completer.complete();
    });
    return completer.future;
  }

  /// 发送消息（流式输出，支持实时 token 显示 + 测验渲染）
  ///
  /// [onAnswered] 可选回调，在检测到测验答案时通知
  /// 返回助手消息在 [_localMessages] 中的索引
  Future<int> sendMessage(String text, {void Function(int qIdx, int sel)? onAnswered}) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return -1;

    // 添加用户消息到本地缓存
    _localMessages.add(ChatMessageEntry(role: 'user', content: trimmed));
    notifyListeners();
    debugPrint('🔍 [ChatProvider] user message added, localMessages=${_localMessages.length}');

    // 添加一个空的 AI 消息，用于流式更新
    final aiMsg = ChatMessageEntry(
      role: 'assistant',
      content: '',
      displayText: '',
      isStreaming: true,
    );
    _localMessages.add(aiMsg);
    notifyListeners();
    debugPrint('🔍 [ChatProvider] AI placeholder added, localMessages=${_localMessages.length}');

    // 等待 UI 渲染（paint）用户消息后再开始网络请求
    // 使用 addPostFrameCallback 确保帧不仅被构建(build)还被绘制(paint)到屏幕
    // Future.delayed(50ms) 在 Flutter Web mobile Safari 上不可靠——
    // 键盘收起等操作会延迟 requestAnimationFrame，导致帧未绘制就开始网络请求
    await _waitForFramePaint();
    debugPrint('🔍 [ChatProvider] frame painted, starting SSE stream');

    final targetSession = _activeSession;
    final sessionUuid = targetSession?.uuid;

    try {
      // 优先使用流式 SSE
      final stream = _apiService.sendAIChatMessageStream(
        trimmed,
        childId: _childId,
        sessionId: sessionUuid,
      );

      String fullReply = '';
      List<Map<String, dynamic>>? quizQuestions;
      String? newSessionId;
      final List<String> pendingGameTypes = [];
      final List<Map<String, dynamic>> pendingGameDatas = [];

      debugPrint('🔍 [ChatProvider] SSE stream starting...');

      // 思考进度提示：AI 在思考中给用户视觉反馈
      int thinkingSeconds = 0;
      final thinkingMessages = [
        '🦄 正在思考...',
        '🦄 想得更仔细一些...',
        '🦄 马上就好...',
        '🦄 让我想想...',
      ];
      Timer thinkingTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
        thinkingSeconds += 3;
        if (aiMsg.isStreaming && aiMsg.displayText!.isEmpty) {
          final msgIdx = (thinkingSeconds ~/ 3 - 1) % thinkingMessages.length;
          aiMsg.displayText = thinkingMessages[msgIdx];
          notifyListeners();
          debugPrint('🔍 [ChatProvider] thinking tick: ${thinkingMessages[msgIdx]}');
        } else {
          timer.cancel();
        }
      });

      try {
      await for (final event in stream.timeout(
        const Duration(seconds: 90),
        onTimeout: (sink) {
          debugPrint('⚠️ [ChatProvider] stream timeout (90s), aborting');
          sink.add({'type': 'error', 'message': 'AI响应超时（90秒），请稍后重试~'});
          sink.close();
        },
      )) {
        final type = event['type'] as String?;

        if (type == 'token') {
          final chunk = event['content'] as String? ?? '';
          if (fullReply.isEmpty) {
            thinkingTimer.cancel();
            debugPrint('🔍 [ChatProvider] first token received: "$chunk"');
          }
          fullReply += chunk;
          aiMsg.content = fullReply;
          aiMsg.displayText = fullReply;
          notifyListeners();
        } else if (type == 'thinking') {
          // 收集思考内容（独立存储，用于可折叠显示）
          final think = event['content'] as String? ?? '';
          if (think.isNotEmpty) {
            aiMsg.thinkingContent = (aiMsg.thinkingContent ?? '') + think;
            notifyListeners();
          }
        } else if (type == 'tool_start') {
          thinkingTimer.cancel();
          final toolName = event['toolName'] as String? ?? '';
          if (toolName == 'generateActivity' || toolName == 'generateQuiz') {
            aiMsg.displayText = fullReply.isEmpty ? '🎨 正在生成互动题目...' : fullReply;
          } else {
            aiMsg.displayText = fullReply.isEmpty ? '🔍 正在查找信息...' : fullReply;
          }
          notifyListeners();
        } else if (type == 'game_data') {
          final gameDataStr = event['gameData'] as String? ?? '';
          final activityType = event['activityType'] as String? ?? '';
          if (gameDataStr.isNotEmpty) {
            // 统一走 _InlineGameCard 路径（含"开始游戏"按钮）
            // 无论 quiz 还是其他类型，都存储为 pendingGameTypes/GameDatas
            try {
              final gameMap = jsonDecode(gameDataStr) as Map<String, dynamic>;
              // 如果后端没有给出 activityType，尝试从数据结构推断
              final resolvedType = activityType.isNotEmpty
                  ? activityType
                  : _inferActivityType(gameMap);
              pendingGameTypes.add(resolvedType);
              pendingGameDatas.add(gameMap);
              if (fullReply.isEmpty) {
                final label = _gameTypeLabel(resolvedType);
                fullReply = '来玩个$label吧！🎮';
                aiMsg.content = fullReply;
                aiMsg.displayText = fullReply;
              }
            } catch (_) {
              // JSON 解析失败，降级为从文本解析 quiz
              final (dt, qs) = _parseQuizFromAIResponse(gameDataStr);
              quizQuestions = qs;
              if (dt != null && dt.isNotEmpty && fullReply.isEmpty) {
                fullReply = dt;
                aiMsg.content = fullReply;
                aiMsg.displayText = fullReply;
              }
            }
          }
          notifyListeners();
        } else if (type == 'done') {
          thinkingTimer.cancel();
          newSessionId = event['sessionId'] as String?;

          // 清理全量 reply 中可能残留的 thinking 标签（防御性处理）
          if ((aiMsg.thinkingContent?.trim().isEmpty ?? false) == false) {
            fullReply = _stripThinkingFromText(fullReply);
          }

          // 如果没有收到任何 token 但有 game_data，用 game_data 的 displayText
          if (fullReply.isEmpty && pendingGameDatas.isNotEmpty) {
            final label = _gameTypeLabel(pendingGameTypes.first);
            fullReply = '来玩个$label吧！🎮';
          }
          // 如果最终还是空的，给个兜底
          if (fullReply.isEmpty) {
            fullReply = '我暂时没法回答这个问题，换个话题试试吧~ 🌟';
          }
          break;
        } else if (type == 'error') {
          thinkingTimer.cancel();
          final msg = event['message'] as String? ?? 'AI服务暂时不可用';
          aiMsg.content = msg;
          aiMsg.displayText = msg;
          aiMsg.isStreaming = false;
          notifyListeners();
          return _localMessages.length - 1;
        }
      }
      } finally {
        thinkingTimer.cancel();
      }

      // 最终化消息
      final (displayText, parsedQuiz) = _parseQuizFromAIResponse(fullReply);
      aiMsg.content = fullReply;
      aiMsg.displayText = displayText ?? fullReply;
      // 如果流式过程中收到了 game_data 事件，使用那个 quizQuestions
      // 否则尝试从 reply 文本中解析
      final finalQuiz = quizQuestions ?? parsedQuiz;
      // 需要重建消息对象以设置 quizQuestions（final 字段）
      final finalizedMsg = ChatMessageEntry(
        role: 'assistant',
        content: fullReply,
        quizQuestions: finalQuiz,
        displayText: displayText ?? fullReply,
        isStreaming: false,
        thinkingContent: aiMsg.thinkingContent,
        isThinkingExpanded: false,
        gameTypes: pendingGameTypes,
        gameDatas: pendingGameDatas,
      );
      _localMessages[_localMessages.length - 1] = finalizedMsg;

      // 更新会话信息
      if (newSessionId != null && newSessionId.isNotEmpty) {
        if (targetSession == null) {
          _activeSession = ChatSessionSummary(
            uuid: newSessionId,
            title: trimmed.length > 30 ? '${trimmed.substring(0, 30)}...' : trimmed,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          _sessions.insert(0, _activeSession!);
        } else {
          _activeSession = ChatSessionSummary(
            uuid: _activeSession!.uuid,
            title: _activeSession!.title,
            createdAt: _activeSession!.createdAt,
            updatedAt: DateTime.now(),
            messageCount: _localMessages.length ~/ 2,
          );
          final idx = _sessions.indexWhere((s) => s.uuid == newSessionId);
          if (idx >= 0) {
            _sessions[idx] = _activeSession!;
          }
        }
      }

      notifyListeners();
      return _localMessages.length - 1;
    } catch (e) {
      // 回退到非流式
      try {
        Map<String, dynamic>? response;
        if (targetSession != null) {
          response = await _apiService.sendAIChatMessage(
            trimmed,
            childId: _childId,
            sessionId: targetSession.uuid,
          );
        } else {
          response = await _apiService.sendAIChatMessage(trimmed, childId: _childId);
        }

        final reply = response?['reply'] as String? ??
            response?['content'] as String? ??
            '抱歉，我暂时无法回复 ~';

        final (displayText, quizQuestions) = _parseQuizFromAIResponse(reply);
        List<Map<String, dynamic>>? finalQuiz = quizQuestions;
        final List<String> pendingGameTypes = [];
        final List<Map<String, dynamic>> pendingGameDatas = [];

        // 也检查 gameData 字段
        final gameData = response?['gameData'];
        if (gameData != null) {
          final gameDataStr = gameData is String ? gameData : jsonEncode(gameData);
          try {
            final gameMap = jsonDecode(gameDataStr) as Map<String, dynamic>;
            final gameType = gameMap['activityType']?.toString() ??
                gameMap['type']?.toString() ??
                _inferActivityType(gameMap);
            pendingGameTypes.add(gameType);
            pendingGameDatas.add(gameMap);
          } catch (_) {
            // JSON 解析失败，降级为文本 quiz 解析
            final (gdt, gqs) = _parseQuizFromAIResponse(gameDataStr);
            if (gqs != null) finalQuiz = gqs;
            final finalText = (displayText ?? '').isEmpty ? (gdt ?? reply) : displayText!;
            final finalizedMsg = ChatMessageEntry(
              role: 'assistant',
              content: reply,
              quizQuestions: finalQuiz,
              displayText: finalText,
              isStreaming: false,
              thinkingContent: _stripThinkingFromText(reply),
              isThinkingExpanded: false,
            );
            _localMessages[_localMessages.length - 1] = finalizedMsg;
            final sessionId = response?['sessionId'] as String?;
            if (sessionId != null && targetSession == null) {
              _activeSession = ChatSessionSummary(
                uuid: sessionId,
                title: trimmed.length > 30 ? '${trimmed.substring(0, 30)}...' : trimmed,
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
              );
              _sessions.insert(0, _activeSession!);
            }
            notifyListeners();
            return _localMessages.length - 1;
          }
        }

        final finalizedMsg = ChatMessageEntry(
          role: 'assistant',
          content: reply,
          quizQuestions: finalQuiz,
          displayText: displayText ?? reply,
          isStreaming: false,
          thinkingContent: _stripThinkingFromText(reply),
          isThinkingExpanded: false,
          gameTypes: pendingGameTypes,
          gameDatas: pendingGameDatas,
        );
        _localMessages[_localMessages.length - 1] = finalizedMsg;

        final sessionId = response?['sessionId'] as String?;
        if (sessionId != null && targetSession == null) {
          _activeSession = ChatSessionSummary(
            uuid: sessionId,
            title: trimmed.length > 30 ? '${trimmed.substring(0, 30)}...' : trimmed,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          _sessions.insert(0, _activeSession!);
        }

        notifyListeners();
        return _localMessages.length - 1;
      } catch (e2) {
        _localMessages[_localMessages.length - 1] = ChatMessageEntry(
          role: 'assistant',
          content: '哎呀，网络不太好，再试一次吧 🌐',
          isStreaming: false,
        );
        notifyListeners();
        return _localMessages.length - 1;
      }
    }
  }

  /// 从游戏数据结构推断活动类型
  String _inferActivityType(Map<String, dynamic> data) {
    // 显式类型字段
    final type = data['type']?.toString().trim() ??
        data['activityType']?.toString().trim();
    if (type != null && type.isNotEmpty) return type;

    // 根据数据结构推断
    if (data['questions'] is List) return 'quiz';
    if (data['statements'] is List) return 'true_false';
    if (data['sentences'] is List) return 'fill_blank';
    if (data['pairs'] is List) return 'matching';
    if (data['connections'] is List ||
        (data['leftItems'] is List && data['rightItems'] is List)) {
      return 'connection';
    }
    if (data['pieces'] is List || data['gridSize'] is Map) return 'puzzle';
    if (data['items'] is List) return 'sequencing';

    return 'quiz'; // 默认
  }

  /// 游戏类型中文名
  String _gameTypeLabel(String type) {
    const labels = {
      'quiz': '选择题',
      'true_false': '判断题',
      'matching': '配对游戏',
      'fill_blank': '填空游戏',
      'sequencing': '排序游戏',
      'connection': '连线游戏',
      'puzzle': '拼图游戏',
    };
    return labels[type] ?? '互动游戏';
  }

}
