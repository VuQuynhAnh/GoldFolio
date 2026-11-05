import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useChat } from "../chat-context";
import { usePortfolio } from "../portfolio-context";
import { chartMetal } from "./MetalFilter";
import { TrendCard } from "./TrendCard";

// Gợi ý câu hỏi khi khung chat còn trống
const SUGGESTIONS = ["Tài sản của tôi đang lãi hay lỗ?", "Giá vàng 30 ngày qua thế nào?", "Giá bạc đang tăng hay giảm?"];

/**
 * Khung chat hỏi AI trượt từ đáy, gần toàn màn hình điện thoại (PRICE-UC03, R-UI-03). Đầu khung là
 * nhận định xu hướng Vàng | Bạc (PRICE-UC02); AI trả lời dựa trên số liệu danh mục và giá do server
 * gửi kèm; luôn ghi đây chỉ là tham khảo.
 */
export function ChatSheet() {
  const { open, messages, sending, error, questionsLeft, trendMetal, setTrendMetal, close, send } = useChat();
  const [text, setText] = useState("");
  const { metal } = usePortfolio();
  const bottom = useRef<HTMLDivElement>(null);

  // Tin mới thì cuộn xuống cuối
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, sending, open]);

  // Esc để đóng
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const outOfQuestions = questionsLeft !== null && questionsLeft <= 0;

  // Xoá ô nhập ngay khi gửi như các app chat; AI không trả lời được thì trả chữ lại để gửi lại
  const submit = async () => {
    const question = text;
    setText("");
    if (!(await send(question))) setText(question);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hỏi AI"
        className="safe-bottom flex h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="font-semibold text-gold">Hỏi AI</h2>
          <button type="button" onClick={close} className="min-h-11 px-2 text-sm text-muted">
            Đóng
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
          {/* Nhận định: kim loại vừa xem (bong bóng), không thì theo bộ lọc (Tất cả thì Vàng); đổi được trong khung */}
          <TrendCard metal={trendMetal ?? chartMetal(metal)} onMetalChange={setTrendMetal} />
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-muted">Hỏi về giá vàng bạc và tài sản của bạn trong GoldFolio.</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="block min-h-11 rounded-xl border border-line px-3 text-left text-ink">
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <p
              key={i}
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2",
                m.role === "user" ? "ml-auto bg-gold text-bg" : "bg-surface-2 text-ink",
              )}
            >
              {m.content}
            </p>
          ))}
          {sending && (
            <p className="text-muted" role="status">
              AI đang trả lời…
            </p>
          )}
          {error && (
            <p role="alert" className="text-loss">
              {error}
            </p>
          )}
          <div ref={bottom} />
        </div>

        <form
          className="border-t border-line px-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Câu hỏi"
              rows={2}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={outOfQuestions ? "Hôm nay đã hết lượt hỏi" : "Nhập câu hỏi…"}
              disabled={outOfQuestions}
              className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-base text-ink outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={sending || !text.trim() || outOfQuestions}
              className="min-h-12 rounded-xl bg-gold px-4 font-medium text-bg disabled:opacity-50"
            >
              Gửi
            </button>
          </div>
          <div className="flex justify-between gap-2 py-2 text-xs text-muted">
            <span>Nhận định tham khảo, không phải lời khuyên đầu tư</span>
            {questionsLeft !== null && <span className="shrink-0">Còn {questionsLeft} câu hôm nay</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
