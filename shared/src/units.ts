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
 * Đọc khối lượng người dùng gõ: nhận cả dấu phẩy thập phân kiểu Việt Nam,
 * phải > 0 và có tối đa 3 chữ số thập phân (HOLD-UC01/BR-3).
 */
export function parseWeight(input: string | number): ParseResult {
  const text = String(input).trim().replace(",", ".");
  if (text === "") return { ok: false, error: "Vui lòng nhập khối lượng" };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Khối lượng không hợp lệ" };
  const value = Number(text);
  if (!(value > 0)) return { ok: false, error: "Khối lượng phải lớn hơn 0" };
  const decimals = text.split(".")[1]?.length ?? 0;
  if (decimals > 3) return { ok: false, error: "Khối lượng có tối đa 3 chữ số thập phân" };
  return { ok: true, value };
}
