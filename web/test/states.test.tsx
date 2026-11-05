import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../src/api";
import { baseHandlers, deferred, group, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const withItem = { summary: { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null }, groups: [group("gold")], items: [item] };
const history = (productId: number) => ({
  products: [
    { productId: 11, productName: "Nhẫn tròn Phú Quý 999.9", brandName: "Phú Quý", metal: "gold", totalCost: 2 },
    { productId: 12, productName: "Vàng miếng SJC", brandName: "Phú Quý", metal: "gold", totalCost: 1 },
  ],
  productId,
  priceUnit: "chi",
  points: [{ date: "2026-11-01", unitPrice: 13_000_000, qty: 1, diff: null }],
  today: null,
  avgCost: 13_000_000,
});

describe("tab Lịch sử", () => {
  // SC: HOLD-UC01-SC21
  // Hồi quy: xoá hết lần mua của sản phẩm đang xem thì biểu đồ từng biến mất hẳn
  it("sản phẩm đang xem không còn lần mua thì quay về sản phẩm mặc định", async () => {
    const calls = mockApi({
      ...baseHandlers(withItem),
      "GET /portfolio/history": () => history(11),
      "GET /portfolio/history?productId=12": () => {
        throw new ApiError(404, "Không tìm thấy sản phẩm");
      },
    });
    const user = userEvent.setup();
    renderAt("/lich-su");
    const select = (await screen.findByLabelText("Sản phẩm")) as HTMLSelectElement;
    await user.selectOptions(select, "12");
    await waitFor(() => expect((screen.getByLabelText("Sản phẩm") as HTMLSelectElement).value).toBe("11"));
    const historyCalls = calls.filter((c) => c.path.startsWith("/portfolio/history")).map((c) => c.path);
    expect(historyCalls.slice(-2)).toEqual(["/portfolio/history?productId=12", "/portfolio/history"]);
  });

  it("lỗi mạng thì báo lỗi và cho thử lại, không treo ở Đang tải", async () => {
    let fail = true;
    mockApi({
      ...baseHandlers(withItem),
      "GET /portfolio/history": () => {
        if (fail) throw new Error("Không kết nối được máy chủ");
        return history(11);
      },
    });
    const user = userEvent.setup();
    renderAt("/lich-su");
    expect(await screen.findByText("Không kết nối được máy chủ")).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText("Sản phẩm")).toBeTruthy();
  });
});

describe("tab Tổng quan", () => {
  it("nạp lỗi thì báo lỗi kèm Thử lại", async () => {
    let fail = true;
    mockApi({
      ...baseHandlers(withItem),
      "GET /portfolio": () => {
        if (fail) throw new Error("Không kết nối được máy chủ");
        return withItem;
      },
    });
    const user = userEvent.setup();
    renderAt("/");
    expect(await screen.findByText("Không kết nối được máy chủ")).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Giá trị vàng")).toBeTruthy();
    expect(screen.queryByText("Không kết nối được máy chủ")).toBeNull();
  });
});

describe("trang sửa lần mua", () => {
  // SC: HOLD-UC01-SC22
  it("lần mua không tồn tại hoặc của người khác: báo không tìm thấy, không hiện form", async () => {
    mockApi({
      ...baseHandlers(withItem),
      "GET /purchases/99": () => {
        throw new ApiError(404, "Không tìm thấy lần mua");
      },
    });
    renderAt("/sua/99");
    expect(await screen.findByText("Không tìm thấy lần mua")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá lần mua" })).toBeNull();
    expect(screen.getByRole("link", { name: "Về danh sách lần mua" })).toBeTruthy();
  });

  it("đang nạp lần mua thì chưa bấm Lưu được", async () => {
    const slow = deferred<unknown>();
    mockApi({ ...baseHandlers(withItem), "GET /purchases/5": () => slow.promise });
    renderAt("/sua/5");
    const save = (await screen.findByRole("button", { name: "Lưu" })) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    slow.resolve({
      purchase: { id: 5, productId: 11, brandId: 1, weight: 2, weightUnit: "chi", weightMg: 7500, purchaseDate: "2026-11-01", purchaseTime: null, priceMode: "unit", unitCost: 1, totalCost: 2, note: "" },
    });
    await waitFor(() => expect(save.disabled).toBe(false));
  });
});
