package app.goldfolio.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONException
import org.json.JSONObject

/**
 * Widget 4x2: tổng tài sản, lãi/lỗ, mỗi kim loại một dòng giá mua vào · bán ra và lãi/lỗ.
 * Chữ đã được server định dạng sẵn, widget chỉ việc hiện. Bấm vào số liệu thì mở app (GoldFolio trong app).
 */
class GoldWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
        render(ctx)
        RefreshJob.schedule(ctx)
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == ACTION_REFRESH) {
            render(ctx, refreshing = true)
            RefreshJob.schedule(ctx)
        }
    }

    companion object {
        const val ACTION_REFRESH = "app.goldfolio.widget.REFRESH"

        private const val GAIN = 0xFF34D399.toInt()
        private const val LOSS = 0xFFF87171.toInt()
        private const val MUTED = 0xFFA8A29E.toInt()

        /** Vẽ lại mọi widget từ số liệu đã lưu */
        fun render(ctx: Context, refreshing: Boolean = false) {
            val manager = AppWidgetManager.getInstance(ctx)
            val ids = manager.getAppWidgetIds(ComponentName(ctx, GoldWidgetProvider::class.java))
            if (ids.isEmpty()) return
            manager.updateAppWidget(ids, build(ctx, refreshing))
        }

        private fun build(ctx: Context, refreshing: Boolean): RemoteViews {
            val views = RemoteViews(ctx.packageName, R.layout.widget)
            val connection = Prefs.connection(ctx)
            val refresh = PendingIntent.getBroadcast(
                ctx, 0,
                Intent(ctx, GoldWidgetProvider::class.java).setAction(ACTION_REFRESH),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.status, refresh)

            if (connection == null) {
                // Chưa dán mã: bấm vào widget mở app, app tự mở màn hình dán mã
                views.setOnClickPendingIntent(R.id.body, openApp(ctx))
                views.setTextViewText(R.id.total_value, ctx.getString(R.string.widget_not_connected))
                views.setTextViewText(R.id.total_pnl, ctx.getString(R.string.widget_open_app))
                views.setTextColor(R.id.total_pnl, MUTED)
                views.setViewVisibility(R.id.rows, View.GONE)
                views.setTextViewText(R.id.status, "")
                return views
            }

            // Bấm vào số liệu: mở GoldFolio ngay trong app, không phải mở trình duyệt
            views.setOnClickPendingIntent(R.id.body, openApp(ctx))

            val data = Prefs.data(ctx)?.let {
                try {
                    JSONObject(it)
                } catch (e: JSONException) {
                    null
                }
            }
            val error = Prefs.error(ctx)
            if (data == null) {
                views.setTextViewText(R.id.total_value, ctx.getString(R.string.widget_loading))
                views.setTextViewText(R.id.total_pnl, error ?: "")
                views.setTextColor(R.id.total_pnl, MUTED)
                views.setViewVisibility(R.id.rows, View.GONE)
                views.setTextViewText(R.id.status, if (refreshing) ctx.getString(R.string.widget_refreshing) else ctx.getString(R.string.widget_tap_refresh))
                return views
            }

            val total = data.optJSONObject("total") ?: JSONObject()
            views.setTextViewText(R.id.total_value, total.optString("valueText"))
            views.setTextViewText(R.id.total_pnl, total.optString("pnlText"))
            views.setTextColor(R.id.total_pnl, colorOf(total.optString("trend")))

            views.setViewVisibility(R.id.rows, View.VISIBLE)
            val metals = data.optJSONArray("metals")
            val rows = listOf(
                Triple(R.id.gold_label, R.id.gold_price, R.id.gold_pnl),
                Triple(R.id.silver_label, R.id.silver_price, R.id.silver_pnl),
            )
            rows.forEachIndexed { i, (labelId, priceId, pnlId) ->
                val metal = metals?.optJSONObject(i)
                views.setTextViewText(labelId, metal?.optString("label") ?: "")
                val price = metal?.optJSONObject("price")
                views.setTextViewText(priceId, price?.optString("text") ?: ctx.getString(R.string.widget_no_price))
                val holding = metal?.optJSONObject("holding")
                if (holding != null) {
                    views.setViewVisibility(pnlId, View.VISIBLE)
                    views.setTextViewText(pnlId, holding.optString("pnlText"))
                    views.setTextColor(pnlId, colorOf(holding.optString("trend")))
                } else {
                    views.setViewVisibility(pnlId, View.GONE)
                }
            }

            // Lỗi lần cập nhật gần nhất vẫn giữ số cũ, ghi rõ để biết số liệu đã cũ
            val priceTime = data.optString("priceTimeText")
            val status = when {
                refreshing -> ctx.getString(R.string.widget_refreshing)
                error != null -> "⚠ $error · $priceTime"
                else -> "$priceTime  ⟳"
            }
            views.setTextViewText(R.id.status, status)
            return views
        }

        private fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(
            ctx, 1, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE,
        )

        private fun colorOf(trend: String): Int = when (trend) {
            "gain" -> GAIN
            "loss" -> LOSS
            else -> MUTED
        }
    }
}
