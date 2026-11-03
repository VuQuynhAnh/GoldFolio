import { Router } from "express";
import { fromMg, type WeightUnit } from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError, asyncHandler, currentUserId } from "../http";
import type { PriceService } from "../prices/service";
import { resolvePrice, validatePurchase } from "./validate";

interface PurchaseRow {
  id: number;
  user_id: number;
  product_id: number;
  brand_id: number;
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

function toDto(r: PurchaseRow) {
  return {
    id: r.id,
    productId: r.product_id,
    brandId: r.brand_id,
    weight: fromMg(r.weight_mg, r.input_unit),
    weightUnit: r.input_unit,
    weightMg: r.weight_mg,
    purchaseDate: r.purchase_date,
    purchaseTime: r.purchase_time,
    priceMode: r.price_mode,
    unitCost: r.unit_cost,
    totalCost: r.total_cost,
    note: r.note,
    priceSource: r.price_source,
    priceNote: r.price_note,
  };
}

/** CRUD lần mua; mọi truy vấn lọc theo tài khoản đang đăng nhập (ACC-BR-002). */
export function purchasesRouter(db: Db, prices: PriceService, now: () => Date): Router {
  const router = Router();

  // Lần mua của người khác trả 404 như không tồn tại, không lộ là có (HOLD-UC01/BR-12)
  const findOwn = async (id: unknown, userId: number): Promise<PurchaseRow> => {
    const pid = Number(id);
    const row = Number.isSafeInteger(pid)
      ? await db.one<PurchaseRow>(
          "SELECT pu.*, p.brand_id FROM purchases pu JOIN products p ON p.id = pu.product_id WHERE pu.id = $1 AND pu.user_id = $2",
          [pid, userId],
        )
      : undefined;
    if (!row) throw new HttpError(404, "Không tìm thấy lần mua");
    return row;
  };

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json({ purchase: toDto(await findOwn(req.params.id, currentUserId(res))) });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const p = await resolvePrice(db, prices, await validatePurchase(db, req.body, now()));
      const stamp = now().toISOString();
      const row = await db.one<{ id: number }>(
        `INSERT INTO purchases (user_id, product_id, weight_mg, input_unit, purchase_date, purchase_time,
           price_mode, unit_cost, total_cost, note, price_source, price_note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [userId, p.productId, p.weightMg, p.inputUnit, p.purchaseDate, p.purchaseTime, p.priceMode, p.unitCost, p.totalCost, p.note, p.priceSource, p.priceNote, stamp, stamp],
      );
      res.status(201).json({ purchase: toDto(await findOwn(row!.id, userId)) });
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const current = await findOwn(req.params.id, userId);
      // Nhập giá tay thì bỏ nhãn giá tự lấy; vẫn để trống thì lấy lại theo ngày giờ mới (BR-16)
      const p = await resolvePrice(db, prices, await validatePurchase(db, req.body, now(), current.product_id));
      await db.query(
        `UPDATE purchases SET product_id = $1, weight_mg = $2, input_unit = $3, purchase_date = $4, purchase_time = $5,
           price_mode = $6, unit_cost = $7, total_cost = $8, note = $9, price_source = $10, price_note = $11, updated_at = $12
         WHERE id = $13 AND user_id = $14`,
        [p.productId, p.weightMg, p.inputUnit, p.purchaseDate, p.purchaseTime, p.priceMode, p.unitCost, p.totalCost, p.note, p.priceSource, p.priceNote, now().toISOString(), current.id, userId],
      );
      res.json({ purchase: toDto(await findOwn(current.id, userId)) });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const userId = currentUserId(res);
      const current = await findOwn(req.params.id, userId);
      await db.query("DELETE FROM purchases WHERE id = $1 AND user_id = $2", [current.id, userId]);
      res.json({ ok: true });
    }),
  );

  return router;
}
