import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { initSchema, poolDb, type Db } from "./db";
import { seedCatalog } from "./catalog";
import { PriceService } from "./prices/service";
import { PhuQuySource } from "./prices/phuquy/adapter";
import { startPriceScheduler } from "./prices/scheduler";
import { GeminiTrendModel } from "./ai/gemini";

const port = Number(process.env.PORT ?? 4000);
// DATABASE_URL (vd chuỗi kết nối Supabase); không có thì pg tự đọc PGHOST/PGUSER/…
let db: Db;
try {
  db = poolDb(process.env.DATABASE_URL, process.env.DB_SSL_CA);
  await initSchema(db);
} catch (err) {
  console.error(
    // ECONNREFUSED là AggregateError có message rỗng: lấy thêm mã lỗi
    `Không kết nối được PostgreSQL: ${(err as Error).message || (err as { code?: string }).code || String(err)}\n` +
      "Kiểm tra DATABASE_URL (và DB_SSL_CA nếu dùng Supabase) trong server/.env — xem README mục Cơ sở dữ liệu.",
  );
  process.exit(1);
}
// Danh mục thương hiệu/sản phẩm luôn đồng bộ theo catalog.ts mỗi lần khởi động
await seedCatalog(db);

const sources = [new PhuQuySource()];
// Tải bù giá theo ngày nghỉ 1,5 giây giữa hai lần hỏi để không dồn request vào nguồn (R-SRC-02)
const prices = new PriceService(db, sources, undefined, 1500);
if (process.env.PRICE_FETCH_ENABLED !== "0") {
  startPriceScheduler(
    prices,
    sources.map((s) => s.brandCode),
    Number(process.env.PRICE_INTERVAL_MIN ?? 15),
  );
}

// AI nhận định xu hướng (PRICE-UC02): chỉ bật khi có GEMINI_API_KEY; GEMINI_MODEL đổi được model
const trendModel = process.env.GEMINI_API_KEY ? new GeminiTrendModel(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || undefined) : undefined;
if (!trendModel) console.log("AI nhận định xu hướng đang tắt (chưa có GEMINI_API_KEY)");

// Có bản build web (npm run build) thì server trả luôn giao diện, chạy một service trên Render
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
createApp({ db, prices, trendModel, webDist: existsSync(webDist) ? webDist : undefined }).listen(port, () => {
  console.log(`GoldFolio server chạy ở http://localhost:${port}`);
});
