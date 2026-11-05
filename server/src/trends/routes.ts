import { Router } from "express";
import type { Db } from "../db";
import { HttpError, asyncHandler, currentUserId } from "../http";
import type { PriceService } from "../prices/service";
import type { TrendModel } from "../ai/trend";
import { getTrend, type Metal } from "./service";

function metalOf(v: unknown): Metal {
  if (v === "gold" || v === "silver") return v;
  throw new HttpError(400, "Kim loại không hợp lệ");
}

/** AI nhận định xu hướng giá vàng/bạc (PRICE-UC02). */
export function trendsRouter(db: Db, prices: PriceService, model: TrendModel | undefined, now: () => Date): Router {
  const router = Router();
  const deps = { db, prices, model, now };
  // Bản của hôm nay; chưa có thì phân tích luôn
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json({ trend: await getTrend(deps, currentUserId(res), metalOf(req.query.metal), false) });
    }),
  );
  // Nút "Phân tích lại"
  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      res.json({ trend: await getTrend(deps, currentUserId(res), metalOf((req.body as { metal?: unknown })?.metal), true) });
    }),
  );
  return router;
}
