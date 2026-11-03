import { describe, expect, it } from "vitest";
import { matchRows, type MatchProduct } from "../src/prices/match";

const products: MatchProduct[] = [
  { id: 1, name: "Nhẫn tròn Phú Quý 999.9", aliases: [], priceUnit: "chi" },
  { id: 2, name: "Vàng 999.0 phi SJC", aliases: [], priceUnit: "chi" },
  { id: 3, name: "Bạc miếng Phú Quý 999 1 lượng", aliases: ["BẠC MIẾNG PHÚ QUÝ 999 1 LƯỢNG", "Bạc thỏi Phú Quý 999 (1Kilo, 10 lượng, 5 lượng, 1 lượng)"], priceUnit: "luong" },
  { id: 4, name: "Bạc thỏi Phú Quý 999 1 kilo", aliases: ["BẠC THỎI PHÚ QUÝ 999 1KILO"], priceUnit: "kg" },
];

describe("khớp dòng giá của nguồn với sản phẩm (PRICE-BR-008)", () => {
  it("không phân biệt hoa thường và gộp dấu cách thừa", () => {
    const { matched } = matchRows(products, [
      { name: "NHẪN TRÒN PHÚ QUÝ 999.9", unit: "chi", buy: 100, sell: 110 },
      { name: "Vàng 999.0  phi SJC", unit: "chi", buy: 90, sell: null },
    ]);
    expect(matched.get(1)).toEqual({ buy: 100, sell: 110 });
    expect(matched.get(2)).toEqual({ buy: 90, sell: null });
  });

  it("dòng trùng tên thì lấy dòng đầu", () => {
    const { matched } = matchRows(products, [
      { name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: 100, sell: 110 },
      { name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: 999, sell: 999 },
    ]);
    expect(matched.get(1)).toEqual({ buy: 100, sell: 110 });
  });

  it("giá theo chỉ quy sang đơn vị niêm yết của sản phẩm (bạc theo ngày: chỉ → lượng)", () => {
    const { matched } = matchRows(products, [
      { name: "Bạc thỏi Phú Quý 999 (1Kilo, 10 lượng, 5 lượng, 1 lượng)", unit: "chi", buy: 160_600, sell: 165_600 },
    ]);
    expect(matched.get(3)).toEqual({ buy: 1_606_000, sell: 1_656_000 });
    expect(matched.has(4)).toBe(false);
  });

  it("dòng không khớp sản phẩm nào được trả về để ghi log", () => {
    const { unmatched } = matchRows(products, [{ name: "Vàng 18K", unit: "chi", buy: 1, sell: 1 }]);
    expect(unmatched).toEqual(["Vàng 18K"]);
  });
});
