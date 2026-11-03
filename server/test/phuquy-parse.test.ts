import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDaily, parseGoldLive, parseSilverLive } from "../src/prices/phuquy/parse";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/phuquy/${name}`, import.meta.url), "utf8");

describe("đọc bảng giá vàng hiện tại của Phú Quý", () => {
  const table = parseGoldLive(fixture("gold-live.html"));

  it("lấy giờ nguồn công bố theo giờ VN", () => {
    expect(table.sourceDate).toBe("2026-11-03");
    expect(table.sourceTime).toBe("2026-11-03T01:40:00.000Z"); // 08:40 giờ VN
  });

  it("bỏ các dòng bạc (giá bạc lấy ở trang bạc riêng)", () => {
    expect(table.rows).toHaveLength(10);
    expect(table.rows.some((r) => /bạc/i.test(r.name))).toBe(false);
  });

  it("giá theo VNĐ/chỉ, dòng chỉ có giá mua vào thì giá bán ra là null", () => {
    expect(table.rows.find((r) => r.name === "Nhẫn tròn Phú Quý 999.9")).toEqual({
      name: "Nhẫn tròn Phú Quý 999.9",
      unit: "chi",
      buy: 13_670_000,
      sell: 13_970_000,
    });
    expect(table.rows.find((r) => r.name.startsWith("Vàng 999.9 phi SJC"))?.sell).toBeNull();
  });
});

describe("đọc bảng giá bạc hiện tại của Phú Quý", () => {
  const table = parseSilverLive(fixture("silver-live.html"));

  it("giờ cập nhật và chỉ lấy bạc Phú Quý, bỏ nhóm thương hiệu khác", () => {
    expect(table.sourceTime).toBe("2026-11-03T01:40:00.000Z");
    expect(table.rows.map((r) => r.name)).toEqual([
      "BẠC MIẾNG PHÚ QUÝ 999 1 LƯỢNG",
      "BẠC THỎI PHÚ QUÝ 999 10 LƯỢNG, 5 LƯỢNG",
      "ĐỒNG BẠC MỸ NGHỆ PHÚ QUÝ 999",
      "BẠC THỎI PHÚ QUÝ 999 1KILO",
    ]);
  });

  it("đơn vị niêm yết đọc theo từng dòng: lượng hoặc kg", () => {
    expect(table.rows[0]).toMatchObject({ unit: "luong", buy: 1_576_000, sell: 1_625_000 });
    expect(table.rows[3]).toMatchObject({ unit: "kg", buy: 42_026_562, sell: 43_333_225 });
  });
});

describe("đọc giá theo ngày (XemLai) của Phú Quý", () => {
  it("ngày 01/11/2026: đủ 12 dòng, bạc tính theo chỉ", () => {
    const table = parseDaily(fixture("daily-2026-11-01.html"), "2026-11-01");
    expect(table?.sourceDate).toBe("2026-11-01");
    expect(table?.rows).toHaveLength(12);
    expect(table?.rows.find((r) => r.name.startsWith("Bạc thỏi"))).toMatchObject({ unit: "chi", buy: 160_600 });
  });

  it("ngày 15/01/2025 có dòng trùng tên: giữ nguyên để bước khớp lấy dòng đầu", () => {
    const table = parseDaily(fixture("daily-2025-01-15.html"), "2025-01-15");
    expect(table?.rows.filter((r) => r.name === "Nhẫn tròn Phú Quý 999.9")).toHaveLength(2);
  });

  it("ngày 01/06/2023 không có dòng bạc", () => {
    const table = parseDaily(fixture("daily-2023-06-01.html"), "2023-06-01");
    expect(table?.rows).toHaveLength(9);
  });

  it("trang trả về ngày khác ngày hỏi thì coi như không có dữ liệu", () => {
    expect(parseDaily(fixture("daily-2023-06-01.html"), "2023-06-02")).toBeNull();
  });
});

describe("nguồn đổi cấu trúc hoặc giá lỗi thì bỏ cả bảng (PRICE-BR-003)", () => {
  it("không có bảng giá", () => {
    expect(() => parseGoldLive("<html><body>Bảo trì</body></html>")).toThrow();
  });

  it("có dòng giá mua vào bằng 0", () => {
    const html = fixture("gold-live.html").replace("13,670,000", "0");
    expect(() => parseGoldLive(html)).toThrow(/giá/i);
  });
});
