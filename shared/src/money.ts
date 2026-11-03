import { MG_PER_UNIT, type PriceUnit } from "./units";

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

/** Tổng tiền = đơn giá (theo đơn vị niêm yết) × khối lượng, làm tròn tới đồng (HOLD-UC01/BR-5). */
export function totalFromUnit(unitPrice: number, weightMg: number, priceUnit: PriceUnit): number {
  return mulDivRound(unitPrice, weightMg, MG_PER_UNIT[priceUnit]);
}

/** Đơn giá = tổng tiền ÷ khối lượng quy về đơn vị niêm yết, làm tròn tới đồng (HOLD-UC01/BR-5). */
export function unitFromTotal(total: number, weightMg: number, priceUnit: PriceUnit): number {
  return mulDivRound(total, MG_PER_UNIT[priceUnit], weightMg);
}
