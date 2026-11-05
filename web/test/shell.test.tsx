import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseHandlers, group, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("tổng quan", () => {
  // SC: HOLD-UC01-SC19
  it("danh mục rỗng", async () => {
    mockApi(baseHandlers());
    renderAt("/");
    expect(await screen.findByText("Bạn chưa có lần mua nào")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Thêm tài sản" })).toBeTruthy();
  });

  // SC: HOLD-UC01-SC17
  it("lần mua chưa có giá được ghi ngay dưới số tổng", async () => {
    mockApi(
      baseHandlers({
        summary: { totalCost: 27_700_000, value: 27_100_000, pnl: -600_000, pct: -2.17, excludedCount: 1, priceTime: "2026-11-02T10:26:00.000Z" },
        groups: [group("gold", { totalCost: 27_700_000, value: 27_100_000, pnl: -600_000, pct: -2.17, excludedCount: 1, priceTime: "2026-11-02T10:26:00.000Z" })],
        items: [item, { ...item, id: 6, current: null }],
      }),
    );
    renderAt("/");
    expect(await screen.findByText("Không gồm 1 lần mua chưa có giá")).toBeTruthy();
    expect(screen.getByText("27.100.000")).toBeTruthy();
  });
});

describe("thanh tab và nút thêm", () => {
  it("3 tab chuyển đúng màn hình; nút + mở trang thêm", async () => {
    mockApi(baseHandlers({ summary: { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null }, groups: [], items: [item] }));
    const user = userEvent.setup();
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(nav.querySelectorAll("a")).toHaveLength(3);

    await user.click(screen.getByRole("link", { name: "Chi tiết" }));
    expect(await screen.findByRole("heading", { name: "Chi tiết" })).toBeTruthy();
    expect(screen.getByText("Nhẫn tròn Phú Quý 999.9")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Biểu đồ" }));
    expect(await screen.findByRole("heading", { name: "Biểu đồ giá" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Thêm tài sản" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Thêm tài sản" })).toBeTruthy());
    // Trang form toàn màn hình: không còn thanh tab
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
  });

  it("chạm vào một lần mua mở trang sửa", async () => {
    mockApi({
      ...baseHandlers({ summary: { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null }, groups: [], items: [item] }),
      "GET /purchases/5": () => ({
        purchase: { id: 5, productId: 11, brandId: 1, weight: 2, weightUnit: "chi", weightMg: 7500, purchaseDate: "2026-11-01", purchaseTime: null, priceMode: "unit", unitCost: 13_850_000, totalCost: 27_700_000, note: "" },
      }),
    });
    const user = userEvent.setup();
    renderAt("/chi-tiet");
    await user.click(await screen.findByRole("link", { name: /Nhẫn tròn Phú Quý 999.9/ }));
    expect(await screen.findByRole("heading", { name: "Sửa lần mua" })).toBeTruthy();
  });
});
