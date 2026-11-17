import { useCallback, useEffect, useState } from "react";
import { formatDateTimeVn } from "@goldfolio/shared";
import { api } from "../api";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { LoadError } from "../components/ui";

interface TokenInfo {
  hasToken: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** Trang tải APK của app widget (GitHub Actions build và đính vào bản phát hành mới nhất) */
export const APK_URL = "https://github.com/VuQuynhAnh/GoldFolio/releases/latest";

/**
 * Mã kết nối = địa chỉ GoldFolio + "#" + mã widget, để dán một lần vào app widget.
 * Mã nằm sau "#" nên không bao giờ bị gửi lên server dưới dạng đường dẫn hay ghi vào log.
 */
export const connectionCode = (origin: string, token: string) => `${origin}#${token}`;

/**
 * Widget màn hình chính Android (HOLD-UC02): tạo / thu hồi mã widget và hướng dẫn cài app widget.
 * Mã chỉ hiện đúng một lần ngay sau khi tạo (BR-2).
 */
export function WidgetPage() {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"create" | "revoke" | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api<TokenInfo>("/widget/token"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thông tin widget");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: "create" | "revoke") => {
    setConfirm(null);
    setBusy(true);
    try {
      if (action === "create") {
        const res = await api<TokenInfo & { token: string }>("/widget/token", { method: "POST" });
        setCode(connectionCode(window.location.origin, res.token));
        setCopied(false);
        setInfo({ hasToken: res.hasToken, createdAt: res.createdAt, lastUsedAt: res.lastUsedAt });
      } else {
        await api("/widget/token", { method: "DELETE" });
        setCode(null);
        setInfo({ hasToken: false, createdAt: null, lastUsedAt: null });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Trình duyệt chặn chép tự động: người dùng tự giữ ngón tay để chép ô mã
      setCopied(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Widget màn hình chính</h1>
      <p className="mb-4 text-sm text-muted">Xem tổng tài sản, lãi/lỗ và giá vàng, bạc ngay trên màn hình chính Android, không cần mở app.</p>
      {error && <LoadError message={error} onRetry={() => void load()} />}

      <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-medium">Mã widget</h2>
        {!info ? (
          !error && <p className="text-sm text-muted">Đang tải…</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {info.hasToken
                ? `Đã tạo lúc ${formatDateTimeVn(info.createdAt!)} · ${info.lastUsedAt ? `widget cập nhật lần cuối ${formatDateTimeVn(info.lastUsedAt)}` : "widget chưa dùng mã này"}`
                : "Chưa có mã. Tạo mã rồi dán vào app widget."}
            </p>
            {code && (
              <div className="mb-3 rounded-xl bg-surface-2 p-3">
                <label className="mb-1 block text-sm font-medium" htmlFor="widget-code">
                  Mã kết nối
                </label>
                <textarea id="widget-code" readOnly value={code} rows={3} className="num w-full resize-none break-all rounded-lg border border-line bg-surface p-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={() => void copy()} className="mt-2 min-h-11 w-full rounded-xl bg-gold font-medium text-bg active:bg-gold-deep">
                  {copied ? "Đã chép" : "Chép mã kết nối"}
                </button>
                <p className="mt-2 text-xs text-loss">Mã chỉ hiện một lần. Ai có mã này xem được số liệu tài sản của bạn, đừng gửi cho người khác.</p>
              </div>
            )}
            <div className="grid gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => (info.hasToken ? setConfirm("create") : void run("create"))}
                className="min-h-11 rounded-xl border border-gold/60 font-medium text-gold disabled:opacity-50"
              >
                {info.hasToken ? "Tạo mã mới" : "Tạo mã widget"}
              </button>
              {info.hasToken && (
                <button type="button" disabled={busy} onClick={() => setConfirm("revoke")} className="min-h-11 rounded-xl font-medium text-loss disabled:opacity-50">
                  Thu hồi mã
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 className="mb-2 font-medium">Cài trên Android</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <a href={APK_URL} target="_blank" rel="noreferrer" className="font-medium text-gold underline">
              Tải app GoldFolio (.apk)
            </a>{" "}
            ở bản phát hành mới nhất.
          </li>
          <li>Mở file vừa tải, Android hỏi cho phép cài từ nguồn này thì bấm Cho phép, rồi Cài đặt.</li>
          <li>Mở app GoldFolio, dán mã kết nối ở trên, bấm Lưu. Từ đó mở app là vào GoldFolio luôn, không cần mở trình duyệt.</li>
          <li>Giữ ngón tay ở chỗ trống trên màn hình chính → Tiện ích (Widget) → GoldFolio, kéo ra màn hình.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Widget tự cập nhật khoảng 30 phút một lần (điện thoại quyết định nhịp), bấm vào giờ trên widget để cập nhật ngay. Bấm vào số liệu để mở GoldFolio.
        </p>
      </section>

      {confirm && (
        <ConfirmSheet
          message={confirm === "create" ? "Widget đang dùng mã cũ sẽ ngừng cập nhật cho tới khi bạn dán mã mới. Tạo mã mới?" : "Widget sẽ ngừng cập nhật. Thu hồi mã?"}
          confirmLabel={confirm === "create" ? "Tạo mã mới" : "Thu hồi"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(confirm)}
        />
      )}
    </div>
  );
}
