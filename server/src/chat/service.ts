import { avgCost, vnDate } from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError } from "../http";
import type { PriceService } from "../prices/service";
import { buildPortfolio } from "../portfolio/service";
import { TrendModelError } from "../ai/trend";
import type { ChatMessage, ChatModel } from "../ai/chat";
import { TREND_DAYS } from "../trends/service";

/** Số câu hỏi mỗi người mỗi ngày (user chốt 2026-11-05), để không vượt hạn mức gói AI miễn phí */
export const MAX_CHAT_PER_DAY = 20;
/** Chỉ gửi các tin gần nhất, đủ ngữ cảnh mà không tốn token */
export const CHAT_HISTORY_LIMIT = 12;
export const MAX_MESSAGE_LENGTH = 1000;
/** Số sản phẩm tối đa đưa chuỗi giá 30 ngày vào ngữ cảnh */
const MAX_SERIES_PRODUCTS = 4;

/** Kiểm lịch sử chat do trình duyệt gửi lên: tin cuối phải là câu hỏi của người dùng */
export function validateMessages(body: unknown): ChatMessage[] {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "Vui lòng nhập câu hỏi");
  const messages = raw.map((m): ChatMessage => {
    const role = (m as ChatMessage)?.role;
    const content = typeof (m as ChatMessage)?.content === "string" ? (m as ChatMessage).content.trim() : "";
    if ((role !== "user" && role !== "assistant") || !content) throw new HttpError(400, "Tin nhắn không hợp lệ");
    if (content.length > MAX_MESSAGE_LENGTH) throw new HttpError(400, `Câu hỏi tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
    return { role, content };
  });
  if (messages.at(-1)!.role !== "user") throw new HttpError(400, "Vui lòng nhập câu hỏi");
  return messages.slice(-CHAT_HISTORY_LIMIT);
}

function daysBefore(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - n)).toISOString().slice(0, 10);
}

/**
 * Số liệu gửi kèm câu hỏi (PRICE-UC03/BR-3): danh mục (sản phẩm, khối lượng, giá vốn, giá hiện
 * tại, lãi/lỗ), giá mua vào 30 ngày của các sản phẩm đang có, nhận định hôm nay. Không có email.
 */
export async function buildChatContext(db: Db, prices: PriceService, userId: number, now: Date): Promise<string> {
  const today = vnDate(now);
  const pf = await buildPortfolio(db, prices, userId);
  const lines = [`Hôm nay: ${today}. Tiền VNĐ, giá theo đơn vị niêm yết của từng sản phẩm.`];

  if (pf.items.length === 0) lines.push("Người dùng chưa có lần mua nào.");
  else {
    const s = pf.summary;
    lines.push(`Toàn danh mục: tổng tiền mua ${s.totalCost}, giá trị hiện tại ${s.value}, lãi/lỗ ${s.pnl} (${s.pct}%).`);
  }
  const products = pf.groups.flatMap((g) => g.products.map((p) => ({ ...p, metal: g.label })));
  for (const p of products) {
    const lots = pf.items.filter((i) => i.productId === p.productId);
    const unit = lots[0]!.priceUnit;
    const cost = avgCost(
      lots.map((l) => ({ weightMg: l.weightMg, totalCost: l.totalCost })),
      unit,
    );
    const price = p.price ? `mua vào hiện tại ${p.price.buy}, bán ra ${p.price.sell ?? "không có"}` : "chưa có giá hiện tại";
    lines.push(
      `- ${p.metal}: ${p.productName} (${p.brandName}), ${p.weightText}, ${p.count} lần mua, tổng tiền mua ${p.totalCost}, giá vốn bình quân ${cost}/${unit}, ${price}, lãi/lỗ ${p.pnl} (${p.pct}%).`,
    );
  }

  const top = [...products].sort((a, b) => b.totalCost - a.totalCost).slice(0, MAX_SERIES_PRODUCTS);
  for (const p of top) {
    const series = await prices.dailySeries(p.productId, daysBefore(today, TREND_DAYS), today);
    if (series.length) lines.push(`Giá mua vào ${TREND_DAYS} ngày của ${p.productName}: ${series.map((d) => `${d.date} ${d.buy}`).join("; ")}.`);
  }

  const insights = await db.query<{ metal: string; content_json: string }>(
    "SELECT metal, content_json FROM trend_insights WHERE user_id = $1 AND date = $2",
    [userId, today],
  );
  for (const r of insights) {
    const a = (JSON.parse(r.content_json) as { analysis: { summary: string } }).analysis;
    lines.push(`Nhận định xu hướng ${r.metal === "gold" ? "vàng" : "bạc"} hôm nay: ${a.summary}`);
  }
  return lines.join("\n");
}

async function usedToday(db: Db, userId: number, today: string): Promise<number> {
  return (await db.one<{ count: number }>("SELECT count FROM chat_usage WHERE user_id = $1 AND date = $2", [userId, today]))?.count ?? 0;
}

/** Số câu còn được hỏi hôm nay */
export async function chatQuota(db: Db, userId: number, now: Date) {
  return { questionsLeft: MAX_CHAT_PER_DAY - (await usedToday(db, userId, vnDate(now))), maxQuestions: MAX_CHAT_PER_DAY };
}

/** Trả lời một câu hỏi (PRICE-UC03). Chỉ tính lượt khi AI trả lời được. */
export async function answer(deps: { db: Db; prices: PriceService; model?: ChatModel; now: () => Date }, userId: number, body: unknown) {
  const { db, prices, model } = deps;
  if (!model) throw new HttpError(503, "Chưa bật AI (thiếu GEMINI_API_KEY)");
  const messages = validateMessages(body);
  const now = deps.now();
  const today = vnDate(now);
  if ((await usedToday(db, userId, today)) >= MAX_CHAT_PER_DAY) {
    throw new HttpError(429, `Hôm nay đã hỏi đủ ${MAX_CHAT_PER_DAY} câu, mai hỏi tiếp nhé`);
  }

  let reply: string;
  try {
    reply = (await model.chat({ messages, context: await buildChatContext(db, prices, userId, now) })).trim();
    if (!reply) throw new TrendModelError("failed", "Câu trả lời rỗng");
  } catch (err) {
    if (err instanceof TrendModelError) {
      console.warn(`[AI ${model.name}] chat ${err.kind}: ${err.message}`);
      if (err.kind === "quota") throw new HttpError(503, "AI đã hết lượt miễn phí, thử lại sau");
      if (err.kind === "busy") throw new HttpError(503, "AI đang quá tải, thử lại sau ít phút");
      throw new HttpError(502, "Chưa trả lời được, thử lại sau");
    }
    throw err;
  }

  const row = await db.one<{ count: number }>(
    `INSERT INTO chat_usage (user_id, date, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, date) DO UPDATE SET count = chat_usage.count + 1 RETURNING count`,
    [userId, today],
  );
  return { reply, questionsLeft: MAX_CHAT_PER_DAY - row!.count };
}
