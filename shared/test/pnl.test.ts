import { describe, expect, it } from "vitest";
import { toMg } from "../src/units";
import { avgCost, dayPoint, pctOf, valueOf } from "../src/pnl";

describe("lãi/lỗ theo giá mua vào", () => {
  // SC: HOLD-UC01-SC14
  it("2 chỉ mua 27.000.000, giá mua vào 13.550.000 → +100.000, +0,37%", () => {
    const value = valueOf(toMg(2, "chi"), "chi", 13_550_000);
    expect(value).toBe(27_100_000);
    expect(value - 27_000_000).toBe(100_000);
    expect(pctOf(100_000, 27_000_000)).toBe(0.37);
  });

  // SC: HOLD-UC01-SC15
  it("1 chỉ mua 14.000.000, giá mua vào 13.550.000 → −450.000, −3,21%", () => {
    const value = valueOf(toMg(1, "chi"), "chi", 13_550_000);
    expect(value - 14_000_000).toBe(-450_000);
    expect(pctOf(-450_000, 14_000_000)).toBe(-3.21);
  });

  // SC: HOLD-UC01-SC25
  it("bạc 1 kg: theo sản phẩm niêm yết lượng và theo sản phẩm niêm yết kg", () => {
    expect(valueOf(toMg(1, "kg"), "luong", 1_591_000)).toBe(42_426_667);
    expect(valueOf(toMg(1, "kg"), "kg", 42_426_561)).toBe(42_426_561);
  });
});

describe("biểu đồ lịch sử giá", () => {
  // SC: HOLD-UC01-SC26
  it("giá vốn bình quân của 2 chỉ × 13.000.000 và 1 chỉ × 13.500.000 là 13.166.667", () => {
    const lots = [
      { weightMg: toMg(2, "chi"), totalCost: 26_000_000 },
      { weightMg: toMg(1, "chi"), totalCost: 13_500_000 },
    ];
    expect(avgCost(lots, "chi")).toBe(13_166_667);
  });

  // SC: HOLD-UC01-SC27
  it("nhiều lần mua cùng ngày gộp thành giá bình quân theo khối lượng", () => {
    const lots = [
      { weightMg: toMg(1, "chi"), totalCost: 13_400_000 },
      { weightMg: toMg(3, "chi"), totalCost: 39_000_000 },
    ];
    expect(dayPoint(lots, "chi")).toEqual({ unitPrice: 13_100_000, qty: 4 });
  });
});
