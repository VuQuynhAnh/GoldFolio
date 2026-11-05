import { cn } from "@/lib/utils";
import { usePortfolio, type MetalFilterValue } from "../portfolio-context";

const options: { value: MetalFilterValue; label: string }[] = [
  { value: "gold", label: "Vàng" },
  { value: "silver", label: "Bạc" },
  { value: "all", label: "Tất cả" },
];

/** Lọc Vàng | Bạc | Tất cả ở đầu 3 tab; lựa chọn giữ nguyên khi chuyển tab (HOLD-UC01/BR-17). */
export function MetalFilter() {
  const { metal, setMetal } = usePortfolio();
  return (
    <div role="group" aria-label="Lọc kim loại" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
      {options.map((o) => (
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

/** "vàng" / "bạc" cho câu thông báo theo kim loại đang lọc */
export const METAL_NAME = { gold: "vàng", silver: "bạc" } as const;
