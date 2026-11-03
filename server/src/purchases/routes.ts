import { Router } from "express";
import { fromMg, type WeightUnit } from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError, currentUserId } from "../http";
import { validatePurchase } from "./validate";

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
  };
}

/** CRUD lần mua; mọi truy vấn lọc theo tài khoản đang đăng nhập (ACC-BR-002). */
export function purchasesRouter(db: Db, now: () => Date): Router {
  const router = Router();

  // Lần mua của người khác trả 404 như không tồn tại, không lộ là có (HOLD-UC01/BR-12)
  const findOwn = (id: unknown, userId: number): PurchaseRow => {
    const row = db
      .prepare("SELECT pu.*, p.brand_id FROM purchases pu JOIN products p ON p.id = pu.product_id WHERE pu.id = ? AND pu.user_id = ?")
      .get(Number(id), userId) as PurchaseRow | undefined;
    if (!row) throw new HttpError(404, "Không tìm thấy lần mua");
    return row;
  };

  router.get("/:id", (req, res) => {
    res.json({ purchase: toDto(findOwn(req.params.id, currentUserId(res))) });
  });

  router.post("/", (req, res) => {
    const userId = currentUserId(res);
    const p = validatePurchase(db, req.body, now());
    const stamp = now().toISOString();
    const { id } = db
      .prepare(
        `INSERT INTO purchases (user_id, product_id, weight_mg, input_unit, purchase_date, purchase_time,
           price_mode, unit_cost, total_cost, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(userId, p.productId, p.weightMg, p.inputUnit, p.purchaseDate, p.purchaseTime, p.priceMode, p.unitCost, p.totalCost, p.note, stamp, stamp) as {
      id: number;
    };
    res.status(201).json({ purchase: toDto(findOwn(id, userId)) });
  });

  router.put("/:id", (req, res) => {
    const userId = currentUserId(res);
    const current = findOwn(req.params.id, userId);
    const p = validatePurchase(db, req.body, now(), current.product_id);
    db.prepare(
      `UPDATE purchases SET product_id = ?, weight_mg = ?, input_unit = ?, purchase_date = ?, purchase_time = ?,
         price_mode = ?, unit_cost = ?, total_cost = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(p.productId, p.weightMg, p.inputUnit, p.purchaseDate, p.purchaseTime, p.priceMode, p.unitCost, p.totalCost, p.note, now().toISOString(), current.id, userId);
    res.json({ purchase: toDto(findOwn(current.id, userId)) });
  });

  router.delete("/:id", (req, res) => {
    const userId = currentUserId(res);
    const current = findOwn(req.params.id, userId);
    db.prepare("DELETE FROM purchases WHERE id = ? AND user_id = ?").run(current.id, userId);
    res.json({ ok: true });
  });

  return router;
}
