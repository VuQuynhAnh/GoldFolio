import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { PriceService } from "../src/prices/service";
import type { Db } from "../src/db";
import { TrendModelError, type TrendAnalysis, type TrendInput, type TrendModel } from "../src/ai/trend";
import { FakeSource, productId, testDb } from "./helpers";

// "Bây giờ" cố định: 10:00 ngày 02/11/2026 giờ VN
const NOW = new Date("2026-11-02T03:00:00.000Z");

/** Ngày VN cách 02/11/2026 `n` ngày về trước, "YYYY-MM-DD" */
const daysAgo = (n: number) => new Date(Date.UTC(2026, 10, 2 - n)).toISOString().slice(0, 10);

const analysis: TrendAnalysis = {
  trend: "up",
  confidence: "medium",
  summary: "Giá nhẫn tròn tăng đều trong 30 ngày.",
  points: ["Tăng khoảng 6% so với đầu kỳ"],
  vsCost: "Giá mua vào hiện cao hơn giá vốn bình quân.",
};

class FakeModel implements TrendModel {
  name = "fake-model";
  inputs: TrendInput[] = [];
  fail: TrendModelError | null = null;
  async analyze(input: TrendInput) {
    this.inputs.push(input);
    if (this.fail) throw this.fail;
    return analysis;
  }
}

let db: Db;
let source: FakeSource;
let prices: PriceService;
let model: FakeModel;
let app: Express;
let ring: number;

beforeEach(async () => {
  db = await testDb();
  source = new FakeSource();
  prices = new PriceService(db, [source], () => NOW);
  model = new FakeModel();
  app = createApp({ db, prices, now: () => NOW, trendModel: model });
  ring = await productId(db, "phuquy", "nhan-tron-9999");
});

/** Giá theo ngày của nhẫn tròn cho `days` ngày gần nhất: tăng 10.000 đồng mỗi ngày */
function dailyRingSeries(days: number) {
  for (let n = 1; n <= days; n++) {
    const sell = 14_000_000 - n * 10_000;
    source.daily.set(daysAgo(n), { sourceDate: daysAgo(n), sourceTime: null, rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: sell - 300_000, sell }] });
  }
}

async function login() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "a@example.com", password: "matkhau123" }).expect(201);
  return agent;
}

describe("giá theo ngày 30 ngày gần nhất (PRICE-BR-007)", () => {
  // SC: PRICE-UC02-SC1
  it("tải bù mỗi ngày đã qua một lần, không hỏi lại ngày đã có hoặc nguồn báo không có", async () => {
    dailyRingSeries(30);
    source.daily.delete(daysAgo(5)); // nguồn không có ngày này
    expect(await prices.backfillDaily("phuquy", 30)).toBe(30);
    expect(source.dailyCalls).toHaveLength(30);
    // Hôm nay chưa kết thúc: không hỏi
    expect(source.dailyCalls).not.toContain(daysAgo(0));
    expect(await prices.backfillDaily("phuquy", 30)).toBe(0);
    expect(source.dailyCalls).toHaveLength(30);

    const series = await prices.dailySeries(ring, daysAgo(30), daysAgo(0));
    expect(series).toHaveLength(29);
    expect(series[0]).toEqual({ date: daysAgo(30), buy: 13_400_000, sell: 13_700_000 });
    expect(series.at(-1)).toEqual({ date: daysAgo(1), buy: 13_690_000, sell: 13_990_000 });
  });
});

describe("nhận định xu hướng (PRICE-UC02)", () => {
  // SC: PRICE-UC02-SC2
  it("lần đầu trong ngày thì phân tích và lưu; mở lại dùng bản đã lưu", async () => {
    dailyRingSeries(30);
    await prices.startBackfill("phuquy", 30);
    const agent = await login();
    await agent.post("/api/purchases").send({ productId: ring, weight: "2", weightUnit: "chi", purchaseDate: daysAgo(10), priceMode: "unit", unitPrice: 13_000_000 }).expect(201);

    const first = await agent.get("/api/trends?metal=gold").expect(200);
    expect(first.body.trend).toMatchObject({
      metal: "gold",
      date: "2026-11-02",
      productName: "Nhẫn tròn Phú Quý 999.9",
      priceUnit: "chi",
      model: "fake-model",
      refreshesLeft: 3,
      analysis,
      // Số liệu do server tính, không lấy từ AI
      stats: { days: 30, firstBuy: 13_400_000, lastBuy: 13_690_000, changePct: 2.16, minBuy: 13_400_000, maxBuy: 13_690_000 },
    });
    // Gửi kèm giá vốn và khối lượng đang có của người dùng (user chốt), không gửi email
    expect(model.inputs[0]).toMatchObject({ metal: "gold", productName: "Nhẫn tròn Phú Quý 999.9", holding: { weightText: "2 chỉ", avgCost: 13_000_000 } });
    expect(JSON.stringify(model.inputs[0])).not.toContain("a@example.com");

    await agent.get("/api/trends?metal=gold").expect(200);
    expect(model.inputs).toHaveLength(1);
  });

  // SC: PRICE-UC02-SC3
  it("Phân tích lại: gọi AI lần nữa, tối đa 3 lần mỗi ngày", async () => {
    dailyRingSeries(30);
    await prices.startBackfill("phuquy", 30);
    const agent = await login();
    await agent.get("/api/trends?metal=gold").expect(200);
    for (const left of [2, 1, 0]) {
      const res = await agent.post("/api/trends/refresh").send({ metal: "gold" }).expect(200);
      expect(res.body.trend.refreshesLeft).toBe(left);
    }
    const over = await agent.post("/api/trends/refresh").send({ metal: "gold" }).expect(429);
    expect(over.body.error).toBe("Hôm nay đã phân tích lại đủ 3 lần, mai thử lại nhé");
    expect(model.inputs).toHaveLength(4);
  });

  // SC: PRICE-UC02-SC4
  it("chưa có lần mua bạc thì nhận định sản phẩm bạc mặc định, không có phần giá vốn", async () => {
    const agent = await login();
    const silver = await productId(db, "phuquy", "bac-mieng-1-luong");
    for (let n = 1; n <= 10; n++) {
      source.daily.set(daysAgo(n), { sourceDate: daysAgo(n), sourceTime: null, rows: [{ name: "Bạc miếng Phú Quý 999 1 lượng", unit: "luong", buy: 1_400_000, sell: 1_440_000 }] });
    }
    await prices.backfillDaily("phuquy", 30);
    const res = await agent.get("/api/trends?metal=silver").expect(200);
    expect(res.body.trend).toMatchObject({ metal: "silver", productId: silver, priceUnit: "luong" });
    expect(model.inputs[0]!.holding).toBeNull();
  });

  // SC: PRICE-UC02-SC5
  it("thiếu giá thì tự tải bù 30 ngày: trong lúc tải báo đang tải, tải xong thì nhận định", async () => {
    dailyRingSeries(30);
    const agent = await login();
    const loading = await agent.get("/api/trends?metal=gold").expect(409);
    expect(loading.body).toMatchObject({ error: "Đang tải giá 30 ngày gần nhất, đợi khoảng 1 phút", fields: { trend: "loading" } });
    expect(model.inputs).toHaveLength(0);
    await prices.backfillRunning("phuquy");
    expect(source.dailyCalls).toHaveLength(30);
    await agent.get("/api/trends?metal=gold").expect(200);
  });

  it("lịch lấy giá và lượt mở tab cùng lúc thì dùng chung một lần tải bù", async () => {
    dailyRingSeries(30);
    const a = prices.startBackfill("phuquy", 30);
    expect(prices.startBackfill("phuquy", 30)).toBe(a);
    await a;
    expect(source.dailyCalls).toHaveLength(30);
    expect(prices.backfillRunning("phuquy")).toBeUndefined();
  });

  it("đã tải bù mà nguồn vẫn không đủ 5 ngày thì báo, không gọi AI", async () => {
    dailyRingSeries(4);
    await prices.startBackfill("phuquy", 30);
    const agent = await login();
    const res = await agent.get("/api/trends?metal=gold").expect(409);
    expect(res.body.error).toBe("Nguồn giá chưa có đủ số liệu để nhận định (cần ít nhất 5 ngày)");
    expect(res.body.fields).toBeUndefined();
    expect(model.inputs).toHaveLength(0);
  });

  // SC: PRICE-UC02-SC6
  it("AI hết lượt miễn phí hoặc lỗi thì báo, không lưu bản hỏng", async () => {
    dailyRingSeries(30);
    await prices.startBackfill("phuquy", 30);
    const agent = await login();
    model.fail = new TrendModelError("quota");
    expect((await agent.get("/api/trends?metal=gold").expect(503)).body.error).toBe("AI đã hết lượt miễn phí, thử lại sau");
    model.fail = new TrendModelError("busy");
    expect((await agent.get("/api/trends?metal=gold").expect(503)).body.error).toBe("AI đang quá tải, thử lại sau ít phút");
    model.fail = new TrendModelError("failed");
    expect((await agent.get("/api/trends?metal=gold").expect(502)).body.error).toBe("Chưa phân tích được, thử lại sau");
    model.fail = null;
    await agent.get("/api/trends?metal=gold").expect(200);
  });

  it("chưa cấu hình AI thì báo, các API khác vẫn chạy", async () => {
    app = createApp({ db, prices, now: () => NOW });
    const agent = await login();
    expect((await agent.get("/api/trends?metal=gold").expect(503)).body.error).toBe("Chưa bật AI nhận định (thiếu GEMINI_API_KEY)");
    await agent.get("/api/portfolio").expect(200);
  });

  it("kim loại không hợp lệ thì 400; chưa đăng nhập thì 401", async () => {
    await request(app).get("/api/trends?metal=gold").expect(401);
    const agent = await login();
    await agent.get("/api/trends?metal=copper").expect(400);
  });
});
