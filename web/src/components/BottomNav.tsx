import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

// Icon nét đơn giản, vẽ tay để khỏi thêm thư viện icon
const icons = {
  overview: "M4 13h4v7H4zM10 9h4v11h-4zM16 4h4v16h-4z",
  history: "M3 17l5-5 4 4 8-8M15 8h5v5",
  purchases: "M5 6h14M5 12h14M5 18h9",
};

const tabs = [
  { to: "/", end: true, label: "Tổng quan", icon: icons.overview },
  { to: "/bieu-do", end: false, label: "Biểu đồ", icon: icons.history },
  { to: "/chi-tiet", end: false, label: "Chi tiết", icon: icons.purchases },
];

/** Thanh 3 tab cố định đáy, có nhãn chữ, mỗi tab cao ≥ 44px (R-UI-03). */
export function BottomNav() {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-surface"
    >
      <div className="grid h-[var(--spacing-tabbar)] grid-cols-3">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn("flex flex-col items-center justify-center gap-0.5 text-xs", isActive ? "font-medium text-gold" : "text-muted")
            }
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
