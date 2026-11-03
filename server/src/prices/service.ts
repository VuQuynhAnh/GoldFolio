import { createHash } from "node:crypto";
import { vnDate, vnToIso, type PriceUnit } from "@goldfolio/shared";
import { tx, type Db } from "../db";
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

/** Giá của các thương hiệu: lấy từ adapter, lưu ảnh chụp, tra giá hiện tại và giá tại thời điểm mua. */
export class PriceService {
  private sources = new Map<string, PriceSource>();

  constructor(
    private db: Db,
    sources: PriceSource[],
    /** Đồng hồ, tiêm vào để test "hôm nay" */
    private now: () => Date = () => new Date(),
  ) {
    for (const s of sources) this.sources.set(s.brandCode, s);
  }

  private brandId(code: string): number {
    const row = this.db.prepare("SELECT id FROM brands WHERE code = ?").get(code) as { id: number } | undefined;
    if (!row) throw new Error(`Không có thương hiệu ${code}`);
    return row.id;
  }

  private liveProducts(brandId: number, metal?: string): MatchProduct[] {
    const rows = (
      metal
        ? this.db.prepare("SELECT * FROM products WHERE brand_id = ? AND source = 'live' AND metal = ?").all(brandId, metal)
        : this.db.prepare("SELECT * FROM products WHERE brand_id = ? AND source = 'live'").all(brandId)
    ) as unknown as ProductRow[];
    return rows.map((r) => ({ id: r.id, name: r.name, aliases: JSON.parse(r.aliases_json), priceUnit: r.price_unit }));
  }

  private saveSnapshot(brandId: number, kind: "live" | "daily", section: string, table: SourceTable, matched: Map<number, MatchedPrice>, hash: string) {
    const snap = this.db
      .prepare(
        `INSERT INTO price_snapshots (brand_id, kind, section, source_date, source_time, fetched_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(brandId, kind, section, table.sourceDate, table.sourceTime, new Date().toISOString(), hash) as { id: number };
    const insert = this.db.prepare("INSERT INTO price_points (snapshot_id, product_id, buy_price, sell_price) VALUES (?, ?, ?, ?)");
    for (const [productId, p] of matched) insert.run(snap.id, productId, p.buy, p.sell);
  }

  /**
   * Lấy bảng giá hiện tại của một thương hiệu và lưu thành ảnh chụp.
   * Phần nào lỗi thì giữ nguyên ảnh chụp cũ của phần đó (PRICE-BR-003);
   * bảng giống hệt lần trước thì không lưu thêm (PRICE-BR-002).
   */
  async refreshLive(brandCode: string): Promise<{ saved: number; errors: string[] }> {
    const source = this.sources.get(brandCode);
    if (!source) return { saved: 0, errors: [`Thương hiệu ${brandCode} chưa có nguồn giá`] };
    const brandId = this.brandId(brandCode);
    const { sections, errors } = await source.fetchLive();
    let saved = 0;

    for (const { section, metal, table } of sections) {
      const products = this.liveProducts(brandId, metal);
      const { matched, unmatched } = matchRows(products, table.rows);
      if (unmatched.length) console.warn(`[giá ${brandCode}/${section}] dòng không khớp sản phẩm:`, unmatched);
      if (matched.size === 0) {
        errors.push(`${section}: không dòng nào khớp sản phẩm`);
        continue;
      }
      const hash = createHash("sha256")
        .update(JSON.stringify([table.sourceTime, [...matched].sort((a, b) => a[0] - b[0])]))
        .digest("hex");
      const last = this.db
        .prepare("SELECT content_hash FROM price_snapshots WHERE brand_id = ? AND kind = 'live' AND section = ? ORDER BY id DESC LIMIT 1")
        .get(brandId, section) as { content_hash: string } | undefined;
      if (last?.content_hash === hash) continue;

      tx(this.db, () => {
        this.saveSnapshot(brandId, "live", section, table, matched, hash);
        // Sản phẩm không còn trên bảng giá thì không chọn được cho lần mua mới (HOLD-UC01/BR-15)
        const setActive = this.db.prepare("UPDATE products SET active = ? WHERE id = ?");
        for (const p of products) setActive.run(matched.has(p.id) ? 1 : 0, p.id);
      });
      saved++;
    }
    return { saved, errors };
  }

  /** Giá hiện tại = ảnh chụp live mới nhất có sản phẩm này. */
  latest(productId: number): LatestPrice | null {
    const row = this.db
      .prepare(
        `SELECT pp.buy_price, pp.sell_price, s.source_time FROM price_points pp
         JOIN price_snapshots s ON s.id = pp.snapshot_id
         WHERE pp.product_id = ? AND s.kind = 'live'
         ORDER BY s.source_time DESC, s.id DESC LIMIT 1`,
      )
      .get(productId) as { buy_price: number; sell_price: number | null; source_time: string } | undefined;
    return row ? { buy: row.buy_price, sell: row.sell_price, sourceTime: row.source_time } : null;
  }

  /**
   * Giá tại thời điểm mua (PRICE-BR-004): ảnh chụp gần nhất trước hoặc đúng giờ mua
   * trong ngày mua (không có giờ thì lấy cuối ngày). Trong ngày không có ảnh chụp
   * thì dùng giá theo ngày của nguồn; giá theo ngày chỉ hỏi nguồn khi cần và mỗi
   * ngày hỏi một lần, kể cả khi nguồn báo không có (PRICE-BR-007).
   */
  async priceAt(productId: number, date: string, time: string | null): Promise<PriceAt | null> {
    const live = this.db
      .prepare(
        `SELECT pp.buy_price, pp.sell_price, s.source_time FROM price_points pp
         JOIN price_snapshots s ON s.id = pp.snapshot_id
         WHERE pp.product_id = ? AND s.kind = 'live' AND s.source_time >= ? AND s.source_time <= ?
         ORDER BY s.source_time DESC, s.id DESC LIMIT 1`,
      )
      .get(productId, vnToIso(date, "00:00"), vnToIso(date, time ?? "23:59")) as
      | { buy_price: number; sell_price: number | null; source_time: string }
      | undefined;
    if (live) return { buy: live.buy_price, sell: live.sell_price, kind: "live", sourceTime: live.source_time, sourceDate: date };

    const product = this.db
      .prepare("SELECT p.brand_id, b.code AS brand_code FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?")
      .get(productId) as { brand_id: number; brand_code: string } | undefined;
    if (!product) return null;

    const daily = () =>
      this.db
        .prepare(
          `SELECT pp.buy_price, pp.sell_price FROM price_points pp
           JOIN price_snapshots s ON s.id = pp.snapshot_id
           WHERE pp.product_id = ? AND s.kind = 'daily' AND s.source_date = ? LIMIT 1`,
        )
        .get(productId, date) as { buy_price: number; sell_price: number | null } | undefined;
    const toResult = (r: { buy_price: number; sell_price: number | null }): PriceAt => ({
      buy: r.buy_price,
      sell: r.sell_price,
      kind: "daily",
      sourceTime: null,
      sourceDate: date,
    });

    const cached = daily();
    if (cached) return toResult(cached);

    const source = this.sources.get(product.brand_code);
    // Chỉ hỏi giá theo ngày cho ngày đã qua (giờ VN). Hôm nay chưa kết thúc: nguồn có thể
    // chưa có trang của hôm nay, ghi "không có dữ liệu" lúc này sẽ chặn ngày đó vĩnh viễn;
    // giá trong ngày đã có ảnh chụp live lo.
    if (!source || date >= vnDate(this.now())) return null;
    const asked =
      this.db.prepare("SELECT 1 FROM price_snapshots WHERE brand_id = ? AND kind = 'daily' AND source_date = ?").get(product.brand_id, date) ??
      this.db.prepare("SELECT 1 FROM daily_misses WHERE brand_id = ? AND date = ?").get(product.brand_id, date);
    if (asked) return null;

    let table: SourceTable | null;
    try {
      table = await source.fetchDaily(date);
    } catch (err) {
      // Lỗi mạng: không ghi là "không có dữ liệu" để lần sau còn thử lại
      console.warn(`[giá ${product.brand_code}] lỗi lấy giá ngày ${date}:`, err);
      return null;
    }
    if (!table) {
      this.db.prepare("INSERT OR IGNORE INTO daily_misses (brand_id, date) VALUES (?, ?)").run(product.brand_id, date);
      return null;
    }
    const { matched } = matchRows(this.liveProducts(product.brand_id), table.rows);
    tx(this.db, () => this.saveSnapshot(product.brand_id, "daily", "daily", table, matched, ""));
    const saved = daily();
    return saved ? toResult(saved) : null;
  }
}
