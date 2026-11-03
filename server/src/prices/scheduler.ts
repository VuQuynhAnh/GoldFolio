import type { PriceService } from "./service";

/**
 * Lấy giá hiện tại định kỳ cho các thương hiệu có nguồn (PRICE-BR-002): chạy ngay
 * lúc khởi động rồi lặp lại mỗi `intervalMin` phút. Lỗi chỉ ghi log, lượt sau thử lại;
 * giá cũ vẫn giữ nguyên (PRICE-BR-003). Chạy trong tiến trình server: chỉ nên có một instance.
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
