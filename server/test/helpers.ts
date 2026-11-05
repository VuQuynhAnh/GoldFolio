import { PGlite, type Transaction } from "@electric-sql/pglite";
import { initSchema, type Db } from "../src/db";
import { seedCatalog } from "../src/catalog";
import type { LiveSection, PriceSource, SourceTable } from "../src/prices/types";

/** Bọc PGlite (Postgres thật chạy trong tiến trình, không cần server) theo giao diện Db của app. */
export function pgliteDb(pg: PGlite | Transaction): Db {
  const db: Db = {
    query: async <T,>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows,
    one: async <T,>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows[0],
    exec: async (sql) => {
      await pg.exec(sql);
    },
    // Trong transaction rồi thì chạy luôn; ở ngoài thì mở transaction của PGlite
    tx: (fn) => ("transaction" in pg ? pg.transaction((t) => fn(pgliteDb(t))) : fn(db)),
    close: async () => {},
  };
  return db;
}

// Một PGlite cho cả file test (khởi động mất ~1,5 giây); mỗi test xoá dữ liệu rồi nạp lại danh mục.
let shared: Db | undefined;

/** DB Postgres sạch, đã có danh mục thương hiệu/sản phẩm. */
export async function testDb(): Promise<Db> {
  if (!shared) {
    // BIGINT đọc thành number, giống cấu hình pg của app
    shared = pgliteDb(new PGlite({ parsers: { 20: (v: string) => Number(v) } }));
    await initSchema(shared);
  }
  await shared.exec(
    "TRUNCATE users, sessions, brands, products, price_snapshots, price_points, daily_misses, purchases RESTART IDENTITY CASCADE",
  );
  await seedCatalog(shared);
  return shared;
}

export async function productId(db: Db, brandCode: string, code: string): Promise<number> {
  const row = await db.one<{ id: number }>(
    "SELECT p.id FROM products p JOIN brands b ON b.id = p.brand_id WHERE b.code = $1 AND p.code = $2",
    [brandCode, code],
  );
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
