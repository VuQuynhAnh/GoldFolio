package app.goldfolio.widget

import android.content.Context
import android.content.SharedPreferences

/** Địa chỉ GoldFolio và mã widget, lấy từ "mã kết nối" người dùng chép trong trang Widget */
data class Connection(val origin: String, val token: String)

/**
 * Lưu cấu hình và bản số liệu gần nhất trong bộ nhớ riêng của app (không ứng dụng khác đọc được).
 * Giữ bản số liệu cũ để mất mạng hoặc server đang ngủ thì widget vẫn có số để hiện.
 */
object Prefs {
    private const val NAME = "goldfolio"
    private const val ORIGIN = "origin"
    private const val TOKEN = "token"
    private const val DATA = "data"
    private const val ERROR = "error"

    /** Tiền tố mã widget do server cấp */
    private const val TOKEN_PREFIX = "gfw_"

    private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    /**
     * Mã kết nối có dạng "https://địa-chỉ#gfw_…". Sai dạng thì null.
     * Nhận cả khi người dùng chép thừa khoảng trắng hoặc xuống dòng.
     */
    fun parse(code: String): Connection? {
        val text = code.trim().replace(Regex("\\s+"), "")
        val hash = text.lastIndexOf('#')
        if (hash <= 0) return null
        val origin = text.substring(0, hash).trimEnd('/')
        val token = text.substring(hash + 1)
        if (!origin.startsWith("https://") && !origin.startsWith("http://")) return null
        if (!token.startsWith(TOKEN_PREFIX) || token.length < TOKEN_PREFIX.length + 16) return null
        return Connection(origin, token)
    }

    fun connection(ctx: Context): Connection? {
        val p = prefs(ctx)
        val origin = p.getString(ORIGIN, null) ?: return null
        val token = p.getString(TOKEN, null) ?: return null
        return Connection(origin, token)
    }

    /** Kết nối mới: bỏ số liệu của kết nối cũ để không hiện nhầm tài sản */
    fun saveConnection(ctx: Context, c: Connection) {
        prefs(ctx).edit().putString(ORIGIN, c.origin).putString(TOKEN, c.token).remove(DATA).remove(ERROR).apply()
    }

    fun clear(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }

    fun data(ctx: Context): String? = prefs(ctx).getString(DATA, null)

    fun error(ctx: Context): String? = prefs(ctx).getString(ERROR, null)

    fun saveData(ctx: Context, json: String) {
        prefs(ctx).edit().putString(DATA, json).remove(ERROR).commit()
    }

    fun saveError(ctx: Context, message: String) {
        prefs(ctx).edit().putString(ERROR, message).commit()
    }
}
