import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseHandlers, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const autoItem = { ...item, priceSource: "auto" as const, priceNote: "Giá Phú Quý ngày 15/01/2025" };
const portfolio = { summary: { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null }, groups: [], items: [autoItem] };
const autoPurchase = {
  id: 5,
  productId: 11,
  brandId: 1,
  weight: 2,
  weightUnit: "chi",
  weightMg: 7500,
  purchaseDate: "2025-01-15",
  purchaseTime: null,
  priceMode: "unit",
  unitCost: 8_610_000,
  totalCost: 17_220_000,
  note: "",
  priceSource: "auto",
  priceNote: "Giá Phú Quý ngày 15/01/2025",
};

describe("giá tự lấy (BR-16)", () => {
  // SC: HOLD-UC01-SC34
  it("thẻ lần mua hiện nhãn giá tự lấy", async () => {
    mockApi(baseHandlers(portfolio));
    renderAt("/chi-tiet");
    expect(await screen.findByText("Tự lấy · Giá Phú Quý ngày 15/01/2025")).toBeTruthy();
  });

  it("form thêm ghi rõ có thể để trống giá", async () => {
    mockApi(baseHandlers());
    renderAt("/them");
    expect(await screen.findByText("Để trống để tự lấy giá ngày mua")).toBeTruthy();
  });

  // SC: HOLD-UC01-SC37
  it("sửa lần mua giá tự lấy: hiện nhãn, ô giá điền sẵn số đã lưu; bấm Lưu thì gửi giá đó (thành người dùng nhập)", async () => {
    const calls = mockApi({
      ...baseHandlers(portfolio),
      "GET /purchases/5": () => ({ purchase: autoPurchase }),
      "PUT /purchases/5": () => ({ purchase: { ...autoPurchase, priceSource: "manual", priceNote: "" } }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    expect(await screen.findByText("Giá tự lấy · Giá Phú Quý ngày 15/01/2025")).toBeTruthy();
    const unit = screen.getByLabelText(/^Đơn giá/) as HTMLInputElement;
    expect(unit.value).toBe("8.610.000");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ unitPrice: 8_610_000 }));
  });

  it("sửa lần mua giá tự lấy, gõ giá khác thì bỏ nhãn tự lấy và gửi giá mới", async () => {
    const calls = mockApi({
      ...baseHandlers(portfolio),
      "GET /purchases/5": () => ({ purchase: autoPurchase }),
      "PUT /purchases/5": () => ({ purchase: { ...autoPurchase, priceSource: "manual", priceNote: "" } }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    const unit = (await screen.findByDisplayValue("8.610.000")) as HTMLInputElement;
    await user.clear(unit);
    await user.type(unit, "13700000");
    expect(screen.queryByText("Giá tự lấy · Giá Phú Quý ngày 15/01/2025")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ unitPrice: 13_700_000 }));
  });

  it("sửa lần mua mà xoá trống ô giá: gửi giá trống để server lấy lại", async () => {
    const calls = mockApi({
      ...baseHandlers(portfolio),
      "GET /purchases/5": () => ({ purchase: autoPurchase }),
      "PUT /purchases/5": () => ({ purchase: autoPurchase }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    const weight = (await screen.findByDisplayValue("2")) as HTMLInputElement;
    await user.clear(weight);
    await user.type(weight, "3");
    await user.clear(screen.getByLabelText(/^Đơn giá/));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const body = calls.find((c) => c.method === "PUT")!.body as Record<string, unknown>;
    expect(body.unitPrice).toBeUndefined();
    expect(body.totalPrice).toBeUndefined();
  });
});
