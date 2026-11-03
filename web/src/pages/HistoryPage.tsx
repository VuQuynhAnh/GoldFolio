import { useCallback, useEffect, useState } from "react";
import { api, type History } from "../api";
import { usePortfolio } from "../portfolio-context";
import { HistoryChart } from "../components/HistoryChart";
import { LoadError } from "../components/ui";

/** Tab Lịch sử: biểu đồ giá theo các mốc mua của một sản phẩm (HOLD-UC01/BR-13, BR-14). */
export function HistoryPage() {
  const { portfolio } = usePortfolio();
  const [history, setHistory] = useState<History | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number | null) => {
    const q = id ? `?productId=${id}` : "";
    try {
      setHistory(await api<History>(`/portfolio/history${q}`));
      setError(null);
    } catch (err) {
      // Sản phẩm đang xem đã bị xoá hết lần mua: quay về sản phẩm mặc định thay vì mất biểu đồ
      if (id) setProductId(null);
      // Lỗi khác: báo lỗi kèm thử lại, không treo ở "Đang tải…" (R-UI-04)
      else setError(err instanceof Error ? err.message : "Không tải được lịch sử giá");
    }
  }, []);

  // Nạp lại khi danh mục đổi (vừa thêm/sửa/xoá)
  useEffect(() => {
    void load(productId);
  }, [load, productId, portfolio]);

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Lịch sử giá</h1>
      {error && <LoadError message={error} onRetry={() => void load(productId)} />}
      {!history ? (
        !error && <p className="text-muted">Đang tải…</p>
      ) : !history.productId ? (
        <p className="pt-8 text-center text-muted">Chưa có lần mua nào để vẽ biểu đồ</p>
      ) : (
        <HistoryChart history={history} onSelect={setProductId} />
      )}
    </div>
  );
}
