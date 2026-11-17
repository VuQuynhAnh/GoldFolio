package app.goldfolio.widget

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

/**
 * Cập nhật app từ GitHub Releases ngay trong app, không phải gỡ rồi cài lại.
 * - Số bản = số lần build của GitHub Actions: tag "widget-v12" ứng với versionCode 12.
 * - Có bản mới thì hỏi, tải APK về bộ nhớ riêng của app rồi đưa cho trình cài của Android
 *   (PackageInstaller); người dùng chỉ bấm "Cập nhật".
 * - Cài đè chỉ được khi bản mới ký cùng khoá với bản đang cài (khoá ký cố định trong CI).
 */
object Updater {
    /** Repo chứa bản phát hành APK */
    private const val LATEST_RELEASE = "https://api.github.com/repos/VuQuynhAnh/GoldFolio/releases/latest"
    private const val PREFS = "updater"
    private const val KEY_CHECKED = "checkedOn"
    private const val ACTION_INSTALLED = "app.goldfolio.widget.INSTALL_RESULT"

    private data class Release(val version: Int, val apkUrl: String)

    fun currentVersion(ctx: Context): Int {
        val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        @Suppress("DEPRECATION")
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode
    }

    /** Mở app thì kiểm tra, mỗi ngày tối đa một lần, im lặng nếu không có bản mới hay lỗi mạng */
    fun checkDaily(activity: Activity) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = LocalDate.now().toString()
        if (prefs.getString(KEY_CHECKED, null) == today) return
        prefs.edit().putString(KEY_CHECKED, today).apply()
        check(activity, manual = false)
    }

    /** `manual` = người dùng bấm "Kiểm tra cập nhật": báo cả khi đang là bản mới nhất hoặc lỗi */
    fun check(activity: Activity, manual: Boolean) {
        if (manual) toast(activity, "Đang kiểm tra bản mới…")
        Thread {
            val release = try {
                latest()
            } catch (e: Exception) {
                null
            }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                when {
                    release == null -> if (manual) toast(activity, "Chưa kiểm tra được, thử lại sau")
                    release.version <= currentVersion(activity) -> if (manual) toast(activity, "Đang dùng bản mới nhất (1.0.${currentVersion(activity)})")
                    else -> AlertDialog.Builder(activity)
                        .setTitle("Có bản mới 1.0.${release.version}")
                        .setMessage("Bản đang dùng: 1.0.${currentVersion(activity)}. Tải và cập nhật ngay?")
                        .setPositiveButton("Cập nhật") { _, _ -> download(activity, release) }
                        .setNegativeButton("Để sau", null)
                        .show()
                }
            }
        }.start()
    }

    private fun latest(): Release? {
        val conn = URL(LATEST_RELEASE).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        try {
            if (conn.responseCode != 200) return null
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val version = json.optString("tag_name").substringAfterLast('v').toIntOrNull() ?: return null
            val assets = json.optJSONArray("assets") ?: return null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                if (a.optString("name").endsWith(".apk")) return Release(version, a.optString("browser_download_url"))
            }
            return null
        } finally {
            conn.disconnect()
        }
    }

    private fun download(activity: Activity, release: Release) {
        // Android 8+: app phải được cho phép "cài ứng dụng không rõ nguồn" một lần
        if (!activity.packageManager.canRequestPackageInstalls()) {
            toast(activity, "Cho phép app cài bản cập nhật, rồi bấm Cập nhật lại")
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            return
        }
        toast(activity, "Đang tải bản mới…")
        val ctx = activity.applicationContext
        Thread {
            try {
                val file = File(ctx.cacheDir, "update.apk")
                val conn = URL(release.apkUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000
                conn.readTimeout = 60_000
                // Link tải của GitHub chuyển hướng sang máy chủ file; HttpURLConnection tự theo (cùng https)
                conn.instanceFollowRedirects = true
                conn.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
                conn.disconnect()
                install(ctx, file)
            } catch (e: Exception) {
                activity.runOnUiThread { toast(activity, "Tải bản mới không được, thử lại sau") }
            }
        }.start()
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("app", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            // MUTABLE: trình cài cần điền kết quả vào intent này (Android 12+)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val callback = PendingIntent.getBroadcast(ctx, sessionId, Intent(ctx, InstallResultReceiver::class.java).setAction(ACTION_INSTALLED), flags)
            session.commit(callback.intentSender)
        }
    }

    private fun toast(ctx: Context, text: String) = Toast.makeText(ctx, text, Toast.LENGTH_LONG).show()

    /** Nhận kết quả từ trình cài: cần người dùng xác nhận thì mở màn xác nhận; lỗi thì báo rõ */
    class InstallResultReceiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                    ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                PackageInstaller.STATUS_SUCCESS -> Unit
                // Bản đang cài ký bằng khoá khác (bản cũ trước khi có khoá cố định): phải gỡ một lần
                PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                    toast(ctx, "Bản đang cài dùng khoá ký cũ: gỡ app rồi cài bản mới một lần, sau đó cập nhật trong app được")
                PackageInstaller.STATUS_FAILURE_ABORTED -> Unit
                else -> toast(ctx, "Cập nhật không thành công, thử lại sau")
            }
        }
    }
}
