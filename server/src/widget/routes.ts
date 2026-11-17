import { Router, type RequestHandler } from "express";
import type { Db } from "../db";
import { HttpError, asyncHandler, currentUserId } from "../http";
import type { PriceService } from "../prices/service";
import { buildWidget, createToken, revokeToken, tokenInfo, userOfToken } from "./service";

/**
 * Widget màn hình chính (HOLD-UC02).
 * - `/token`: quản lý mã widget, cần đăng nhập bằng cookie như mọi API khác.
 * - `GET /`: số liệu cho widget, xác thực bằng mã widget (header `Authorization: Bearer <mã>`),
 *   vì widget không có cookie đăng nhập. Mã chỉ mở được đúng API này, chỉ đọc (BR-3).
 */
export function widgetRouter(db: Db, prices: PriceService, requireUser: RequestHandler, now: () => Date): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const header = req.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const userId = token ? await userOfToken(db, token, now()) : undefined;
      if (!userId) throw new HttpError(401, "Mã widget không đúng hoặc đã bị thu hồi, tạo mã mới trong GoldFolio");
      // Widget tự làm mới theo nhịp điện thoại; không cần proxy/trình duyệt giữ bản cũ
      res.set("Cache-Control", "no-store");
      res.json(await buildWidget(db, prices, userId, now()));
    }),
  );

  router.get(
    "/token",
    requireUser,
    asyncHandler(async (_req, res) => {
      res.json(await tokenInfo(db, currentUserId(res)));
    }),
  );
  router.post(
    "/token",
    requireUser,
    asyncHandler(async (_req, res) => {
      const userId = currentUserId(res);
      const token = await createToken(db, userId, now());
      res.status(201).json({ token, ...(await tokenInfo(db, userId)) });
    }),
  );
  router.delete(
    "/token",
    requireUser,
    asyncHandler(async (_req, res) => {
      await revokeToken(db, currentUserId(res));
      res.status(204).end();
    }),
  );
  return router;
}
