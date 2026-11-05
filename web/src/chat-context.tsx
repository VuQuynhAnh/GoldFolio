import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  open: boolean;
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  /** null = chưa biết (chưa hỏi server) */
  questionsLeft: number | null;
  /** Kim loại của nhận định ở đầu khung chat; null = theo bộ lọc đang dùng */
  trendMetal: "gold" | "silver" | null;
  setTrendMetal(m: "gold" | "silver"): void;
  /** Mở khung chat; `seed` = tin mở đầu của AI (vd nhận định vừa xem), `metal` = kim loại của nhận định */
  openChat(seed?: string, metal?: "gold" | "silver"): void;
  close(): void;
  /** Gửi câu hỏi; true = AI đã trả lời */
  send(text: string): Promise<boolean>;
}

const ChatContext = createContext<ChatState | null>(null);

/**
 * Chat hỏi AI (PRICE-UC03). Lịch sử chỉ giữ trong phiên (user chốt): chuyển tab hay mở form
 * vẫn còn, tải lại trang là mất; server không lưu nội dung.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionsLeft, setQuestionsLeft] = useState<number | null>(null);
  const [trendMetal, setTrendMetal] = useState<"gold" | "silver" | null>(null);
  // Lịch sử hiện tại cho lần gửi: tin vừa thêm chưa kịp vào state khi gọi API
  const history = useRef<ChatMessage[]>([]);
  history.current = messages;
  const quotaAsked = useRef(false);

  const openChat = useCallback((seed?: string, metal?: "gold" | "silver") => {
    setOpen(true);
    setError(null);
    setTrendMetal(metal ?? null);
    if (seed) setMessages((ms) => (ms.at(-1)?.content === seed ? ms : [...ms, { role: "assistant", content: seed }]));
    // Lần mở đầu: hỏi server số câu còn lại hôm nay
    if (!quotaAsked.current) {
      quotaAsked.current = true;
      api<{ questionsLeft: number }>("/chat")
        .then((r) => setQuestionsLeft(r.questionsLeft))
        .catch(() => {
          quotaAsked.current = false;
        });
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content) return false;
    const next = [...history.current, { role: "user" as const, content }];
    setMessages(next);
    setSending(true);
    setError(null);
    try {
      const r = await api<{ reply: string; questionsLeft: number }>("/chat", { method: "POST", body: { messages: next } });
      setMessages((ms) => [...ms, { role: "assistant", content: r.reply }]);
      setQuestionsLeft(r.questionsLeft);
      return true;
    } catch (err) {
      // Không trả lời được: bỏ câu hỏi khỏi danh sách, chữ vẫn còn trong ô để gửi lại
      setMessages((ms) => (ms.at(-1) === next.at(-1) ? ms.slice(0, -1) : ms));
      setError(err instanceof Error ? err.message : "Chưa trả lời được, thử lại sau");
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <ChatContext.Provider value={{ open, messages, sending, error, questionsLeft, trendMetal, setTrendMetal, openChat, close: () => setOpen(false), send }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat phải nằm trong ChatProvider");
  return ctx;
}
