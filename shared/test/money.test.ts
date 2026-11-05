import { describe, expect, it } from "vitest";
import { toMg } from "../src/units";
import { convertUnitPrice, totalFromUnit, unitFromTotal } from "../src/money";

describe("đổi đơn giá giữa các đơn vị (BR-5, BR-6)", () => {
  // SC: HOLD-UC01-SC44
  it("13.900.000/chỉ = 139.000.000/lượng; 13.850.000/chỉ ≈ 3.693.333/g", () => {
    expect(convertUnitPrice(13_900_000, "chi", "luong")).toBe(139_000_000);
    expect(convertUnitPrice(13_850_000, "chi", "gram")).toBe(3_693_333);
    expect(convertUnitPrice(1_591_000, "luong", "kg")).toBe(42_426_667);
    expect(convertUnitPrice(13_850_000, "chi", "chi")).toBe(13_850_000);
  });

  it("đơn giá theo lượng × khối lượng theo lượng", () => {
    expect(totalFromUnit(138_500_000, toMg(1, "luong"), "luong")).toBe(138_500_000);
    expect(unitFromTotal(41_000_000, toMg(7.5, "gram"), "gram")).toBe(5_466_667);
  });
});

describe("đơn giá ↔ tổng tiền", () => {
  // SC: HOLD-UC01-SC2
  it("2 chỉ × 13.850.000 = 27.700.000", () => {
    expect(totalFromUnit(13_850_000, toMg(2, "chi"), "chi")).toBe(27_700_000);
  });

  // SC: HOLD-UC01-SC3
  it("41.000.000 cho 3 chỉ → đơn giá 13.666.667", () => {
    expect(unitFromTotal(41_000_000, toMg(3, "chi"), "chi")).toBe(13_666_667);
  });

  // SC: HOLD-UC01-SC20
  it("sửa lên 3 chỉ, giữ đơn giá 13.850.000 → tổng 41.550.000", () => {
    expect(totalFromUnit(13_850_000, toMg(3, "chi"), "chi")).toBe(41_550_000);
  });

  // SC: HOLD-UC01-SC24
  it("sửa lên 4 chỉ, giữ tổng 41.000.000 → đơn giá 10.250.000", () => {
    expect(unitFromTotal(41_000_000, toMg(4, "chi"), "chi")).toBe(10_250_000);
  });

  it("khối lượng nhập bằng kg cho sản phẩm niêm yết theo lượng", () => {
    expect(totalFromUnit(1_591_000, toMg(1, "kg"), "luong")).toBe(42_426_667);
  });

  // Hồi quy: tích đơn giá × miligram vượt 2^53 thì làm tròn sai đồng cuối
  it("số lớn ở mức giới hạn vẫn tính chính xác tới đồng", () => {
    // 1.000 kg vàng theo chỉ: 266.666,67 chỉ × 13.850.000 = 3.693.333.333.333,33
    expect(totalFromUnit(13_850_000, toMg(1000, "kg"), "chi")).toBe(3_693_333_333_333);
    expect(unitFromTotal(999_999_999_999, toMg(1, "chi"), "chi")).toBe(999_999_999_999);
  });
});
