import { useEffect, useRef, useState } from "react";
import {
  UNIT_LABEL,
  WEIGHT_UNITS,
  convertUnitPrice,
  formatVnd,
  parseWeight,
  toMg,
  totalFromUnit,
  unitFromTotal,
  type WeightUnit,
} from "@goldfolio/shared";
import { api, type Product } from "../api";
import { Field, inputClass } from "./ui";
import { MoneyInput } from "./MoneyInput";
import { WeightCombo } from "./WeightCombo";

/** Một sản phẩm trong form thêm tài sản / sửa lần mua */
export interface LineState {
  key: number;
  productId: number | "";
  weight: string;
  weightUnit: WeightUnit;
  priceMode: "unit" | "total";
  /** Chuỗi chữ số, "" = chưa nhập */
  unitPrice: string;
  totalPrice: string;
  /** Lần mua đang sửa có giá tự lấy: giá cũ hiện mờ, gõ giá thì bỏ (BR-16) */
  autoPrice: { note: string; unitCost: number } | null;
}

let nextKey = 1;
/** Dòng mới: sản phẩm mặc định của thương hiệu, 0,5 chỉ (HOLD-UC01/BR-1, BR-3) */
export function newLine(defaultProductId: number | ""): LineState {
  return {
    key: nextKey++,
    productId: defaultProductId,
    weight: "0,5",
    weightUnit: "chi",
    priceMode: "unit",
    unitPrice: "",
    totalPrice: "",
    autoPrice: null,
  };
}

interface Props {
  line: LineState;
  /** Cập nhật dòng; cha gộp theo key để kết quả về muộn không ghi đè cả dòng */
  onChange(patch: Partial<LineState>): void;
  products: Product[];
  purchaseDate: string;
  purchaseTime: string;
  /** Trang sửa: không gợi ý lại giá (BR-7) */
  editing: boolean;
  errors: Record<string, string>;
  /** Số thứ tự hiển thị khi có nhiều sản phẩm; undefined = form một sản phẩm */
  index?: number;
  onRemove?(): void;
}

export function PurchaseLine({ line, onChange, products, purchaseDate, purchaseTime, editing, errors, index, onRemove }: Props) {
  const [suggestLabel, setSuggestLabel] = useState<string | null>(null);
  // Số vừa được gợi ý: ô giá còn đúng số này nghĩa là người dùng chưa sửa tay (BR-6)
  const lastSuggested = useRef<string | null>(null);
  // Giá trị hiện tại của dòng cho kết quả gợi ý về muộn: người dùng có thể đã gõ trong lúc
  // chờ, so với giá trị lúc gửi yêu cầu sẽ ghi đè số vừa gõ (R-UI-02)
  const lineNow = useRef(line);
  lineNow.current = line;

  const product = products.find((p) => p.id === line.productId);
  // Đơn vị niêm yết của sản phẩm: giá gợi ý của nguồn tính theo đơn vị này
  const listUnit = product?.priceUnit ?? "chi";
  // Đơn giá trên form theo đơn vị khối lượng đang chọn (BR-5)
  const unit = line.weightUnit;

  // Gợi ý đơn giá theo sản phẩm của dòng + ngày giờ mua chung, chỉ khi thêm mới (BR-6, BR-18)
  useEffect(() => {
    if (editing || !line.productId || !purchaseDate) return;
    let cancelled = false;
    const q = new URLSearchParams({ productId: String(line.productId), date: purchaseDate });
    if (purchaseTime) q.set("time", purchaseTime);
    api<{ unitPrice: number | null; label: string }>(`/prices/suggest?${q}`)
      .then((s) => {
        if (cancelled) return;
        setSuggestLabel(s.label);
        const cur = lineNow.current;
        const untouched = cur.priceMode === "unit" && (cur.unitPrice === "" || cur.unitPrice === lastSuggested.current);
        if (!untouched) return;
        // Giá gợi ý theo đơn vị niêm yết, quy sang đơn vị đang chọn (BR-6)
        const next = s.unitPrice === null ? "" : String(convertUnitPrice(s.unitPrice, listUnit, cur.weightUnit));
        lastSuggested.current = next || null;
        onChange({ unitPrice: next });
      })
      .catch(() => !cancelled && setSuggestLabel(null));
    return () => {
      cancelled = true;
    };
    // Gợi ý lại khi đổi sản phẩm, thời điểm mua hoặc đơn vị (để quy lại giá), không khi người dùng gõ giá
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.productId, purchaseDate, purchaseTime, line.weightUnit, editing]);

  // Nhập một trong hai, số kia tự tính theo khối lượng (BR-5)
  const parsed = parseWeight(line.weight, line.weightUnit);
  const weightMg = parsed.ok ? toMg(parsed.value, line.weightUnit) : 0;
  const shownUnit =
    line.priceMode === "unit"
      ? line.unitPrice
      : weightMg && line.totalPrice
        ? String(unitFromTotal(Number(line.totalPrice), weightMg, unit))
        : "";
  const shownTotal =
    line.priceMode === "total"
      ? line.totalPrice
      : weightMg && line.unitPrice
        ? String(totalFromUnit(Number(line.unitPrice), weightMg, unit))
        : "";

  const fields = (
    <>
      <Field label="Sản phẩm" error={errors.productId}>
        <select
          className={inputClass}
          value={line.productId}
          onChange={(e) => onChange({ productId: e.target.value ? Number(e.target.value) : "" })}
        >
          <option value="">— Chọn —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Khối lượng" error={errors.weight}>
          <WeightCombo value={line.weight} unit={line.weightUnit} onChange={(weight) => onChange({ weight })} />
        </Field>
        <Field label="Đơn vị" error={errors.weightUnit}>
          <select className={inputClass} value={line.weightUnit} onChange={(e) => onChange({ weightUnit: e.target.value as WeightUnit })}>
            {WEIGHT_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={`Đơn giá (VNĐ/${UNIT_LABEL[unit]})`}
        error={line.priceMode === "unit" ? errors.price : undefined}
        hint={!editing && suggestLabel ? suggestLabel : undefined}
      >
        <MoneyInput
          value={shownUnit}
          dim={line.priceMode !== "unit"}
          placeholder={line.autoPrice ? formatVnd(line.autoPrice.unitCost) : undefined}
          onChange={(unitPrice) => onChange({ priceMode: "unit", unitPrice, autoPrice: null })}
        />
      </Field>
      <Field
        label="Tổng tiền"
        error={line.priceMode === "total" ? errors.price : undefined}
        hint={shownTotal ? undefined : "Để trống để tự lấy giá ngày mua"}
      >
        <MoneyInput
          value={shownTotal}
          dim={line.priceMode !== "total"}
          onChange={(totalPrice) => onChange({ priceMode: "total", totalPrice, autoPrice: null })}
        />
      </Field>
      {line.autoPrice && <p className="-mt-1 mb-3 text-sm text-gold">Giá tự lấy · {line.autoPrice.note}</p>}
    </>
  );

  if (index === undefined) return fields;
  return (
    <section aria-label={`Sản phẩm ${index + 1}`} className="mb-4 rounded-2xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gold">Sản phẩm {index + 1}</h2>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Xoá sản phẩm ${index + 1}`} className="min-h-11 px-2 text-sm text-loss">
            Xoá sản phẩm
          </button>
        )}
      </div>
      {fields}
    </section>
  );
}
