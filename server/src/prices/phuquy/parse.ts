import { load, type CheerioAPI } from "cheerio";
import { vnToIso, type PriceUnit } from "@goldfolio/shared";
import { SourceParseError, type SourceRow, type SourceTable } from "../types";

// Đọc HTML bảng giá của Phú Quý. Nguồn không có API: mọi bộ chọn ở đây dựa trên
// HTML thật ngày 03/11/2026 (test/fixtures/phuquy). Trang đổi cấu trúc thì ném lỗi
// để bỏ cả bảng, không bao giờ trả giá 0 hoặc giá rỗng (PRICE-BR-003).

/** "13,670,000" → 13670000; ô trống hoặc "_" → null. */
function parsePrice(text: string): number | null {
  const t = text.trim();
  if (t === "" || t === "_" || t === "-") return null;
  if (!/^[\d.,]+$/.test(t)) throw new SourceParseError(`Giá không đọc được: "${t}"`);
  return Number(t.replace(/[.,]/g, ""));
}

function requireBuy(name: string, text: string): number {
  const buy = parsePrice(text);
  if (buy === null || buy <= 0) throw new SourceParseError(`Thiếu giá mua vào hợp lệ cho "${name}"`);
  return buy;
}

function optionalSell(name: string, text: string): number | null {
  const sell = parsePrice(text);
  if (sell !== null && sell <= 0) throw new SourceParseError(`Giá bán ra không hợp lệ cho "${name}"`);
  return sell;
}

/** "dd/MM/yyyy" → "YYYY-MM-DD" */
function ymd(dmy: string): string {
  const [d, m, y] = dmy.split("/");
  return `${y}-${m}-${d}`;
}

/** Các dòng của bảng vàng (trang chủ và trang XemLai cùng cấu trúc), giá theo VNĐ/chỉ. */
function goldRows($: CheerioAPI): SourceRow[] {
  const rows: SourceRow[] = [];
  $("#priceList tbody tr").each((_, tr) => {
    const name = $(tr).find("td").first().text().trim();
    if (!name) return;
    rows.push({
      name,
      unit: "chi",
      buy: requireBuy(name, $(tr).find("td.buy-price").text()),
      sell: optionalSell(name, $(tr).find("td.sell-price").text()),
    });
  });
  return rows;
}

/** Bảng giá vàng hiện tại ở trang chủ phuquygroup.vn. */
export function parseGoldLive(html: string): SourceTable {
  const $ = load(html);
  // "Giá vàng cập nhật lần cuối lúc 08:40 03/11/2026"
  const m = $("#lastupdate .update-time").first().text().match(/(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})/);
  if (!m) throw new SourceParseError("Không thấy giờ cập nhật bảng giá vàng");
  const sourceDate = ymd(m[2]!);
  // Giá bạc ở trang chủ tính theo chỉ; giá bạc chuẩn (lượng/kg) lấy ở trang bạc riêng
  const rows = goldRows($).filter((r) => !/bạc/i.test(r.name));
  if (rows.length === 0) throw new SourceParseError("Bảng giá vàng trống");
  return { sourceDate, sourceTime: vnToIso(sourceDate, m[1]!), rows };
}

/** Bảng giá bạc hiện tại ở giabac.phuquygroup.vn; đơn vị niêm yết ghi ở từng dòng. */
export function parseSilverLive(html: string): SourceTable {
  const $ = load(html);
  const time = $("#last-update-time").text().trim();
  const date = $("#last-update-date").text().trim();
  if (!/^\d{2}:\d{2}$/.test(time) || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    throw new SourceParseError("Không thấy giờ cập nhật bảng giá bạc");
  }
  const rows: SourceRow[] = [];
  let otherBrands = false;
  $("tr").each((_, tr) => {
    // Bảng chia nhóm "BẠC THƯƠNG HIỆU PHÚ QUÝ" và "BẠC THƯƠNG HIỆU KHÁC";
    // chỉ lấy nhóm Phú Quý, bạc hãng khác không phải sản phẩm của thương hiệu này
    if ($(tr).hasClass("silver-price-group-row")) {
      otherBrands = /KHÁC/i.test($(tr).text());
      return;
    }
    const nameCell = $(tr).find("td.silver-product-name");
    if (otherBrands || nameCell.length === 0) return;
    const name = nameCell.text().replace(/\s+/g, " ").trim();
    const unitText = $(tr).find("td.silver-unit").text().replace(/\s+/g, "").toUpperCase();
    let unit: PriceUnit;
    if (unitText.endsWith("/LƯỢNG")) unit = "luong";
    else if (unitText.endsWith("/KG")) unit = "kg";
    else throw new SourceParseError(`Đơn vị bạc lạ: "${unitText}" (${name})`);
    rows.push({
      name,
      unit,
      buy: requireBuy(name, $(tr).find("td.silver-buy-price").text()),
      sell: optionalSell(name, $(tr).find("td.silver-sell-price").text()),
    });
  });
  if (rows.length === 0) throw new SourceParseError("Bảng giá bạc trống");
  const sourceDate = ymd(date);
  return { sourceDate, sourceTime: vnToIso(sourceDate, time), rows };
}

/**
 * Trang XemLai?date=: giá theo ngày, không có giờ; mọi dòng (kể cả bạc) theo VNĐ/chỉ.
 * Trả null khi trang không phải của ngày được hỏi hoặc không có dòng giá nào.
 */
export function parseDaily(html: string, date: string): SourceTable | null {
  const $ = load(html);
  // "Giá vàng ngày 01/11/2026"
  const m = $("#lastupdate .update-time").first().text().match(/ngày\s+(\d{2}\/\d{2}\/\d{4})/);
  if (!m || ymd(m[1]!) !== date) return null;
  const rows = goldRows($);
  if (rows.length === 0) return null;
  return { sourceDate: date, sourceTime: null, rows };
}
