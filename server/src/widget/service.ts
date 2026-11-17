import { createHash, randomBytes } from "node:crypto";
import { formatDateTimeVn, formatPct, formatSignedVnd, formatVnd, UNIT_LABEL } from "@goldfolio/shared";
import type { Db } from "../db";
import { HttpError } from "../http";
import type { PriceService } from "../prices/service";
import { buildPortfolio } from "../portfolio/service";
import { pickProduct, type Metal } from "../trends/service";

/** Tiền tố để nhận ra mã widget khi người dùng dán nhầm chỗ */
const TOKEN_PREFIX = "gfw_";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface WidgetTokenInfo {
  hasToken: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export async function tokenInfo(db: Db, userId: number): Promise<WidgetTokenInfo> {
  const row = await db.one<{ created_at: string; last_used_at: string | null }>(
    "SELECT created_at, last_used_at FROM widget_tokens WHERE user_id = $1",
    [userId],
  );
  return { hasToken: !!row, createdAt: row?.created_at ?? null, lastUsedAt: row?.last_used_at ?? null };
}

/**
 * Tạo mã widget mới (HOLD-UC02/BR-2): trả mã gốc đúng một lần, server chỉ giữ bản băm.
 * Mỗi người một mã, nên mã cũ (nếu có) hết hiệu lực ngay.
 */
export async function createToken(db: Db, userId: number, now: Date): Promise<string> {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  await db.query(
    `INSERT INTO widget_tokens (user_id, token_hash, created_at, last_used_at) VALUES ($1, $2, $3, NULL)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = NULL`,
    [userId, sha256(token), now.toISOString()],
  );
  return token;
}

export async function revokeToken(db: Db, userId: number): Promise<void> {
  await db.query("DELETE FROM widget_tokens WHERE user_id = $1", [userId]);
}

/** Người dùng của mã widget; mã sai hoặc đã thu hồi thì undefined. Ghi lại lần dùng cuối. */
export async function userOfToken(db: Db, token: string, now: Date): Promise<number | undefined> {
  if (!token.startsWith(TOKEN_PREFIX)) return undefined;
  const row = await db.one<{ user_id: number }>(
    "UPDATE widget_tokens SET last_used_at = $2 WHERE token_hash = $1 RETURNING user_id",
    [sha256(token), now.toISOString()],
  );
  return row?.user_id;
}

type Trend = "gain" | "loss" | "flat";
const trendOf = (pnl: number): Trend => (pnl > 0 ? "gain" : pnl < 0 ? "loss" : "flat");

const METALS: { metal: Metal; label: string }[] = [
  { metal: "gold", label: "Vàng" },
  { metal: "silver", label: "Bạc" },
];

/**
 * Số liệu cho widget (HOLD-UC02/BR-4): tổng tài sản và lãi/lỗ như màn Tổng quan, kèm mỗi kim loại
 * một dòng giá hiện tại của sản phẩm chính (sản phẩm bỏ nhiều tiền nhất, chưa có thì sản phẩm mặc
 * định). Có sẵn chuỗi đã định dạng để widget chỉ việc hiện, không phải tự định dạng tiền.
 */
export async function buildWidget(db: Db, prices: PriceService, userId: number, now: Date) {
  const portfolio = await buildPortfolio(db, prices, userId);
  const { summary } = portfolio;

  const metals = [];
  for (const { metal, label } of METALS) {
    const group = portfolio.groups.find((g) => g.metal === metal);
    // Thương hiệu chưa có sản phẩm có nguồn giá cho kim loại này: dòng đó ghi "Chưa có giá"
    const product = await pickProduct(db, userId, metal).catch((err) => {
      if (err instanceof HttpError) return undefined;
      throw err;
    });
    const price = product ? await prices.latest(product.id) : null;
    metals.push({
      metal,
      label,
      holding: group
        ? {
            weightText: group.weightText,
            value: group.value,
            pnl: group.pnl,
            pct: group.pct,
            trend: trendOf(group.pnl),
            pnlText: `${formatSignedVnd(group.pnl)} (${formatPct(group.pct)})`,
          }
        : null,
      price:
        product && price
          ? {
              productName: product.name,
              unit: product.price_unit,
              buy: price.buy,
              sell: price.sell,
              time: price.sourceTime,
              // "Mua 13.550.000 · Bán 13.850.000 /chỉ"; nguồn chỉ có giá mua vào thì bỏ phần bán (PRICE-BR-006)
              text: `Mua ${formatVnd(price.buy)}${price.sell !== null ? ` · Bán ${formatVnd(price.sell)}` : ""} /${UNIT_LABEL[product.price_unit]}`,
            }
          : null,
    });
  }

  // Giờ của giá: giá cũ nhất đang dùng để tính tài sản; chưa có tài sản thì giá cũ nhất trong các dòng giá
  const priceTime = summary.priceTime ?? metals.map((m) => m.price?.time).filter((t): t is string => !!t).sort()[0] ?? null;
  const hasHolding = portfolio.items.length > 0;
  return {
    updatedAt: now.toISOString(),
    total: {
      hasHolding,
      value: summary.value,
      totalCost: summary.totalCost,
      pnl: summary.pnl,
      pct: summary.pct,
      excludedCount: summary.excludedCount,
      trend: trendOf(summary.pnl),
      valueText: hasHolding ? `${formatVnd(summary.value)} đ` : "Chưa có tài sản",
      pnlText: hasHolding ? `${formatSignedVnd(summary.pnl)} (${formatPct(summary.pct)})` : "",
    },
    metals,
    priceTime,
    priceTimeText: priceTime ? `Giá lúc ${formatDateTimeVn(priceTime)}` : "Chưa có giá",
  };
}
