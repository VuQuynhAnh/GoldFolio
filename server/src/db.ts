import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSync;

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

/** Mở DB (":memory:" cho test) và tạo bảng nếu chưa có. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(schema);
  return db;
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
