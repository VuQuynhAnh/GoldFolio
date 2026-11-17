package app.goldfolio.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ProgressBar

/**
 * Mở app (hoặc bấm vào widget) là mở GoldFolio ngay trong app (HOLD-UC02/BR-7), đăng nhập một lần
 * rồi nhớ cookie, không phải mở trình duyệt. Địa chỉ GoldFolio lấy từ mã kết nối; chưa dán mã thì
 * mở màn hình cài đặt widget trước.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val connection = Prefs.connection(this)
        if (connection == null) {
            startActivity(Intent(this, WidgetSetupActivity::class.java))
            finish()
            return
        }
        web = WebView(this)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { isIndeterminate = true }
        val root = FrameLayout(this).apply {
            fitsSystemWindows = true
            setBackgroundColor(0xFF0F0F10.toInt())
            addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(progress, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }
        setContentView(root)
        WebScreen.setup(this, web, connection.origin) { loading -> progress.visibility = if (loading) View.VISIBLE else View.GONE }
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl("${connection.origin}/")
    }

    /**
     * Ghi cookie đăng nhập xuống máy mỗi khi app bị ẩn hay đóng. Đăng nhập trong web là gọi API ngầm,
     * không tải trang mới, nên cookie mới chỉ nằm trong bộ nhớ tạm; đóng app trước khi webview tự ghi
     * (vài chục giây) là mất, mở lại phải đăng nhập lại.
     */
    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::web.isInitialized) web.saveState(outState)
    }

    /** Nút back của điện thoại lùi trang trong web trước, hết trang mới thoát app */
    @Deprecated("Vẫn chạy khi chưa bật cử chỉ back dự đoán")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_SETUP, 0, getString(R.string.widget_settings))
        menu.add(0, MENU_PIN, 1, getString(R.string.pin))
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            MENU_SETUP -> startActivity(Intent(this, WidgetSetupActivity::class.java))
            MENU_PIN -> getSystemService(AppWidgetManager::class.java)
                ?.takeIf { it.isRequestPinAppWidgetSupported }
                ?.requestPinAppWidget(ComponentName(this, GoldWidgetProvider::class.java), null, null)
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }

    companion object {
        private const val MENU_SETUP = 1
        private const val MENU_PIN = 2
    }
}
