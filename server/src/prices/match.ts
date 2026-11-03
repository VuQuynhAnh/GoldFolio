import { MG_PER_UNIT, type PriceUnit } from "@goldfolio/shared";
import type { SourceRow } from "./types";

export interface MatchProduct {
  id: number;
  name: string;
  aliases: string[];
  priceUnit: PriceUnit;
}

export interface MatchedPrice {
  buy: number;
  sell: number | null;
}

/** Tên chuẩn hoá để so khớp: Unicode NFC, chữ thường, gộp dấu cách. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function convert(price: number, from: PriceUnit, to: PriceUnit): number {
  return Math.round((price * MG_PER_UNIT[to]) / MG_PER_UNIT[from]);
}

/**
 * Khớp dòng giá với sản phẩm theo tên + tên khác (PRICE-BR-008). Một dòng có thể
 * định giá nhiều sản phẩm (vd dòng bạc theo ngày dùng chung cho bạc 1 lượng và bạc
 * thỏi 5–10 lượng). Dòng trùng tên thì lấy dòng đầu. Giá đổi về đơn vị niêm yết
 * của sản phẩm; riêng sản phẩm theo kg không lấy giá quy từ chỉ/lượng vì giá kg
 * của nguồn là giá riêng, không phải giá chỉ nhân lên.
 */
export function matchRows(products: readonly MatchProduct[], rows: readonly SourceRow[]) {
  const byName = new Map<string, SourceRow>();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!byName.has(key)) byName.set(key, row);
  }

  const matched = new Map<number, MatchedPrice>();
  const used = new Set<string>();
  for (const p of products) {
    for (const name of [p.name, ...p.aliases]) {
      const key = normalizeName(name);
      const row = byName.get(key);
      if (!row) continue;
      if (p.priceUnit === "kg" && row.unit !== "kg") continue;
      matched.set(p.id, {
        buy: convert(row.buy, row.unit, p.priceUnit),
        sell: row.sell === null ? null : convert(row.sell, row.unit, p.priceUnit),
      });
      used.add(key);
      break;
    }
  }

  const unmatched = [...byName.keys()].filter((k) => !used.has(k)).map((k) => byName.get(k)!.name);
  return { matched, unmatched };
}
