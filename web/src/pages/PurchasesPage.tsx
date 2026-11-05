import { Link } from "react-router-dom";
import { UNIT_LABEL, formatDateVn, formatVnd } from "@goldfolio/shared";
import { usePortfolio } from "../portfolio-context";
import { LoadError, Pnl } from "../components/ui";
import { METAL_NAME, MetalFilter } from "../components/MetalFilter";

/**
 * Tab Chi tiết: toàn bộ lần mua, mới nhất trước, không phân trang; chạm để sửa (HOLD-UC01/BR-10).
 * Chỉ hiện lần mua của kim loại đang lọc (BR-17).
 */
export function PurchasesPage() {
  const { portfolio, error, reload, metal } = usePortfolio();
  const items = portfolio?.items.filter((i) => metal === "all" || i.metal === metal) ?? [];

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Chi tiết</h1>
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {portfolio && portfolio.items.length > 0 && <MetalFilter />}
      {!portfolio ? (
        !error && <p className="text-muted">Đang tải…</p>
      ) : portfolio.items.length === 0 ? (
        <p className="pt-8 text-center text-muted">Bạn chưa có lần mua nào</p>
      ) : items.length === 0 ? (
        <p className="pt-8 text-center text-muted">Chưa có tài sản {metal === "all" ? "" : METAL_NAME[metal]}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={`/sua/${i.id}`} className="block rounded-2xl border border-line bg-surface p-4 active:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.productName}</div>
                    <div className="num text-xs text-muted">
                      {i.brandName} · {i.weightText}
                    </div>
                    <div className="num text-xs text-muted">
                      {formatDateVn(i.purchaseDate)}
                      {i.purchaseTime && ` ${i.purchaseTime}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num">{formatVnd(i.totalCost)}</div>
                    {i.current ? (
                      <Pnl pnl={i.current.pnl} pct={i.current.pct} className="text-xs" />
                    ) : (
                      <span className="text-xs text-muted">Chưa có giá</span>
                    )}
                  </div>
                </div>
                {/* Chỉ đánh dấu giá người dùng nhập; giá hệ thống lấy không ghi nhãn cho gọn, nguồn xem ở trang sửa (BR-16) */}
                <div className="num mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>
                    Đơn giá <span className="text-ink">{formatVnd(i.unitCost)}</span>/{UNIT_LABEL[i.inputUnit]}
                  </span>
                  {i.priceSource === "manual" && (
                    <span className="shrink-0 rounded-full border border-gold/60 px-2 py-0.5 text-gold">Người dùng nhập</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
