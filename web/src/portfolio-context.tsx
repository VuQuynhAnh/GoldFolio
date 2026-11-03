import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Brand, type Portfolio } from "./api";

interface PortfolioState {
  portfolio: Portfolio | null;
  brands: Brand[];
  error: string | null;
  /** Nạp lại sau khi thêm/sửa/xoá để cả 3 tab thấy số mới */
  reload(): Promise<void>;
}

const PortfolioContext = createContext<PortfolioState | null>(null);

/** Dữ liệu danh mục + thương hiệu dùng chung cho các tab và trang form. */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [pf, br] = await Promise.all([api<Portfolio>("/portfolio"), api<{ brands: Brand[] }>("/brands")]);
      setPortfolio(pf);
      setBrands(br.brands);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <PortfolioContext.Provider value={{ portfolio, brands, error, reload }}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio phải nằm trong PortfolioProvider");
  return ctx;
}
