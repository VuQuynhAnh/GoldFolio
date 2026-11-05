import { cn } from "@/lib/utils";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { usePortfolio } from "../portfolio-context";
import { BottomNav } from "./BottomNav";
import { ChatSheet } from "./ChatSheet";
import { useChat } from "../chat-context";

/**
 * Khung 3 tab: header gọn, nội dung cuộn, thanh tab cố định đáy và nút "+" nổi trong
 * tầm ngón cái (R-UI-03). Màn rộng thì nội dung căn giữa, vẫn giữ bố cục điện thoại.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { portfolio } = usePortfolio();
  const { openChat } = useChat();
  // Danh mục rỗng đã có nút "Thêm tài sản" to ở giữa trang (BR-11), không cần nút nổi
  const showFab = !!portfolio && portfolio.items.length > 0;

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-bg">
      <header className="safe-top sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex h-12 items-center justify-between px-4">
          <span className="font-semibold text-gold">GoldFolio</span>
          <button onClick={() => void logout()} className="min-h-11 px-2 text-sm text-muted" title={user?.email}>
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="px-4 pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+5rem)] pt-4">
        <Outlet />
      </main>

      {showFab && (
        <Link
          to="/them"
          aria-label="Thêm tài sản"
          className="fixed bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1rem)] right-[max(1rem,calc(50vw-14rem+1rem))] z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gold text-2xl leading-none text-bg shadow-lg active:bg-gold-deep"
        >
          +
        </Link>
      )}
      {/* Nút hỏi AI (PRICE-UC03): cùng cỡ 48px với nút "+" (user chốt), đứng ngay trên; không có nút "+" thì đứng chỗ của nó */}
      <button
        type="button"
        aria-label="Hỏi AI"
        onClick={() => openChat()}
        className={cn(
          "fixed right-[max(1rem,calc(50vw-14rem+1rem))] z-20 flex h-12 w-12 items-center justify-center rounded-full border border-gold/60 bg-surface-2 text-gold shadow-lg active:bg-surface",
          showFab
            ? "bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+4.75rem)]"
            : "bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1rem)]",
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
      </button>
      <ChatSheet />
      <BottomNav />
    </div>
  );
}
