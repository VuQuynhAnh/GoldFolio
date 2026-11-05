// Đơn vị khối lượng vàng bạc (HOLD-BR-002). Lưu mọi khối lượng bằng miligram
// số nguyên để quy đổi qua lại giữa chỉ, lượng, gram, kg không bị lệch.
export type WeightUnit = "chi" | "luong" | "gram" | "kg";
// Đơn vị niêm yết giá của sản phẩm: các thương hiệu chỉ báo giá theo chỉ, lượng hoặc kg.
export type PriceUnit = "chi" | "luong" | "kg";

export const WEIGHT_UNITS: readonly WeightUnit[] = ["chi", "luong", "gram", "kg"];

// 1 chỉ = 3,75 g; 1 lượng (cây) = 10 chỉ; 1 kg = 1000 g
export const MG_PER_UNIT: Record<WeightUnit, number> = {
  chi: 3750,
  luong: 37_500,
  gram: 1000,
  kg: 1_000_000,
};

// Khối lượng một lần mua tối đa 1.000 kg (R-MONEY-02)
export const MAX_WEIGHT_MG = 1_000 * 1_000_000;

export const UNIT_LABEL: Record<WeightUnit, string> = {
  chi: "chỉ",
  luong: "lượng",
  gram: "g",
  kg: "kg",
};

export function toMg(value: number, unit: WeightUnit): number {
  return Math.round(value * MG_PER_UNIT[unit]);
}

/** Khối lượng theo đơn vị `unit`, làm tròn 3 chữ số thập phân để hiển thị và so sánh. */
export function fromMg(mg: number, unit: WeightUnit): number {
  return Math.round((mg / MG_PER_UNIT[unit]) * 1000) / 1000;
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Gợi ý khối lượng hay mua theo đơn vị, cho ô vừa chọn vừa gõ (HOLD-UC01/BR-3).
 * Chỉ: 0,5 → 10 bước 0,5 (user chốt); đơn vị khác là các cỡ miếng/thỏi thường gặp.
 */
export const WEIGHT_PRESETS: Record<WeightUnit, readonly number[]> = {
  chi: Array.from({ length: 20 }, (_, i) => (i + 1) / 2),
  luong: [1, 2, 3, 5, 10],
  gram: [1, 2, 5, 10, 37.5],
  kg: [0.5, 1, 2, 5],
};

/**
 * Đọc khối lượng người dùng gõ: nhận cả dấu phẩy thập phân kiểu Việt Nam, phải > 0.
 * Theo chỉ thì bước nhỏ nhất 0,1 (1 chữ số thập phân); đơn vị khác tối đa 3 chữ số
 * thập phân (HOLD-UC01/BR-3).
 */
export function parseWeight(input: string | number, unit?: WeightUnit): ParseResult {
  const text = String(input).trim().replace(",", ".");
  if (text === "") return { ok: false, error: "Vui lòng nhập khối lượng" };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Khối lượng không hợp lệ" };
  const value = Number(text);
  if (!(value > 0)) return { ok: false, error: "Khối lượng phải lớn hơn 0" };
  const decimals = text.split(".")[1]?.length ?? 0;
  if (unit === "chi" && decimals > 1) return { ok: false, error: "Khối lượng nhập theo bước 0,1 chỉ" };
  if (decimals > 3) return { ok: false, error: "Khối lượng có tối đa 3 chữ số thập phân" };
  return { ok: true, value };
}
