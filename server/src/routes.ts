import { Router } from "express";
import { formatDateTimeVn, formatDateVn } from "@goldfolio/shared";
import type { Db } from "./db";
import { HttpError, asyncHandler, currentUserId } from "./http";
import type { PriceService } from "./prices/service";
import { buildHistory, buildPortfolio } from "./portfolio/service";

/** Thương hiệu và sản phẩm chọn được cho lần mua mới (HOLD-UC01/BR-1, BR-2, BR-15). */
export function brandsRouter(db: Db): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    const brands = db.prepare("SELECT * FROM brands ORDER BY sort_order").all() as {
      id: number;
      code: string;
      name: string;
      is_default: number;
      has_source: number;
    }[];
    const products = db
      .prepare("SELECT id, brand_id, name, metal, price_unit FROM products WHERE active = 1 ORDER BY sort_order")
      .all() as { id: number; brand_id: number; name: string; metal: string; price_unit: string }[];
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
  });
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
      if (!productId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Thiếu sản phẩm hoặc ngày mua");
      const brand = db.prepare("SELECT b.name FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?").get(productId) as
        | { name: string }
        | undefined;
      const p = brand ? await prices.priceAt(productId, date, time) : null;
      // Nguồn chỉ có giá mua vào thì không gợi ý được giá đã trả (PRICE-BR-006)
      if (!brand || !p || p.sell === null) {
        res.json({ unitPrice: null, label: "Chưa có giá tham khảo cho thời điểm này" });
        return;
      }
      const label =
        p.kind === "live" && p.sourceTime
          ? `Giá ${brand.name} lúc ${formatDateTimeVn(p.sourceTime)}`
          : `Giá ${brand.name} ngày ${formatDateVn(p.sourceDate)}`;
      res.json({ unitPrice: p.sell, label });
    }),
  );
  return router;
}

export function portfolioRouter(db: Db, prices: PriceService, now: () => Date): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(buildPortfolio(db, prices, currentUserId(res)));
  });
  router.get("/history", (req, res) => {
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    res.json(buildHistory(db, prices, currentUserId(res), now(), productId));
  });
  return router;
}
