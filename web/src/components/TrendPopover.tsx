import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTrend } from "../hooks/useTrend";
import { useChat } from "../chat-context";
import { METAL_NAME } from "./MetalFilter";
import { TREND_LABEL, Waiting } from "./TrendCard";

/**
 * Bong bóng nhận định ngay dưới dòng sản phẩm ở Tổng quan (PRICE-UC02/BR-11): xu hướng 30 ngày
 * của kim loại và tóm tắt; "Hỏi thêm" mở chat có sẵn nhận định này. Dùng bản đã lưu trong ngày.
 */
export function TrendPopover({ metal, onClose }: { metal: "gold" | "silver"; onClose(): void }) {
  const { trend, loading, error, pending } = useTrend(metal);
  const { openChat } = useChat();
  const name = METAL_NAME[metal];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={`Nhận định ${name}`} className="mt-2 rounded-xl border border-gold/40 bg-surface-2 p-3 text-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        {trend && !loading ? (
          <span className={cn("font-semibold", TREND_LABEL[trend.analysis.trend].className)}>{TREND_LABEL[trend.analysis.trend].text}</span>
        ) : (
          <span className="font-semibold">Nhận định {name}</span>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng nhận định" className="-mr-2 -mt-2 min-h-11 min-w-11 text-muted">
          ✕
        </button>
      </div>
      {pending || loading ? (
        <Waiting text={pending ?? "Đang phân tích…"} />
      ) : error ? (
        <p className="text-loss">{error}</p>
      ) : (
        trend && (
          <>
            <p>{trend.analysis.summary}</p>
            <p className="mt-1 text-xs text-muted">Theo {trend.productName} · tham khảo, không phải lời khuyên đầu tư</p>
            <button
              type="button"
              onClick={() => {
                openChat(`Nhận định ${name} hôm nay: ${trend.analysis.summary}`, metal);
                onClose();
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-gold/60 font-medium text-gold"
            >
              Hỏi thêm
            </button>
          </>
        )
      )}
    </div>
  );
}
