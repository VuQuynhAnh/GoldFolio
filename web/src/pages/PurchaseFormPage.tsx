import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { vnDate } from "@goldfolio/shared";
import { ApiError, api, type Brand, type Product, type Purchase } from "../api";
import { usePortfolio } from "../portfolio-context";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { PurchaseLine, newLine, type LineState } from "../components/PurchaseLine";
import { Field, LoadError, inputClass } from "../components/ui";

const MAX_LINES = 20;
const defaultProductOf = (b?: Brand): number | "" => b?.products.find((p) => p.isDefault)?.id ?? "";

/** Giá của một dòng gửi lên server: chỉ gửi ô người dùng đã nhập; trống cả hai thì server tự lấy giá (BR-16) */
function linePayload(l: LineState) {
  return {
    productId: l.productId || undefined,
    weight: l.weight,
    weightUnit: l.weightUnit,
    priceMode: l.priceMode,
    unitPrice: l.priceMode === "unit" && l.unitPrice ? Number(l.unitPrice) : undefined,
    totalPrice: l.priceMode === "total" && l.totalPrice ? Number(l.totalPrice) : undefined,
  };
}

/**
 * Trang **Thêm tài sản** (`/them`, nhiều sản phẩm một lần, BR-18) và **Sửa lần mua** (`/sua/:id`,
 * một sản phẩm, BR-20). Toàn màn hình, nút Lưu dính đáy trong tầm ngón cái (R-UI-03).
 */
export function PurchaseFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const { brands, portfolio, reload } = usePortfolio();
  const editing = editId ? (portfolio?.items.find((i) => i.id === editId) ?? null) : null;

  const [brandId, setBrandId] = useState<number | "">("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [purchaseDate, setPurchaseDate] = useState(vnDate());
  const [purchaseTime, setPurchaseTime] = useState("");
  // Giờ mua hiếm khi cần nên ẩn sau nút, để hàng ngày mua không chật trên màn nhỏ (BR-1).
  // Lần mua đang sửa có giờ, hoặc server báo lỗi ô giờ, thì luôn hiện.
  const [showTime, setShowTime] = useState(false);
  // Form không còn ô ghi chú (BR-1); lần mua cũ đã có ghi chú thì giữ nguyên khi sửa, không xoá trắng
  const [note, setNote] = useState("");
  // Lỗi ô dùng chung (ngày, giờ) và lỗi theo dòng ("items.<i>.<ô>" của server)
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Trang sửa: chỉ cho thao tác khi đã nạp xong lần mua (R-UI-04)
  const [load, setLoad] = useState<"loading" | "ready" | "notfound" | "error">(editId ? "loading" : "ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Mở từ link ngoài (không có trang trước trong app) thì "quay lại" về tab Lần mua
  const goBack = () => (location.key === "default" ? navigate("/chi-tiet", { replace: true }) : navigate(-1));

  // Thêm mới: thương hiệu mặc định Phú Quý, một dòng với sản phẩm mặc định (BR-1)
  useEffect(() => {
    if (editId || brandId !== "" || brands.length === 0) return;
    const b = brands.find((x) => x.isDefault) ?? brands[0]!;
    setBrandId(b.id);
    setLines([newLine(defaultProductOf(b))]);
  }, [brands, brandId, editId]);

  // Sửa: nạp lần mua, giữ giá đã lưu; chỉ gợi ý lại khi người dùng đổi sản phẩm/ngày/giờ (BR-7)
  useEffect(() => {
    if (!editId) return;
    setLoad("loading");
    api<{ purchase: Purchase }>(`/purchases/${editId}`)
      .then(({ purchase: p }) => {
        setBrandId(p.brandId);
        setPurchaseDate(p.purchaseDate);
        setPurchaseTime(p.purchaseTime ?? "");
        setNote(p.note);
        const auto = p.priceSource === "auto";
        setLines([
          {
            ...newLine(p.productId),
            weight: String(p.weight).replace(".", ","),
            weightUnit: p.weightUnit,
            priceMode: p.priceMode,
            // Giá tự lấy cũng điền sẵn số đã lưu: bấm Lưu là người dùng xác nhận, thành giá
            // người dùng nhập; xoá trống ô giá thì server lấy lại (BR-16)
            unitPrice: String(p.unitCost),
            totalPrice: String(p.totalCost),
            autoPrice: auto ? { note: p.priceNote, unitCost: p.unitCost } : null,
            savedManual: !auto,
          },
        ]);
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
  const products = useMemo<Product[]>(() => {
    const list = brand?.products ?? [];
    if (editing && !list.some((p) => p.id === editing.productId)) {
      return [...list, { id: editing.productId, name: editing.productName, metal: editing.metal, priceUnit: editing.priceUnit }];
    }
    return list;
  }, [brand, editing]);

  // Gộp theo key: kết quả gợi ý về muộn chỉ đụng tới đúng ô của đúng dòng
  const updateLine = (key: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineErrors = (i: number) =>
    Object.fromEntries(
      Object.entries(errors)
        .filter(([k]) => k.startsWith(`items.${i}.`))
        .map(([k, v]) => [k.slice(`items.${i}.`.length), v]),
    );

  const done = async () => {
    await reload();
    navigate("/chi-tiet", { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const shared = { purchaseDate, purchaseTime: purchaseTime || null, note };
    try {
      if (editId) {
        await api(`/purchases/${editId}`, { method: "PUT", body: { ...shared, ...linePayload(lines[0]!) } });
      } else {
        await api("/purchases/batch", { method: "POST", body: { ...shared, items: lines.map(linePayload) } });
      }
      await done();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        // Trang sửa: server trả lỗi theo tên ô, đổi về dạng của dòng 0 cho thống nhất
        const shared = new Set(["purchaseDate", "purchaseTime", "note"]);
        setErrors(
          editId
            ? Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [shared.has(k) ? k : `items.0.${k}`, v]))
            : err.fields,
        );
      } else setFormError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
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
        <h1 className="text-lg font-semibold">{editId ? "Sửa lần mua" : "Thêm tài sản"}</h1>
      </div>
    </header>
  );

  if (load === "notfound") {
    return (
      <div className="mx-auto min-h-dvh max-w-md bg-surface">
        {header}
        <div className="flex flex-col items-center px-4 pt-16 text-center">
          <p className="mb-6 text-muted">Không tìm thấy lần mua</p>
          <Link to="/chi-tiet" replace className="flex min-h-12 items-center rounded-xl bg-gold px-6 font-medium text-bg">
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
              const b = brands.find((x) => x.id === Number(e.target.value));
              setBrandId(Number(e.target.value));
              // Đổi thương hiệu thì sản phẩm về sản phẩm mặc định của thương hiệu đó (BR-1, BR-2)
              setLines((ls) => ls.map((l) => ({ ...l, productId: defaultProductOf(b) })));
            }}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ngày mua" error={errors.purchaseDate}>
          <input className={inputClass} type="date" max={vnDate()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        {showTime || purchaseTime !== "" || errors.purchaseTime ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Giờ mua" error={errors.purchaseTime}>
                <input className={inputClass} type="time" value={purchaseTime} onChange={(e) => setPurchaseTime(e.target.value)} />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => {
                setPurchaseTime("");
                setShowTime(false);
              }}
              className="mb-3 min-h-12 px-2 text-sm text-muted"
            >
              Bỏ giờ mua
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowTime(true)} className="-mt-1 mb-3 min-h-11 text-sm text-gold">
            + Thêm giờ mua
          </button>
        )}

        {lines.map((l, i) => (
          <PurchaseLine
            key={l.key}
            line={l}
            onChange={(patch) => updateLine(l.key, patch)}
            products={products}
            purchaseDate={purchaseDate}
            purchaseTime={purchaseTime}
            editing={!!editId}
            errors={lineErrors(i)}
            index={editId ? undefined : i}
            onRemove={lines.length > 1 ? () => setLines((ls) => ls.filter((x) => x.key !== l.key)) : undefined}
          />
        ))}

        {!editId && lines.length < MAX_LINES && (
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, newLine(defaultProductOf(brand))])}
            className="mb-4 min-h-12 w-full rounded-xl border border-dashed border-gold/60 text-gold"
          >
            + Thêm sản phẩm
          </button>
        )}

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
          {editId || lines.length <= 1 ? "Lưu" : `Lưu ${lines.length} sản phẩm`}
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
