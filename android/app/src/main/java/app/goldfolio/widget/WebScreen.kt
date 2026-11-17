package app.goldfolio.widget

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Cấu hình WebView để chạy GoldFolio như một app thật: bật JavaScript và localStorage, giữ cookie
 * đăng nhập (đăng nhập một lần rồi nhớ), link ngoài (vd tải APK trên GitHub) mở bằng trình duyệt.
 * Mất mạng thì dùng bản đã lưu trong bộ nhớ đệm.
 */
object WebScreen {
    @SuppressLint("SetJavaScriptEnabled")
    fun setup(ctx: Context, web: WebView, baseUrl: String, onLoading: (Boolean) -> Unit) {
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.cacheMode = if (online(ctx)) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
        CookieManager.getInstance().setAcceptCookie(true)
        val host = Uri.parse(baseUrl).host
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Trang của app mở trong app; link ngoài (vd GitHub) mở bằng trình duyệt
                if (request.url.host == host) return false
                try {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) {
                    // Máy không có trình duyệt: bỏ qua
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                onLoading(true)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                onLoading(false)
                // Lưu cookie đăng nhập xuống máy ngay, phòng app bị tắt đột ngột
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                onLoading(false)
                view.loadDataWithBaseURL(
                    null,
                    """
                    <html><body style="background:#0f0f10;color:#f4f1ea;font-family:sans-serif;padding:24px">
                    <h3>Chưa mở được trang</h3>
                    <p style="color:#a8a29e">Kiểm tra mạng rồi bấm Thử lại. Máy chủ miễn phí đang ngủ thì lần mở đầu có thể mất tới 1 phút.</p>
                    <p><a style="color:#d4af37;font-size:18px" href="${request.url}">Thử lại</a></p>
                    </body></html>
                    """.trimIndent(),
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        }
    }

    fun online(ctx: Context): Boolean {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

}
