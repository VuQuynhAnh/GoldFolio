import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../src/auth";
import { AppRoutes } from "../src/App";
import { api } from "../src/api";
import type { Brand, Portfolio, PortfolioItem } from "../src/api";

type Handler = (init?: { method?: string; body?: unknown }) => unknown | Promise<unknown>;

/**
 * Giả lập API theo "METHOD /đường-dẫn" (bỏ query cho khớp, trừ khi khai báo kèm query).
 * Trả về danh sách lời gọi để test kiểm tra.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.mocked(api).mockImplementation(async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, path, body: init.body });
    const exact = handlers[`${method} ${path}`];
    const loose = handlers[`${method} ${path.split("?")[0]}`];
    const h = exact ?? loose;
    if (!h) throw new Error(`Chưa giả lập ${method} ${path}`);
    return (await h(init)) as never;
  });
  return calls;
}

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

export const brands: Brand[] = [
  {
    id: 1,
    code: "phuquy",
    name: "Phú Quý",
    isDefault: true,
    hasSource: true,
    products: [
      { id: 11, name: "Nhẫn tròn Phú Quý 999.9", metal: "gold", priceUnit: "chi" },
      { id: 12, name: "Vàng miếng SJC", metal: "gold", priceUnit: "chi" },
    ],
  },
  {
    id: 2,
    code: "btmh",
    name: "Bảo Tín Mạnh Hải",
    isDefault: false,
    hasSource: false,
    products: [{ id: 21, name: "Kim Gia Bảo 24K", metal: "gold", priceUnit: "chi" }],
  },
];

const zero = { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null };

export const emptyPortfolio: Portfolio = { summary: zero, groups: [], items: [] };

export const item: PortfolioItem = {
  id: 5,
  productId: 11,
  productName: "Nhẫn tròn Phú Quý 999.9",
  brandName: "Phú Quý",
  metal: "gold",
  priceUnit: "chi",
  weightText: "2 chỉ",
  purchaseDate: "2026-11-01",
  purchaseTime: null,
  unitCost: 13_850_000,
  totalCost: 27_700_000,
  note: "",
  priceSource: "manual",
  priceNote: "",
  current: { buyPrice: 13_550_000, value: 27_100_000, pnl: -600_000, pct: -2.17, priceTime: "2026-11-02T10:26:00.000Z" },
};

/** API tối thiểu của một người dùng đã đăng nhập. */
export function baseHandlers(portfolio: Portfolio = emptyPortfolio): Record<string, Handler> {
  return {
    "GET /auth/me": () => ({ user: { id: 1, email: "a@example.com" } }),
    "GET /portfolio": () => portfolio,
    "GET /brands": () => ({ brands }),
    "GET /portfolio/history": () => ({ products: [], productId: null, priceUnit: null, points: [], today: null, avgCost: null }),
  };
}

/** Promise mở bằng tay, để giả lập phản hồi API về muộn. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
