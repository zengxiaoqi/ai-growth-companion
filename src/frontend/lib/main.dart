import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'services/storage_service.dart';
import 'services/api_service.dart';
import 'services/ai_service.dart';
import 'providers/user_provider.dart';
import 'providers/learning_provider.dart';
import 'providers/content_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // 初始化本地存储
  final prefs = await SharedPreferences.getInstance();
  final storageService = StorageService(prefs);
  
  // 初始化 API 服务
  final apiService = ApiService();
  
  // 初始化 AI 服务
  final aiService = AiService(apiService);
  
  runApp(
    MultiProvider(
      providers: [
        Provider<StorageService>.value(value: storageService),
        Provider<ApiService>.value(value: apiService),
        Provider<AiService>.value(value: aiService),
        ChangeNotifierProvider(
          create: (_) => UserProvider(storageService),
        ),
        ChangeNotifierProvider(
          create: (_) => LearningProvider(storageService),
        ),
        ChangeNotifierProvider(
          create: (_) => ContentProvider(),
        ),
      ],
      child: const LingxiApp(),
    ),
  );
}