import { useCallback, useEffect, useState } from "react";
import { api, type History } from "../api";
import { usePortfolio } from "../portfolio-context";
import { HistoryChart } from "../components/HistoryChart";
import { LoadError } from "../components/ui";
import { METAL_NAME, MetalFilter, chartMetal } from "../components/MetalFilter";

/**
 * Tab Biểu đồ: giá theo các mốc mua của một sản phẩm (HOLD-UC01/BR-13, BR-14);
 * chỉ lọc Vàng | Bạc, chọn được sản phẩm của kim loại đang lọc (BR-17).
 */
export function HistoryPage() {
  const { portfolio, metal: chosen } = usePortfolio();
  const metal = chartMetal(chosen);
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

  // Sản phẩm của kim loại đang lọc; danh sách server đã xếp theo tiền mua giảm dần
  const visible = history?.products.filter((p) => p.metal === metal) ?? [];
  // Đang xem sản phẩm khác kim loại vừa chọn: chuyển sang sản phẩm tiền mua lớn nhất của kim loại đó
  const current = history?.productId ?? null;
  const first = visible[0]?.productId ?? null;
  useEffect(() => {
    if (first !== null && current !== null && !visible.some((p) => p.productId === current)) setProductId(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metal, current, first]);

  const inMetal = history?.productId != null && visible.some((p) => p.productId === history.productId);
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Biểu đồ giá</h1>
      {error && <LoadError message={error} onRetry={() => void load(productId)} />}
      {history && history.products.length > 0 && <MetalFilter withAll={false} />}
      {!history ? (
        !error && <p className="text-muted">Đang tải…</p>
      ) : !history.productId ? (
        <p className="pt-8 text-center text-muted">Chưa có lần mua nào để vẽ biểu đồ</p>
      ) : visible.length === 0 ? (
        <p className="pt-8 text-center text-muted">Chưa có tài sản {METAL_NAME[metal]}</p>
      ) : inMetal ? (
        <HistoryChart history={history} products={visible} onSelect={setProductId} />
      ) : (
        <p className="text-muted">Đang tải…</p>
      )}
    </div>
  );
}
