import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Field, inputClass } from "../components/ui";

export function LoginPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "login" ? login : register)(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Không kết nối được máy chủ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Nền trang trí; dự kiến thay bằng component nền của React Bits (xem README)
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--color-gold-100),_transparent_60%),linear-gradient(160deg,#fffaf0,#f5f5f4)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm backdrop-blur">
        <h1 className="text-2xl font-semibold text-gold-700">GoldFolio</h1>
        <p className="mb-6 text-sm text-stone-500">Sổ tài sản vàng bạc của bạn</p>
        <Field label="Email" error={error?.fields.email}>
          <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mật khẩu" error={error?.fields.password}>
          <input
            className={inputClass}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && !error.fields.email && !error.fields.password && <p className="mb-3 text-sm text-loss">{error.message}</p>}
        <button disabled={busy} className="min-h-12 w-full rounded-xl bg-gold-500 font-medium text-white active:bg-gold-700 disabled:opacity-60">
          {mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <p className="mt-4 text-center text-sm text-stone-500">
          {mode === "login" ? (
            <>
              Chưa có tài khoản? <Link className="text-gold-700 underline" to="/dang-ky">Đăng ký</Link>
            </>
          ) : (
            <>
              Đã có tài khoản? <Link className="text-gold-700 underline" to="/dang-nhap">Đăng nhập</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
