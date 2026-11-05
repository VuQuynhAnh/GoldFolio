import { useEffect, useRef, useState } from "react";
import { ApiError, api, type Trend } from "../api";

/** Server đang tải bù giá 30 ngày: tự thử lại sau ngần này (PRICE-UC02/BR-3) */
const RETRY_WHILE_LOADING_MS = 15_000;

const message = (err: unknown) => (err instanceof Error ? err.message : "Chưa phân tích được, thử lại sau");

/**
 * Nhận định xu hướng của một kim loại (PRICE-UC02), dùng chung cho thẻ ở tab Biểu đồ và bong
 * bóng ở Tổng quan. Server đang tải giá thì `pending` có thông báo và hook tự hỏi lại.
 */
export function useTrend(metal: "gold" | "silver") {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Thông báo "đang tải giá" của server: không phải lỗi, hiện như trạng thái chờ
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Kim loại đang xem lúc kết quả về: đã chuyển kim loại khác thì bỏ kết quả cũ (R-UI-02)
  const metalNow = useRef(metal);
  metalNow.current = metal;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTrend(null);
    setError(null);
    api<{ trend: Trend }>(`/trends?metal=${metal}`)
      .then((r) => {
        if (cancelled) return;
        setTrend(r.trend);
        setPending(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.fields.trend === "loading") setPending(err.message);
        else {
          setPending(null);
          setError(message(err));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [metal, attempt]);

  // Server đang tải giá: đợi rồi tự hỏi lại, người dùng không phải bấm gì
  useEffect(() => {
    if (!pending || loading) return;
    const timer = setTimeout(() => setAttempt((a) => a + 1), RETRY_WHILE_LOADING_MS);
    return () => clearTimeout(timer);
  }, [pending, loading]);

  /** "Phân tích lại": lỗi thì giữ nhận định cũ, chỉ báo lỗi */
  const refresh = async () => {
    const m = metal;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ trend: Trend }>("/trends/refresh", { method: "POST", body: { metal: m } });
      if (metalNow.current === m) setTrend(r.trend);
    } catch (err) {
      if (metalNow.current === m) setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return { trend, loading, error, pending, busy, refresh, retry: () => setAttempt((a) => a + 1) };
}
