import type { PriceUnit } from "@goldfolio/shared";
import { tx, type Db } from "./db";

// Danh mục thương hiệu và sản phẩm. Sửa danh sách ở đây rồi chạy `npm run seed`
// (hoặc khởi động lại server): chỉ thêm/cập nhật, không xoá sản phẩm đã có lần mua.

interface ProductDef {
  code: string;
  name: string;
  metal: "gold" | "silver";
  unit: PriceUnit;
  /** Tên khác mà nguồn giá dùng cho sản phẩm này (khớp không phân biệt hoa thường, PRICE-BR-008) */
  aliases?: string[];
}

interface BrandDef {
  code: string;
  name: string;
  isDefault?: boolean;
  hasSource: boolean;
  products: ProductDef[];
}

// Dòng bạc trên bảng giá vàng của Phú Quý (VNĐ/chỉ) — chỉ dùng cho giá theo ngày,
// vì trang bạc riêng không có lịch sử.
const PQ_SILVER_BAR_DAILY = "Bạc thỏi Phú Quý 999 (1Kilo, 10 lượng, 5 lượng, 1 lượng)";

export const CATALOG: BrandDef[] = [
  {
    // Thương hiệu mặc định (HOLD-BR-007). Tên sản phẩm lấy từ phuquygroup.vn và
    // giabac.phuquygroup.vn ngày 03/11/2026.
    code: "phuquy",
    name: "Phú Quý",
    isDefault: true,
    hasSource: true,
    products: [
      { code: "sjc", name: "Vàng miếng SJC", metal: "gold", unit: "chi" },
      { code: "nhan-tron-9999", name: "Nhẫn tròn Phú Quý 999.9", metal: "gold", unit: "chi" },
      { code: "1-luong-9999", name: "Phú Quý 1 Lượng 999.9", metal: "gold", unit: "chi" },
      { code: "1-luong-999", name: "Phú Quý 1 lượng 99.9", metal: "gold", unit: "chi" },
      { code: "trang-suc-9999", name: "Vàng trang sức 999.9", metal: "gold", unit: "chi" },
      { code: "trang-suc-999", name: "Vàng trang sức 999", metal: "gold", unit: "chi" },
      { code: "trang-suc-99", name: "Vàng trang sức 99", metal: "gold", unit: "chi" },
      { code: "trang-suc-98", name: "Vàng trang sức 98", metal: "gold", unit: "chi" },
      { code: "phi-sjc-9999", name: "Vàng 999.9 phi SJC", metal: "gold", unit: "chi" },
      { code: "phi-sjc-9990", name: "Vàng 999.0 phi SJC", metal: "gold", unit: "chi" },
      {
        code: "bac-mieng-1-luong",
        name: "Bạc miếng Phú Quý 999 1 lượng",
        metal: "silver",
        unit: "luong",
        aliases: ["BẠC MIẾNG PHÚ QUÝ 999 1 LƯỢNG", PQ_SILVER_BAR_DAILY],
      },
      {
        code: "bac-thoi-10-5-luong",
        name: "Bạc thỏi Phú Quý 999 10 lượng, 5 lượng",
        metal: "silver",
        unit: "luong",
        aliases: ["BẠC THỎI PHÚ QUÝ 999 10 LƯỢNG, 5 LƯỢNG", PQ_SILVER_BAR_DAILY],
      },
      {
        code: "dong-bac-my-nghe",
        name: "Đồng bạc mỹ nghệ Phú Quý 999",
        metal: "silver",
        unit: "luong",
        aliases: ["ĐỒNG BẠC MỸ NGHỆ PHÚ QUÝ 999", "Đồng bạc mỹ nghệ 999"],
      },
      // Bạc 1 kilo không có giá theo ngày: dòng bạc của bảng vàng tính theo chỉ, khác giá kg
      { code: "bac-thoi-1kg", name: "Bạc thỏi Phú Quý 999 1 kilo", metal: "silver", unit: "kg", aliases: ["BẠC THỎI PHÚ QUÝ 999 1KILO"] },
    ],
  },
  {
    // Chưa có adapter: danh sách nhập sẵn theo btmc.vn ngày 03/11/2026, chờ user duyệt.
    // Đơn vị vàng theo chỉ chưa xác minh (trang chỉ ghi "ĐVT 1 = 1.000 VNĐ").
    code: "btmc",
    name: "Bảo Tín Minh Châu",
    hasSource: false,
    products: [
      { code: "vrtl-mieng", name: "Vàng miếng VRTL Bảo Tín Minh Châu", metal: "gold", unit: "chi" },
      { code: "nhan-tron-tron", name: "Nhẫn tròn trơn Bảo Tín Minh Châu", metal: "gold", unit: "chi" },
      { code: "dong-xu-vrtl-01", name: "Đồng xu VRTL 0.1", metal: "gold", unit: "chi" },
      { code: "qua-mung-ban-vi", name: "Quà mừng bản vị vàng Bảo Tín Minh Châu", metal: "gold", unit: "chi" },
      { code: "sjc", name: "Vàng miếng SJC", metal: "gold", unit: "chi" },
      { code: "trang-suc-vrtl-9999", name: "Trang sức Vàng Rồng Thăng Long 999.9", metal: "gold", unit: "chi" },
      { code: "trang-suc-vrtl-999", name: "Trang sức Vàng Rồng Thăng Long 99.9", metal: "gold", unit: "chi" },
      { code: "bac-mieng-rtl", name: "Bạc miếng Bạc Rồng Thăng Long", metal: "silver", unit: "luong" },
      { code: "bac-thoi-rtl", name: "Bạc thỏi Bạc Rồng Thăng Long", metal: "silver", unit: "kg" },
    ],
  },
  {
    // Chưa có adapter: theo baotinmanhhai.vn/bang-gia-vang ngày 03/11/2026, chờ user duyệt.
    code: "btmh",
    name: "Bảo Tín Mạnh Hải",
    hasSource: false,
    products: [
      { code: "kim-gia-bao", name: "Kim Gia Bảo 24K", metal: "gold", unit: "chi" },
      { code: "kim-gia-bao-gift", name: "Kim Gia Bảo Gift 24K", metal: "gold", unit: "chi" },
      { code: "tieu-kim-cat", name: "Tiểu Kim Cát 24K", metal: "gold", unit: "chi" },
      { code: "nhan-tron", name: "Nhẫn tròn BTMH", metal: "gold", unit: "chi" },
      { code: "trang-suc-9999", name: "Vàng trang sức 24K 999.9", metal: "gold", unit: "chi" },
      { code: "trang-suc-999", name: "Vàng trang sức 24K 999", metal: "gold", unit: "chi" },
      { code: "sjc", name: "Vàng miếng SJC", metal: "gold", unit: "chi" },
      { code: "ngan-gia-bao-tu-quy", name: "Ngân Gia Bảo - Tứ Quý", metal: "silver", unit: "luong" },
      { code: "ngan-gia-bao-thoi", name: "Ngân Gia Bảo - Bạc thỏi 5 lượng, 10 lượng", metal: "silver", unit: "luong" },
      { code: "bac-thoi-1kg", name: "Bạc thỏi 1 kg", metal: "silver", unit: "kg" },
    ],
  },
  // SJC, DOJI, PNJ: chưa đọc được bảng giá chính thức (SJC chặn 403, DOJI/PNJ nạp bằng JS).
  // Tạm một sản phẩm cho mỗi hãng, chờ user gửi danh sách thật.
  {
    code: "sjc",
    name: "SJC",
    hasSource: false,
    products: [{ code: "mieng-9999", name: "Vàng miếng SJC 999.9", metal: "gold", unit: "chi" }],
  },
  {
    code: "doji",
    name: "DOJI",
    hasSource: false,
    products: [{ code: "sjc-9999", name: "Vàng miếng SJC 999.9", metal: "gold", unit: "chi" }],
  },
  {
    code: "pnj",
    name: "PNJ",
    hasSource: false,
    products: [{ code: "sjc-9999", name: "Vàng miếng SJC 999.9", metal: "gold", unit: "chi" }],
  },
];

/** Thêm hoặc cập nhật thương hiệu/sản phẩm theo CATALOG. Không xoá gì, chạy lại nhiều lần được. */
export function seedCatalog(db: Db, catalog: BrandDef[] = CATALOG): void {
  const upsertBrand = db.prepare(`
    INSERT INTO brands (code, name, is_default, has_source, sort_order) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, is_default = excluded.is_default,
      has_source = excluded.has_source, sort_order = excluded.sort_order
    RETURNING id`);
  const upsertProduct = db.prepare(`
    INSERT INTO products (brand_id, code, name, metal, price_unit, source, aliases_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(brand_id, code) DO UPDATE SET name = excluded.name, metal = excluded.metal,
      price_unit = excluded.price_unit, source = excluded.source,
      aliases_json = excluded.aliases_json, sort_order = excluded.sort_order`);

  tx(db, () => {
    catalog.forEach((b, bi) => {
      const { id } = upsertBrand.get(b.code, b.name, b.isDefault ? 1 : 0, b.hasSource ? 1 : 0, bi) as { id: number };
      b.products.forEach((p, pi) => {
        upsertProduct.run(id, p.code, p.name, p.metal, p.unit, b.hasSource ? "live" : "seed", JSON.stringify(p.aliases ?? []), pi);
      });
    });
  });
}
