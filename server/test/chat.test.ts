import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { PriceService } from "../src/prices/service";
import type { Db } from "../src/db";
import { TrendModelError } from "../src/ai/trend";
import type { ChatInput, ChatModel } from "../src/ai/chat";
import { FakeSource, goldSection, productId, testDb } from "./helpers";

// "Bây giờ" cố định: 10:00 ngày 02/11/2026 giờ VN
const NOW = new Date("2026-11-02T03:00:00.000Z");

class FakeChat implements ChatModel {
  name = "fake-chat";
  inputs: ChatInput[] = [];
  fail: TrendModelError | null = null;
  async chat(input: ChatInput) {
    this.inputs.push(input);
    if (this.fail) throw this.fail;
    return "Giá nhẫn tròn đang cao hơn giá vốn của bạn.";
  }
}

let db: Db;
let source: FakeSource;
let prices: PriceService;
let chat: FakeChat;
let app: Express;
let ring: number;

beforeEach(async () => {
  db = await testDb();
  source = new FakeSource();
  prices = new PriceService(db, [source], () => NOW);
  chat = new FakeChat();
  app = createApp({ db, prices, now: () => NOW, chatModel: chat });
  ring = await productId(db, "phuquy", "nhan-tron-9999");
});

async function login() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "a@example.com", password: "matkhau123" }).expect(201);
  return agent;
}

const ask = (text: string, history: { role: "user" | "assistant"; content: string }[] = []) => ({
  messages: [...history, { role: "user", content: text }],
});

describe("chat hỏi AI (PRICE-UC03)", () => {
  // SC: PRICE-UC03-SC1
  it("trả lời kèm ngữ cảnh danh mục và giá của người dùng, không gửi email", async () => {
    source.live = [goldSection("2026-11-02", "09:00", 13_550_000, 13_850_000)];
    await prices.refreshLive("phuquy");
    const agent = await login();
    await agent.post("/api/purchases").send({ productId: ring, weight: "2", weightUnit: "chi", purchaseDate: "2026-11-01", priceMode: "unit", unitPrice: 13_000_000 }).expect(201);

    const res = await agent.post("/api/chat").send(ask("Vàng của tôi đang lãi hay lỗ?", [{ role: "assistant", content: "Nhận định vàng hôm nay: tăng nhẹ." }])).expect(200);
    expect(res.body).toEqual({ reply: "Giá nhẫn tròn đang cao hơn giá vốn của bạn.", questionsLeft: 19 });

    const input = chat.inputs[0]!;
    expect(input.messages).toEqual([
      { role: "assistant", content: "Nhận định vàng hôm nay: tăng nhẹ." },
      { role: "user", content: "Vàng của tôi đang lãi hay lỗ?" },
    ]);
    expect(input.context).toContain("Nhẫn tròn Phú Quý 999.9");
    expect(input.context).toContain("2 chỉ");
    expect(input.context).toContain("giá vốn bình quân 13000000");
    expect(input.context).toContain("mua vào hiện tại 13550000");
    expect(input.context).not.toContain("a@example.com");
  });

  // SC: PRICE-UC03-SC2
  it("tối đa 20 câu mỗi ngày; câu lỗi không tính lượt", async () => {
    const agent = await login();
    chat.fail = new TrendModelError("failed");
    expect((await agent.post("/api/chat").send(ask("a")).expect(502)).body.error).toBe("Chưa trả lời được, thử lại sau");
    chat.fail = new TrendModelError("quota");
    expect((await agent.post("/api/chat").send(ask("a")).expect(503)).body.error).toBe("AI đã hết lượt miễn phí, thử lại sau");
    chat.fail = null;
    expect((await agent.get("/api/chat").expect(200)).body).toEqual({ questionsLeft: 20, maxQuestions: 20 });
    for (let i = 19; i >= 0; i--) {
      expect((await agent.post("/api/chat").send(ask(`câu ${i}`)).expect(200)).body.questionsLeft).toBe(i);
    }
    const over = await agent.post("/api/chat").send(ask("thêm")).expect(429);
    expect(over.body.error).toBe("Hôm nay đã hỏi đủ 20 câu, mai hỏi tiếp nhé");
  });

  // SC: PRICE-UC03-SC3
  it("tin nhắn không hợp lệ thì 400; lịch sử dài chỉ gửi các tin gần nhất", async () => {
    const agent = await login();
    await agent.post("/api/chat").send({ messages: [] }).expect(400);
    await agent.post("/api/chat").send({ messages: [{ role: "assistant", content: "x" }] }).expect(400);
    await agent.post("/api/chat").send(ask("a".repeat(1001))).expect(400);
    await agent.post("/api/chat").send(ask("  ")).expect(400);
    const history = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `tin ${i}` }));
    await agent.post("/api/chat").send(ask("cuối", history)).expect(200);
    expect(chat.inputs[0]!.messages).toHaveLength(12);
    expect(chat.inputs[0]!.messages.at(-1)).toEqual({ role: "user", content: "cuối" });
  });

  it("chưa cấu hình AI thì 503; chưa đăng nhập thì 401", async () => {
    await request(app).post("/api/chat").send(ask("a")).expect(401);
    app = createApp({ db, prices, now: () => NOW });
    const agent = await login();
    expect((await agent.post("/api/chat").send(ask("a")).expect(503)).body.error).toBe("Chưa bật AI (thiếu GEMINI_API_KEY)");
  });
});
