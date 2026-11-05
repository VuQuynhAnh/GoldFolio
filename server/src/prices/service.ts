import { createHash } from "node:crypto";
import { vnDate, vnToIso, type PriceUnit } from "@goldfolio/shared";

/** Ngày "YYYY-MM-DD" cộng `n` ngày (theo lịch, không theo múi giờ) */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
import type { Db } from "../db";
import { matchRows, type MatchedPrice, type MatchProduct } from "./match";
import type { PriceSource, SourceTable } from "./types";

export interface LatestPrice {
  buy: number;
  sell: number | null;
  sourceTime: string;
}

export interface PriceAt {
  buy: number;
  sell: number | null;
  /** live = ảnh chụp có giờ; daily = giá theo ngày của nguồn, không có giờ */
  kind: "live" | "daily";
  sourceTime: string | null;
  sourceDate: string;
}

interface ProductRow {
  id: number;
  name: string;
  aliases_json: string;
  price_unit: PriceUnit;
  metal: string;
}

interface PointRow {
  buy_price: number;
  sell_price: number | null;
}

/** Giá của các thương hiệu: lấy từ adapter, lưu ảnh chụp, tra giá hiện tại và giá tại thời điểm mua. */
export class PriceService {
  private sources = new Map<string, PriceSource>();
  /** Lần tải bù đang chạy theo thương hiệu: lịch lấy giá và lượt mở tab dùng chung, không tải trùng */
  private backfills = new Map<string, Promise<number>>();
  /** Ngày (VN) đã tải bù xong theo thương hiệu */
  private backfilledOn = new Map<string, string>();

  constructor(
    private db: Db,
    sources: PriceSource[],
    /** Đồng hồ, tiêm vào để test "hôm nay" */
    private now: () => Date = () => new Date(),
    /** Nghỉ giữa hai lần hỏi giá theo ngày khi tải bù (R-SRC-02); server đặt 1,5 giây, test để 0 */
    private backfillPauseMs = 0,
  ) {
    for (const s of sources) this.sources.set(s.brandCode, s);
  }

  private async brandId(code: string): Promise<number> {
    const row = await this.db.one<{ id: number }>("SELECT id FROM brands WHERE code = $1", [code]);
    if (!row) throw new Error(`Không có thương hiệu ${code}`);
    return row.id;
  }

  private async liveProducts(brandId: number, metal?: string): Promise<MatchProduct[]> {
    const rows = metal
      ? await this.db.query<ProductRow>("SELECT * FROM products WHERE brand_id = $1 AND source = 'live' AND metal = $2", [brandId, metal])
      : await this.db.query<ProductRow>("SELECT * FROM products WHERE brand_id = $1 AND source = 'live'", [brandId]);
    return rows.map((r) => ({ id: r.id, name: r.name, aliases: JSON.parse(r.aliases_json), priceUnit: r.price_unit }));
  }

  private async saveSnapshot(
    db: Db,
    brandId: number,
    kind: "live" | "daily",
    section: string,
    table: SourceTable,
    matched: Map<number, MatchedPrice>,
    hash: string,
  ) {
    const snap = await db.one<{ id: number }>(
      `INSERT INTO price_snapshots (brand_id, kind, section, source_date, source_time, fetched_at, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [brandId, kind, section, table.sourceDate, table.sourceTime, new Date().toISOString(), hash],
    );
    for (const [productId, p] of matched) {
      await db.query("INSERT INTO price_points (snapshot_id, product_id, buy_price, sell_price) VALUES ($1, $2, $3, $4)", [
        snap!.id,
        productId,
        p.buy,
        p.sell,
      ]);
    }
  }

  /**
   * Lấy bảng giá hiện tại của một thương hiệu và lưu thành ảnh chụp.
   * Phần nào lỗi thì giữ nguyên ảnh chụp cũ của phần đó (PRICE-BR-003);
   * bảng giống hệt lần trước thì không lưu thêm (PRICE-BR-002).
   */
  async refreshLive(brandCode: string): Promise<{ saved: number; errors: string[] }> {
    const source = this.sources.get(brandCode);
    if (!source) return { saved: 0, errors: [`Thương hiệu ${brandCode} chưa có nguồn giá`] };
    const brandId = await this.brandId(brandCode);
    const { sections, errors } = await source.fetchLive();
    let saved = 0;

    for (const { section, metal, table } of sections) {
      const products = await this.liveProducts(brandId, metal);
      const { matched, unmatched } = matchRows(products, table.rows);
      if (unmatched.length) console.warn(`[giá ${brandCode}/${section}] dòng không khớp sản phẩm:`, unmatched);
      if (matched.size === 0) {
        errors.push(`${section}: không dòng nào khớp sản phẩm`);
        continue;
      }
      const hash = createHash("sha256")
        .update(JSON.stringify([table.sourceTime, [...matched].sort((a, b) => a[0] - b[0])]))
        .digest("hex");
      const last = await this.db.one<{ content_hash: string }>(
        "SELECT content_hash FROM price_snapshots WHERE brand_id = $1 AND kind = 'live' AND section = $2 ORDER BY id DESC LIMIT 1",
        [brandId, section],
      );
      if (last?.content_hash === hash) continue;

      await this.db.tx(async (t) => {
        await this.saveSnapshot(t, brandId, "live", section, table, matched, hash);
        // Sản phẩm không còn trên bảng giá thì không chọn được cho lần mua mới (HOLD-UC01/BR-15)
        for (const p of products) await t.query("UPDATE products SET active = $1 WHERE id = $2", [matched.has(p.id) ? 1 : 0, p.id]);
      });
      saved++;
    }
    return { saved, errors };
  }

  /** Giá hiện tại = ảnh chụp live mới nhất có sản phẩm này. */
  async latest(productId: number): Promise<LatestPrice | null> {
    const row = await this.db.one<PointRow & { source_time: string }>(
      `SELECT pp.buy_price, pp.sell_price, s.source_time FROM price_points pp
       JOIN price_snapshots s ON s.id = pp.snapshot_id
       WHERE pp.product_id = $1 AND s.kind = 'live'
       ORDER BY s.source_time DESC, s.id DESC LIMIT 1`,
      [productId],
    );
    return row ? { buy: row.buy_price, sell: row.sell_price, sourceTime: row.source_time } : null;
  }

  /**
   * Giá tại thời điểm mua (PRICE-BR-004): ảnh chụp gần nhất trước hoặc đúng giờ mua
   * trong ngày mua (không có giờ thì lấy cuối ngày). Trong ngày không có ảnh chụp
   * thì dùng giá theo ngày của nguồn; giá theo ngày chỉ hỏi nguồn khi cần và mỗi
   * ngày hỏi một lần, kể cả khi nguồn báo không có (PRICE-BR-007).
   */
  async priceAt(productId: number, date: string, time: string | null): Promise<PriceAt | null> {
    const live = await this.db.one<PointRow & { source_time: string }>(
      `SELECT pp.buy_price, pp.sell_price, s.source_time FROM price_points pp
       JOIN price_snapshots s ON s.id = pp.snapshot_id
       WHERE pp.product_id = $1 AND s.kind = 'live' AND s.source_time >= $2 AND s.source_time <= $3
       ORDER BY s.source_time DESC, s.id DESC LIMIT 1`,
      [productId, vnToIso(date, "00:00"), vnToIso(date, time ?? "23:59")],
    );
    if (live) return { buy: live.buy_price, sell: live.sell_price, kind: "live", sourceTime: live.source_time, sourceDate: date };

    const product = await this.db.one<{ brand_id: number; brand_code: string }>(
      "SELECT p.brand_id, b.code AS brand_code FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = $1",
      [productId],
    );
    if (!product) return null;

    const daily = () =>
      this.db.one<PointRow>(
        `SELECT pp.buy_price, pp.sell_price FROM price_points pp
         JOIN price_snapshots s ON s.id = pp.snapshot_id
         WHERE pp.product_id = $1 AND s.kind = 'daily' AND s.source_date = $2 LIMIT 1`,
        [productId, date],
      );
    const toResult = (r: PointRow): PriceAt => ({ buy: r.buy_price, sell: r.sell_price, kind: "daily", sourceTime: null, sourceDate: date });

    const cached = await daily();
    if (cached) return toResult(cached);
    if (!(await this.ensureDaily(product.brand_id, product.brand_code, date))) return null;
    const saved = await daily();
    return saved ? toResult(saved) : null;
  }

  /**
   * Bảo đảm đã hỏi nguồn giá theo ngày của `date` (PRICE-BR-007): mỗi ngày đã qua chỉ hỏi
   * một lần, kể cả khi nguồn báo không có. Trả true nếu vừa lấy được và lưu bảng mới.
   */
  private async ensureDaily(brandId: number, brandCode: string, date: string): Promise<boolean> {
    const source = this.sources.get(brandCode);
    // Chỉ hỏi giá theo ngày cho ngày đã qua (giờ VN). Hôm nay chưa kết thúc: nguồn có thể
    // chưa có trang của hôm nay, ghi "không có dữ liệu" lúc này sẽ chặn ngày đó vĩnh viễn;
    // giá trong ngày đã có ảnh chụp live lo.
    if (!source || date >= vnDate(this.now()) || (await this.dailyAsked(brandId, date))) return false;

    let table: SourceTable | null;
    try {
      table = await source.fetchDaily(date);
    } catch (err) {
      // Lỗi mạng: không ghi là "không có dữ liệu" để lần sau còn thử lại
      console.warn(`[giá ${brandCode}] lỗi lấy giá ngày ${date}:`, err);
      return false;
    }
    if (!table) {
      await this.db.query("INSERT INTO daily_misses (brand_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING", [brandId, date]);
      return false;
    }
    const { matched } = matchRows(await this.liveProducts(brandId), table.rows);
    await this.db.tx((t) => this.saveSnapshot(t, brandId, "daily", "daily", table, matched, ""));
    return true;
  }

  /**
   * Tải bù giá theo ngày của `days` ngày đã qua gần nhất cho nhận định xu hướng (PRICE-UC02,
   * PRICE-BR-007): tuần tự, nghỉ `pauseMs` giữa hai lần hỏi để không dồn request vào nguồn;
   * ngày đã hỏi rồi thì bỏ qua, nên chạy lại hằng ngày chỉ hỏi thêm ngày mới. Trả số ngày đã hỏi nguồn.
   */
  async backfillDaily(brandCode: string, days: number, pauseMs = 0): Promise<number> {
    const source = this.sources.get(brandCode);
    if (!source) return 0;
    const brandId = await this.brandId(brandCode);
    const today = vnDate(this.now());
    let asked = 0;
    for (let n = 1; n <= days; n++) {
      const date = addDays(today, -n);
      if (await this.dailyAsked(brandId, date)) continue;
      await this.ensureDaily(brandId, brandCode, date);
      asked++;
      if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
    }
    return asked;
  }

  /**
   * Tải bù 30 ngày (PRICE-UC02/BR-1) theo cách dùng chung: đang có lần tải của thương hiệu này
   * thì trả lại đúng lần đó. Xong thì ghi nhận ngày đã tải bù.
   */
  startBackfill(brandCode: string, days: number): Promise<number> {
    const running = this.backfills.get(brandCode);
    if (running) return running;
    const job = this.backfillDaily(brandCode, days, this.backfillPauseMs)
      .then((asked) => {
        this.backfilledOn.set(brandCode, vnDate(this.now()));
        return asked;
      })
      .finally(() => this.backfills.delete(brandCode));
    this.backfills.set(brandCode, job);
    return job;
  }

  /** Lần tải bù đang chạy (nếu có) */
  backfillRunning(brandCode: string): Promise<number> | undefined {
    return this.backfills.get(brandCode);
  }

  /** Hôm nay đã tải bù xong cho thương hiệu này chưa */
  backfilledToday(brandCode: string): boolean {
    return this.backfilledOn.get(brandCode) === vnDate(this.now());
  }

  /** Đã hỏi nguồn giá theo ngày của `date` chưa: có bảng đã lưu, hoặc nguồn từng báo không có */
  private async dailyAsked(brandId: number, date: string): Promise<boolean> {
    return !!(
      (await this.db.one("SELECT 1 FROM price_snapshots WHERE brand_id = $1 AND kind = 'daily' AND source_date = $2", [brandId, date])) ??
      (await this.db.one("SELECT 1 FROM daily_misses WHERE brand_id = $1 AND date = $2", [brandId, date]))
    );
  }

  /**
   * Giá theo từng ngày của một sản phẩm trong [from, to] (PRICE-UC02): ưu tiên giá theo ngày
   * của nguồn (số chốt của ngày); ngày chưa có thì lấy ảnh chụp live cuối cùng của ngày đó.
   */
  async dailySeries(productId: number, from: string, to: string): Promise<{ date: string; buy: number; sell: number | null }[]> {
    const daily = await this.db.query<PointRow & { date: string }>(
      `SELECT s.source_date AS date, pp.buy_price, pp.sell_price FROM price_points pp
       JOIN price_snapshots s ON s.id = pp.snapshot_id
       WHERE pp.product_id = $1 AND s.kind = 'daily' AND s.source_date >= $2 AND s.source_date <= $3`,
      [productId, from, to],
    );
    const live = await this.db.query<PointRow & { date: string }>(
      `SELECT DISTINCT ON (s.source_date) s.source_date AS date, pp.buy_price, pp.sell_price FROM price_points pp
       JOIN price_snapshots s ON s.id = pp.snapshot_id
       WHERE pp.product_id = $1 AND s.kind = 'live' AND s.source_date >= $2 AND s.source_date <= $3
       ORDER BY s.source_date, s.source_time DESC, s.id DESC`,
      [productId, from, to],
    );
    const byDate = new Map<string, { date: string; buy: number; sell: number | null }>();
    for (const r of [...live, ...daily]) byDate.set(r.date, { date: r.date, buy: r.buy_price, sell: r.sell_price });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
