import { describe, expect, it } from "vitest";
import { TrendModelError, buildTrendPrompt, parseTrendAnalysis, type TrendInput } from "../src/ai/trend";

const input: TrendInput = {
  metal: "gold",
  productName: "Nhẫn tròn Phú Quý 999.9",
  priceUnit: "chi",
  series: [
    { date: "2026-10-31", buy: 13_500_000, sell: 13_800_000 },
    { date: "2026-11-01", buy: 13_550_000, sell: 13_850_000 },
  ],
  stats: { days: 2, firstBuy: 13_500_000, lastBuy: 13_550_000, changePct: 0.37, minBuy: 13_500_000, maxBuy: 13_550_000 },
  holding: { weightText: "2 chỉ", avgCost: 13_000_000, totalCost: 26_000_000 },
};

describe("prompt và kết quả AI (PRICE-UC02)", () => {
  it("prompt có giá từng ngày, đơn vị và giá vốn của người dùng", () => {
    const p = buildTrendPrompt(input);
    expect(p).toContain("giá VNĐ/chỉ");
    expect(p).toContain("2026-11-01: mua vào 13550000, bán ra 13850000");
    expect(p).toContain("giá vốn bình quân 13000000");
    expect(buildTrendPrompt({ ...input, holding: null })).toContain("bỏ trống vsCost");
  });

  it("nhận kết quả đúng dạng; cắt bớt ý thừa; bỏ vsCost khi người dùng chưa có sản phẩm", () => {
    const raw = { trend: "down", confidence: "low", summary: " Giảm nhẹ. ", points: ["a", "", "b", "c", "d", "e"], vsCost: "Thấp hơn giá vốn" };
    expect(parseTrendAnalysis(raw, true)).toEqual({ trend: "down", confidence: "low", summary: "Giảm nhẹ.", points: ["a", "b", "c", "d"], vsCost: "Thấp hơn giá vốn" });
    expect(parseTrendAnalysis(raw, false).vsCost).toBeNull();
  });

  it("thiếu trường bắt buộc hoặc giá trị lạ thì báo lỗi, không lưu", () => {
    expect(() => parseTrendAnalysis({ trend: "moon", confidence: "low", summary: "x", points: [] }, false)).toThrow(TrendModelError);
    expect(() => parseTrendAnalysis({ trend: "up", confidence: "low", points: [] }, false)).toThrow(TrendModelError);
    expect(() => parseTrendAnalysis(null, false)).toThrow(TrendModelError);
  });
});
