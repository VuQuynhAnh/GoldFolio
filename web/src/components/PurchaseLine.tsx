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
  /** Lần mua đang sửa có giá người dùng nhập: hiện nhãn dưới ô đơn giá, gõ giá khác thì bỏ (BR-16) */
  savedManual: boolean;
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
    savedManual: false,
  };
}

interface Props {
  line: LineState;
  /** Cập nhật dòng; cha gộp theo key để kết quả về muộn không ghi đè cả dòng */
  onChange(patch: Partial<LineState>): void;
  products: Product[];
  purchaseDate: string;
  purchaseTime: string;
  /** Trang sửa: mở ra giữ giá đã lưu, chỉ gợi ý lại khi người dùng đổi sản phẩm/ngày/giờ (BR-7) */
  editing: boolean;
  errors: Record<string, string>;
  /** Số thứ tự hiển thị khi có nhiều sản phẩm; undefined = form một sản phẩm */
  index?: number;
  onRemove?(): void;
}

export function PurchaseLine({ line, onChange, products, purchaseDate, purchaseTime, editing, errors, index, onRemove }: Props) {
  const [suggestLabel, setSuggestLabel] = useState<string | null>(null);
  // Đang chờ giá gợi ý: hiện "Đang lấy giá…" để người dùng biết ô giá sắp tự điền (BR-6)
  const [loading, setLoading] = useState(false);
  // Số vừa được gợi ý: ô giá còn đúng số này nghĩa là người dùng chưa sửa tay (BR-6).
  // Trang sửa: giá đã lưu coi như giá gợi ý, chưa gõ lại thì đổi sản phẩm/ngày sẽ thay (BR-7)
  const lastSuggested = useRef<string | null>(editing && line.unitPrice ? line.unitPrice : null);
  // Giá gợi ý gốc theo đơn vị niêm yết, để đổi đơn vị thì quy đổi ngay, không gọi lại server
  const suggestedRaw = useRef<number | null>(null);
  // Giá trị hiện tại của dòng cho kết quả gợi ý về muộn: người dùng có thể đã gõ trong lúc
  // chờ, so với giá trị lúc gửi yêu cầu sẽ ghi đè số vừa gõ (R-UI-02)
  const lineNow = useRef(line);
  lineNow.current = line;
  // Trang sửa: sản phẩm + thời điểm lúc mở. Còn khớp thì không gợi ý (giữ giá đã lưu, BR-7);
  // so theo giá trị chứ không theo "lần chạy đầu" vì StrictMode chạy effect hai lần khi mount
  const openedWith = useRef<string | null>(editing ? `${line.productId}|${purchaseDate}|${purchaseTime}` : null);
  // Đơn vị trước khi đổi, để quy đổi đơn giá đang có sang đơn vị mới (BR-5)
  const prevUnit = useRef(line.weightUnit);

  const product = products.find((p) => p.id === line.productId);
  // Đơn vị niêm yết của sản phẩm: giá gợi ý của nguồn tính theo đơn vị này
  const listUnit = product?.priceUnit ?? "chi";
  // Đơn giá trên form theo đơn vị khối lượng đang chọn (BR-5)
  const unit = line.weightUnit;

  // Ô giá chưa bị sửa tay: còn trống hoặc còn đúng số vừa gợi ý (BR-6). Nhập theo tổng tiền thì
  // giữ tổng tiền (số đã trả thật)
  const untouched = (cur: LineState) =>
    cur.priceMode === "unit" && (cur.unitPrice === "" || cur.unitPrice === lastSuggested.current);

  // Điền giá gợi ý (theo đơn vị niêm yết) vào ô đơn giá, quy sang đơn vị đang chọn (BR-5, BR-6)
  const fillSuggested = (cur: LineState) => {
    const raw = suggestedRaw.current;
    const next = raw === null ? "" : String(convertUnitPrice(raw, listUnit, cur.weightUnit));
    lastSuggested.current = next || null;
    // Giá đã thay bằng giá gợi ý mới thì không còn là "giá tự lấy" đã lưu (BR-16)
    if (next !== cur.unitPrice) onChange({ unitPrice: next, autoPrice: null, savedManual: false });
  };

  // Gợi ý đơn giá theo sản phẩm của dòng + ngày giờ mua chung (BR-6, BR-18); trang sửa thì chỉ
  // sau khi người dùng đổi sản phẩm/ngày/giờ (BR-7)
  useEffect(() => {
    const key = `${line.productId}|${purchaseDate}|${purchaseTime}`;
    if (openedWith.current === key || !line.productId || !purchaseDate) {
      setLoading(false);
      return;
    }
    // Đã đổi khỏi lúc mở: quay lại đúng giá trị cũ cũng gợi ý, vì giá đã bị thay
    openedWith.current = null;
    let cancelled = false;
    setLoading(true);
    const q = new URLSearchParams({ productId: String(line.productId), date: purchaseDate });
    if (purchaseTime) q.set("time", purchaseTime);
    api<{ unitPrice: number | null; label: string }>(`/prices/suggest?${q}`)
      .then((s) => {
        if (cancelled) return;
        setSuggestLabel(s.label);
        suggestedRaw.current = s.unitPrice;
        if (untouched(lineNow.current)) fillSuggested(lineNow.current);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestLabel(null);
        // Không giữ giá của sản phẩm/thời điểm trước, kẻo đổi đơn vị lại quy đổi nhầm giá đó
        suggestedRaw.current = null;
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Gợi ý lại khi đổi sản phẩm hoặc thời điểm mua, không khi người dùng gõ giá
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.productId, purchaseDate, purchaseTime]);

  // Đổi đơn vị: quy đổi đơn giá đang có ngay tại chỗ, không gọi lại server; giá đã sửa tay
  // trong lần nhập này thì giữ nguyên (BR-5)
  useEffect(() => {
    const from = prevUnit.current;
    prevUnit.current = line.weightUnit;
    // Đang chờ gợi ý: kết quả về sẽ tự quy theo đơn vị mới
    if (from === line.weightUnit || loading) return;
    const cur = lineNow.current;
    if (!untouched(cur) || cur.unitPrice === "") return;
    // Có giá gợi ý gốc thì quy từ đó (không lệch do làm tròn); trang sửa chưa gợi ý thì quy từ đơn vị trước
    if (suggestedRaw.current !== null) return fillSuggested(cur);
    const next = String(convertUnitPrice(Number(cur.unitPrice), from, cur.weightUnit));
    lastSuggested.current = next;
    onChange({ unitPrice: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.weightUnit]);

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
        hint={
          loading ? (
            <span className="inline-flex items-center gap-1.5" role="status">
              <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              Đang lấy giá…
            </span>
          ) : line.savedManual || line.autoPrice ? (
            <>
              {/* Nguồn của giá đã lưu (trang sửa); lưu lại thì server so giá lần nữa (BR-16) */}
              {line.savedManual ? (
                <span className="text-gold">Người dùng nhập</span>
              ) : (
                <span className="text-gold">Hệ thống lấy · {line.autoPrice!.note}</span>
              )}
              {/* Đã đổi sản phẩm/ngày mà giữ giá (vd nhập theo tổng tiền): vẫn cho xem giá tham khảo */}
              {suggestLabel && <span className="mt-1 block">{suggestLabel}</span>}
            </>
          ) : (
            suggestLabel ?? undefined
          )
        }
      >
        <MoneyInput
          aria-busy={loading || undefined}
          value={shownUnit}
          dim={line.priceMode !== "unit"}
          placeholder={line.autoPrice ? formatVnd(line.autoPrice.unitCost) : undefined}
          onChange={(unitPrice) => onChange({ priceMode: "unit", unitPrice, autoPrice: null, savedManual: false })}
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
          onChange={(totalPrice) => onChange({ priceMode: "total", totalPrice, autoPrice: null, savedManual: false })}
        />
      </Field>
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
