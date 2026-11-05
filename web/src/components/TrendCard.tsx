import { formatDateTimeVn, formatPct, formatVnd } from "@goldfolio/shared";
import { cn } from "@/lib/utils";
import type { Trend } from "../api";
import { useTrend } from "../hooks/useTrend";
import { LoadError } from "./ui";

export const TREND_LABEL = {
  up: { text: "Xu hướng tăng", className: "text-gain" },
  down: { text: "Xu hướng giảm", className: "text-loss" },
  sideways: { text: "Đi ngang", className: "text-muted" },
} as const;
const CONFIDENCE = { low: "thấp", medium: "trung bình", high: "cao" } as const;
const UNIT = { chi: "chỉ", luong: "lượng", kg: "kg" } as const;

/** Vòng xoay + chữ cho trạng thái chờ (đang tải giá, đang phân tích) */
export function Waiting({ text }: { text: string }) {
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      {text}
    </p>
  );
}

const METALS = [
  { value: "gold", label: "Vàng" },
  { value: "silver", label: "Bạc" },
] as const;

/**
 * Thẻ AI nhận định xu hướng giá, đặt ở đầu khung chat (PRICE-UC02/BR-10, user chuyển từ tab Biểu đồ
 * vào chat 2026-11-05), có nút chuyển Vàng | Bạc. Số liệu 30 ngày do server tính; phần chữ do AI
 * viết, luôn kèm lời nhắc chỉ là tham khảo.
 */
export function TrendCard({ metal, onMetalChange }: { metal: "gold" | "silver"; onMetalChange(m: "gold" | "silver"): void }) {
  const { trend, loading, error, pending, busy, refresh, retry } = useTrend(metal);
  return (
    <section aria-label="Nhận định xu hướng" className="rounded-2xl border border-gold/40 bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Nhận định xu hướng</h3>
        <div role="group" aria-label="Kim loại nhận định" className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-0.5">
          {METALS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={metal === m.value}
              onClick={() => onMetalChange(m.value)}
              className={cn("min-h-11 rounded-md px-3 text-xs font-medium", metal === m.value ? "bg-gold text-bg" : "text-muted")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {error && <LoadError message={error} onRetry={() => (trend ? void refresh() : retry())} />}
      {pending || loading || busy ? <Waiting text={pending ?? "Đang phân tích…"} /> : trend && <TrendBody trend={trend} />}
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
