import { openDb, type Db } from "../src/db";
import { seedCatalog } from "../src/catalog";
import type { LiveSection, PriceSource, SourceTable } from "../src/prices/types";

/** DB in-memory đã có danh mục thương hiệu/sản phẩm. */
export function testDb(): Db {
  const db = openDb(":memory:");
  seedCatalog(db);
  return db;
}

export function productId(db: Db, brandCode: string, code: string): number {
  const row = db
    .prepare("SELECT p.id FROM products p JOIN brands b ON b.id = p.brand_id WHERE b.code = ? AND p.code = ?")
    .get(brandCode, code) as { id: number } | undefined;
  if (!row) throw new Error(`Không có sản phẩm ${brandCode}/${code}`);
  return row.id;
}

/** Nguồn giá giả: trả bảng do test đặt, đếm số lần hỏi giá theo ngày. */
export class FakeSource implements PriceSource {
  brandCode = "phuquy";
  live: LiveSection[] = [];
  liveErrors: string[] = [];
  daily = new Map<string, SourceTable | null>();
  dailyCalls: string[] = [];

  async fetchLive() {
    return { sections: this.live, errors: this.liveErrors };
  }

  async fetchDaily(date: string) {
    this.dailyCalls.push(date);
    return this.daily.get(date) ?? null;
  }
}

/** Bảng vàng 1 dòng nhẫn tròn Phú Quý, giờ nguồn `time` (giờ VN) của ngày `date`. */
export function goldSection(date: string, time: string, buy: number, sell: number | null, extraRows: SourceTable["rows"] = []): LiveSection {
  return {
    section: "gold",
    metal: "gold",
    table: {
      sourceDate: date,
      sourceTime: new Date(`${date}T${time}:00+07:00`).toISOString(),
      rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy, sell }, ...extraRows],
    },
  };
}
