import { fromMg, UNIT_LABEL, type PriceUnit, type WeightUnit } from "./units";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });
const pct = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Dấu trừ dùng ký tự "−" (U+2212) cho dễ đọc, khớp với spec.
const MINUS = "−";

export function formatVnd(n: number): string {
  return vnd.format(n);
}

/** Lãi có dấu "+", lỗ có dấu "−" (HOLD-UC01/BR-10). */
export function formatSignedVnd(n: number): string {
  if (n > 0) return `+${vnd.format(n)}`;
  if (n < 0) return `${MINUS}${vnd.format(-n)}`;
  return "0";
}

export function formatPct(p: number): string {
  if (p > 0) return `+${pct.format(p)}%`;
  if (p < 0) return `${MINUS}${pct.format(-p)}%`;
  return `${pct.format(0)}%`;
}

export function formatQty(value: number, unit: WeightUnit): string {
  return `${qty.format(value)} ${UNIT_LABEL[unit]}`;
}

/**
 * Khối lượng hiển thị theo đơn vị niêm yết của sản phẩm, kèm đơn vị người dùng đã nhập
 * nếu khác, vd "26,667 lượng (1 kg)" (HOLD-UC01/BR-3).
 */
export function formatWeight(weightMg: number, priceUnit: PriceUnit, inputUnit: WeightUnit): string {
  const main = formatQty(fromMg(weightMg, priceUnit), priceUnit);
  if (inputUnit === priceUnit) return main;
  return `${main} (${formatQty(fromMg(weightMg, inputUnit), inputUnit)})`;
}

/** "HH:mm dd/MM/yyyy" từ chuỗi ISO, theo giờ Việt Nam. */
export function formatDateTimeVn(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}/${get("year")}`;
}

/** "dd/MM/yyyy" từ "YYYY-MM-DD". */
export function formatDateVn(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
