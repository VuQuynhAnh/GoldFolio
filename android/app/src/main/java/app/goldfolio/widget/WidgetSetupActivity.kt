package app.goldfolio.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import org.json.JSONObject

/**
 * Cài đặt widget: dán mã kết nối (tạo ở GoldFolio → Widget), kiểm tra kết nối, rồi thêm widget ra
 * màn hình chính. Mã kết nối có cả địa chỉ GoldFolio, nên app cũng dùng nó để mở web trong app.
 */
class WidgetSetupActivity : Activity() {
    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var save: Button
    private lateinit var pin: Button
    private lateinit var disconnect: Button
    private lateinit var open: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        input = findViewById(R.id.code)
        status = findViewById(R.id.status)
        save = findViewById(R.id.save)
        pin = findViewById(R.id.pin)
        disconnect = findViewById(R.id.disconnect)
        open = findViewById(R.id.open)
        open.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }

        findViewById<Button>(R.id.paste).setOnClickListener {
            val clip = getSystemService(ClipboardManager::class.java).primaryClip
            val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
            if (!text.isNullOrBlank()) input.setText(text)
        }
        save.setOnClickListener { connect() }
        pin.setOnClickListener {
            getSystemService(AppWidgetManager::class.java)
                .requestPinAppWidget(ComponentName(this, GoldWidgetProvider::class.java), null, null)
        }
        disconnect.setOnClickListener {
            Prefs.clear(this)
            GoldWidgetProvider.render(this)
            showState()
        }
        showState()
    }

    private fun showState() {
        val connection = Prefs.connection(this)
        val canPin = getSystemService(AppWidgetManager::class.java).isRequestPinAppWidgetSupported
        pin.visibility = if (connection != null && canPin) View.VISIBLE else View.GONE
        disconnect.visibility = if (connection != null) View.VISIBLE else View.GONE
        open.visibility = if (connection != null) View.VISIBLE else View.GONE
        status.text = if (connection != null) getString(R.string.connected_to, connection.origin) else getString(R.string.not_connected)
    }

    private fun connect() {
        val connection = Prefs.parse(input.text.toString())
        if (connection == null) {
            status.text = getString(R.string.code_invalid)
            return
        }
        Prefs.saveConnection(this, connection)
        input.setText("")
        save.isEnabled = false
        status.text = getString(R.string.checking)
        Thread {
            val message = try {
                val body = WidgetApi.fetch(connection)
                Prefs.saveData(this, body)
                val total = JSONObject(body).optJSONObject("total")?.optString("valueText") ?: ""
                getString(R.string.connect_ok, total)
            } catch (e: WidgetApiException) {
                Prefs.saveError(this, e.message ?: "")
                getString(R.string.connect_failed, e.message)
            }
            GoldWidgetProvider.render(this)
            runOnUiThread {
                save.isEnabled = true
                showState()
                status.text = message
            }
        }.start()
    }
}
