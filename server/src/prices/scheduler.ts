import type { PriceService } from "./service";
import { TREND_DAYS } from "../trends/service";

/**
 * Lấy giá hiện tại định kỳ cho các thương hiệu có nguồn (PRICE-BR-002): chạy ngay
 * lúc khởi động rồi lặp lại mỗi `intervalMin` phút. Lỗi chỉ ghi log, lượt sau thử lại;
 * giá cũ vẫn giữ nguyên (PRICE-BR-003). Sau đó tải bù giá theo ngày của 30 ngày gần nhất cho
 * nhận định xu hướng (PRICE-UC02): lần đầu hỏi đủ 30 ngày, các lượt sau chỉ còn ngày mới.
 * Chạy trong tiến trình server: chỉ nên có một instance.
 */
export function startPriceScheduler(prices: PriceService, brandCodes: string[], intervalMin: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const code of brandCodes) {
        const { saved, errors } = await prices.refreshLive(code);
        if (errors.length) console.warn(`[giá ${code}] lỗi:`, errors);
        else console.log(`[giá ${code}] đã lấy, ${saved} bảng mới`);
        const asked = await prices.startBackfill(code, TREND_DAYS);
        if (asked) console.log(`[giá ${code}] đã tải bù giá theo ngày của ${asked} ngày`);
      }
    } catch (err) {
      console.error("[giá] lỗi không mong đợi:", err);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMin * 60_000);
  return () => clearInterval(timer);
}
