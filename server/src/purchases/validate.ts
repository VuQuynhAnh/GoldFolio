import {
  MAX_MONEY,
  MAX_WEIGHT_MG,
  WEIGHT_UNITS,
  parseWeight,
  toMg,
  totalFromUnit,
  unitFromTotal,
  vnDate,
  vnTime,
  type PriceUnit,
  type WeightUnit,
} from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError } from "../http";
import type { PriceService } from "../prices/service";
import { sellPriceAt } from "../prices/suggest";

export interface PurchaseInput {
  productId: number;
  weightMg: number;
  inputUnit: WeightUnit;
  purchaseDate: string;
  purchaseTime: string | null;
  priceMode: "unit" | "total";
  unitCost: number;
  totalCost: number;
  note: string;
  /** manual = người dùng nhập; auto = để trống, chờ resolvePrice tự lấy (BR-16) */
  priceSource: "manual" | "auto";
  priceNote: string;
  /** Đơn vị niêm yết của sản phẩm, để resolvePrice tính tổng tiền */
  priceUnit: PriceUnit;
}

export const AUTO_PRICE_NOT_FOUND = "Không tìm được giá ngày này, vui lòng nhập giá mua";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Kiểm tra form lần mua (HOLD-UC01/BR-1…5, BR-15). Gom lỗi theo từng ô để form hiện
 * ngay dưới ô sai (BR-12). `currentProductId` = sản phẩm đang có của lần mua khi sửa:
 * sản phẩm đã biến mất khỏi bảng giá vẫn giữ được, nhưng không chọn mới được.
 */
export function validatePurchase(db: Db, body: unknown, now: Date, currentProductId?: number): PurchaseInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};

  let priceUnit: PriceUnit = "chi";
  const productId = Number(b.productId);
  if (!b.productId) fields.productId = "Vui lòng chọn sản phẩm";
  else {
    const product = db.prepare("SELECT price_unit, active FROM products WHERE id = ?").get(productId) as
      | { price_unit: PriceUnit; active: number }
      | undefined;
    if (!product) fields.productId = "Sản phẩm không hợp lệ";
    else if (!product.active && productId !== currentProductId) fields.productId = "Sản phẩm không còn trên bảng giá";
    else priceUnit = product.price_unit;
  }

  const inputUnit = (b.weightUnit ?? "chi") as WeightUnit;
  if (!WEIGHT_UNITS.includes(inputUnit)) fields.weightUnit = "Đơn vị khối lượng không hợp lệ";
  const weight = parseWeight(typeof b.weight === "number" || typeof b.weight === "string" ? b.weight : "");
  if (!weight.ok) fields.weight = weight.error;
  const weightMg = weight.ok && !fields.weightUnit ? toMg(weight.value, inputUnit) : 0;
  // Giới hạn trên để tiền luôn là số nguyên chính xác (R-MONEY-02)
  if (weightMg > MAX_WEIGHT_MG) fields.weight = "Khối lượng tối đa 1.000 kg";

  // Ngày giờ so với "bây giờ" theo giờ VN (BR-4)
  const today = vnDate(now);
  const purchaseDate = typeof b.purchaseDate === "string" ? b.purchaseDate : "";
  if (!purchaseDate) fields.purchaseDate = "Vui lòng chọn ngày mua";
  else if (!DATE_RE.test(purchaseDate) || !isRealDate(purchaseDate)) fields.purchaseDate = "Ngày mua không hợp lệ";
  else if (purchaseDate > today) fields.purchaseDate = "Ngày mua không được sau hôm nay";

  const rawTime = typeof b.purchaseTime === "string" ? b.purchaseTime.trim() : "";
  const purchaseTime = rawTime || null;
  if (purchaseTime && !TIME_RE.test(purchaseTime)) fields.purchaseTime = "Giờ mua không hợp lệ";
  else if (purchaseTime && purchaseDate === today && purchaseTime > vnTime(now)) {
    fields.purchaseTime = "Thời điểm mua không được sau hiện tại";
  }

  // Nhập một trong hai: đơn giá hoặc tổng tiền; số kia tự tính (BR-5).
  // Để trống cả hai thì hệ thống tự lấy giá khi lưu (BR-16), xem resolvePrice.
  const priceMode = b.priceMode === "total" ? "total" : "unit";
  const rawPrice = priceMode === "unit" ? b.unitPrice : b.totalPrice;
  const price = rawPrice === undefined || rawPrice === null || rawPrice === "" ? null : Number(rawPrice);
  const priceSource = price === null ? "auto" : "manual";
  if (price !== null) {
    if (!Number.isFinite(price) || !Number.isInteger(price)) fields.price = "Giá mua phải là số nguyên";
    else if (price <= 0) fields.price = "Giá mua phải lớn hơn 0";
    else if (price > MAX_MONEY) fields.price = "Giá mua tối đa 1.000 tỷ đồng";
  }

  // Số tự tính từ số đã nhập cũng phải trong giới hạn
  let unitCost = 0;
  let totalCost = 0;
  if (price !== null && !fields.price && !fields.weight && !fields.weightUnit && !fields.productId) {
    unitCost = priceMode === "unit" ? price! : unitFromTotal(price!, weightMg, priceUnit);
    totalCost = priceMode === "total" ? price! : totalFromUnit(price!, weightMg, priceUnit);
    if (totalCost > MAX_MONEY) fields.price = "Tổng tiền tối đa 1.000 tỷ đồng";
    else if (unitCost > MAX_MONEY) fields.price = "Đơn giá tối đa 1.000 tỷ đồng";
    else if (unitCost <= 0 || totalCost <= 0) fields.price = "Giá mua quá nhỏ so với khối lượng";
  }

  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > 200) fields.note = "Ghi chú tối đa 200 ký tự";

  if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0]!, fields);

  return { productId, weightMg, inputUnit, purchaseDate, purchaseTime, priceMode, unitCost, totalCost, note, priceSource, priceNote: "", priceUnit };
}

/**
 * Giá để trống thì lấy giá bán ra tại thời điểm mua làm đơn giá và ghi nhãn nguồn
 * (HOLD-UC01/BR-16). Không tìm được giá thì không lưu, báo người dùng nhập tay.
 */
export async function resolvePrice(db: Db, prices: PriceService, input: PurchaseInput): Promise<PurchaseInput> {
  if (input.priceSource === "manual") return input;
  const found = await sellPriceAt(db, prices, input.productId, input.purchaseDate, input.purchaseTime);
  if (!found) throw new HttpError(400, AUTO_PRICE_NOT_FOUND, { price: AUTO_PRICE_NOT_FOUND });
  const totalCost = totalFromUnit(found.unitPrice, input.weightMg, input.priceUnit);
  if (totalCost > MAX_MONEY) throw new HttpError(400, "Tổng tiền tối đa 1.000 tỷ đồng", { price: "Tổng tiền tối đa 1.000 tỷ đồng" });
  if (totalCost <= 0) throw new HttpError(400, "Giá mua quá nhỏ so với khối lượng", { price: "Giá mua quá nhỏ so với khối lượng" });
  return { ...input, priceMode: "unit", unitCost: found.unitPrice, totalCost, priceNote: found.label };
}
