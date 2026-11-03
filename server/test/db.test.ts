import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate, type Db } from "../src/db";

describe("nâng cấp DB đang có dữ liệu", () => {
  // Hồi quy: schema.sql chỉ CREATE TABLE IF NOT EXISTS, DB cũ không tự có cột mới
  it("bảng lần mua cũ được thêm cột nguồn giá, dữ liệu cũ giữ nguyên và coi là nhập tay", async () => {
    const pg = new PGlite({ parsers: { 20: (v: string) => Number(v) } });
    const db = {
      exec: async (sql: string) => {
        await pg.exec(sql);
      },
    } as Db;
    await pg.exec(`CREATE TABLE purchases (id BIGINT PRIMARY KEY, total_cost BIGINT NOT NULL);
                   INSERT INTO purchases (id, total_cost) VALUES (1, 27700000);`);
    await migrate(db);
    await migrate(db); // chạy lại nhiều lần không lỗi
    expect((await pg.query("SELECT id, total_cost, price_source, price_note FROM purchases")).rows).toEqual([
      { id: 1, total_cost: 27_700_000, price_source: "manual", price_note: "" },
    ]);
  });
});
