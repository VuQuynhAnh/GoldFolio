import type { ReactNode } from "react";
import { formatPct, formatSignedVnd } from "@goldfolio/shared";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-100";

/** Ô form có nhãn và lỗi hiện ngay bên dưới (HOLD-UC01/BR-12). */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
    </label>
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
