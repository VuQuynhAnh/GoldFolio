import { Router } from "express";
import type { Db } from "../db";
import { asyncHandler, currentUserId } from "../http";
import type { PriceService } from "../prices/service";
import type { ChatModel } from "../ai/chat";
import { answer, chatQuota } from "./service";

/** Chat hỏi AI về giá và danh mục (PRICE-UC03). Lịch sử chat chỉ ở trình duyệt, server không lưu. */
export function chatRouter(db: Db, prices: PriceService, model: ChatModel | undefined, now: () => Date): Router {
  const router = Router();
  // Số câu còn được hỏi hôm nay
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await chatQuota(db, currentUserId(res), now()));
    }),
  );
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await answer({ db, prices, model, now }, currentUserId(res), req.body));
    }),
  );
  return router;
}
