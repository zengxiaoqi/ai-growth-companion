// 仅用于本地视觉验收的预览入口，不参与正式打包。
//
//   flutter build web -t lib/preview_chat_main.dart --output build/preview
//   然后打开 build/preview/index.html?skin=forest（candy / forest / space / honey）
//
// 它绕开登录与后端：注入一个不拉会话的 ChatSessionProvider 子类，
// 直接塞几条假消息，用真实页面 + 真实皮肤渲染，截图即是真机观感。

import 'dart:html' as html;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'providers/chat_session_provider.dart';
import 'providers/content_provider.dart';
import 'providers/learning_provider.dart';
import 'providers/reward_provider.dart';
import 'providers/user_provider.dart';
import 'providers/video_download_provider.dart';
import 'screens/ai_chat_screen.dart';
import 'services/ai_service.dart';
import 'services/api_service.dart';
import 'services/storage_service.dart';
import 'components/chat_composer.dart';
import 'theme/child_theme.dart';

class PreviewChatProvider extends ChatSessionProvider {
  PreviewChatProvider(ApiService api) : super(api) {
    _seed();
  }

  // 预览不碰网络，也不让首屏把种子消息清掉
  @override
  Future<void> loadSessions({int page = 1}) async {}

  @override
  Future<void> loadMoreSessions() async {}

  @override
  void resetGreeting() {}

  void _seed() {
    localMessages.addAll([
      ChatMessageEntry(
        role: 'assistant',
        content: '你好呀！我是小犀，有什么想聊的吗？',
        displayText: '你好呀！我是小犀，有什么想聊的吗？',
      ),
      ChatMessageEntry(role: 'user', content: '唱首小星星给我听'),
      ChatMessageEntry(
        role: 'assistant',
        content: '好呀，全部播放给你听～',
        displayText: '好呀，全部播放给你听～ 想跟着一起唱就把话筒点上 🎤',
        thinkingContent: '孩子想听《小星星》。先给一句话回应，再放音乐；'
            '不要一次给太多按钮，低龄孩子会不知道先点哪个。',
      ),
      ChatMessageEntry(role: 'user', content: '再讲一个笑话'),
      ChatMessageEntry(
        role: 'assistant',
        content: '',
        displayText: '',
        isStreaming: true,
      ),
    ]);
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final storage = StorageService(prefs);
  final api = ApiService();

  final skin = Uri.base.queryParameters['skin'] ?? 'forest';
  final key = ChildThemeKey.values.firstWhere(
    (k) => k.name == skin,
    orElse: () => ChildThemeKey.forest,
  );
  final isParent = Uri.base.queryParameters['parent'] == '1';
  final showGallery = Uri.base.queryParameters['gallery'] == '1';

  // 正式入口由 LingxiBootstrap 在首帧后撤掉 HTML 加载层，预览没有那一步
  WidgetsBinding.instance.addPostFrameCallback((_) {
    html.document.getElementById('lingxi-loader')?.remove();
  });

  runApp(_PreviewApp(
    storage: storage,
    api: api,
    skin: key,
    isParent: isParent,
    showGallery: showGallery,
  ));
}

class _PreviewApp extends StatelessWidget {
  const _PreviewApp({
    required this.storage,
    required this.api,
    required this.skin,
    required this.isParent,
    required this.showGallery,
  });

  final StorageService storage;
  final ApiService api;
  final ChildThemeKey skin;
  final bool isParent;
  final bool showGallery;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildChildTheme(skin),
      home: ColoredBox(
        color: const Color(0xFF2E2A33),
        child: Center(
          // 固定在 390×844 的手机框里渲染，避免无头浏览器的视口尺寸干扰布局
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              size: const Size(390, 844),
              devicePixelRatio: 2,
            ),
            child: SizedBox(
              width: 390,
              height: 844,
              child: MultiProvider(
        providers: [
          Provider<StorageService>.value(value: storage),
          Provider<ApiService>.value(value: api),
          Provider<AiService>(create: (_) => AiService(api)),
          ChangeNotifierProvider(create: (_) => UserProvider(storage, api)),
          ChangeNotifierProvider(create: (_) => LearningProvider(storage)),
          ChangeNotifierProvider(create: (_) => ContentProvider(api)),
          // 注意：必须显式声明 <ChatSessionProvider>，
          // 否则 Provider 只按 PreviewChatProvider 类型注册，页面读不到。
          ChangeNotifierProvider<ChatSessionProvider>(
              create: (_) => PreviewChatProvider(api)),
          ChangeNotifierProvider(create: (_) => RewardProvider(api)),
          ChangeNotifierProvider(create: (_) => VideoDownloadProvider(api)),
          ChangeNotifierProvider(create: (_) => ChildThemeController(storage)),
        ],
                child: showGallery
                    ? const _ComposerGallery()
                    : AIChatScreen(isParentMode: isParent),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 组件陈列页：把工具面板与两种输入胶囊并排画出来，
/// 用 ?gallery=1 打开，专门用来目检输入区。
class _ComposerGallery extends StatefulWidget {
  const _ComposerGallery();

  @override
  State<_ComposerGallery> createState() => _ComposerGalleryState();
}

class _ComposerGalleryState extends State<_ComposerGallery> {
  final TextEditingController _empty = TextEditingController();
  final TextEditingController _typed =
      TextEditingController(text: '今天学了什么呀');

  @override
  Widget build(BuildContext context) {
    final palette = ChildThemePalette.of(context);
    final isKid = palette.level == 0;
    return Scaffold(
      backgroundColor: palette.paper,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ChatToolPanel(
                palette: palette,
                title: isKid ? '给小犀看看' : '添加到对话',
                style: isKid ? ChatToolStyle.rows : ChatToolStyle.grid,
                items: isKid
                    ? [
                        ChatToolItem(
                            icon: Icons.photo_camera_rounded,
                            label: '拍照',
                            accent: true,
                            onTap: () {}),
                        ChatToolItem(
                            icon: Icons.photo_library_rounded,
                            label: '相册',
                            onTap: () {}),
                      ]
                    : [
                        ChatToolItem(
                            icon: Icons.photo_camera_rounded,
                            label: '拍照',
                            accent: true,
                            onTap: () {}),
                        ChatToolItem(
                            icon: Icons.photo_library_rounded,
                            label: '相册',
                            onTap: () {}),
                        ChatToolItem(
                            icon: Icons.description_rounded,
                            label: '文件',
                            onTap: () {}),
                        ChatToolItem(
                            icon: Icons.translate_rounded,
                            label: '英语陪练',
                            onTap: () {}),
                      ],
              ),
              const SizedBox(height: 6),
              isKid
                  ? KidChatComposer(
                      controller: _empty,
                      palette: palette,
                      mic: _mic(palette, 64, bright: true),
                      onSend: () {},
                      onToggleTools: () {},
                      onSwitchToText: () {},
                      onSwitchToVoice: () {},
                      onPickAlbum: () {},
                      toolsOpen: false,
                      textMode: false,
                      listening: false,
                    )
                  : ChatComposer(
                      controller: _empty,
                      palette: palette,
                      hint: '和小犀聊点什么…',
                      mic: _mic(palette, 32),
                      onSend: () {},
                      onToggleTools: () {},
                      onToggleEnglish: () {},
                      toolsOpen: false,
                      isEnglishMode: false,
                    ),
              const SizedBox(height: 20),
              isKid
                  ? KidChatComposer(
                      controller: _typed,
                      palette: palette,
                      mic: _mic(palette, 44),
                      onSend: () {},
                      onToggleTools: () {},
                      onSwitchToText: () {},
                      onSwitchToVoice: () {},
                      onPickAlbum: () {},
                      toolsOpen: false,
                      textMode: true,
                      listening: false,
                    )
                  : ChatComposer(
                      controller: _typed,
                      palette: palette,
                      hint: '和小犀聊点什么…',
                      mic: _mic(palette, 32),
                      onSend: () {},
                      onToggleTools: () {},
                      onToggleEnglish: () {},
                      toolsOpen: false,
                      isEnglishMode: true,
                    ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _mic(ChildThemePalette palette, double size, {bool bright = false}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bright ? palette.pop : palette.soft,
        shape: BoxShape.circle,
        border: Border.all(color: palette.edge, width: 2),
      ),
      child: Icon(Icons.mic_rounded,
          size: size * 0.5,
          color: bright ? palette.onPrimary : palette.ink),
    );
  }
}
