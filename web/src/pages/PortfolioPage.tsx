import { useCallback, useEffect, useState } from "react";
import { formatDateTimeVn, formatDateVn, formatVnd } from "@goldfolio/shared";
import { api, type Brand, type History, type Portfolio, type PortfolioItem, type Totals } from "../api";
import { useAuth } from "../auth";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { HistoryChart } from "../components/HistoryChart";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { Pnl } from "../components/ui";

/** Màn hình "Tài sản của tôi" (HOLD-UC01/BR-9…11, BR-13). */
export function PortfolioPage() {
  const { user, logout } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [historyProduct, setHistoryProduct] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ editing: PortfolioItem | null } | null>(null);
  const [deleting, setDeleting] = useState<PortfolioItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pf, br] = await Promise.all([api<Portfolio>("/portfolio"), api<{ brands: Brand[] }>("/brands")]);
      setPortfolio(pf);
      setBrands(br.brands);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadHistory = useCallback(async (productId: number | null) => {
    const q = productId ? `?productId=${productId}` : "";
    try {
      setHistory(await api<History>(`/portfolio/history${q}`));
    } catch {
      // Sản phẩm đang xem đã bị xoá hết lần mua: quay về sản phẩm mặc định thay vì mất biểu đồ
      if (productId) setHistoryProduct(null);
      else setHistory(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadHistory(historyProduct);
  }, [loadHistory, historyProduct, portfolio]);

  const afterChange = () => {
    setDialog(null);
    setDeleting(null);
    void load();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-gold-700">GoldFolio</h1>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span className="hidden sm:inline">{user?.email}</span>
          <button onClick={() => void logout()} className="underline">
            Đăng xuất
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-loss">{error}</p>}
      {!portfolio ? (
        <p className="text-stone-500">Đang tải…</p>
      ) : portfolio.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="mb-4 text-stone-600">Bạn chưa có lần mua nào</p>
          <button onClick={() => setDialog({ editing: null })} className="rounded-lg bg-gold-500 px-4 py-2 font-medium text-white">
            Thêm lần mua
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Summary totals={portfolio.summary} onAdd={() => setDialog({ editing: null })} />

          <section className="grid gap-4 md:grid-cols-2">
            {portfolio.groups.map((g) => (
              <div key={g.metal} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-semibold">
                    {g.label} <span className="num text-sm font-normal text-stone-500">· {g.weightText}</span>
                  </h2>
                  {g.totalCost > 0 && <Pnl pnl={g.pnl} pct={g.pct} className="text-sm" />}
                </div>
                <ul className="divide-y divide-stone-100">
                  {g.products.map((p) => (
                    <li key={p.productId} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div>
                        <div>{p.productName}</div>
                        <div className="num text-xs text-stone-500">
                          {p.brandName} · {p.weightText} · {p.count} lần mua
                        </div>
                      </div>
                      <div className="text-right">
                        {p.excludedCount === p.count ? (
                          <span className="text-stone-500">Chưa có giá</span>
                        ) : (
                          <>
                            <div className="num">{formatVnd(p.value)}</div>
                            <Pnl pnl={p.pnl} pct={p.pct} className="text-xs" />
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {history && <HistoryChart history={history} onSelect={setHistoryProduct} />}

          <section className="rounded-2xl border border-stone-200 bg-white">
            <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">Các lần mua</h2>
            <ul className="divide-y divide-stone-100">
              {portfolio.items.map((i) => (
                <PurchaseRow key={i.id} item={i} onEdit={() => setDialog({ editing: i })} onDelete={() => setDeleting(i)} />
              ))}
            </ul>
          </section>
        </div>
      )}

      {dialog && <PurchaseDialog brands={brands} editing={dialog.editing} onClose={() => setDialog(null)} onSaved={afterChange} />}
      {deleting && (
        <DeleteConfirm
          onCancel={() => setDeleting(null)}
          onConfirm={() => void api(`/purchases/${deleting.id}`, { method: "DELETE" }).then(afterChange, (e) => setError(e.message))}
        />
      )}
    </div>
  );
}

function Summary({ totals, onAdd }: { totals: Totals; onAdd(): void }) {
  return (
    <section className="rounded-2xl border border-gold-100 bg-gradient-to-br from-gold-50 to-white p-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tổng tiền mua">{formatVnd(totals.totalCost)}</Stat>
        <Stat label="Giá trị hiện tại">{formatVnd(totals.value)}</Stat>
        <Stat label="Lãi/Lỗ" wide>
          <Pnl pnl={totals.pnl} pct={totals.pct} className="text-xl" />
        </Stat>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>
          {totals.priceTime && `Giá cập nhật lúc ${formatDateTimeVn(totals.priceTime)}`}
          {totals.excludedCount > 0 && ` · Không gồm ${totals.excludedCount} lần mua chưa có giá`}
        </span>
        <button onClick={onAdd} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-700">
          Thêm lần mua
        </button>
      </div>
    </section>
  );
}

function Stat({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className="num text-lg font-semibold">{children}</div>
    </div>
  );
}

function PurchaseRow({ item, onEdit, onDelete }: { item: PortfolioItem; onEdit(): void; onDelete(): void }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{item.productName}</div>
        <div className="num text-xs text-stone-500">
          {item.brandName} · {item.weightText} · {formatDateVn(item.purchaseDate)}
          {item.purchaseTime && ` ${item.purchaseTime}`}
        </div>
        {item.note && <div className="mt-0.5 text-xs text-stone-500">{item.note}</div>}
      </div>
      <div className="ml-auto text-right">
        <div className="num">{formatVnd(item.totalCost)}</div>
        {item.current ? <Pnl pnl={item.current.pnl} pct={item.current.pct} className="text-xs" /> : <span className="text-xs text-stone-500">Chưa có giá</span>}
        <div className="mt-1 flex justify-end gap-3 text-xs">
          <button onClick={onEdit} className="text-gold-700 underline">
            Sửa
          </button>
          <button onClick={onDelete} className="text-loss underline">
            Xoá
          </button>
        </div>
      </div>
    </li>
  );
}
