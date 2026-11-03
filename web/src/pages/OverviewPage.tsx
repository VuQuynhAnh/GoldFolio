import { Link } from "react-router-dom";
import { formatDateTimeVn, formatVnd } from "@goldfolio/shared";
import { usePortfolio } from "../portfolio-context";
import { LoadError, Pnl } from "../components/ui";

/** Tab Tổng quan: giá trị hiện tại, lãi/lỗ, nhóm kim loại → sản phẩm (HOLD-UC01/BR-9…11). */
export function OverviewPage() {
  const { portfolio, error, reload } = usePortfolio();
  // Lỗi khi đã có số cũ thì chỉ hiện dải báo lỗi phía trên, giữ nguyên số đang xem
  const errorBar = error && <LoadError message={error} onRetry={() => void reload()} />;

  if (!portfolio) return errorBar || <p className="text-stone-500">Đang tải…</p>;

  if (portfolio.items.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 pt-16 text-center">
        {errorBar}
        <h1 className="sr-only">Tổng quan</h1>
        <p className="mb-6 text-stone-600">Bạn chưa có lần mua nào</p>
        <Link to="/them" className="flex min-h-12 items-center rounded-xl bg-gold-500 px-6 font-medium text-white">
          Thêm lần mua
        </Link>
      </div>
    );
  }

  const s = portfolio.summary;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Tổng quan</h1>
      {errorBar}
      <section className="rounded-2xl bg-gradient-to-br from-gold-100 to-gold-50 p-5">
        <div className="text-sm text-stone-600">Giá trị hiện tại</div>
        <div className="num text-3xl font-semibold">{formatVnd(s.value)}</div>
        <Pnl pnl={s.pnl} pct={s.pct} className="text-lg" />
        {/* Ghi ngay dưới số tổng để không ai tưởng tổng đã gồm mọi lần mua (BR-9) */}
        {s.excludedCount > 0 && <div className="mt-1 text-sm text-stone-600">Không gồm {s.excludedCount} lần mua chưa có giá</div>}
        <div className="mt-4 flex items-baseline justify-between border-t border-gold-100 pt-3 text-sm">
          <span className="text-stone-600">Tổng tiền mua</span>
          <span className="num font-medium">{formatVnd(s.totalCost)}</span>
        </div>
        {s.priceTime && <div className="mt-1 text-xs text-stone-500">Giá cập nhật lúc {formatDateTimeVn(s.priceTime)}</div>}
      </section>

      {portfolio.groups.map((g) => (
        <section key={g.metal} className="rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-baseline justify-between px-4 pt-4">
            <h2 className="font-semibold">
              {g.label} <span className="num text-sm font-normal text-stone-500">· {g.weightText}</span>
            </h2>
            {g.totalCost > 0 && <Pnl pnl={g.pnl} pct={g.pct} className="text-sm" />}
          </div>
          <ul className="divide-y divide-stone-100 px-4 pb-1">
            {g.products.map((p) => (
              <li key={p.productId} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{p.productName}</div>
                  <div className="num text-xs text-stone-500">
                    {p.brandName} · {p.weightText} · {p.count} lần mua
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {p.excludedCount === p.count ? (
                    <span className="text-sm text-stone-500">Chưa có giá</span>
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
