import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/db";
import { pgliteDb } from "./helpers";

// Bảng tối thiểu giống DB trước 2026-11-05 (chưa có cột nguồn giá, đơn giá theo đơn vị niêm yết)
const OLD_SCHEMA = `
  CREATE TABLE products (id BIGINT PRIMARY KEY, price_unit TEXT NOT NULL);
  CREATE TABLE purchases (
    id BIGINT PRIMARY KEY, product_id BIGINT NOT NULL, weight_mg BIGINT NOT NULL, input_unit TEXT NOT NULL,
    unit_cost BIGINT NOT NULL CHECK (unit_cost > 0), total_cost BIGINT NOT NULL
  );
  INSERT INTO products VALUES (1, 'chi'), (2, 'luong');
`;

describe("nâng cấp DB đang có dữ liệu", () => {
  // Hồi quy: schema.sql chỉ CREATE TABLE IF NOT EXISTS, DB cũ không tự có cột mới
  it("bảng lần mua cũ được thêm cột nguồn giá, dữ liệu cũ giữ nguyên và coi là nhập tay", async () => {
    const pg = new PGlite({ parsers: { 20: (v: string) => Number(v) } });
    await pg.exec(OLD_SCHEMA + "INSERT INTO purchases VALUES (1, 1, 7500, 'chi', 13850000, 27700000);");
    await migrate(pgliteDb(pg));
    await migrate(pgliteDb(pg)); // chạy lại nhiều lần không lỗi
    expect((await pg.query("SELECT id, total_cost, price_source, price_note FROM purchases")).rows).toEqual([
      { id: 1, total_cost: 27_700_000, price_source: "manual", price_note: "" },
    ]);
  });

  // SC: HOLD-UC01-SC45
  it("đơn giá của lần mua có đơn vị nhập khác đơn vị niêm yết được tính lại theo đơn vị nhập, một lần", async () => {
    const pg = new PGlite({ parsers: { 20: (v: string) => Number(v) } });
    await pg.exec(
      OLD_SCHEMA +
        `INSERT INTO purchases VALUES
           (1, 1, 7500, 'gram', 13850000, 27700000),   -- 7,5 g nhẫn: đơn giá cũ theo chỉ
           (2, 1, 7500, 'chi', 13850000, 27700000),    -- 2 chỉ: cùng đơn vị, không đổi
           (3, 2, 1000000, 'kg', 1591000, 42426667);   -- 1 kg bạc niêm yết theo lượng`,
    );
    await migrate(pgliteDb(pg));
    // Lần mua mới (đơn giá theo đơn vị nhập) không bị tính lại ở lần khởi động sau
    await pg.exec("UPDATE purchases SET unit_cost = 3693334 WHERE id = 1");
    await migrate(pgliteDb(pg));
    expect((await pg.query("SELECT id, unit_cost, total_cost FROM purchases ORDER BY id")).rows).toEqual([
      { id: 1, unit_cost: 3_693_334, total_cost: 27_700_000 },
      { id: 2, unit_cost: 13_850_000, total_cost: 27_700_000 },
      { id: 3, unit_cost: 42_426_667, total_cost: 42_426_667 },
    ]);
  });
});
