import type { LiveSection, PriceSource, SourceTable } from "../types";
import { parseDaily, parseGoldLive, parseSilverLive } from "./parse";

const GOLD_URL = "https://phuquygroup.vn/";
const SILVER_URL = "https://giabac.phuquygroup.vn/";
// Lịch sử giá theo ngày, cùng cấu trúc bảng với trang chủ (không có giờ)
const DAILY_URL = "https://phuquygroup.vn/XemLai?date=";

// Tự giới thiệu đúng là ứng dụng, không giả trình duyệt.
const HEADERS = { "User-Agent": "GoldFolio/0.1 (+https://github.com/VuQuynhAnh/GoldFolio)" };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url} trả về HTTP ${res.status}`);
  return res.text();
}

/** Adapter giá Phú Quý (PRICE-BR-001): vàng ở trang chủ, bạc ở trang bạc riêng. */
export class PhuQuySource implements PriceSource {
  brandCode = "phuquy";

  async fetchLive() {
    const sections: LiveSection[] = [];
    const errors: string[] = [];
    // Hai trang lấy độc lập: một trang lỗi không làm mất giá của trang kia
    const parts = [
      { section: "gold", metal: "gold" as const, url: GOLD_URL, parse: parseGoldLive },
      { section: "silver", metal: "silver" as const, url: SILVER_URL, parse: parseSilverLive },
    ];
    for (const p of parts) {
      try {
        sections.push({ section: p.section, metal: p.metal, table: p.parse(await fetchText(p.url)) });
      } catch (err) {
        errors.push(`${p.section}: ${(err as Error).message}`);
      }
    }
    return { sections, errors };
  }

  async fetchDaily(date: string): Promise<SourceTable | null> {
    return parseDaily(await fetchText(DAILY_URL + date), date);
  }
}
