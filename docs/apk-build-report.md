# APK 打包测试报告 — 灵犀伴学 (Phase 5)

**日期**: 2026-05-30
**环境**: WSL (x86_64, 3.7GB RAM, ~900GB available disk)

---

## 1. 环境状态

| 组件 | 状态 | 说明 |
|------|------|------|
| Flutter SDK | ❌ 未安装 | `local.properties` 指向 `/home/zxq/flutter`，不存在 |
| Android SDK | ❌ 未安装 | `local.properties` 指向 `/home/zxq/android-sdk`，不存在 |
| JDK | ❌ 未安装 | 需要 JDK 17+ |
| 项目结构 | ✅ 完整 | Flutter 项目 + Android Gradle 配置齐全 |

## 2. 配置分析

### 2.1 工具链版本
- **AGP**: 8.11.1 (`settings.gradle.kts`)
- **Kotlin**: 2.2.20
- **Gradle**: 8.14 (`gradle-wrapper.properties`)
- **NDK**: 27.0.12077973
- **JDK target**: Java 17

### 2.2 构建配置
- **Build DSL**: Kotlin (`.kts`) — 现代化标准 ✅
- **applicationId**: `com.example.lingxi_companion` — ⚠️ 示例 ID，需更改
- **Build output 重定向**: 指向 `../../build` ✅

## 3. 发现的问题

### 🔴 关键 — INTERNET 权限缺失（已修复）
**问题**: `AndroidManifest.xml` (main) 只有 `RECORD_AUDIO` 权限，没有 `INTERNET`。
`INTERNET` 仅在 `debug/AndroidManifest.xml` 中声明。
Release 构建将无法进行网络请求，所有 API 调用失败。
**修复**: 在 main manifest 添加 `<uses-permission android:name="android.permission.INTERNET"/>`

### 🟡 中等 — Application ID
**问题**: `com.example.lingxi_companion` 是 Flutter 模板默认值，不能在 Play Store 发布。
**建议**: 改为 `com.nousresearch.lingxi` 或类似唯一标识。

### 🟡 中等 — Release 签名
**问题**: `build.gradle.kts` 第 37 行: `signingConfig = signingConfigs.getByName("debug")`
Release APK 使用 debug 签名，无法在 Play Store 发布。
**建议**: 创建 `key.properties`，配置 `signingConfigs.release`，引用自己的 keystore。

### 🟢 已修复 — 应用显示名
**问题**: `android:label="lingxi_companion"` → 修正为 `android:label="灵犀伴学"`

### 🔵 建议 — RECORD_AUDIO 权限
如果应用不实际使用麦克风，可以移除此权限避免不必要的权限请求。
当前 App 中有音频相关功能（儿歌、视频），此权限合理。

## 4. 构建命令（需安装 Flutter/Android SDK 后）

```bash
# Debug APK
cd src/frontend
flutter build apk --debug

# Release APK (单个)
flutter build apk --release

# Release App Bundle (推荐用于 Play Store)
flutter build appbundle --release

# 分 ABI 打包（减小 APK 体积）
flutter build apk --release --split-per-abi
```

## 5. 预计构建物大小

| 构建类型 | 预计大小 |
|----------|----------|
| Debug APK (fat) | ~150-200 MB |
| Release APK (fat) | ~80-120 MB |
| Release AAB | ~40-60 MB |
| Split arm64-v8a | ~30-40 MB |

## 6. 生产发布前清单

- [ ] 安装 Flutter SDK + Android SDK + JDK 17
- [ ] 更改 `applicationId` 为正式域名
- [ ] 创建 keystore: `keytool -genkey -v -keystore upload-keystore.jks`
- [ ] 配置 `key.properties` 引用 keystore
- [ ] 修改 `build.gradle.kts` release signingConfig
- [ ] 更新 `versionName` 和 `versionCode`
- [ ] 替换默认图标 (`mipmap/ic_launcher`)
- [ ] 构建 `flutter build appbundle --release`
- [ ] 在真机上安装测试：`flutter install`
- [ ] Play Console 上传 AAB