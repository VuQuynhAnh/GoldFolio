import { MG_PER_UNIT, type WeightUnit } from "./units";

// Tiền luôn là số nguyên VNĐ. Giới hạn trên của tiền và khối lượng giữ mọi kết quả là
// số nguyên chính xác trong JS (R-MONEY-02).
export const MAX_MONEY = 1_000_000_000_000; // 1.000 tỷ đồng

/**
 * a × b ÷ d làm tròn nửa lên, tính bằng BigInt: tích đơn giá × miligram có thể vượt 2^53
 * dù kết quả cuối nằm trong giới hạn, tính bằng số thực sẽ lệch đồng cuối.
 */
function mulDivRound(a: number, b: number, d: number): number {
  const n = BigInt(Math.round(a)) * BigInt(Math.round(b));
  const den = BigInt(d);
  return Number((2n * n + den) / (2n * den));
}

/**
 * Tổng tiền = đơn giá × khối lượng, làm tròn tới đồng. `unit` là đơn vị của đơn giá: đơn vị
 * khối lượng người dùng đang chọn khi nhập (HOLD-UC01/BR-5), hoặc đơn vị niêm yết khi định giá.
 */
export function totalFromUnit(unitPrice: number, weightMg: number, unit: WeightUnit): number {
  return mulDivRound(unitPrice, weightMg, MG_PER_UNIT[unit]);
}

/** Đơn giá theo `unit` = tổng tiền ÷ khối lượng, làm tròn tới đồng (HOLD-UC01/BR-5). */
export function unitFromTotal(total: number, weightMg: number, unit: WeightUnit): number {
  return mulDivRound(total, MG_PER_UNIT[unit], weightMg);
}

/** Đổi đơn giá giữa các đơn vị, vd 13.900.000/chỉ → 139.000.000/lượng (BR-5, BR-6). */
export function convertUnitPrice(price: number, from: WeightUnit, to: WeightUnit): number {
  return from === to ? price : mulDivRound(price, MG_PER_UNIT[to], MG_PER_UNIT[from]);
}
