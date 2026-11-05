import { avgCost, formatWeight, pctOf, vnDate, type PriceUnit } from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError } from "../http";
import { isDefaultProduct } from "../catalog";
import type { PriceService } from "../prices/service";
import { TrendModelError, type TrendAnalysis, type TrendInput, type TrendModel, type TrendStats } from "../ai/trend";

/** Số ngày giá đưa vào nhận định (user chốt 2026-11-05) */
export const TREND_DAYS = 30;
/** Ít hơn số ngày có giá này thì nhận định không có ý nghĩa, không gọi AI */
export const MIN_TREND_POINTS = 5;
/** Số lần "Phân tích lại" mỗi ngày cho mỗi kim loại, để không vượt hạn mức gói AI miễn phí */
export const MAX_REFRESH_PER_DAY = 3;

export type Metal = "gold" | "silver";

export interface TrendView {
  metal: Metal;
  date: string;
  productId: number;
  productName: string;
  priceUnit: PriceUnit;
  stats: TrendStats;
  analysis: TrendAnalysis;
  model: string;
  createdAt: string;
  refreshesLeft: number;
}

interface InsightRow {
  product_id: number;
  content_json: string;
  model: string;
  created_at: string;
  refresh_count: number;
}

interface ProductRow {
  id: number;
  code: string;
  name: string;
  price_unit: PriceUnit;
  brand_code: string;
}

/**
 * Sản phẩm để nhận định: sản phẩm người dùng bỏ nhiều tiền nhất trong kim loại đó; chưa có
 * thì sản phẩm mặc định của thương hiệu mặc định (vàng: nhẫn tròn; bạc: sản phẩm bạc đầu tiên).
 * Chỉ sản phẩm có nguồn giá mới có giá theo ngày.
 */
async function pickProduct(db: Db, userId: number, metal: Metal): Promise<ProductRow> {
  const held = await db.one<ProductRow>(
    `SELECT p.id, p.code, p.name, p.price_unit, b.code AS brand_code FROM purchases pu
     JOIN products p ON p.id = pu.product_id JOIN brands b ON b.id = p.brand_id
     WHERE pu.user_id = $1 AND p.metal = $2 AND p.source = 'live'
     GROUP BY p.id, b.code ORDER BY SUM(pu.total_cost) DESC, p.id LIMIT 1`,
    [userId, metal],
  );
  if (held) return held;
  const candidates = await db.query<ProductRow>(
    `SELECT p.id, p.code, p.name, p.price_unit, b.code AS brand_code FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE b.is_default = 1 AND p.metal = $1 AND p.source = 'live' ORDER BY p.sort_order`,
    [metal],
  );
  const pick = candidates.find((p) => isDefaultProduct(p.brand_code, p.code)) ?? candidates[0];
  if (!pick) throw new HttpError(409, "Chưa có sản phẩm có nguồn giá để nhận định");
  return pick;
}

function computeStats(series: TrendInput["series"]): TrendStats {
  const buys = series.map((p) => p.buy);
  const first = buys[0]!;
  const last = buys.at(-1)!;
  return { days: series.length, firstBuy: first, lastBuy: last, changePct: pctOf(last - first, first), minBuy: Math.min(...buys), maxBuy: Math.max(...buys) };
}

async function holdingOf(db: Db, userId: number, product: ProductRow): Promise<TrendInput["holding"]> {
  const lots = await db.query<{ weight_mg: number; total_cost: number }>(
    "SELECT weight_mg, total_cost FROM purchases WHERE user_id = $1 AND product_id = $2",
    [userId, product.id],
  );
  if (lots.length === 0) return null;
  const mg = lots.reduce((s, l) => s + l.weight_mg, 0);
  const total = lots.reduce((s, l) => s + l.total_cost, 0);
  return {
    weightText: formatWeight(mg, product.price_unit, product.price_unit),
    avgCost: avgCost(lots.map((l) => ({ weightMg: l.weight_mg, totalCost: l.total_cost })), product.price_unit),
    totalCost: total,
  };
}

/** Ngày "YYYY-MM-DD" lùi `n` ngày */
function daysBefore(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - n)).toISOString().slice(0, 10);
}

/**
 * Nhận định xu hướng giá của một kim loại cho người dùng (PRICE-UC02). Mỗi ngày phân tích
 * một lần rồi lưu; `refresh` = người dùng bấm "Phân tích lại" (giới hạn lượt mỗi ngày).
 */
export async function getTrend(
  deps: { db: Db; prices: PriceService; model?: TrendModel; now: () => Date },
  userId: number,
  metal: Metal,
  refresh: boolean,
): Promise<TrendView> {
  const { db, prices, model } = deps;
  if (!model) throw new HttpError(503, "Chưa bật AI nhận định (thiếu GEMINI_API_KEY)");
  const today = vnDate(deps.now());
  const saved = await db.one<InsightRow>(
    "SELECT product_id, content_json, model, created_at, refresh_count FROM trend_insights WHERE user_id = $1 AND metal = $2 AND date = $3",
    [userId, metal, today],
  );
  if (saved && refresh && saved.refresh_count >= MAX_REFRESH_PER_DAY) {
    throw new HttpError(429, `Hôm nay đã phân tích lại đủ ${MAX_REFRESH_PER_DAY} lần, mai thử lại nhé`);
  }

  const product = await pickProduct(db, userId, metal);
  const series = await prices.dailySeries(product.id, daysBefore(today, TREND_DAYS), today);
  if (series.length < MIN_TREND_POINTS) {
    // Thiếu giá: tự tải bù 30 ngày (chạy nền, dùng chung với lịch lấy giá) và báo đang tải để
    // giao diện tự thử lại; đã tải bù xong mà vẫn thiếu thì nguồn không có, báo rõ (BR-3)
    if (!prices.backfilledToday(product.brand_code)) {
      prices.startBackfill(product.brand_code, TREND_DAYS).catch((err) => console.warn(`[giá ${product.brand_code}] lỗi tải bù:`, err));
      throw new HttpError(409, "Đang tải giá 30 ngày gần nhất, đợi khoảng 1 phút", { trend: "loading" });
    }
    throw new HttpError(409, `Nguồn giá chưa có đủ số liệu để nhận định (cần ít nhất ${MIN_TREND_POINTS} ngày)`);
  }
  const stats = computeStats(series);
  const view = (row: InsightRow): TrendView => {
    const content = JSON.parse(row.content_json) as { analysis: TrendAnalysis; stats: TrendStats };
    return {
      metal,
      date: today,
      productId: product.id,
      productName: product.name,
      priceUnit: product.price_unit,
      stats: content.stats,
      analysis: content.analysis,
      model: row.model,
      createdAt: row.created_at,
      refreshesLeft: MAX_REFRESH_PER_DAY - row.refresh_count,
    };
  };
  // Bản hôm nay đã có và vẫn cho đúng sản phẩm thì dùng lại, không tốn lượt AI
  if (saved && !refresh && saved.product_id === product.id) return view(saved);

  let analysis: TrendAnalysis;
  try {
    analysis = await model.analyze({ metal, productName: product.name, priceUnit: product.price_unit, series, stats, holding: await holdingOf(db, userId, product) });
  } catch (err) {
    if (err instanceof TrendModelError) {
      console.warn(`[AI ${model.name}] ${err.kind}: ${err.message}`);
      if (err.kind === "quota") throw new HttpError(503, "AI đã hết lượt miễn phí, thử lại sau");
      throw new HttpError(502, "Chưa phân tích được, thử lại sau");
    }
    throw err;
  }

  const row: InsightRow = {
    product_id: product.id,
    content_json: JSON.stringify({ analysis, stats }),
    model: model.name,
    created_at: deps.now().toISOString(),
    refresh_count: saved ? saved.refresh_count + (refresh ? 1 : 0) : 0,
  };
  await db.query(
    `INSERT INTO trend_insights (user_id, metal, date, product_id, content_json, model, created_at, refresh_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, metal, date) DO UPDATE SET product_id = excluded.product_id, content_json = excluded.content_json,
       model = excluded.model, created_at = excluded.created_at, refresh_count = excluded.refresh_count`,
    [userId, metal, today, row.product_id, row.content_json, row.model, row.created_at, row.refresh_count],
  );
  return view(row);
}
