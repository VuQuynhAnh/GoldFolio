import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { PortfolioProvider } from "./portfolio-context";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { HistoryPage } from "./pages/HistoryPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { PurchaseFormPage } from "./pages/PurchaseFormPage";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-muted">Đang tải…</div>;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return (
    <PortfolioProvider>
      <Outlet />
    </PortfolioProvider>
  );
}

/**
 * 3 tab (Tổng quan / Lịch sử / Lần mua) nằm trong AppShell có thanh tab dưới;
 * form thêm/sửa là trang riêng toàn màn hình, nên nút back của điện thoại quay về tab trước.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage mode="login" />} />
      <Route path="/dang-ky" element={<LoginPage mode="register" />} />
      <Route element={<Protected />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="lich-su" element={<HistoryPage />} />
          <Route path="lan-mua" element={<PurchasesPage />} />
        </Route>
        <Route path="them" element={<PurchaseFormPage />} />
        <Route path="sua/:id" element={<PurchaseFormPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
