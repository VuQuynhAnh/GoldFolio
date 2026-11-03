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
    // Nền tối có quầng vàng kim phía trên; dự kiến thay bằng component nền của React Bits (xem README)
    <div className="flex min-h-dvh items-center justify-center bg-bg bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-gold)_22%,transparent),transparent_60%)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-gold">GoldFolio</h1>
        <p className="mb-6 text-sm text-muted">Sổ tài sản vàng bạc của bạn</p>
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
        <button disabled={busy} className="min-h-12 w-full rounded-xl bg-gold font-medium text-bg active:bg-gold-deep disabled:opacity-60">
          {mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === "login" ? (
            <>
              Chưa có tài khoản? <Link className="text-gold underline" to="/dang-ky">Đăng ký</Link>
            </>
          ) : (
            <>
              Đã có tài khoản? <Link className="text-gold underline" to="/dang-nhap">Đăng nhập</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
