// 应用内更新下载器 — 条件导出入口
//
// 非 Web 平台（Android 真机）：Dio 流式下载 + 断点续传 + SHA-256 校验；
// Web 平台：不支持（App 内自升级只存在于 Android 安装包里）。
//
// 通过条件导出隔离 dart:io，避免 Flutter Web 编译失败。
export 'app_update_downloader_stub.dart'
    if (dart.library.io) 'app_update_downloader_native.dart';
