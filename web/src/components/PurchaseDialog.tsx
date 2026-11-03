import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  UNIT_LABEL,
  WEIGHT_UNITS,
  formatVnd,
  parseWeight,
  toMg,
  totalFromUnit,
  unitFromTotal,
  vnDate,
  type WeightUnit,
} from "@goldfolio/shared";
import { ApiError, api, type Brand, type PortfolioItem, type Purchase } from "../api";
import { Field, inputClass } from "./ui";

interface Props {
  brands: Brand[];
  /** Lần mua đang sửa; không có = thêm mới */
  editing: PortfolioItem | null;
  onClose(): void;
  onSaved(): void;
}

const digits = (s: string) => s.replace(/\D/g, "");

export function PurchaseDialog({ brands, editing, onClose, onSaved }: Props) {
  const defaultBrand = brands.find((b) => b.isDefault) ?? brands[0];
  const [brandId, setBrandId] = useState<number | "">(defaultBrand?.id ?? "");
  const [productId, setProductId] = useState<number | "">("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("chi");
  const [purchaseDate, setPurchaseDate] = useState(vnDate());
  const [purchaseTime, setPurchaseTime] = useState("");
  const [priceMode, setPriceMode] = useState<"unit" | "total">("unit");
  const [unitPrice, setUnitPrice] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [note, setNote] = useState("");
  const [suggestLabel, setSuggestLabel] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Số vừa được gợi ý: ô giá còn đúng số này nghĩa là người dùng chưa sửa tay (BR-6)
  const lastSuggested = useRef<string | null>(null);
  // Giá trị hiện tại của ô giá cho kết quả gợi ý trả về muộn: người dùng có thể đã gõ
  // trong lúc chờ, so với giá trị lúc gửi yêu cầu sẽ ghi đè số vừa gõ (R-UI-02)
  const priceNow = useRef({ priceMode, unitPrice });
  priceNow.current = { priceMode, unitPrice };

  // Form sửa: nạp lần mua, không gợi ý lại giá (BR-7)
  useEffect(() => {
    if (!editing) return;
    api<{ purchase: Purchase }>(`/purchases/${editing.id}`).then(({ purchase: p }) => {
      setBrandId(p.brandId);
      setProductId(p.productId);
      setWeight(String(p.weight).replace(".", ","));
      setWeightUnit(p.weightUnit);
      setPurchaseDate(p.purchaseDate);
      setPurchaseTime(p.purchaseTime ?? "");
      setPriceMode(p.priceMode);
      setUnitPrice(String(p.unitCost));
      setTotalPrice(String(p.totalCost));
      setNote(p.note);
    });
  }, [editing]);

  const brand = brands.find((b) => b.id === brandId);
  // Lần mua cũ của sản phẩm đã biến mất khỏi bảng giá vẫn sửa được (BR-15)
  const products = useMemo(() => {
    const list = brand?.products ?? [];
    if (editing && editing.productId === productId && !list.some((p) => p.id === productId)) {
      return [...list, { id: editing.productId, name: editing.productName, metal: editing.metal, priceUnit: editing.priceUnit }];
    }
    return list;
  }, [brand, editing, productId]);
  const product = products.find((p) => p.id === productId);
  const priceUnit = product?.priceUnit ?? "chi";

  // Gợi ý đơn giá theo sản phẩm + ngày giờ mua, chỉ khi thêm mới (BR-6)
  useEffect(() => {
    if (editing || !productId || !purchaseDate) return;
    let cancelled = false;
    const q = new URLSearchParams({ productId: String(productId), date: purchaseDate });
    if (purchaseTime) q.set("time", purchaseTime);
    api<{ unitPrice: number | null; label: string }>(`/prices/suggest?${q}`)
      .then((s) => {
        if (cancelled) return;
        setSuggestLabel(s.label);
        const cur = priceNow.current;
        const untouched = cur.priceMode === "unit" && (cur.unitPrice === "" || cur.unitPrice === lastSuggested.current);
        if (!untouched) return;
        const next = s.unitPrice === null ? "" : String(s.unitPrice);
        lastSuggested.current = next || null;
        setUnitPrice(next);
      })
      .catch(() => !cancelled && setSuggestLabel(null));
    return () => {
      cancelled = true;
    };
    // Chỉ gợi ý lại khi đổi sản phẩm hoặc thời điểm mua, không khi người dùng gõ giá
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, purchaseDate, purchaseTime, editing]);

  // Nhập một trong hai, số kia tự tính theo khối lượng (BR-5)
  const parsed = parseWeight(weight);
  const weightMg = parsed.ok ? toMg(parsed.value, weightUnit) : 0;
  const shownUnit =
    priceMode === "unit" ? unitPrice : weightMg && totalPrice ? String(unitFromTotal(Number(totalPrice), weightMg, priceUnit)) : "";
  const shownTotal =
    priceMode === "total" ? totalPrice : weightMg && unitPrice ? String(totalFromUnit(Number(unitPrice), weightMg, priceUnit)) : "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const body = {
      productId: productId || undefined,
      weight,
      weightUnit,
      purchaseDate,
      purchaseTime: purchaseTime || null,
      priceMode,
      unitPrice: priceMode === "unit" && unitPrice ? Number(unitPrice) : undefined,
      totalPrice: priceMode === "total" && totalPrice ? Number(totalPrice) : undefined,
      note,
    };
    try {
      await api(editing ? `/purchases/${editing.id}` : "/purchases", { method: editing ? "PUT" : "POST", body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <h2 className="mb-4 text-lg font-semibold">{editing ? "Sửa lần mua" : "Thêm lần mua"}</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Thương hiệu">
            <select
              className={inputClass}
              value={brandId}
              onChange={(e) => {
                setBrandId(Number(e.target.value));
                // Đổi thương hiệu thì bỏ sản phẩm đã chọn (BR-2)
                setProductId("");
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sản phẩm" error={errors.productId} hint={brand && !brand.hasSource ? "Thương hiệu này chưa có nguồn giá" : undefined}>
            <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— Chọn —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Khối lượng" error={errors.weight}>
            <input className={inputClass} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="vd 2 hoặc 0,5" />
          </Field>
          <Field label="Đơn vị">
            <select className={inputClass} value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày mua" error={errors.purchaseDate}>
            <input className={inputClass} type="date" max={vnDate()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Giờ mua (không bắt buộc)" error={errors.purchaseTime}>
            <input className={inputClass} type="time" value={purchaseTime} onChange={(e) => setPurchaseTime(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Đơn giá (VNĐ/${UNIT_LABEL[priceUnit]})`}
            error={priceMode === "unit" ? errors.price : undefined}
            hint={!editing && suggestLabel ? suggestLabel : shownUnit ? formatVnd(Number(shownUnit)) : undefined}
          >
            <input
              className={inputClass + (priceMode === "unit" ? "" : " bg-stone-50 text-stone-500")}
              inputMode="numeric"
              value={shownUnit}
              onChange={(e) => {
                setPriceMode("unit");
                setUnitPrice(digits(e.target.value));
              }}
            />
          </Field>
          <Field
            label="Tổng tiền (VNĐ)"
            error={priceMode === "total" ? errors.price : undefined}
            hint={shownTotal ? formatVnd(Number(shownTotal)) : undefined}
          >
            <input
              className={inputClass + (priceMode === "total" ? "" : " bg-stone-50 text-stone-500")}
              inputMode="numeric"
              value={shownTotal}
              onChange={(e) => {
                setPriceMode("total");
                setTotalPrice(digits(e.target.value));
              }}
            />
          </Field>
        </div>

        <Field label="Ghi chú" error={errors.note}>
          <input className={inputClass} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {formError && <p className="mb-3 text-sm text-loss">{formError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-stone-600 hover:bg-stone-100">
            Huỷ
          </button>
          <button disabled={busy} className="rounded-lg bg-gold-500 px-4 py-2 font-medium text-white hover:bg-gold-700 disabled:opacity-60">
            Lưu
          </button>
        </div>
      </form>
    </div>
  );
}
