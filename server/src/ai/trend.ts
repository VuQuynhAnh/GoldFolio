import type { PriceUnit } from "@goldfolio/shared";

/** Số liệu gửi cho AI để nhận định xu hướng một sản phẩm (PRICE-UC02). Không có email/thông tin tài khoản. */
export interface TrendInput {
  metal: "gold" | "silver";
  productName: string;
  /** Đơn vị niêm yết; mọi giá trong input tính theo đơn vị này */
  priceUnit: PriceUnit;
  /** Giá từng ngày, cũ trước */
  series: { date: string; buy: number; sell: number | null }[];
  stats: TrendStats;
  /** Sản phẩm này người dùng đang có (user chốt gửi kèm giá vốn); null = chưa có */
  holding: { weightText: string; avgCost: number; totalCost: number } | null;
}

/** Số liệu tóm tắt do server tính (không lấy từ AI, để con số trên màn hình luôn đúng) */
export interface TrendStats {
  days: number;
  firstBuy: number;
  lastBuy: number;
  /** % thay đổi giá mua vào từ ngày đầu tới ngày cuối, 2 chữ số thập phân */
  changePct: number;
  minBuy: number;
  maxBuy: number;
}

export interface TrendAnalysis {
  trend: "up" | "down" | "sideways";
  confidence: "low" | "medium" | "high";
  summary: string;
  points: string[];
  /** Nhận xét so với giá vốn; null khi người dùng chưa có sản phẩm này */
  vsCost: string | null;
}

/** Nhà cung cấp AI. Đổi nhà cung cấp chỉ cần thêm một lớp cài đặt giao diện này. */
export interface TrendModel {
  /** Tên model, lưu kèm nhận định để biết bản nào do model nào viết */
  name: string;
  analyze(input: TrendInput): Promise<TrendAnalysis>;
}

/** quota = hết hạn mức (gói miễn phí); failed = lỗi khác hoặc trả về sai định dạng */
export class TrendModelError extends Error {
  constructor(
    public kind: "quota" | "failed",
    message: string = kind,
  ) {
    super(message);
  }
}

/** Dạng JSON bắt model trả về (structured output) */
export const TREND_JSON_SCHEMA = {
  type: "object",
  properties: {
    trend: { type: "string", enum: ["up", "down", "sideways"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    points: { type: "array", items: { type: "string" }, maxItems: 4 },
    vsCost: { type: "string" },
  },
  required: ["trend", "confidence", "summary", "points"],
} as const;

export const TREND_SYSTEM_PROMPT = `Bạn là trợ lý phân tích giá vàng bạc cho một ứng dụng sổ tài sản cá nhân ở Việt Nam.
Viết bằng tiếng Việt, ngắn gọn, dễ hiểu với người không chuyên.
Chỉ dựa trên số liệu được cung cấp; không bịa tin tức, sự kiện hay con số khác.
Đây là nhận định tham khảo, không phải lời khuyên đầu tư: không khuyên chắc chắn mua hay bán, nói rõ mức không chắc chắn.
Giá "mua vào" là giá cửa hàng mua lại của khách (dùng để tính giá trị tài sản), "bán ra" là giá cửa hàng bán cho khách.`;

const UNIT_NAME: Record<PriceUnit, string> = { chi: "chỉ", luong: "lượng", kg: "kg" };

/** Nội dung gửi cho model: bảng giá theo ngày + số liệu tóm tắt + (nếu có) giá vốn của người dùng */
export function buildTrendPrompt(input: TrendInput): string {
  const unit = UNIT_NAME[input.priceUnit];
  const rows = input.series.map((p) => `${p.date}: mua vào ${p.buy}, bán ra ${p.sell ?? "không có"}`).join("\n");
  const s = input.stats;
  const lines = [
    `Sản phẩm: ${input.productName} (${input.metal === "gold" ? "vàng" : "bạc"}), giá VNĐ/${unit}.`,
    `Giá theo ngày (${s.days} ngày có số liệu):`,
    rows,
    `Tóm tắt: mua vào từ ${s.firstBuy} lên/xuống ${s.lastBuy} (${s.changePct}%), thấp nhất ${s.minBuy}, cao nhất ${s.maxBuy}.`,
  ];
  if (input.holding) {
    const h = input.holding;
    lines.push(`Người dùng đang có ${h.weightText}, giá vốn bình quân ${h.avgCost} VNĐ/${unit}, tổng tiền mua ${h.totalCost} VNĐ.`);
  } else {
    lines.push("Người dùng chưa có sản phẩm này: bỏ trống vsCost.");
  }
  lines.push(
    "Trả về JSON: trend (up/down/sideways), confidence (low/medium/high), summary (2-3 câu), points (tối đa 4 ý ngắn), vsCost (1-2 câu so giá mua vào hiện tại với giá vốn, chỉ khi người dùng đang có).",
  );
  return lines.join("\n");
}

/** Kiểm kết quả model trả về; sai định dạng thì báo lỗi, không lưu bản hỏng. */
export function parseTrendAnalysis(raw: unknown, hasHolding: boolean): TrendAnalysis {
  const o = raw as Partial<Record<keyof TrendAnalysis, unknown>> | null;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  if (!o || typeof o !== "object") throw new TrendModelError("failed", "Kết quả không phải JSON");
  const trend = o.trend === "up" || o.trend === "down" || o.trend === "sideways" ? o.trend : null;
  const confidence = o.confidence === "low" || o.confidence === "medium" || o.confidence === "high" ? o.confidence : null;
  const summary = str(o.summary, 600);
  if (!trend || !confidence || !summary) throw new TrendModelError("failed", "Kết quả thiếu trường bắt buộc");
  const points = Array.isArray(o.points) ? o.points.map((p) => str(p, 200)).filter((p): p is string => !!p).slice(0, 4) : [];
  return { trend, confidence, summary, points, vsCost: hasHolding ? str(o.vsCost, 400) : null };
}
