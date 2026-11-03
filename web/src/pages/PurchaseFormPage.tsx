import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { ApiError, api, type Purchase } from "../api";
import { usePortfolio } from "../portfolio-context";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Field, LoadError, inputClass } from "../components/ui";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Trang thêm (`/them`) và sửa (`/sua/:id`) lần mua, toàn màn hình, nút Lưu dính đáy
 * trong tầm ngón cái (HOLD-UC01/BR-1…8, BR-12; R-UI-03).
 */
export function PurchaseFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const { brands, portfolio, reload } = usePortfolio();
  const editing = editId ? (portfolio?.items.find((i) => i.id === editId) ?? null) : null;

  const [brandId, setBrandId] = useState<number | "">("");
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Lần mua có giá tự lấy: ô giá để trống (lưu mà không nhập thì server lấy lại giá, BR-16),
  // giá cũ hiện làm chữ mờ; người dùng gõ giá thì bỏ nhãn
  const [autoPrice, setAutoPrice] = useState<{ note: string; unitCost: number } | null>(null);
  // Trang sửa: chỉ cho thao tác khi đã nạp xong lần mua (R-UI-04)
  const [load, setLoad] = useState<"loading" | "ready" | "notfound" | "error">(editId ? "loading" : "ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Số vừa được gợi ý: ô giá còn đúng số này nghĩa là người dùng chưa sửa tay (BR-6)
  const lastSuggested = useRef<string | null>(null);
  // Giá trị hiện tại của ô giá cho kết quả gợi ý trả về muộn: người dùng có thể đã gõ
  // trong lúc chờ, so với giá trị lúc gửi yêu cầu sẽ ghi đè số vừa gõ (R-UI-02)
  const priceNow = useRef({ priceMode, unitPrice });
  priceNow.current = { priceMode, unitPrice };

  // Mở từ link ngoài (không có trang trước trong app) thì "quay lại" về tab Lần mua
  const goBack = () => (location.key === "default" ? navigate("/lan-mua", { replace: true }) : navigate(-1));

  // Thêm mới: thương hiệu mặc định Phú Quý, khi danh sách thương hiệu đã nạp (BR-1)
  useEffect(() => {
    if (editId || brandId !== "" || brands.length === 0) return;
    setBrandId((brands.find((b) => b.isDefault) ?? brands[0])!.id);
  }, [brands, brandId, editId]);

  // Sửa: nạp lần mua, không gợi ý lại giá (BR-7)
  useEffect(() => {
    if (!editId) return;
    setLoad("loading");
    api<{ purchase: Purchase }>(`/purchases/${editId}`)
      .then(({ purchase: p }) => {
        setBrandId(p.brandId);
        setProductId(p.productId);
        setWeight(String(p.weight).replace(".", ","));
        setWeightUnit(p.weightUnit);
        setPurchaseDate(p.purchaseDate);
        setPurchaseTime(p.purchaseTime ?? "");
        setPriceMode(p.priceMode);
        if (p.priceSource === "auto") {
          setAutoPrice({ note: p.priceNote, unitCost: p.unitCost });
          setUnitPrice("");
          setTotalPrice("");
        } else {
          setUnitPrice(String(p.unitCost));
          setTotalPrice(String(p.totalCost));
        }
        setNote(p.note);
        setLoad("ready");
      })
      .catch((err) => {
        // 404 gồm cả lần mua của tài khoản khác (server không phân biệt, R-OWN-01)
        if (err instanceof ApiError && err.status === 404) setLoad("notfound");
        else {
          setLoadError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
          setLoad("error");
        }
      });
  }, [editId, attempt]);

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
    if (editId || !productId || !purchaseDate) return;
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
  }, [productId, purchaseDate, purchaseTime, editId]);

  // Nhập một trong hai, số kia tự tính theo khối lượng (BR-5)
  const parsed = parseWeight(weight);
  const weightMg = parsed.ok ? toMg(parsed.value, weightUnit) : 0;
  const shownUnit =
    priceMode === "unit" ? unitPrice : weightMg && totalPrice ? String(unitFromTotal(Number(totalPrice), weightMg, priceUnit)) : "";
  const shownTotal =
    priceMode === "total" ? totalPrice : weightMg && unitPrice ? String(totalFromUnit(Number(unitPrice), weightMg, priceUnit)) : "";

  const done = async () => {
    await reload();
    navigate("/lan-mua", { replace: true });
  };

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
      await api(editId ? `/purchases/${editId}` : "/purchases", { method: editId ? "PUT" : "POST", body });
      await done();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api(`/purchases/${editId}`, { method: "DELETE" });
      await done();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    }
  };

  const header = (
    <header className="safe-top sticky top-0 z-10 border-b border-line bg-surface">
      <div className="flex h-12 items-center gap-1 px-1">
        <button type="button" onClick={goBack} aria-label="Quay lại" className="flex h-11 w-11 items-center justify-center text-2xl text-muted">
          ‹
        </button>
        <h1 className="text-lg font-semibold">{editId ? "Sửa lần mua" : "Thêm lần mua"}</h1>
      </div>
    </header>
  );

  if (load === "notfound") {
    return (
      <div className="mx-auto min-h-dvh max-w-md bg-surface">
        {header}
        <div className="flex flex-col items-center px-4 pt-16 text-center">
          <p className="mb-6 text-muted">Không tìm thấy lần mua</p>
          <Link to="/lan-mua" replace className="flex min-h-12 items-center rounded-xl bg-gold px-6 font-medium text-bg">
            Về danh sách lần mua
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface">
      {header}

      {load === "error" && loadError && (
        <div className="px-4 pt-4">
          <LoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      )}
      {/* Khoá cả form tới khi nạp xong lần mua, tránh lưu một form trống */}
      <fieldset disabled={load !== "ready"} className="min-w-0 flex-1 px-4 pb-6 pt-4">
        <Field label="Thương hiệu" hint={brand && !brand.hasSource ? "Thương hiệu này chưa có nguồn giá" : undefined}>
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
        <Field label="Sản phẩm" error={errors.productId}>
          <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— Chọn —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
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

        <Field
          label={`Đơn giá (VNĐ/${UNIT_LABEL[priceUnit]})`}
          error={priceMode === "unit" ? errors.price : undefined}
          hint={!editId && suggestLabel ? suggestLabel : shownUnit ? formatVnd(Number(shownUnit)) : undefined}
        >
          <input
            className={inputClass + (priceMode === "unit" ? "" : " bg-surface-2 text-muted")}
            inputMode="numeric"
            value={shownUnit}
            placeholder={autoPrice ? formatVnd(autoPrice.unitCost) : undefined}
            onChange={(e) => {
              setPriceMode("unit");
              setUnitPrice(digits(e.target.value));
              setAutoPrice(null);
            }}
          />
        </Field>
        <Field
          label="Tổng tiền (VNĐ)"
          error={priceMode === "total" ? errors.price : undefined}
          hint={shownTotal ? formatVnd(Number(shownTotal)) : "Để trống để tự lấy giá ngày mua"}
        >
          <input
            className={inputClass + (priceMode === "total" ? "" : " bg-surface-2 text-muted")}
            inputMode="numeric"
            value={shownTotal}
            onChange={(e) => {
              setPriceMode("total");
              setTotalPrice(digits(e.target.value));
              setAutoPrice(null);
            }}
          />
        </Field>

        {autoPrice && <p className="-mt-1 mb-3 text-sm text-gold">Giá tự lấy · {autoPrice.note}</p>}

        <Field label="Ghi chú" error={errors.note}>
          <input className={inputClass} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {formError && <p className="mb-3 text-sm text-loss">{formError}</p>}

        {editId && load === "ready" && (
          <button type="button" onClick={() => setConfirmDelete(true)} className="mt-4 min-h-12 w-full rounded-xl text-loss">
            Xoá lần mua
          </button>
        )}
      </fieldset>

      {/* Nút Lưu dính đáy, chừa vùng an toàn; bàn phím mở thì trình duyệt tự đẩy lên */}
      <div className="safe-bottom sticky bottom-0 border-t border-line bg-surface px-4 pt-3">
        <button disabled={busy || load !== "ready"} className="mb-3 min-h-12 w-full rounded-xl bg-gold font-medium text-bg active:bg-gold-deep disabled:opacity-60">
          Lưu
        </button>
      </div>

      {confirmDelete && (
        <ConfirmSheet
          message="Xoá lần mua này? Không thể hoàn tác."
          confirmLabel="Xoá"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      )}
    </form>
  );
}
