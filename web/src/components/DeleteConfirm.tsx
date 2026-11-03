/** Xác nhận trước khi xoá lần mua (HOLD-UC01/BR-8). */
export function DeleteConfirm({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mb-5">Xoá lần mua này? Không thể hoàn tác.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-stone-600 hover:bg-stone-100">
            Huỷ
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-loss px-4 py-2 font-medium text-white">
            Xoá
          </button>
        </div>
      </div>
    </div>
  );
}
