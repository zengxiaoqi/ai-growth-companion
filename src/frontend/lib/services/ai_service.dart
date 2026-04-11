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
      // 构建上下文提示
      final systemPrompt = _buildSystemPrompt();
      
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
  
  // 构建系统提示词
  String _buildSystemPrompt() {
    final age = _userContext?['age'] ?? 5;
    final interests = _userContext?['interests'] ?? '学习新知识';
    
    String agePrompt;
    if (age < 4) {
      agePrompt = '用户是3-4岁的孩子，语言要非常简单，使用简短的句子，多用比喻和拟人';
    } else if (age < 6) {
      agePrompt = '用户是5-6岁的孩子，语言要简单但可以有一点点复杂的内容';
    } else {
      agePrompt = '用户是6岁以上的孩子，可以接受更丰富的内容';
    }
    
    return '''
你是一个friendly的AI小伙伴，名字叫"小犀"，专门陪伴3-6岁的孩子成长。

$agePrompt

特点：
- 亲切、温柔、有耐心
- 喜欢鼓励孩子
- 回答要简短有趣
- 可以适当使用emoji
- 引导孩子学习，但不要强迫

兴趣：$interests

规则：
- 不给负面评价
- 不提到年龄差距
- 保持积极乐观
- 可以讲故事、做游戏

开始吧！
''';
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