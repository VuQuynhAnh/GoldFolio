import { beforeEach, describe, expect, it } from "vitest";
import { PriceService } from "../src/prices/service";
import { FakeSource, goldSection, productId, testDb } from "./helpers";
import type { Db } from "../src/db";

let db: Db;
let source: FakeSource;
let prices: PriceService;
let ring: number;

beforeEach(() => {
  db = testDb();
  source = new FakeSource();
  prices = new PriceService(db, [source]);
  ring = productId(db, "phuquy", "nhan-tron-9999");
});

const snapshotCount = () => (db.prepare("SELECT COUNT(*) AS n FROM price_snapshots").get() as { n: number }).n;

describe("lấy và lưu giá hiện tại", () => {
  it("lưu ảnh chụp giá; bảng giống hệt lần trước thì không lưu thêm (PRICE-BR-002)", async () => {
    source.live = [goldSection("2026-11-02", "17:26", 13_550_000, 13_850_000)];
    await prices.refreshLive("phuquy");
    await prices.refreshLive("phuquy");
    expect(snapshotCount()).toBe(1);

    source.live = [goldSection("2026-11-02", "17:40", 13_600_000, 13_900_000)];
    await prices.refreshLive("phuquy");
    expect(snapshotCount()).toBe(2);
  });

  // SC: HOLD-UC01-SC18
  it("giá mới nhất kèm giờ nguồn công bố", async () => {
    source.live = [goldSection("2026-11-02", "17:26", 13_550_000, 13_850_000)];
    await prices.refreshLive("phuquy");
    expect(prices.latest(ring)).toEqual({ buy: 13_550_000, sell: 13_850_000, sourceTime: "2026-11-02T10:26:00.000Z" });
  });

  it("nguồn lỗi thì giữ giá cũ, không ghi gì mới (PRICE-BR-003)", async () => {
    source.live = [goldSection("2026-11-02", "17:26", 13_550_000, 13_850_000)];
    await prices.refreshLive("phuquy");
    source.live = [];
    source.liveErrors = ["Bảng giá vàng trống"];
    const result = await prices.refreshLive("phuquy");
    expect(result.errors).toEqual(["Bảng giá vàng trống"]);
    expect(prices.latest(ring)?.buy).toBe(13_550_000);
  });

  // SC: HOLD-UC01-SC29
  it("sản phẩm không còn trong bảng giá mới nhất thì bị ẩn, có lại thì hiện lại", async () => {
    const sjc = productId(db, "phuquy", "sjc");
    const isActive = (id: number) => (db.prepare("SELECT active FROM products WHERE id = ?").get(id) as { active: number }).active;
    source.live = [goldSection("2026-11-02", "17:26", 1, 1, [{ name: "Vàng miếng SJC", unit: "chi", buy: 2, sell: 2 }])];
    await prices.refreshLive("phuquy");
    expect(isActive(sjc)).toBe(1);

    source.live = [goldSection("2026-11-02", "17:40", 1, 1)];
    await prices.refreshLive("phuquy");
    expect(isActive(sjc)).toBe(0);
    // Bạc không nằm trong phần "gold" nên không bị ẩn theo
    expect(isActive(productId(db, "phuquy", "bac-thoi-1kg"))).toBe(1);
  });
});

describe("giá tại thời điểm mua (PRICE-BR-004)", () => {
  beforeEach(async () => {
    source.live = [goldSection("2026-11-01", "09:00", 13_500_000, 13_800_000)];
    await prices.refreshLive("phuquy");
    source.live = [goldSection("2026-11-01", "14:00", 13_600_000, 13_900_000)];
    await prices.refreshLive("phuquy");
  });

  // SC: HOLD-UC01-SC10
  it("không có giờ mua: lấy ảnh chụp cuối ngày", async () => {
    expect(await prices.priceAt(ring, "2026-11-01", null)).toMatchObject({
      sell: 13_900_000,
      kind: "live",
      sourceTime: "2026-11-01T07:00:00.000Z",
    });
  });

  // SC: HOLD-UC01-SC11
  it("có giờ mua: lấy ảnh chụp gần nhất trước giờ đó", async () => {
    expect(await prices.priceAt(ring, "2026-11-01", "10:30")).toMatchObject({ sell: 13_800_000 });
  });

  // SC: HOLD-UC01-SC32
  it("ngày không có ảnh chụp thì dùng giá theo ngày của nguồn", async () => {
    source.daily.set("2025-01-15", {
      sourceDate: "2025-01-15",
      sourceTime: null,
      rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: 8_460_000, sell: 8_610_000 }],
    });
    expect(await prices.priceAt(ring, "2025-01-15", null)).toMatchObject({ sell: 8_610_000, kind: "daily", sourceDate: "2025-01-15" });
    // Lần sau dùng bản đã lưu, không hỏi nguồn lại
    await prices.priceAt(ring, "2025-01-15", "09:00");
    expect(source.dailyCalls).toEqual(["2025-01-15"]);
  });

  // SC: HOLD-UC01-SC12
  it("nguồn không có dữ liệu ngày đó: không gợi ý và chỉ hỏi nguồn một lần (PRICE-BR-007)", async () => {
    expect(await prices.priceAt(ring, "2024-01-01", null)).toBeNull();
    expect(await prices.priceAt(ring, "2024-01-01", null)).toBeNull();
    expect(source.dailyCalls).toEqual(["2024-01-01"]);
  });

  // Hồi quy: hỏi giá theo ngày cho hôm nay từng bị ghi "không có dữ liệu" vĩnh viễn,
  // sang hôm sau ngày đó không bao giờ được gợi ý giá nữa
  it("ngày hôm nay (giờ VN) không hỏi giá theo ngày và không ghi là không có dữ liệu", async () => {
    const today = new PriceService(db, [source], () => new Date("2026-11-05T03:00:00.000Z"));
    expect(await today.priceAt(ring, "2026-11-05", null)).toBeNull();
    expect(source.dailyCalls).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM daily_misses").get()).toEqual({ n: 0 });

    // Hôm sau nguồn đã có giá ngày đó
    source.daily.set("2026-11-05", {
      sourceDate: "2026-11-05",
      sourceTime: null,
      rows: [{ name: "Nhẫn tròn Phú Quý 999.9", unit: "chi", buy: 1, sell: 2 }],
    });
    const tomorrow = new PriceService(db, [source], () => new Date("2026-11-06T03:00:00.000Z"));
    expect(await tomorrow.priceAt(ring, "2026-11-05", null)).toMatchObject({ sell: 2, kind: "daily" });
  });

  it("thương hiệu chưa có nguồn giá thì không hỏi nguồn nào", async () => {
    const btmh = productId(db, "btmh", "nhan-tron");
    expect(await prices.priceAt(btmh, "2026-11-01", null)).toBeNull();
    expect(source.dailyCalls).toEqual([]);
  });
});
