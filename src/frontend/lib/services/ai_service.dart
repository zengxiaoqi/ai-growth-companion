import 'api_service.dart';

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
  
  // 发送消息到 AI
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
      print('AI chat error: $e');
      return '抱歉，我现在有点累了，让我们休息一下再来聊天吧~';
    }
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
      print('Generate suggestion error: $e');
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
      print('Generate story error: $e');
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
      print('Evaluate learning error: $e');
      return {
        'score': 80,
        'feedback': '你做得很好！',
      };
    }
  }
}