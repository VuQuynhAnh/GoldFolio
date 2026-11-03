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

beforeEach(() => {
  db = testDb();
  source = new FakeSource();
  prices = new PriceService(db, [source], () => NOW);
  app = createApp({ db, prices, now: () => NOW });
  ring = productId(db, "phuquy", "nhan-tron-9999");
});

async function login(email = "a@example.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "matkhau123" }).expect(201);
  return agent;
}

async function setRingPrice(buy: number, sell: number, time = "09:00", date = "2026-11-02") {
  source.live = [goldSection(date, time, buy, sell)];
  await prices.refreshLive("phuquy");
}

const base = { weightUnit: "chi", purchaseDate: "2026-11-01", priceMode: "unit" };

describe("tài khoản", () => {
  it("chưa đăng nhập thì mọi API dữ liệu trả 401", async () => {
    const res = await request(app).get("/api/portfolio").expect(401);
    expect(res.body.error).toBe("Vui lòng đăng nhập");
  });

  it("đăng ký trùng email và đăng nhập sai", async () => {
    await login();
    const dup = await request(app).post("/api/auth/register").send({ email: "A@example.com", password: "matkhau123" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Email đã được đăng ký");
    const bad = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "sai-mat-khau" });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe("Email hoặc mật khẩu không đúng");
  });

  it("mật khẩu quá ngắn", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "b@example.com", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.fields.password).toBe("Mật khẩu tối thiểu 8 ký tự");
  });
});

describe("thương hiệu và sản phẩm", () => {
  // SC: HOLD-UC01-SC1
  it("Phú Quý là thương hiệu mặc định, có danh sách sản phẩm", async () => {
    const agent = await login();
    const { body } = await agent.get("/api/brands").expect(200);
    const pq = body.brands.find((b: { isDefault: boolean }) => b.isDefault);
    expect(pq.name).toBe("Phú Quý");
    expect(pq.products.map((p: { name: string }) => p.name)).toContain("Nhẫn tròn Phú Quý 999.9");
  });

  // SC: HOLD-UC01-SC31
  it("thương hiệu chưa có nguồn giá dùng danh sách nhập sẵn, lần mua hiện chưa có giá", async () => {
    const agent = await login();
    const { body } = await agent.get("/api/brands");
    const btmh = body.brands.find((b: { code: string }) => b.code === "btmh");
    expect(btmh.hasSource).toBe(false);
    expect(btmh.products.length).toBeGreaterThan(0);
    await agent.post("/api/purchases").send({ ...base, productId: btmh.products[0].id, weight: "1", unitPrice: 13_000_000 }).expect(201);
    const pf = await agent.get("/api/portfolio");
    expect(pf.body.items[0].current).toBeNull();
    expect(pf.body.summary.excludedCount).toBe(1);
  });
});

describe("thêm lần mua", () => {
  // SC: HOLD-UC01-SC2
  it("theo đơn giá: tổng tiền tự tính", async () => {
    const agent = await login();
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", unitPrice: 13_850_000 }).expect(201);
    expect(res.body.purchase.totalCost).toBe(27_700_000);
  });

  // SC: HOLD-UC01-SC3
  it("theo tổng tiền: đơn giá tự tính, tổng tiền giữ nguyên", async () => {
    const agent = await login();
    const res = await agent
      .post("/api/purchases")
      .send({ ...base, productId: ring, weight: "3", priceMode: "total", totalPrice: 41_000_000 })
      .expect(201);
    expect(res.body.purchase).toMatchObject({ unitCost: 13_666_667, totalCost: 41_000_000 });
  });

  // SC: HOLD-UC01-SC5
  it.each([
    ["0", "Khối lượng phải lớn hơn 0"],
    ["1,2345", "Khối lượng có tối đa 3 chữ số thập phân"],
    ["", "Vui lòng nhập khối lượng"],
  ])("khối lượng %j bị chặn", async (weight, message) => {
    const agent = await login();
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight, unitPrice: 1 }).expect(400);
    expect(res.body.fields.weight).toBe(message);
  });

  // SC: HOLD-UC01-SC6
  it("ngày mua sau hôm nay (giờ VN) bị chặn", async () => {
    const agent = await login();
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1, purchaseDate: "2026-11-03" });
    expect(res.body.fields.purchaseDate).toBe("Ngày mua không được sau hôm nay");
  });

  // SC: HOLD-UC01-SC7
  it("giờ mua sau thời điểm hiện tại bị chặn", async () => {
    const agent = await login();
    const res = await agent
      .post("/api/purchases")
      .send({ ...base, productId: ring, weight: "1", unitPrice: 1, purchaseDate: "2026-11-02", purchaseTime: "11:00" });
    expect(res.body.fields.purchaseTime).toBe("Thời điểm mua không được sau hiện tại");
  });

  // SC: HOLD-UC01-SC8
  it("giá bằng 0", async () => {
    const agent = await login();
    const zero = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 0 });
    expect(zero.body.fields.price).toBe("Giá mua phải lớn hơn 0");
  });
});

describe("để trống giá thì tự lấy giá ngày mua (BR-16)", () => {
  const NOT_FOUND = "Không tìm được giá ngày này, vui lòng nhập giá mua";
  const dailyRing = (date: string, sell: number) =>
    source.daily.set(date, { sourceDate: date, sourceTime: null, rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: sell - 150_000, sell }] });

  // SC: HOLD-UC01-SC34
  it("lấy giá bán ra theo ngày của nguồn, tổng tiền tự tính, gắn nhãn", async () => {
    const agent = await login();
    dailyRing("2025-01-15", 8_610_000);
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", purchaseDate: "2025-01-15" }).expect(201);
    expect(res.body.purchase).toMatchObject({
      priceMode: "unit",
      unitCost: 8_610_000,
      totalCost: 17_220_000,
      priceSource: "auto",
      priceNote: "Giá Phú Quý ngày 15/01/2025",
    });
    const pf = await agent.get("/api/portfolio");
    expect(pf.body.items[0]).toMatchObject({ priceSource: "auto", priceNote: "Giá Phú Quý ngày 15/01/2025" });
  });

  // SC: HOLD-UC01-SC35
  it("có giờ mua thì lấy ảnh chụp trước giờ đó", async () => {
    const agent = await login();
    await setRingPrice(13_500_000, 13_800_000, "09:00", "2026-11-01");
    await setRingPrice(13_600_000, 13_900_000, "14:00", "2026-11-01");
    const res = await agent
      .post("/api/purchases")
      .send({ ...base, productId: ring, weight: "1", purchaseDate: "2026-11-01", purchaseTime: "10:30" })
      .expect(201);
    expect(res.body.purchase).toMatchObject({ unitCost: 13_800_000, priceNote: "Giá Phú Quý lúc 09:00 01/11/2026" });
  });

  // SC: HOLD-UC01-SC36
  it("thương hiệu chưa có nguồn giá", async () => {
    const agent = await login();
    const btmh = productId(db, "btmh", "nhan-tron");
    const res = await agent.post("/api/purchases").send({ ...base, productId: btmh, weight: "1" }).expect(400);
    expect(res.body.fields.price).toBe(NOT_FOUND);
  });

  // SC: HOLD-UC01-SC36
  it("nguồn không có dữ liệu ngày mua", async () => {
    const agent = await login();
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", purchaseDate: "2024-01-01" }).expect(400);
    expect(res.body.fields.price).toBe(NOT_FOUND);
  });

  // SC: HOLD-UC01-SC36
  it("sản phẩm chỉ có giá mua vào", async () => {
    const agent = await login();
    const phiSjc = productId(db, "phuquy", "phi-sjc-9999");
    source.live = [goldSection("2026-11-01", "09:00", 1, 1, [{ name: "Vàng 999.9 phi SJC", unit: "chi", buy: 12_700_000, sell: null }])];
    await prices.refreshLive("phuquy");
    const res = await agent.post("/api/purchases").send({ ...base, productId: phiSjc, weight: "1" }).expect(400);
    expect(res.body.fields.price).toBe(NOT_FOUND);
  });

  // SC: HOLD-UC01-SC37
  it("sửa và nhập giá tay thì bỏ nhãn giá tự lấy; sửa mà vẫn để trống thì lấy lại giá", async () => {
    const agent = await login();
    dailyRing("2025-01-15", 8_610_000);
    dailyRing("2025-02-03", 8_900_000);
    const { body } = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", purchaseDate: "2025-01-15" });
    const id = body.purchase.id;

    const again = await agent.put(`/api/purchases/${id}`).send({ ...base, productId: ring, weight: "1", purchaseDate: "2025-02-03" }).expect(200);
    expect(again.body.purchase).toMatchObject({ unitCost: 8_900_000, priceSource: "auto", priceNote: "Giá Phú Quý ngày 03/02/2025" });

    const manual = await agent
      .put(`/api/purchases/${id}`)
      .send({ ...base, productId: ring, weight: "1", purchaseDate: "2025-02-03", unitPrice: 13_700_000 })
      .expect(200);
    expect(manual.body.purchase).toMatchObject({ unitCost: 13_700_000, priceSource: "manual", priceNote: "" });
  });

  // SC: HOLD-UC01-SC33
  // Hồi quy: số cực lớn từng được lưu thành số thực 2.67e+23
  it("khối lượng và giá có giới hạn trên", async () => {
    const agent = await login();
    const heavy = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1001", weightUnit: "kg", unitPrice: 1 });
    expect(heavy.body.fields.weight).toBe("Khối lượng tối đa 1.000 kg");
    const pricey = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1_000_000_000_001 });
    expect(pricey.body.fields.price).toBe("Giá mua tối đa 1.000 tỷ đồng");
    // Đơn giá hợp lệ nhưng nhân khối lượng ra tổng tiền vượt giới hạn
    const total = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1000", weightUnit: "kg", unitPrice: 999_999_999_999 });
    expect(total.body.fields.price).toBe("Tổng tiền tối đa 1.000 tỷ đồng");
  });

  // SC: HOLD-UC01-SC23
  it("ghi chú quá 200 ký tự", async () => {
    const agent = await login();
    const res = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1, note: "a".repeat(201) });
    expect(res.body.fields.note).toBe("Ghi chú tối đa 200 ký tự");
  });
});

describe("tài sản của tôi", () => {
  // SC: HOLD-UC01-SC19
  it("danh mục rỗng", async () => {
    const agent = await login();
    const { body } = await agent.get("/api/portfolio").expect(200);
    expect(body.items).toEqual([]);
  });

  // SC: HOLD-UC01-SC14, HOLD-UC01-SC18
  it("lãi/lỗ theo giá mua vào, kèm giờ giá", async () => {
    const agent = await login();
    await setRingPrice(13_550_000, 13_850_000, "17:26", "2026-11-01");
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", priceMode: "total", totalPrice: 27_000_000 });
    const { body } = await agent.get("/api/portfolio");
    expect(body.items[0].current).toMatchObject({ value: 27_100_000, pnl: 100_000, pct: 0.37, priceTime: "2026-11-01T10:26:00.000Z" });
    expect(body.summary).toMatchObject({ totalCost: 27_000_000, value: 27_100_000, pnl: 100_000, pct: 0.37, excludedCount: 0 });
  });

  // SC: HOLD-UC01-SC15
  it("lỗ", async () => {
    const agent = await login();
    await setRingPrice(13_550_000, 13_850_000);
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", priceMode: "total", totalPrice: 14_000_000 });
    const { body } = await agent.get("/api/portfolio");
    expect(body.items[0].current).toMatchObject({ pnl: -450_000, pct: -3.21 });
  });

  // SC: HOLD-UC01-SC16
  it("nhóm theo kim loại rồi sản phẩm; tổng quan bằng tổng các nhóm", async () => {
    const agent = await login();
    const silver = productId(db, "phuquy", "bac-thoi-10-5-luong");
    source.live = [
      goldSection("2026-11-02", "09:00", 13_550_000, 13_850_000),
      {
        section: "silver",
        metal: "silver",
        table: {
          sourceDate: "2026-11-02",
          sourceTime: "2026-11-02T02:00:00.000Z",
          rows: [{ name: "BẠC THỎI PHÚ QUÝ 999 10 LƯỢNG, 5 LƯỢNG", unit: "luong", buy: 1_576_000, sell: 1_625_000 }],
        },
      },
    ];
    await prices.refreshLive("phuquy");
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 13_000_000 });
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", unitPrice: 13_000_000 });
    await agent.post("/api/purchases").send({ ...base, productId: silver, weight: "5", weightUnit: "luong", unitPrice: 1_500_000 });
    const { body } = await agent.get("/api/portfolio");
    const [gold, silv] = body.groups;
    expect(gold).toMatchObject({ metal: "gold", weightText: "3 chỉ", totalCost: 39_000_000 });
    expect(gold.products).toHaveLength(1);
    expect(silv).toMatchObject({ metal: "silver", weightText: "5 lượng", totalCost: 7_500_000 });
    expect(body.summary.totalCost).toBe(gold.totalCost + silv.totalCost);
    expect(body.summary.value).toBe(gold.value + silv.value);
  });

  // SC: HOLD-UC01-SC17
  it("lần mua chưa có giá không vào tổng", async () => {
    const agent = await login();
    const sjc = productId(db, "phuquy", "sjc");
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 13_000_000 }).expect(201);
    await agent.post("/api/purchases").send({ ...base, productId: sjc, weight: "1", unitPrice: 14_000_000 }).expect(201);
    // Bảng giá chỉ có nhẫn tròn: SJC chưa có giá hiện tại
    await setRingPrice(13_550_000, 13_850_000);
    const { body } = await agent.get("/api/portfolio");
    expect(body.summary).toMatchObject({ totalCost: 13_000_000, excludedCount: 1 });
  });

  // SC: HOLD-UC01-SC30
  it("không phân trang, mới nhất trước", async () => {
    const agent = await login();
    for (let i = 0; i < 300; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      db.prepare(
        `INSERT INTO purchases (user_id, product_id, weight_mg, input_unit, purchase_date, price_mode, unit_cost, total_cost, created_at, updated_at)
         VALUES (1, ?, 3750, 'chi', ?, 'unit', 1, 1, '', '')`,
      ).run(ring, `2026-10-${day}`);
    }
    const { body } = await agent.get("/api/portfolio");
    expect(body.items).toHaveLength(300);
    expect(body.items[0].purchaseDate).toBe("2026-10-28");
  });

  // SC: HOLD-UC01-SC29
  it("sản phẩm biến mất khỏi bảng giá: lần mua cũ hiện chưa có giá, không chọn được cho lần mua mới", async () => {
    const agent = await login();
    const sjc = productId(db, "phuquy", "sjc");
    await agent.post("/api/purchases").send({ ...base, productId: sjc, weight: "1", unitPrice: 1 }).expect(201);
    await setRingPrice(1, 1); // bảng giá mới không còn dòng SJC
    const { body } = await agent.get("/api/portfolio");
    expect(body.items[0]).toMatchObject({ productName: "Vàng miếng SJC", current: null });
    const brands = await agent.get("/api/brands");
    expect(brands.body.brands[0].products.map((p: { id: number }) => p.id)).not.toContain(sjc);
    const res = await agent.post("/api/purchases").send({ ...base, productId: sjc, weight: "1", unitPrice: 1 });
    expect(res.body.fields.productId).toBe("Sản phẩm không còn trên bảng giá");
  });
});

describe("sửa và xoá lần mua", () => {
  // SC: HOLD-UC01-SC20
  it("đã nhập theo đơn giá: đổi khối lượng thì giữ đơn giá, tính lại tổng", async () => {
    const agent = await login();
    const { body } = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", unitPrice: 13_850_000 });
    const res = await agent.put(`/api/purchases/${body.purchase.id}`).send({ ...base, productId: ring, weight: "3", unitPrice: 13_850_000 }).expect(200);
    expect(res.body.purchase.totalCost).toBe(41_550_000);
  });

  // SC: HOLD-UC01-SC24
  it("đã nhập theo tổng tiền: đổi khối lượng thì giữ tổng, tính lại đơn giá", async () => {
    const agent = await login();
    const p = { ...base, productId: ring, priceMode: "total", totalPrice: 41_000_000 };
    const { body } = await agent.post("/api/purchases").send({ ...p, weight: "3" });
    const res = await agent.put(`/api/purchases/${body.purchase.id}`).send({ ...p, weight: "4" }).expect(200);
    expect(res.body.purchase).toMatchObject({ totalCost: 41_000_000, unitCost: 10_250_000 });
  });

  // SC: HOLD-UC01-SC21
  it("xoá thì biến mất khỏi danh sách và tổng", async () => {
    const agent = await login();
    const { body } = await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1 });
    await agent.delete(`/api/purchases/${body.purchase.id}`).expect(200);
    const pf = await agent.get("/api/portfolio");
    expect(pf.body.items).toEqual([]);
  });

  // SC: HOLD-UC01-SC22
  it("không xem, sửa, xoá được lần mua của tài khoản khác", async () => {
    const a = await login("a@example.com");
    const { body } = await a.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1 });
    const b = await login("b@example.com");
    expect((await b.get("/api/portfolio")).body.items).toEqual([]);
    for (const res of [
      await b.get(`/api/purchases/${body.purchase.id}`),
      await b.put(`/api/purchases/${body.purchase.id}`).send({ ...base, productId: ring, weight: "9", unitPrice: 1 }),
      await b.delete(`/api/purchases/${body.purchase.id}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Không tìm thấy lần mua");
    }
    expect((await a.get(`/api/purchases/${body.purchase.id}`)).body.purchase.weight).toBe(1);
  });
});

describe("gợi ý giá mua", () => {
  // SC: HOLD-UC01-SC10
  it("ảnh chụp có giờ", async () => {
    const agent = await login();
    await setRingPrice(13_600_000, 13_900_000, "14:00", "2026-11-01");
    const { body } = await agent.get(`/api/prices/suggest?productId=${ring}&date=2026-11-01`);
    expect(body).toEqual({ unitPrice: 13_900_000, label: "Giá Phú Quý lúc 14:00 01/11/2026" });
  });

  // SC: HOLD-UC01-SC32
  it("giá theo ngày của nguồn", async () => {
    const agent = await login();
    source.daily.set("2025-01-15", {
      sourceDate: "2025-01-15",
      sourceTime: null,
      rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: 8_460_000, sell: 8_610_000 }],
    });
    const { body } = await agent.get(`/api/prices/suggest?productId=${ring}&date=2025-01-15`);
    expect(body).toEqual({ unitPrice: 8_610_000, label: "Giá Phú Quý ngày 15/01/2025" });
  });

  // SC: HOLD-UC01-SC12
  it("không có giá tham khảo", async () => {
    const agent = await login();
    const { body } = await agent.get(`/api/prices/suggest?productId=${ring}&date=2024-01-01`);
    expect(body).toEqual({ unitPrice: null, label: "Chưa có giá tham khảo cho thời điểm này" });
  });
});

describe("biểu đồ lịch sử giá", () => {
  // SC: HOLD-UC01-SC26
  it("điểm theo ngày mua, điểm hôm nay, giá vốn bình quân", async () => {
    const agent = await login();
    await setRingPrice(13_550_000, 13_850_000);
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "2", unitPrice: 13_000_000, purchaseDate: "2026-10-01" });
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 13_500_000, purchaseDate: "2026-10-15" });
    const { body } = await agent.get("/api/portfolio/history");
    expect(body.productId).toBe(ring);
    expect(body.points).toEqual([
      { date: "2026-10-01", unitPrice: 13_000_000, qty: 2, diff: 550_000 },
      { date: "2026-10-15", unitPrice: 13_500_000, qty: 1, diff: 50_000 },
    ]);
    expect(body.today).toMatchObject({ date: "2026-11-02", buyPrice: 13_550_000 });
    expect(body.avgCost).toBe(13_166_667);
  });

  // SC: HOLD-UC01-SC27
  it("nhiều lần mua cùng ngày gộp một điểm", async () => {
    const agent = await login();
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 13_400_000, purchaseDate: "2026-10-20" });
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "3", unitPrice: 13_000_000, purchaseDate: "2026-10-20" });
    const { body } = await agent.get("/api/portfolio/history");
    expect(body.points).toEqual([{ date: "2026-10-20", unitPrice: 13_100_000, qty: 4, diff: null }]);
  });

  // SC: HOLD-UC01-SC28
  it("sản phẩm chưa có giá hiện tại thì không có điểm hôm nay", async () => {
    const agent = await login();
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1 });
    const { body } = await agent.get("/api/portfolio/history");
    expect(body.today).toBeNull();
  });

  it("mặc định là sản phẩm có tổng tiền mua lớn nhất", async () => {
    const agent = await login();
    const sjc = productId(db, "phuquy", "sjc");
    await agent.post("/api/purchases").send({ ...base, productId: ring, weight: "1", unitPrice: 1_000 });
    await agent.post("/api/purchases").send({ ...base, productId: sjc, weight: "1", unitPrice: 9_000 });
    const { body } = await agent.get("/api/portfolio/history");
    expect(body.productId).toBe(sjc);
    expect(body.products).toHaveLength(2);
  });
});
