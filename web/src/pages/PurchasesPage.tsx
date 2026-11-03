import { Link } from "react-router-dom";
import { formatDateVn, formatVnd } from "@goldfolio/shared";
import { usePortfolio } from "../portfolio-context";
import { LoadError, Pnl } from "../components/ui";

/** Tab Lần mua: toàn bộ lần mua, mới nhất trước, không phân trang; chạm để sửa (HOLD-UC01/BR-10). */
export function PurchasesPage() {
  const { portfolio, error, reload } = usePortfolio();

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Lần mua</h1>
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!portfolio ? (
        !error && <p className="text-stone-500">Đang tải…</p>
      ) : portfolio.items.length === 0 ? (
        <p className="pt-8 text-center text-stone-600">Bạn chưa có lần mua nào</p>
      ) : (
        <ul className="space-y-2">
          {portfolio.items.map((i) => (
            <li key={i.id}>
              <Link to={`/sua/${i.id}`} className="block rounded-2xl border border-stone-200 bg-white p-4 active:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.productName}</div>
                    <div className="num text-xs text-stone-500">
                      {i.brandName} · {i.weightText}
                    </div>
                    <div className="num text-xs text-stone-500">
                      {formatDateVn(i.purchaseDate)}
                      {i.purchaseTime && ` ${i.purchaseTime}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num">{formatVnd(i.totalCost)}</div>
                    {i.current ? (
                      <Pnl pnl={i.current.pnl} pct={i.current.pct} className="text-xs" />
                    ) : (
                      <span className="text-xs text-stone-500">Chưa có giá</span>
                    )}
                  </div>
                </div>
                {i.note && <div className="mt-1 truncate text-xs text-stone-500">{i.note}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
