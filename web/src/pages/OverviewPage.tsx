import { Link } from "react-router-dom";
import { formatDateTimeVn, formatVnd } from "@goldfolio/shared";
import type { Totals } from "../api";
import { usePortfolio } from "../portfolio-context";
import { LoadError, Pnl } from "../components/ui";
import { METAL_NAME, MetalFilter } from "../components/MetalFilter";

/**
 * Tab Tổng quan: giá trị hiện tại, lãi/lỗ, nhóm kim loại → sản phẩm (HOLD-UC01/BR-9…11),
 * lọc theo Vàng | Bạc | Tất cả (BR-17).
 */
export function OverviewPage() {
  const { portfolio, error, reload, metal } = usePortfolio();
  // Lỗi khi đã có số cũ thì chỉ hiện dải báo lỗi phía trên, giữ nguyên số đang xem
  const errorBar = error && <LoadError message={error} onRetry={() => void reload()} />;

  if (!portfolio) return errorBar || <p className="text-muted">Đang tải…</p>;

  if (portfolio.items.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 pt-16 text-center">
        {errorBar}
        <h1 className="sr-only">Tổng quan</h1>
        <p className="mb-6 text-muted">Bạn chưa có lần mua nào</p>
        <Link to="/them" className="flex min-h-12 items-center rounded-xl bg-gold px-6 font-medium text-bg">
          Thêm tài sản
        </Link>
      </div>
    );
  }

  // Vàng/Bạc: số của riêng nhóm kim loại đó; Tất cả: tổng cả danh mục
  const groups = metal === "all" ? portfolio.groups : portfolio.groups.filter((g) => g.metal === metal);
  const totals: Totals | undefined = metal === "all" ? portfolio.summary : groups[0];
  const title = metal === "all" ? "Giá trị hiện tại" : `Giá trị ${METAL_NAME[metal]}`;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Tổng quan</h1>
      {errorBar}
      <MetalFilter />
      {!totals ? (
        <p className="pt-8 text-center text-muted">Chưa có tài sản {metal === "all" ? "" : METAL_NAME[metal]}</p>
      ) : (
        <section className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 via-surface to-surface p-5">
          <div className="text-sm text-muted">{title}</div>
          <div className="num text-4xl font-semibold tracking-tight text-gold-soft">{formatVnd(totals.value)}</div>
          <Pnl pnl={totals.pnl} pct={totals.pct} className="text-lg" />
          {/* Ghi ngay dưới số tổng để không ai tưởng tổng đã gồm mọi lần mua (BR-9) */}
          {totals.excludedCount > 0 && <div className="mt-1 text-sm text-muted">Không gồm {totals.excludedCount} lần mua chưa có giá</div>}
          <div className="mt-4 flex items-baseline justify-between border-t border-gold/30 pt-3 text-sm">
            <span className="text-muted">Tổng tiền mua</span>
            <span className="num font-medium">{formatVnd(totals.totalCost)}</span>
          </div>
          {totals.priceTime && <div className="mt-1 text-xs text-muted">Giá cập nhật lúc {formatDateTimeVn(totals.priceTime)}</div>}
        </section>
      )}

      {groups.map((g) => (
        <section key={g.metal} className="rounded-2xl border border-line bg-surface">
          <div className="flex items-baseline justify-between px-4 pt-4">
            <h2 className="font-semibold">
              {g.label} <span className="num text-sm font-normal text-muted">· {g.weightText}</span>
            </h2>
            {g.totalCost > 0 && <Pnl pnl={g.pnl} pct={g.pct} className="text-sm" />}
          </div>
          <ul className="divide-y divide-line px-4 pb-1">
            {g.products.map((p) => (
              <li key={p.productId} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{p.productName}</div>
                  <div className="num text-xs text-muted">
                    {p.brandName} · {p.weightText} · {p.count} lần mua
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {p.excludedCount === p.count ? (
                    <span className="text-sm text-muted">Chưa có giá</span>
                  ) : (
                    <>
                      <div className="num text-sm">{formatVnd(p.value)}</div>
                      <Pnl pnl={p.pnl} pct={p.pct} className="text-xs" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
