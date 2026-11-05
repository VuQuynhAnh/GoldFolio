import { formatVnd } from "@goldfolio/shared";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";

/**
 * Ô nhập tiền hiển thị dạng VNĐ ngay khi gõ ("13.850.000 VNĐ"); giá trị bên trong là chuỗi
 * chữ số, gửi đi thành số nguyên (HOLD-UC01/BR-19).
 */
export function MoneyInput({
  value,
  onChange,
  dim,
  placeholder,
  ...rest
}: {
  value: string;
  onChange(digits: string): void;
  /** Ô đang hiện số tự tính (người dùng nhập ô kia) */
  dim?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <div className="relative">
      <input
        {...rest}
        className={cn(inputClass, "pr-14", dim && "bg-surface-2 text-muted")}
        inputMode="numeric"
        value={value ? formatVnd(Number(value)) : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">VNĐ</span>
    </div>
  );
}
