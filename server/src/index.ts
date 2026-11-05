import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { initSchema, poolDb, type Db } from "./db";
import { seedCatalog } from "./catalog";
import { PriceService } from "./prices/service";
import { PhuQuySource } from "./prices/phuquy/adapter";
import { startPriceScheduler } from "./prices/scheduler";

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
const prices = new PriceService(db, sources);
if (process.env.PRICE_FETCH_ENABLED !== "0") {
  startPriceScheduler(
    prices,
    sources.map((s) => s.brandCode),
    Number(process.env.PRICE_INTERVAL_MIN ?? 15),
  );
}

// Có bản build web (npm run build) thì server trả luôn giao diện, chạy một service trên Render
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
createApp({ db, prices, webDist: existsSync(webDist) ? webDist : undefined }).listen(port, () => {
  console.log(`GoldFolio server chạy ở http://localhost:${port}`);
});
