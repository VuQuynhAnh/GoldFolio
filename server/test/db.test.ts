import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/db";

describe("nâng cấp DB đang có dữ liệu", () => {
  // Hồi quy: schema.sql chỉ CREATE TABLE IF NOT EXISTS, DB cũ không tự có cột mới
  it("bảng lần mua cũ được thêm cột nguồn giá, dữ liệu cũ giữ nguyên và coi là nhập tay", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE purchases (id INTEGER PRIMARY KEY, total_cost INTEGER NOT NULL);
             INSERT INTO purchases (id, total_cost) VALUES (1, 27700000);`);
    migrate(db);
    migrate(db); // chạy lại nhiều lần không lỗi
    expect(db.prepare("SELECT id, total_cost, price_source, price_note FROM purchases").all()).toEqual([
      { id: 1, total_cost: 27_700_000, price_source: "manual", price_note: "" },
    ]);
  });
});
