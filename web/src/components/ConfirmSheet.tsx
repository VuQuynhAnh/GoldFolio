/** Bảng xác nhận trượt từ đáy màn hình, nút nằm trong tầm ngón cái (HOLD-UC01/BR-8, R-UI-03). */
export function ConfirmSheet({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="safe-bottom w-full max-w-md rounded-t-2xl bg-surface px-4 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center">{message}</p>
        <div className="grid gap-2 pb-4">
          <button onClick={onConfirm} className="min-h-12 rounded-xl bg-loss font-medium text-bg">
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="min-h-12 rounded-xl bg-surface-2 font-medium text-ink">
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
