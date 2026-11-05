import { cn } from "@/lib/utils";
import { usePortfolio, type MetalFilterValue } from "../portfolio-context";

// "Tất cả" là mặc định nên đứng đầu (BR-17)
const options: { value: MetalFilterValue; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "gold", label: "Vàng" },
  { value: "silver", label: "Bạc" },
];

/**
 * Lọc Vàng | Bạc | Tất cả ở đầu 3 tab; lựa chọn giữ nguyên khi chuyển tab (HOLD-UC01/BR-17).
 * `withAll = false` (tab Biểu đồ): chỉ Vàng | Bạc, đang lọc Tất cả thì coi như Vàng.
 */
export function MetalFilter({ withAll = true }: { withAll?: boolean }) {
  const { metal: chosen, setMetal } = usePortfolio();
  const metal = withAll ? chosen : chartMetal(chosen);
  const shown = withAll ? options : options.filter((o) => o.value !== "all");
  return (
    <div role="group" aria-label="Lọc kim loại" className={cn("mb-4 grid gap-1 rounded-xl bg-surface p-1", withAll ? "grid-cols-3" : "grid-cols-2")}>
      {shown.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={metal === o.value}
          onClick={() => setMetal(o.value)}
          className={cn("min-h-11 rounded-lg text-sm font-medium", metal === o.value ? "bg-gold text-bg" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Biểu đồ vẽ từng sản phẩm nên không có "Tất cả": đang lọc Tất cả thì xem Vàng (BR-17) */
export function chartMetal(m: MetalFilterValue): "gold" | "silver" {
  return m === "all" ? "gold" : m;
}

/** "vàng" / "bạc" cho câu thông báo theo kim loại đang lọc */
export const METAL_NAME = { gold: "vàng", silver: "bạc" } as const;
