import { describe, expect, it } from "vitest";
import { toMg } from "../src/units";
import { formatDateTimeVn, formatPct, formatSignedVnd, formatVnd, formatWeight } from "../src/format";

describe("định dạng hiển thị", () => {
  it("tiền theo kiểu Việt Nam", () => {
    expect(formatVnd(13_850_000)).toBe("13.850.000");
  });

  // SC: HOLD-UC01-SC14, HOLD-UC01-SC15
  it("lãi có dấu +, lỗ có dấu −", () => {
    expect(formatSignedVnd(100_000)).toBe("+100.000");
    expect(formatSignedVnd(-450_000)).toBe("−450.000");
    expect(formatPct(0.37)).toBe("+0,37%");
    expect(formatPct(-3.21)).toBe("−3,21%");
  });

  // SC: HOLD-UC01-SC4, HOLD-UC01-SC25
  it("khối lượng theo đơn vị niêm yết kèm đơn vị đã nhập", () => {
    expect(formatWeight(toMg(1, "luong"), "chi", "luong")).toBe("10 chỉ (1 lượng)");
    expect(formatWeight(toMg(7.5, "gram"), "chi", "gram")).toBe("2 chỉ (7,5 g)");
    expect(formatWeight(toMg(1, "kg"), "luong", "kg")).toBe("26,667 lượng (1 kg)");
    expect(formatWeight(toMg(1, "kg"), "kg", "kg")).toBe("1 kg");
  });

  // SC: HOLD-UC01-SC18
  it("thời điểm giá theo giờ Việt Nam", () => {
    expect(formatDateTimeVn("2026-11-02T10:26:00.000Z")).toBe("17:26 02/11/2026");
  });
});
