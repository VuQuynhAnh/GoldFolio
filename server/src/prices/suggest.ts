import { formatDateTimeVn, formatDateVn } from "@goldfolio/shared";
import type { Db } from "../db";
import type { PriceService } from "./service";

/**
 * Giá bán ra tại thời điểm mua kèm nhãn nguồn, vd "Giá Phú Quý lúc 09:00 01/11/2026" hoặc
 * "Giá Phú Quý ngày 15/01/2025" (PRICE-BR-004). Dùng cho gợi ý giá (HOLD-UC01/BR-6) và
 * tự lấy giá khi để trống (BR-16). null khi không có: chưa có nguồn, ngày không có dữ liệu,
 * hoặc nguồn chỉ công bố giá mua vào (PRICE-BR-006).
 */
export async function sellPriceAt(
  db: Db,
  prices: PriceService,
  productId: number,
  date: string,
  time: string | null,
): Promise<{ unitPrice: number; label: string } | null> {
  const brand = await db.one<{ name: string }>("SELECT b.name FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = $1", [productId]);
  if (!brand) return null;
  const p = await prices.priceAt(productId, date, time);
  if (!p || p.sell === null) return null;
  const label =
    p.kind === "live" && p.sourceTime
      ? `Giá ${brand.name} lúc ${formatDateTimeVn(p.sourceTime)}`
      : `Giá ${brand.name} ngày ${formatDateVn(p.sourceDate)}`;
  return { unitPrice: p.sell, label };
}
