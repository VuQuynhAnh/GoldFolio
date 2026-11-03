import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { usePortfolio } from "../portfolio-context";
import { BottomNav } from "./BottomNav";

/**
 * Khung 3 tab: header gọn, nội dung cuộn, thanh tab cố định đáy và nút "+" nổi trong
 * tầm ngón cái (R-UI-03). Màn rộng thì nội dung căn giữa, vẫn giữ bố cục điện thoại.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { portfolio } = usePortfolio();
  // Danh mục rỗng đã có nút "Thêm lần mua" to ở giữa trang (BR-11), không cần nút nổi
  const showFab = !!portfolio && portfolio.items.length > 0;

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-stone-50">
      <header className="safe-top sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="flex h-12 items-center justify-between px-4">
          <span className="font-semibold text-gold-700">GoldFolio</span>
          <button onClick={() => void logout()} className="min-h-11 px-2 text-sm text-stone-500" title={user?.email}>
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
          aria-label="Thêm lần mua"
          className="fixed bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1rem)] right-[max(1rem,calc(50vw-14rem+1rem))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gold-500 text-3xl leading-none text-white shadow-lg active:bg-gold-700"
        >
          +
        </Link>
      )}
      <BottomNav />
    </div>
  );
}
