import type { ReactNode } from "react";
import { formatPct, formatSignedVnd } from "@goldfolio/shared";
import { cn } from "@/lib/utils";

// Ô cao 48px, chữ 16px: iOS tự phóng to trang khi chạm vào ô có chữ nhỏ hơn 16px (R-UI-03)
export const inputClass =
  "h-12 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-gold focus:ring-2 focus:ring-gold/30";

/** Ô form có nhãn và lỗi hiện ngay bên dưới (HOLD-UC01/BR-12). */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
    </label>
  );
}

/** Báo lỗi nạp dữ liệu kèm nút thử lại; trang không bao giờ dừng ở "Đang tải…" khi lỗi (R-UI-04). */
export function LoadError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-loss/10 px-3 py-2 text-sm text-loss">
      <span>{message}</span>
      <button onClick={onRetry} className="min-h-11 shrink-0 rounded-lg px-3 font-medium underline">
        Thử lại
      </button>
    </div>
  );
}

/** Lãi xanh có dấu "+", lỗ đỏ có dấu "−"; số hiện thẳng, không hiệu ứng chạy số (HOLD-UC01/BR-10). */
export function Pnl({ pnl, pct, className }: { pnl: number; pct?: number; className?: string }) {
  return (
    <span className={cn("num font-medium", pnl > 0 && "text-gain", pnl < 0 && "text-loss", className)}>
      {formatSignedVnd(pnl)}
      {pct !== undefined && <span className="ml-1 text-sm">({formatPct(pct)})</span>}
    </span>
  );
}
