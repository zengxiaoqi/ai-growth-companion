# Flutter 开发指南

## 📋 概述

本文档说明如何构建和运行灵犀伴学 Flutter 前端应用。

**构建顺序**: Android → iOS

---

## 🖥️ 开发环境要求

### 通用依赖
- Node.js >= 18.0.0
- Flutter SDK >= 3.0.0

### Android 开发
- Android Studio (推荐) 或 VS Code
- Android SDK (API 21+)
- JDK 11+

#### Windows/Linux 无 GUI 环境安装 Android SDK

如果在没有图形界面的 Linux 服务器上开发，按以下步骤安装：

```bash
# 1. 安装 Java (需要 sudo 权限)
sudo apt update
sudo apt install openjdk-17-jdk

# 2. 创建 SDK 目录并下载 command line tools
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
rm commandlinetools-linux-11076708_latest.zip

# 3. 配置环境变量
echo 'export ANDROID_HOME=~/android-sdk' >> ~/.bashrc
echo 'export ANDROID_SDK_ROOT=~/android-sdk' >> ~/.bashrc
echo 'export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"' >> ~/.bashrc
source ~/.bashrc

# 4. 接受许可并安装 SDK 组件
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 5. 配置 Flutter 使用本地 SDK
flutter config --android-sdk ~/android-sdk

# 6. 验证安装
flutter doctor
```

**注意**: 步骤 1 需要有 sudo 权限。如果在 WSL 中，确保 Windows 已安装 Android Studio。

### iOS 开发 (macOS only)
- Xcode 14.0+
- CocoaPods

---

## 🚀 快速开始

### 1. 安装 Flutter 依赖

```bash
cd src/frontend

# 安装依赖
flutter pub get

# 检查环境
flutter doctor
```

### 2. 生成项目文件

Flutter 项目需要平台特定文件（android/、ios/）：

```bash
# 在 frontend 目录执行
cd src/frontend

# 生成 Android 项目结构
flutter create .

# 或者指定平台
flutter create --platforms=android,ios .
```

### 3. 运行应用

```bash
# 开发模式 (热重载)
flutter run

# 指定设备
flutter devices          # 查看可用设备
flutter run -d <设备ID>  # 运行在指定设备
```

---

## 📱 Android 构建

### Debug APK

```bash
cd src/frontend

# 构建调试 APK
flutter build apk --debug

# APK 输出位置: build/app/outputs/flutter-apk/app-debug.apk
```

### Release APK

```bash
# 构建发布版 APK
flutter build apk --release

# 签名配置 (首次需要)
# 修改 android/app/build.gradle 中的 signingConfigs
```

### APK 安装到设备

```bash
# 通过 USB
adb install build/app/outputs/flutter-apk/app-release.apk

# 通过网络
adb connect <设备IP>
adb install build/app/outputs/flutter-apk/app-release.apk
```

---

## 🍎 iOS 构建 (macOS only)

### 模拟器运行

```bash
# 查看可用模拟器
xcrun simctl list devices

# 运行在模拟器
flutter run -d <模拟器ID>
```

### 真机调试

```bash
# 首次需要配置证书
# 1. 打开 Xcode
# 2. Xcode → Preferences → Accounts 添加 Apple ID
# 3. 选择 Team

# 然后运行
flutter run -d <真机设备ID>
```

### App Store 构建

```bash
# 构建 iOS App
flutter build ios --release

# 或使用 Xcode
# 1. 打开 ios/Runner.xcworkspace
# 2. Product → Archive
```

---

## ⚙️ 配置说明

### pubspec.yaml 依赖

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # 状态管理
  provider: ^6.1.1
  riverpod: ^2.4.9
  
  # 网络
  dio: ^5.3.3
  
  # 本地存储
  shared_preferences: ^2.2.2
  hive: ^2.2.3
  hive_flutter: ^1.1.0
  
  # UI
  cupertino_icons: ^1.0.6
  cached_network_image: ^3.3.0
  
  # 音频
  audioplayers: ^5.2.1
```

### API 配置

修改 `lib/services/api_service.dart` 中的 API 地址：

```dart
class ApiService {
  // 开发环境
  static const String baseUrl = 'http://10.0.2.2:3000/api';  // Android 模拟器
  // static const String baseUrl = 'http://localhost:3000/api';  // iOS 模拟器
  
  // 生产环境
  // static const String baseUrl = 'https://your-server.com/api';
}
```

---

## 📁 项目结构

```
src/frontend/
├── lib/
│   ├── main.dart           # 应用入口
│   ├── app.dart            # 应用配置
│   ├── providers/          # 状态管理
│   ├── screens/            # 页面
│   │   ├── splash_screen.dart
│   │   ├── ai_chat_screen.dart
│   │   ├── achievement/
│   │   ├── child/
│   │   ├── learning/
│   │   ├── parent/
│   │   └── profile/
│   ├── services/           # API 服务
│   └── theme/              # 主题配置
├── android/                # Android 项目
├── ios/                    # iOS 项目
├── pubspec.yaml            # 依赖配置
└── README.md
```

---

## 🐛 常见问题

### Android

| 问题 | 解决方案 |
|------|----------|
| SDK 未找到 | 设置 ANDROID_HOME 环境变量 |
| 签名失败 | 检查 debug.keystore 或配置签名 |
| 应用无法联网 | 添加网络权限 (AndroidManifest.xml) |

### iOS

| 问题 | 解决方案 |
|------|----------|
| CocoaPods 错误 | 运行 pod install |
| 签名错误 | 检查 Apple ID 和 Team 配置 |
| Simulator 启动慢 | 重启 Xcode |

---

## 📦 构建输出

| 平台 | 文件位置 |
|------|----------|
| Android Debug | `build/app/outputs/flutter-apk/app-debug.apk` |
| Android Release | `build/app/outputs/flutter-apk/app-release.apk` |
| iOS | `build/ios/iphoneos/Runner.app` |

---

*最后更新: 2026-03-16*