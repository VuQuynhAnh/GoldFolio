package app.goldfolio.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context

/**
 * Lấy số liệu mới trong job nền. Không gọi mạng ngay trong widget vì Android chỉ cho vài giây,
 * mà server đang ngủ có thể mất tới cả phút mới trả lời. Job chạy khi có mạng.
 */
class RefreshJob : JobService() {
    @Volatile
    private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val connection = Prefs.connection(this)
        if (connection == null) {
            GoldWidgetProvider.render(this)
            return false
        }
        worker = Thread {
            try {
                Prefs.saveData(this, WidgetApi.fetch(connection))
            } catch (e: WidgetApiException) {
                Prefs.saveError(this, e.message ?: "Chưa cập nhật được")
            } catch (e: Exception) {
                Prefs.saveError(this, "Chưa cập nhật được")
            } finally {
                GoldWidgetProvider.render(this)
                jobFinished(params, false)
            }
        }.also { it.start() }
        return true
    }

    /** Hệ thống dừng job giữa chừng (mất mạng…): xin chạy lại sau */
    override fun onStopJob(params: JobParameters): Boolean {
        worker?.interrupt()
        return true
    }

    companion object {
        private const val JOB_ID = 1

        fun schedule(ctx: Context) {
            val job = JobInfo.Builder(JOB_ID, ComponentName(ctx, RefreshJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build()
            ctx.getSystemService(JobScheduler::class.java).schedule(job)
        }
    }
}
