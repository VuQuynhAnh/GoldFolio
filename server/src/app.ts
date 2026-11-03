import express, { type Express } from "express";
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
}

/** Tạo app Express (không listen) để server và test dùng chung. */
export function createApp({ db, prices, now = () => new Date() }: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", authRouter(db));
  const auth = requireUser(db);
  app.use("/api/brands", auth, brandsRouter(db));
  app.use("/api/prices", auth, pricesRouter(db, prices));
  app.use("/api/purchases", auth, purchasesRouter(db, now));
  app.use("/api/portfolio", auth, portfolioRouter(db, prices, now));

  app.use(errorHandler);
  return app;
}
