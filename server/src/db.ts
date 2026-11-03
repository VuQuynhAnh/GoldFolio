import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSync;

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

/** Mở DB (":memory:" cho test), tạo bảng nếu chưa có và nâng cấp bảng cũ. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(schema);
  migrate(db);
  return db;
}

function ensureColumn(db: Db, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

/**
 * Thêm cột mới vào DB đã có dữ liệu. schema.sql chỉ `CREATE TABLE IF NOT EXISTS` nên
 * bảng cũ không tự có cột mới; mọi cột thêm sau phải khai báo cả ở đây (R-DB-01).
 * Chạy lại nhiều lần không sao.
 */
export function migrate(db: Db): void {
  // Nguồn giá của lần mua: nhập tay hay hệ thống tự lấy (HOLD-UC01/BR-16). Lần mua cũ là nhập tay.
  ensureColumn(db, "purchases", "price_source", "TEXT NOT NULL DEFAULT 'manual' CHECK (price_source IN ('manual', 'auto'))");
  ensureColumn(db, "purchases", "price_note", "TEXT NOT NULL DEFAULT ''");
}

/** Chạy `fn` trong một transaction; lỗi thì rollback toàn bộ. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
