import { useEffect, useRef, useState } from "react";
import { UNIT_LABEL, WEIGHT_PRESETS, type WeightUnit } from "@goldfolio/shared";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";

const vn = (n: number) => String(n).replace(".", ",");

/**
 * Ô khối lượng vừa chọn vừa gõ (HOLD-UC01/BR-3): nút ▾ mở danh sách gợi ý theo đơn vị
 * (chỉ: 0,5 → 10), hoặc gõ tay số khác. Không dùng <datalist> vì nó lọc theo chữ đang có
 * trong ô (ô có sẵn "0,5" thì danh sách gần như trống) và hiển thị khác nhau giữa iOS/Android.
 */
export function WeightCombo({ value, unit, onChange, id }: { value: string; unit: WeightUnit; onChange(v: string): void; id?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Chạm ra ngoài thì đóng danh sách
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        className={cn(inputClass, "pr-12")}
        inputMode="decimal"
        value={value}
        placeholder="vd 0,5"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label="Chọn khối lượng có sẵn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted"
      >
        ▾
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={`Khối lượng (${UNIT_LABEL[unit]})`}
          className="absolute z-20 mt-1 grid max-h-64 w-full grid-cols-4 gap-1 overflow-y-auto rounded-xl border border-line bg-surface-2 p-2 shadow-2xl"
        >
          {WEIGHT_PRESETS[unit].map((n) => (
            <li key={n}>
              <button
                type="button"
                role="option"
                aria-selected={value === vn(n)}
                onClick={() => {
                  onChange(vn(n));
                  setOpen(false);
                }}
                className={cn("num min-h-11 w-full rounded-lg text-sm", value === vn(n) ? "bg-gold text-bg" : "bg-surface text-ink")}
              >
                {vn(n)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
