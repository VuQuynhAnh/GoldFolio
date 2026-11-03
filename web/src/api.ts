import type { PriceUnit, WeightUnit } from "@goldfolio/shared";

/** Lỗi từ server: thông báo tiếng Việt + lỗi theo từng ô của form. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Có lỗi xảy ra, vui lòng thử lại", data.fields ?? {});
  return data as T;
}

export interface User {
  id: number;
  email: string;
}

export interface Product {
  id: number;
  name: string;
  metal: "gold" | "silver";
  priceUnit: PriceUnit;
}

export interface Brand {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
  hasSource: boolean;
  products: Product[];
}

export interface Totals {
  totalCost: number;
  value: number;
  pnl: number;
  pct: number;
  excludedCount: number;
  priceTime: string | null;
}

export interface PortfolioItem {
  id: number;
  productId: number;
  productName: string;
  brandName: string;
  metal: "gold" | "silver";
  priceUnit: PriceUnit;
  weightText: string;
  purchaseDate: string;
  purchaseTime: string | null;
  unitCost: number;
  totalCost: number;
  note: string;
  current: { buyPrice: number; value: number; pnl: number; pct: number; priceTime: string } | null;
}

export interface Portfolio {
  summary: Totals;
  groups: (Totals & {
    metal: "gold" | "silver";
    label: string;
    weightText: string;
    products: (Totals & { productId: number; productName: string; brandName: string; count: number; weightText: string })[];
  })[];
  items: PortfolioItem[];
}

export interface Purchase {
  id: number;
  productId: number;
  brandId: number;
  weight: number;
  weightUnit: WeightUnit;
  purchaseDate: string;
  purchaseTime: string | null;
  priceMode: "unit" | "total";
  unitCost: number;
  totalCost: number;
  note: string;
}

export interface History {
  products: { productId: number; productName: string; brandName: string; totalCost: number }[];
  productId: number | null;
  priceUnit: PriceUnit | null;
  points: { date: string; unitPrice: number; qty: number; diff: number | null }[];
  today: { date: string; buyPrice: number; priceTime: string } | null;
  avgCost: number | null;
}
