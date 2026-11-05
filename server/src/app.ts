import express, { type Express } from "express";
import { join } from "node:path";
import cookieParser from "cookie-parser";
import type { Db } from "./db";
import { errorHandler } from "./http";
import { authRouter, requireUser } from "./auth/auth";
import { purchasesRouter } from "./purchases/routes";
import { brandsRouter, portfolioRouter, pricesRouter } from "./routes";
import type { PriceService } from "./prices/service";

export interface AppDeps {
  db: Db;
  prices: PriceService;
  /** Đồng hồ, tiêm vào để test "hôm nay" / "hiện tại" */
  now?: () => Date;
  /** Thư mục bản build của web (web/dist). Có thì server trả luôn giao diện, để deploy một service duy nhất */
  webDist?: string;
}

/** Tạo app Express (không listen) để server và test dùng chung. */
export function createApp({ db, prices, now = () => new Date(), webDist }: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", authRouter(db));
  const auth = requireUser(db);
  app.use("/api/brands", auth, brandsRouter(db));
  app.use("/api/prices", auth, pricesRouter(db, prices));
  app.use("/api/purchases", auth, purchasesRouter(db, prices, now));
  app.use("/api/portfolio", auth, portfolioRouter(db, prices, now));
  // /api lạ trả lỗi JSON, không rơi xuống trang web phía dưới
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Không tìm thấy" });
  });

  if (webDist) {
    app.use(express.static(webDist));
    // Web dùng route phía trình duyệt (/lan-mua, /sua/5…): mở thẳng hoặc tải lại trang thì trả index.html
    app.get("*", (_req, res) => {
      res.sendFile(join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
