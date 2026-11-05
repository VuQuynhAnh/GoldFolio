import { useEffect, useRef, useState } from "react";
import { formatDateTimeVn, formatPct, formatVnd } from "@goldfolio/shared";
import { cn } from "@/lib/utils";
import { ApiError, api, type Trend } from "../api";
import { LoadError } from "./ui";

const TREND_LABEL = {
  up: { text: "Xu hướng tăng", className: "text-gain" },
  down: { text: "Xu hướng giảm", className: "text-loss" },
  sideways: { text: "Đi ngang", className: "text-muted" },
} as const;
const CONFIDENCE = { low: "thấp", medium: "trung bình", high: "cao" } as const;
const UNIT = { chi: "chỉ", luong: "lượng", kg: "kg" } as const;

/** Server đang tải bù giá 30 ngày: tự thử lại sau ngần này (PRICE-UC02/BR-3) */
const RETRY_WHILE_LOADING_MS = 15_000;

const message = (err: unknown) => (err instanceof Error ? err.message : "Chưa phân tích được, thử lại sau");

/**
 * Thẻ AI nhận định xu hướng giá của kim loại đang xem ở tab Biểu đồ (PRICE-UC02). Số liệu 30 ngày
 * do server tính; phần chữ do AI viết, luôn kèm lời nhắc chỉ là tham khảo.
 */
export function TrendCard({ metal }: { metal: "gold" | "silver" }) {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Thông báo "đang tải giá" của server: không phải lỗi, hiện như trạng thái chờ và tự thử lại
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

  const refresh = async () => {
    const m = metal;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ trend: Trend }>("/trends/refresh", { method: "POST", body: { metal: m } });
      if (metalNow.current === m) setTrend(r.trend);
    } catch (err) {
      // Phân tích lại lỗi: giữ nhận định cũ, chỉ báo lỗi
      if (metalNow.current === m) setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Nhận định xu hướng" className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 font-semibold">Nhận định xu hướng</h2>
      {error && <LoadError message={error} onRetry={() => (trend ? void refresh() : setAttempt((a) => a + 1))} />}
      {pending || loading || busy ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted" role="status">
          <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          {pending ?? "Đang phân tích…"}
        </p>
      ) : (
        trend && <TrendBody trend={trend} />
      )}
      {trend && (
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy || trend.refreshesLeft <= 0}
          className="mt-3 min-h-11 w-full rounded-xl border border-gold/60 text-sm font-medium text-gold disabled:opacity-50"
        >
          Phân tích lại (còn {trend.refreshesLeft} lần)
        </button>
      )}
    </section>
  );
}

function TrendBody({ trend }: { trend: Trend }) {
  const { analysis: a, stats: s } = trend;
  const label = TREND_LABEL[a.trend];
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-semibold", label.className)}>{label.text}</span>
        <span className="text-xs text-muted">Độ tin cậy {CONFIDENCE[a.confidence]}</span>
      </div>
      <p className="text-xs text-muted">{trend.productName}</p>
      {/* Số liệu do server tính từ giá thật, không lấy từ AI */}
      <p className="num text-muted">
        {s.days} ngày: mua vào {formatVnd(s.firstBuy)} → {formatVnd(s.lastBuy)}/{UNIT[trend.priceUnit]}{" "}
        <span className={cn(s.changePct > 0 && "text-gain", s.changePct < 0 && "text-loss")}>{formatPct(s.changePct)}</span>
      </p>
      <p>{a.summary}</p>
      {a.points.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-ink">
          {a.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {a.vsCost && <p className="rounded-lg bg-surface-2 px-3 py-2">{a.vsCost}</p>}
      <p className="text-xs text-muted">
        Nhận định tham khảo, không phải lời khuyên đầu tư · {trend.model} · {formatDateTimeVn(trend.createdAt)}
      </p>
    </div>
  );
}
