import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { PriceService } from "../src/prices/service";
import type { Db } from "../src/db";
import { FakeSource, goldSection, productId, testDb } from "./helpers";

// "Bây giờ" cố định: 10:00 ngày 02/11/2026 giờ VN
const NOW = new Date("2026-11-02T03:00:00.000Z");

let db: Db;
let source: FakeSource;
let prices: PriceService;
let app: Express;
let ring: number;

beforeEach(async () => {
  db = await testDb();
  source = new FakeSource();
  prices = new PriceService(db, [source], () => NOW);
  app = createApp({ db, prices, now: () => NOW });
  ring = await productId(db, "phuquy", "nhan-tron-9999");
  source.live = [
    goldSection("2026-11-02", "09:00", 13_550_000, 13_850_000),
    {
      section: "silver",
      metal: "silver",
      table: {
        sourceDate: "2026-11-02",
        sourceTime: new Date("2026-11-02T09:30:00+07:00").toISOString(),
        rows: [{ name: "Bạc miếng Phú Quý 999 1 lượng", unit: "luong", buy: 1_400_000, sell: 1_440_000 }],
      },
    },
  ];
  await prices.refreshLive("phuquy");
});

async function login(email = "a@example.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "matkhau123" }).expect(201);
  return agent;
}

const widget = (token: string) => request(app).get("/api/widget").set("Authorization", `Bearer ${token}`);

describe("widget màn hình chính (HOLD-UC02)", () => {
  // SC: HOLD-UC02-SC1
  it("tạo mã rồi widget đọc được tổng tài sản, lãi/lỗ và giá vàng/bạc", async () => {
    const agent = await login();
    expect((await agent.get("/api/widget/token").expect(200)).body).toEqual({ hasToken: false, createdAt: null, lastUsedAt: null });
    await agent.post("/api/purchases").send({ productId: ring, weight: "2", weightUnit: "chi", purchaseDate: "2026-11-01", priceMode: "unit", unitPrice: 13_000_000 }).expect(201);

    const created = await agent.post("/api/widget/token").expect(201);
    expect(created.body).toMatchObject({ hasToken: true, createdAt: NOW.toISOString(), lastUsedAt: null });
    const token: string = created.body.token;
    expect(token).toMatch(/^gfw_[\w-]{32}$/);

    const res = await widget(token).expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      updatedAt: NOW.toISOString(),
      total: {
        hasHolding: true,
        value: 27_100_000,
        totalCost: 26_000_000,
        pnl: 1_100_000,
        pct: 4.23,
        excludedCount: 0,
        trend: "gain",
        valueText: "27.100.000 đ",
        pnlText: "+1.100.000 (+4,23%)",
      },
      metals: [
        {
          metal: "gold",
          label: "Vàng",
          holding: { weightText: "2 chỉ", value: 27_100_000, pnl: 1_100_000, pct: 4.23, trend: "gain", pnlText: "+1.100.000 (+4,23%)" },
          price: {
            productName: "Nhẫn tròn Phú Quý 999.9",
            unit: "chi",
            buy: 13_550_000,
            sell: 13_850_000,
            time: "2026-11-02T02:00:00.000Z",
            text: "Mua 13.550.000 · Bán 13.850.000 /chỉ",
          },
        },
        {
          // Chưa có bạc: vẫn hiện giá bạc của sản phẩm mặc định, không có phần tài sản
          metal: "silver",
          label: "Bạc",
          holding: null,
          price: expect.objectContaining({ productName: "Bạc miếng Phú Quý 999 1 lượng", text: "Mua 1.400.000 · Bán 1.440.000 /lượng" }),
        },
      ],
      priceTime: "2026-11-02T02:00:00.000Z",
      priceTimeText: "Giá lúc 09:00 02/11/2026",
    });
    // Không lộ email trong số liệu widget
    expect(JSON.stringify(res.body)).not.toContain("a@example.com");
    expect((await agent.get("/api/widget/token").expect(200)).body.lastUsedAt).toBe(NOW.toISOString());
  });

  // SC: HOLD-UC02-SC2
  it("chưa có tài sản thì widget vẫn hiện giá vàng/bạc", async () => {
    const agent = await login();
    const token: string = (await agent.post("/api/widget/token").expect(201)).body.token;
    const res = await widget(token).expect(200);
    expect(res.body.total).toMatchObject({ hasHolding: false, valueText: "Chưa có tài sản", pnlText: "" });
    expect(res.body.metals.map((m: { price: { text: string } }) => m.price.text)).toEqual([
      "Mua 13.550.000 · Bán 13.850.000 /chỉ",
      "Mua 1.400.000 · Bán 1.440.000 /lượng",
    ]);
    expect(res.body.priceTimeText).toBe("Giá lúc 09:00 02/11/2026");
  });

  // SC: HOLD-UC02-SC3
  it("tạo mã mới thì mã cũ hết hiệu lực; thu hồi thì widget báo 401", async () => {
    const agent = await login();
    const first: string = (await agent.post("/api/widget/token").expect(201)).body.token;
    const second: string = (await agent.post("/api/widget/token").expect(201)).body.token;
    expect(second).not.toBe(first);
    const old = await widget(first).expect(401);
    expect(old.body.error).toBe("Mã widget không đúng hoặc đã bị thu hồi, tạo mã mới trong GoldFolio");
    await widget(second).expect(200);

    await agent.delete("/api/widget/token").expect(204);
    await widget(second).expect(401);
    expect((await agent.get("/api/widget/token").expect(200)).body.hasToken).toBe(false);
  });

  // SC: HOLD-UC02-SC4
  it("mã widget chỉ mở được số liệu widget, không dùng thay đăng nhập; mỗi mã chỉ thấy tài sản của chủ mã", async () => {
    const a = await login("a@example.com");
    await a.post("/api/purchases").send({ productId: ring, weight: "1", weightUnit: "chi", purchaseDate: "2026-11-01", priceMode: "unit", unitPrice: 13_000_000 }).expect(201);
    const b = await login("b@example.com");
    const tokenB: string = (await b.post("/api/widget/token").expect(201)).body.token;

    expect((await widget(tokenB).expect(200)).body.total.hasHolding).toBe(false);
    await request(app).get("/api/portfolio").set("Authorization", `Bearer ${tokenB}`).expect(401);
    await request(app).post("/api/widget/token").set("Authorization", `Bearer ${tokenB}`).expect(401);
    await request(app).get("/api/widget").expect(401);
    await widget("gfw_sai").expect(401);
    await widget("khong-phai-ma-widget").expect(401);
  });
});
