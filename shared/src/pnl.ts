import { totalFromUnit, unitFromTotal } from "./money";
import { fromMg, type PriceUnit } from "./units";

/**
 * Giá trị hiện tại = khối lượng × giá MUA VÀO của cửa hàng, tức số tiền thực nhận
 * nếu bán lại ngay. Không dùng giá bán ra vì sẽ thổi phồng lãi (HOLD-BR-004).
 */
export function valueOf(weightMg: number, priceUnit: PriceUnit, buyPrice: number): number {
  return totalFromUnit(buyPrice, weightMg, priceUnit);
}

/** Tỷ lệ lãi/lỗ theo %, làm tròn 2 chữ số; làm tròn đối xứng để lỗ và lãi cùng cách tròn. */
export function pctOf(pnl: number, cost: number): number {
  if (cost === 0) return 0;
  const raw = (pnl / cost) * 100;
  return (Math.sign(raw) * Math.round(Math.abs(raw) * 100)) / 100;
}

export interface Lot {
  weightMg: number;
  totalCost: number;
}

/** Giá vốn bình quân = tổng tiền mua ÷ tổng khối lượng, theo đơn vị niêm yết (HOLD-UC01/BR-13). */
export function avgCost(lots: readonly Lot[], priceUnit: PriceUnit): number {
  const mg = lots.reduce((s, l) => s + l.weightMg, 0);
  const total = lots.reduce((s, l) => s + l.totalCost, 0);
  return unitFromTotal(total, mg, priceUnit);
}

/** Điểm của một ngày mua trên biểu đồ: các lần mua cùng ngày gộp theo bình quân khối lượng. */
export function dayPoint(lots: readonly Lot[], priceUnit: PriceUnit): { unitPrice: number; qty: number } {
  const mg = lots.reduce((s, l) => s + l.weightMg, 0);
  return { unitPrice: avgCost(lots, priceUnit), qty: fromMg(mg, priceUnit) };
}
