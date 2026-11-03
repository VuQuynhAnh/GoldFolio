import { Router } from "express";
import type { Db } from "./db";
import { HttpError, asyncHandler, currentUserId } from "./http";
import type { PriceService } from "./prices/service";
import { sellPriceAt } from "./prices/suggest";
import { buildHistory, buildPortfolio } from "./portfolio/service";

/** Thương hiệu và sản phẩm chọn được cho lần mua mới (HOLD-UC01/BR-1, BR-2, BR-15). */
export function brandsRouter(db: Db): Router {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const brands = await db.query<{ id: number; code: string; name: string; is_default: number; has_source: number }>(
        "SELECT * FROM brands ORDER BY sort_order",
      );
      const products = await db.query<{ id: number; brand_id: number; name: string; metal: string; price_unit: string }>(
        "SELECT id, brand_id, name, metal, price_unit FROM products WHERE active = 1 ORDER BY sort_order",
      );
      res.json({
        brands: brands.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          isDefault: b.is_default === 1,
          hasSource: b.has_source === 1,
          products: products
            .filter((p) => p.brand_id === b.id)
            .map((p) => ({ id: p.id, name: p.name, metal: p.metal, priceUnit: p.price_unit })),
        })),
      });
    }),
  );
  return router;
}

/** Gợi ý đơn giá mua = giá bán ra tại thời điểm mua (HOLD-UC01/BR-6, PRICE-BR-004). */
export function pricesRouter(db: Db, prices: PriceService): Router {
  const router = Router();
  router.get(
    "/suggest",
    asyncHandler(async (req, res) => {
      const productId = Number(req.query.productId);
      const date = String(req.query.date ?? "");
      const time = req.query.time ? String(req.query.time) : null;
      if (!Number.isSafeInteger(productId) || productId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new HttpError(400, "Thiếu sản phẩm hoặc ngày mua");
      }
      res.json((await sellPriceAt(db, prices, productId, date, time)) ?? { unitPrice: null, label: "Chưa có giá tham khảo cho thời điểm này" });
    }),
  );
  return router;
}

export function portfolioRouter(db: Db, prices: PriceService, now: () => Date): Router {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await buildPortfolio(db, prices, currentUserId(res)));
    }),
  );
  router.get(
    "/history",
    asyncHandler(async (req, res) => {
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      // id không phải số nguyên thì coi như không có sản phẩm đó (tránh lỗi kiểu của Postgres)
      if (productId !== undefined && !Number.isSafeInteger(productId)) throw new HttpError(404, "Không tìm thấy sản phẩm");
      res.json(await buildHistory(db, prices, currentUserId(res), now(), productId));
    }),
  );
  return router;
}
