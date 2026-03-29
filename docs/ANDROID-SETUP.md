# Android 开发环境安装指南

> 本指南适用于在无图形界面的 Linux/WSL 环境中配置 Android 开发环境。

## 前置要求

- sudo 权限（用于安装系统依赖）
- 网络连接（下载 SDK）

---

## 安装步骤

### 1. 安装 Java JDK

```bash
# 更新包索引
sudo apt update

# 安装 OpenJDK 17
sudo apt install openjdk-17-jdk

# 验证安装
java -version
```

### 2. 下载 Android SDK Command Line Tools

```bash
# 创建 SDK 目录
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools

# 下载 command line tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

# 解压并整理
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
rm commandlinetools-linux-11076708_latest.zip
```

### 3. 配置环境变量

将以下内容添加到 `~/.bashrc` 或 `~/.zshrc`：

```bash
# Android SDK
export ANDROID_HOME=~/android-sdk
export ANDROID_SDK_ROOT=~/android-sdk
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
```

重新加载配置：
```bash
source ~/.bashrc
```

### 4. 安装 SDK 组件

```bash
# 接受许可协议
yes | sdkmanager --licenses

# 安装必需的组件
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# 可选：安装更多版本（用于兼容性测试）
sdkmanager "platforms;android-33" "build-tools;33.0.0"
```

### 5. 配置 Flutter

```bash
# 告诉 Flutter Android SDK 位置
flutter config --android-sdk ~/android-sdk

# 验证环境
flutter doctor
```

---

## 验证安装

运行 `flutter doctor`，应该看到：

```
[✓] Android toolchain - develop for Android devices
    • Android SDK at /home/your-user/android-sdk
```

---

## 常见问题

### Q: sdkmanager 报错 "JAVA_HOME is not set"

A: 确保已安装 JDK 并设置 JAVA_HOME：
```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### Q: 下载速度慢

A: 可以使用国内镜像，在 `~/.android/sdkmanager.ini` 中添加：
```ini
sdkman\.curl\.options=-L --connect-timeout 60
```

或者使用阿里云镜像（需要修改 sdkmanager 源码，较为复杂）。

### Q: WSL 环境推荐方案

**推荐直接在 Windows 上安装 Android Studio**，它会自动配置 SDK，然后 WSL 通过以下方式使用：

```bash
# 在 Windows 上安装 Android Studio 后，WSL 中配置：
flutter config --android-sdk /mnt/c/Users/你的用户名/AppData/Local/Android/Sdk
```

---

## 已安装的组件

| 组件 | 版本 | 用途 |
|------|------|------|
| platform-tools | 最新 | adb 等工具 |
| platforms;android-34 | API 34 | 编译目标 |
| build-tools | 34.0.0 | 构建工具 |

---

## 快速命令参考

```bash
# 查看已安装包
sdkmanager --list_installed

# 安装新包
sdkmanager "platforms;android-35"

# 卸载包
sdkmanager "platforms;android-33"

# 清理缓存
sdkmanager --sdk_root=$ANDROID_HOME --cache
```

---

*最后更新: 2026-03-28*