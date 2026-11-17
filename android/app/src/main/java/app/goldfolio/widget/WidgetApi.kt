package app.goldfolio.widget

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Lỗi có thông báo tiếng Việt để hiện thẳng cho người dùng */
class WidgetApiException(message: String) : Exception(message)

/** Gọi API số liệu widget của GoldFolio (`GET /api/widget`, xác thực bằng mã widget) */
object WidgetApi {
    // Server miễn phí ngủ khi lâu không dùng, lần gọi đầu có thể mất tới cả phút
    private const val CONNECT_TIMEOUT_MS = 30_000
    private const val READ_TIMEOUT_MS = 90_000

    /** Trả JSON số liệu (chuỗi) để lưu lại; lỗi thì ném [WidgetApiException] */
    fun fetch(c: Connection): String {
        val conn = try {
            URL("${c.origin}/api/widget").openConnection() as HttpURLConnection
        } catch (e: IOException) {
            throw WidgetApiException("Địa chỉ GoldFolio không đúng")
        }
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.setRequestProperty("Authorization", "Bearer ${c.token}")
        conn.setRequestProperty("Accept", "application/json")
        try {
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (status in 200..299) {
                JSONObject(body) // kiểm đúng dạng trước khi lưu đè bản cũ
                return body
            }
            // Server trả lỗi kèm thông báo tiếng Việt ở trường "error"
            val message = try {
                JSONObject(body).optString("error")
            } catch (e: JSONException) {
                ""
            }
            throw WidgetApiException(message.ifBlank { "Máy chủ báo lỗi ($status)" })
        } catch (e: IOException) {
            throw WidgetApiException("Không kết nối được GoldFolio")
        } catch (e: JSONException) {
            throw WidgetApiException("GoldFolio trả dữ liệu không đúng")
        } finally {
            conn.disconnect()
        }
    }
}
