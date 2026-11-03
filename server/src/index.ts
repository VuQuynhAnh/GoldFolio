import { createApp } from "./app";
import { openDb } from "./db";
import { seedCatalog } from "./catalog";
import { PriceService } from "./prices/service";
import { PhuQuySource } from "./prices/phuquy/adapter";
import { startPriceScheduler } from "./prices/scheduler";

const port = Number(process.env.PORT ?? 4000);
const db = openDb(process.env.DB_PATH ?? "data/goldfolio.sqlite");
// Danh mục thương hiệu/sản phẩm luôn đồng bộ theo catalog.ts mỗi lần khởi động
seedCatalog(db);

const sources = [new PhuQuySource()];
const prices = new PriceService(db, sources);
if (process.env.PRICE_FETCH_ENABLED !== "0") {
  startPriceScheduler(
    prices,
    sources.map((s) => s.brandCode),
    Number(process.env.PRICE_INTERVAL_MIN ?? 15),
  );
}

createApp({ db, prices }).listen(port, () => {
  console.log(`GoldFolio server chạy ở http://localhost:${port}`);
});
