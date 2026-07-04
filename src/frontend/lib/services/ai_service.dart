import '../utils/app_logger.dart';
import 'api_service.dart';

final _log = AppLogger('AiService');

// ─── SSE 流式事件模型 ─────────────────────────────────────────────────

/// AI 对话流式事件类型
enum AiStreamEventType {
  /// 文本片段（逐字输出）
  token,
  /// 思考内容（AI 内部推理过程）
  thinking,
  /// 互动活动（测验、游戏等）
  activity,
  /// 工具调用开始
  toolStart,
  /// 对话完成
  done,
  /// 错误
  error,
}

/// 单条 SSE 流式事件
class AiStreamEvent {
  final AiStreamEventType type;
  final String? content;
  final Map<String, dynamic>? data;

  const AiStreamEvent({required this.type, this.content, this.data});

  /// 便捷构造
  factory AiStreamEvent.token(String chunk) =>
      AiStreamEvent(type: AiStreamEventType.token, content: chunk);
  factory AiStreamEvent.thinking(String chunk) =>
      AiStreamEvent(type: AiStreamEventType.thinking, content: chunk);
  factory AiStreamEvent.activity(Map<String, dynamic> data) =>
      AiStreamEvent(type: AiStreamEventType.activity, data: data);
  factory AiStreamEvent.done(Map<String, dynamic> data) =>
      AiStreamEvent(type: AiStreamEventType.done, data: data);
  factory AiStreamEvent.error(String message) =>
      AiStreamEvent(type: AiStreamEventType.error, content: message);
}

class AiService {
  final ApiService _apiService;
  
  // 对话上下文
  List<Map<String, String>> _messages = [];
  
  // 用户信息
  Map<String, dynamic>? _userContext;
  
  AiService(this._apiService);
  
  // 设置用户上下文（年龄、兴趣等）
  void setUserContext({
    required int age,
    String? interests,
    Map<String, int>? abilities,
  }) {
    _userContext = {
      'age': age,
      'interests': interests,
      'abilities': abilities ?? {},
    };
  }
  
  // 清除对话历史
  void clearHistory() {
    _messages.clear();
  }
  
  // 发送消息到 AI（非流式，向后兼容）
  Future<String> sendMessage(String message) async {
    try {
      // 调用后端 API（后端会调用 AI 服务）
      final response = await _apiService.dio.post('/ai/chat', data: {
        'message': message,
        'context': _userContext,
        'history': _messages,
      });
      
      final aiResponse = response.data['response'] as String;
      
      // 添加到对话历史
      _messages.add({'role': 'user', 'content': message});
      _messages.add({'role': 'assistant', 'content': aiResponse});
      
      // 保持对话历史在合理长度
      if (_messages.length > 20) {
        _messages = _messages.sublist(_messages.length - 20);
      }
      
      return aiResponse;
    } catch (e) {
      _log.warning('AI chat error: $e');
      return '抱歉，我现在有点累了，让我们休息一下再来聊天吧~';
    }
  }

  /// 发送消息并获取 SSE 流式响应
  ///
  /// 返回 [AiStreamEvent] 流，事件类型包括：
  /// - [AiStreamEventType.token]: 逐字文本片段
  /// - [AiStreamEventType.thinking]: AI 思考内容
  /// - [AiStreamEventType.activity]: 互动活动数据（测验/游戏）
  /// - [AiStreamEventType.toolStart]: 工具调用开始
  /// - [AiStreamEventType.done]: 对话完成，包含 sessionId
  /// - [AiStreamEventType.error]: 错误信息
  ///
  /// [childId] 孩子 ID（可选）
  /// [sessionId] 会话 ID（可选，用于多轮对话）
  Stream<AiStreamEvent> sendMessageStream(
    String message, {
    int? childId,
    String? sessionId,
  }) {
    // 记录用户消息到本地历史
    _messages.add({'role': 'user', 'content': message});
    if (_messages.length > 40) {
      _messages = _messages.sublist(_messages.length - 40);
    }

    final rawStream = _apiService.sendAIChatMessageStream(
      message,
      childId: childId,
      sessionId: sessionId,
    );

    return rawStream.map((event) {
      final type = event['type'] as String?;
      switch (type) {
        case 'token':
          return AiStreamEvent.token(event['content'] as String? ?? '');
        case 'thinking':
          return AiStreamEvent.thinking(event['content'] as String? ?? '');
        case 'activity':
        case 'game_data':
          return AiStreamEvent.activity(event);
        case 'tool_start':
          return AiStreamEvent(
            type: AiStreamEventType.toolStart,
            data: event,
          );
        case 'done':
          return AiStreamEvent.done(event);
        case 'error':
          return AiStreamEvent.error(
            event['message'] as String? ?? 'AI服务暂时不可用',
          );
        default:
          // 未知事件类型，尝试作为 token 处理
          final content = event['content'] as String?;
          if (content != null && content.isNotEmpty) {
            return AiStreamEvent.token(content);
          }
          return AiStreamEvent(type: AiStreamEventType.token, content: '');
      }
    }).handleError((e) {
      _log.warning('SSE stream error: $e');
    });
  }

  // 生成学习建议
  Future<String> generateLearningSuggestion(Map<String, dynamic> abilities) async {
    try {
      final response = await _apiService.dio.post('/ai/learning-suggestion', data: {
        'abilities': abilities,
        'age': _userContext?['age'] ?? 5,
      });
      return response.data['suggestion'] as String;
    } catch (e) {
      _log.warning('Generate suggestion error: $e');
      return '今天表现很棒！明天我们继续加油~';
    }
  }
  
  // 生成个性化故事
  Future<Map<String, dynamic>?> generateStory({
    required String topic,
    required int age,
  }) async {
    try {
      final response = await _apiService.dio.post('/ai/generate-story', data: {
        'topic': topic,
        'age': age,
      });
      return response.data;
    } catch (e) {
      _log.warning('Generate story error: $e');
      return null;
    }
  }
  
  // 评估学习效果
  Future<Map<String, dynamic>> evaluateLearning({
    required int contentId,
    required List<Map<String, dynamic>> answers,
  }) async {
    try {
      final response = await _apiService.dio.post('/ai/evaluate', data: {
        'content_id': contentId,
        'answers': answers,
        'age': _userContext?['age'] ?? 5,
      });
      return response.data;
    } catch (e) {
      _log.warning('Evaluate learning error: $e');
      return {
        'score': 80,
        'feedback': '你做得很好！',
      };
    }
  }
}