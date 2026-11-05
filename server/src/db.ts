import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

/**
 * Lớp truy cập PostgreSQL mỏng dùng chung cho cả app (pg Pool) và test (PGlite).
 * Tham số dạng $1, $2…; mọi hàm đều async.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Dòng đầu tiên hoặc undefined */
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Chạy nhiều câu lệnh không tham số (schema, migrate) */
  exec(sql: string): Promise<void>;
  /** Chạy `fn` trong một transaction; lỗi thì rollback toàn bộ */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// BIGINT (tiền, khối lượng mg, id) đọc thành number thay vì chuỗi. An toàn vì tiền ≤ 1.000 tỷ
// và khối lượng ≤ 1e9 mg (R-MONEY-02), đều trong vùng số nguyên chính xác của JS.
pg.types.setTypeParser(20, (v) => Number(v));

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

function wrapClient(q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>): Omit<Db, "tx" | "close" | "exec"> {
  return {
    query: async <T,>(sql: string, params?: unknown[]) => (await q(sql, params)).rows as T[],
    one: async <T,>(sql: string, params?: unknown[]) => (await q(sql, params)).rows[0] as T | undefined,
  };
}

/** DB thật: chuỗi kết nối từ `DATABASE_URL`, hoặc biến PGHOST/PGUSER/… nếu không có. */
export function poolDb(connectionString?: string, sslCaPath?: string): Db {
  if (sslCaPath && !existsSync(sslCaPath)) {
    throw new Error(`không thấy file chứng chỉ DB_SSL_CA "${sslCaPath}" (tải ở Supabase: Project Settings → Database → SSL Configuration)`);
  }
  const pool = new pg.Pool({
    connectionString,
    // Dịch vụ cloud (Supabase) bắt buộc SSL. Có file CA của nhà cung cấp thì kiểm chứng chỉ
    // bằng CA đó; không tắt kiểm tra chứng chỉ.
    ssl: sslCaPath ? { ca: readFileSync(sslCaPath, "utf8") } : undefined,
  });
  // Kết nối rảnh bị dịch vụ cloud ngắt giữa chừng: chỉ ghi log, pool tự mở kết nối mới.
  // Không bắt sự kiện này thì cả tiến trình server bị sập.
  pool.on("error", (err) => console.error("[db] kết nối PostgreSQL bị ngắt:", err.message));
  const base = wrapClient((sql, params) => pool.query(sql, params as unknown[]));
  return {
    ...base,
    exec: async (sql) => {
      await pool.query(sql);
    },
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inner: Db = {
          ...wrapClient((sql, params) => client.query(sql, params as unknown[])),
          exec: async (sql) => {
            await client.query(sql);
          },
          tx: (f) => f(inner),
          close: async () => {},
        };
        const result = await fn(inner);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Tạo bảng nếu chưa có và nâng cấp bảng cũ. Chạy mỗi lần khởi động, chạy lại không sao. */
export async function initSchema(db: Db): Promise<void> {
  await db.exec(schema);
  await migrate(db);
}

/**
 * Thêm cột mới vào DB đã có dữ liệu. schema.sql chỉ `CREATE TABLE IF NOT EXISTS` nên
 * bảng cũ không tự có cột mới; mọi cột thêm sau phải khai báo cả ở đây (R-DB-01).
 */
export async function migrate(db: Db): Promise<void> {
  // Nguồn giá của lần mua: nhập tay hay hệ thống tự lấy (HOLD-UC01/BR-16). Lần mua cũ là nhập tay.
  await db.exec(`
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT 'manual'
      CHECK (price_source IN ('manual', 'auto'));
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_note TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, done_at TEXT NOT NULL);
  `);

  // Từ 2026-11-05 đơn giá theo đơn vị khối lượng người dùng nhập, trước đó theo đơn vị niêm yết
  // của sản phẩm (HOLD-UC01/BR-5). Lần mua cũ có hai đơn vị khác nhau: tính lại đơn giá từ tổng
  // tiền (tổng tiền là số thật, giữ nguyên). Chạy đúng một lần, đánh dấu trong app_migrations.
  await runOnce(
    db,
    "don-gia-theo-don-vi-nhap",
    `UPDATE purchases pu
       SET unit_cost = GREATEST(1, ROUND(pu.total_cost::numeric *
         (CASE pu.input_unit WHEN 'chi' THEN 3750 WHEN 'luong' THEN 37500 WHEN 'gram' THEN 1000 ELSE 1000000 END)
         / pu.weight_mg))
     FROM products p
     WHERE p.id = pu.product_id AND pu.input_unit <> p.price_unit`,
  );
}

/** Chạy một bước nâng cấp dữ liệu đúng một lần (đánh dấu trong app_migrations, cùng transaction). */
async function runOnce(db: Db, name: string, sql: string): Promise<void> {
  if (await db.one("SELECT 1 FROM app_migrations WHERE name = $1", [name])) return;
  await db.tx(async (t) => {
    await t.exec(sql);
    await t.query("INSERT INTO app_migrations (name, done_at) VALUES ($1, $2)", [name, new Date().toISOString()]);
  });
}
