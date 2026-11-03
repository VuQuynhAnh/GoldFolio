import {
  avgCost,
  dayPoint,
  formatWeight,
  pctOf,
  valueOf,
  vnDate,
  type PriceUnit,
  type WeightUnit,
} from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError } from "../http";
import type { LatestPrice, PriceService } from "../prices/service";

interface Row {
  id: number;
  product_id: number;
  product_name: string;
  brand_name: string;
  metal: "gold" | "silver";
  price_unit: PriceUnit;
  weight_mg: number;
  input_unit: WeightUnit;
  purchase_date: string;
  purchase_time: string | null;
  price_mode: "unit" | "total";
  unit_cost: number;
  total_cost: number;
  note: string;
  price_source: "manual" | "auto";
  price_note: string;
}

interface Totals {
  totalCost: number;
  value: number;
  pnl: number;
  pct: number;
  /** Số lần mua chưa có giá, không tính vào tổng (HOLD-BR-006) */
  excludedCount: number;
  /** Giờ của giá cũ nhất đang dùng, để người dùng biết con số mới tới đâu */
  priceTime: string | null;
}

// Khối lượng của nhóm kim loại: vàng theo chỉ, bạc theo lượng (HOLD-UC01/BR-10)
const METAL_UNIT: Record<string, PriceUnit> = { gold: "chi", silver: "luong" };
const METAL_LABEL: Record<string, string> = { gold: "Vàng", silver: "Bạc" };

function loadRows(db: Db, userId: number): Row[] {
  return db
    .prepare(
      `SELECT pu.*, p.name AS product_name, p.metal, p.price_unit, b.name AS brand_name
       FROM purchases pu JOIN products p ON p.id = pu.product_id JOIN brands b ON b.id = p.brand_id
       WHERE pu.user_id = ?
       ORDER BY pu.purchase_date DESC, COALESCE(pu.purchase_time, '23:59') DESC, pu.id DESC`,
    )
    .all(userId) as unknown as Row[];
}

function priceCache(prices: PriceService) {
  const cache = new Map<number, LatestPrice | null>();
  return (productId: number) => {
    if (!cache.has(productId)) cache.set(productId, prices.latest(productId));
    return cache.get(productId)!;
  };
}

/** Cộng dồn lãi/lỗ; chỉ tính lần mua đã có giá hiện tại (HOLD-UC01/BR-9). */
function sum(items: { totalCost: number; current: { value: number; priceTime: string } | null }[]): Totals {
  const priced = items.filter((i) => i.current);
  const totalCost = priced.reduce((s, i) => s + i.totalCost, 0);
  const value = priced.reduce((s, i) => s + i.current!.value, 0);
  const times = priced.map((i) => i.current!.priceTime).sort();
  return {
    totalCost,
    value,
    pnl: value - totalCost,
    pct: pctOf(value - totalCost, totalCost),
    excludedCount: items.length - priced.length,
    priceTime: times[0] ?? null,
  };
}

/** Màn hình "Tài sản của tôi": tổng quan, nhóm kim loại → sản phẩm, danh sách lần mua (HOLD-UC01/BR-9, BR-10). */
export function buildPortfolio(db: Db, prices: PriceService, userId: number) {
  const latest = priceCache(prices);
  const items = loadRows(db, userId).map((r) => {
    const price = latest(r.product_id);
    const value = price ? valueOf(r.weight_mg, r.price_unit, price.buy) : 0;
    return {
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      brandName: r.brand_name,
      metal: r.metal,
      priceUnit: r.price_unit,
      weightMg: r.weight_mg,
      weightText: formatWeight(r.weight_mg, r.price_unit, r.input_unit),
      purchaseDate: r.purchase_date,
      purchaseTime: r.purchase_time,
      priceMode: r.price_mode,
      unitCost: r.unit_cost,
      totalCost: r.total_cost,
      note: r.note,
      priceSource: r.price_source,
      priceNote: r.price_note,
      current: price
        ? { buyPrice: price.buy, value, pnl: value - r.total_cost, pct: pctOf(value - r.total_cost, r.total_cost), priceTime: price.sourceTime }
        : null,
    };
  });

  const groups = (["gold", "silver"] as const)
    .map((metal) => {
      const ofMetal = items.filter((i) => i.metal === metal);
      const productIds = [...new Set(ofMetal.map((i) => i.productId))];
      const products = productIds.map((pid) => {
        const ofProduct = ofMetal.filter((i) => i.productId === pid);
        const first = ofProduct[0]!;
        const mg = ofProduct.reduce((s, i) => s + i.weightMg, 0);
        return {
          productId: pid,
          productName: first.productName,
          brandName: first.brandName,
          count: ofProduct.length,
          weightText: formatWeight(mg, first.priceUnit, first.priceUnit),
          ...sum(ofProduct),
        };
      });
      const mg = ofMetal.reduce((s, i) => s + i.weightMg, 0);
      return {
        metal,
        label: METAL_LABEL[metal],
        weightText: formatWeight(mg, METAL_UNIT[metal]!, METAL_UNIT[metal]!),
        ...sum(ofMetal),
        products,
        empty: ofMetal.length === 0,
      };
    })
    .filter((g) => !g.empty)
    .map(({ empty: _empty, ...g }) => g);

  return { summary: sum(items), groups, items };
}

/**
 * Biểu đồ lịch sử giá của một sản phẩm (HOLD-UC01/BR-13, BR-14): mỗi ngày mua một
 * điểm (đơn giá bình quân theo khối lượng), điểm hôm nay = giá mua vào hiện tại,
 * kèm giá vốn bình quân. Chỉ dùng đơn giá đã nhập, không cần lịch sử ảnh chụp giá.
 */
export function buildHistory(db: Db, prices: PriceService, userId: number, now: Date, productId?: number) {
  const rows = loadRows(db, userId);
  const totals = new Map<number, { productId: number; productName: string; brandName: string; totalCost: number }>();
  for (const r of rows) {
    const t = totals.get(r.product_id) ?? { productId: r.product_id, productName: r.product_name, brandName: r.brand_name, totalCost: 0 };
    t.totalCost += r.total_cost;
    totals.set(r.product_id, t);
  }
  // Mặc định: sản phẩm bỏ nhiều tiền nhất
  const products = [...totals.values()].sort((a, b) => b.totalCost - a.totalCost);
  if (products.length === 0) return { products, productId: null, priceUnit: null, points: [], today: null, avgCost: null };

  const selected = productId ?? products[0]!.productId;
  if (!totals.has(selected)) throw new HttpError(404, "Không tìm thấy sản phẩm");

  const lots = rows.filter((r) => r.product_id === selected);
  const unit = lots[0]!.price_unit;
  const price = prices.latest(selected);
  const byDate = new Map<string, { weightMg: number; totalCost: number }[]>();
  for (const r of lots) byDate.set(r.purchase_date, [...(byDate.get(r.purchase_date) ?? []), { weightMg: r.weight_mg, totalCost: r.total_cost }]);

  const points = [...byDate.keys()].sort().map((date) => {
    const p = dayPoint(byDate.get(date)!, unit);
    return { date, unitPrice: p.unitPrice, qty: p.qty, diff: price ? price.buy - p.unitPrice : null };
  });

  return {
    products,
    productId: selected,
    priceUnit: unit,
    points,
    today: price ? { date: vnDate(now), buyPrice: price.buy, priceTime: price.sourceTime } : null,
    avgCost: avgCost(lots.map((r) => ({ weightMg: r.weight_mg, totalCost: r.total_cost })), unit),
  };
}
