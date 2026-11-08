package com.example.lingxi_companion

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.security.MessageDigest

/**
 * App 内自升级的原生通道（channel: app_update）。
 *
 * 三条系统硬规则：
 *  1. Android 8.0+ 必须声明 REQUEST_INSTALL_PACKAGES，且用户至少手动授权一次
 *     「允许来自此来源的应用」；国产 ROM 会额外弹一次风险确认，绕不过去。
 *  2. Android 7.0+ 给安装器传 file:// URI 会抛 FileUriExposedException，
 *     必须走 FileProvider（见 Manifest 的 provider 与 res/xml/file_paths.xml）。
 *  3. versionCode 才是升级判据，从 PackageManager 读而不是 BuildConfig
 *     （AGP 8 起 BuildConfig.VERSION_CODE 不再自动生成）。
 */
class MainActivity : FlutterActivity() {

    companion object {
        private const val TAG = "AppUpdate"
        private const val CHANNEL = "com.example.lingxi_companion/app_update"
    }

    private enum class InstallResult { OK, NEED_PERMISSION, FAILED }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getVersionInfo" -> result.success(versionInfo())
                    "canInstallPackages" -> result.success(canInstallPackages())
                    "openInstallPermissionSettings" ->
                        result.success(openUnknownSourceSettings())
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        if (path.isNullOrEmpty()) {
                            result.error("INVALID_ARGS", "path is required", null)
                        } else {
                            result.success(
                                when (installApk(File(path))) {
                                    InstallResult.OK -> "ok"
                                    InstallResult.NEED_PERMISSION -> "need_permission"
                                    InstallResult.FAILED -> "failed"
                                }
                            )
                        }
                    }
                    "computeSha256" -> {
                        val path = call.argument<String>("path")
                        if (path.isNullOrEmpty()) {
                            result.error("INVALID_ARGS", "path is required", null)
                        } else {
                            result.success(sha256Of(File(path)))
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // ── 本机版本 ────────────────────────────────────────────────

    private fun versionInfo(): Map<String, Any> = try {
        val info = packageInfo()
        val code =
            if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode
        mapOf("versionCode" to code, "versionName" to (info.versionName ?: ""))
    } catch (e: Exception) {
        Log.w(TAG, "读取本机版本失败", e)
        mapOf("versionCode" to 0, "versionName" to "")
    }

    private fun packageInfo() =
        if (Build.VERSION.SDK_INT >= 33) {
            packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            packageManager.getPackageInfo(packageName, 0)
        }

    // ── 安装 ────────────────────────────────────────────────────

    /** 本 App 是否已被允许安装应用（Android 8.0+ 的「未知来源」开关） */
    private fun canInstallPackages(): Boolean =
        if (Build.VERSION.SDK_INT >= 26) packageManager.canRequestPackageInstalls() else true

    /**
     * FileProvider(content://) → ACTION_VIEW → 系统安装器。
     * 返回 NEED_PERMISSION 时由 Dart 侧引导用户去系统设置页开权限，
     * 用户授权返回后再重新调用（权限是系统页动作，App 内无法代劳）。
     */
    private fun installApk(apk: File): InstallResult {
        if (!apk.exists()) {
            Log.w(TAG, "安装包不存在: ${apk.absolutePath}")
            return InstallResult.FAILED
        }
        if (!canInstallPackages()) return InstallResult.NEED_PERMISSION

        return try {
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            // 部分 ROM 的安装器不认 FLAG_GRANT_READ_URI_PERMISSION，
            // 显式把读权限授予每一个能处理该 Intent 的包，避免「解析包失败」。
            val resolves = packageManager.queryIntentActivities(
                intent, PackageManager.MATCH_DEFAULT_ONLY
            )
            for (r in resolves) {
                val pkg = r.activityInfo?.packageName
                if (!pkg.isNullOrEmpty()) {
                    grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            startActivity(intent)
            Log.i(TAG, "已拉起系统安装器: ${apk.name} (${apk.length()} 字节)")
            InstallResult.OK
        } catch (e: Exception) {
            Log.e(TAG, "拉起安装界面失败", e)
            InstallResult.FAILED
        }
    }

    /** 跳转到「允许安装未知应用」的系统设置页（本 App 那一条） */
    private fun openUnknownSourceSettings(): Boolean = try {
        startActivity(
            Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (e: Exception) {
        Log.w(TAG, "跳转未知来源设置页失败", e)
        false
    }

    // ── SHA-256 ─────────────────────────────────────────────────

    /**
     * 弱网下几十 MB 的包极易中途被掐断，截断文件依然是合法 ZIP 头，
     * 装到一半才报「解析包错误」。下载完先校验再安装。
     * 用标准库 MessageDigest，避免 Dart 侧为此引入 crypto 依赖。
     */
    private fun sha256Of(file: File): String? = try {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n == -1) break
                digest.update(buffer, 0, n)
            }
        }
        digest.digest().joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
        Log.w(TAG, "计算 SHA-256 失败", e)
        null
    }
}
