import { describe, expect, it } from "vitest";
import { MG_PER_UNIT, fromMg, parseWeight, toMg } from "../src/units";

describe("quy đổi khối lượng", () => {
  it("1 lượng = 10 chỉ, 1 chỉ = 3,75 g, 1 kg = 1000 g", () => {
    expect(MG_PER_UNIT.chi).toBe(3750);
    expect(MG_PER_UNIT.luong).toBe(37500);
    expect(MG_PER_UNIT.gram).toBe(1000);
    expect(MG_PER_UNIT.kg).toBe(1_000_000);
  });

  // SC: HOLD-UC01-SC4
  it("1 lượng quy ra 10 chỉ, 7,5 gram quy ra 2 chỉ", () => {
    expect(fromMg(toMg(1, "luong"), "chi")).toBe(10);
    expect(fromMg(toMg(7.5, "gram"), "chi")).toBe(2);
  });

  // SC: HOLD-UC01-SC25
  it("1 kg quy ra 26,667 lượng (làm tròn 3 chữ số)", () => {
    expect(fromMg(toMg(1, "kg"), "luong")).toBe(26.667);
  });
});

describe("đọc khối lượng người dùng nhập", () => {
  it("nhận dấu phẩy thập phân", () => {
    expect(parseWeight("7,5")).toEqual({ ok: true, value: 7.5 });
    expect(parseWeight("0.125")).toEqual({ ok: true, value: 0.125 });
  });

  // SC: HOLD-UC01-SC5
  it.each([
    ["0", "Khối lượng phải lớn hơn 0"],
    ["-1", "Khối lượng phải lớn hơn 0"],
    ["1,2345", "Khối lượng có tối đa 3 chữ số thập phân"],
    ["", "Vui lòng nhập khối lượng"],
    ["abc", "Khối lượng không hợp lệ"],
  ])("khối lượng %j bị chặn: %s", (input, message) => {
    expect(parseWeight(input)).toEqual({ ok: false, error: message });
  });
});
