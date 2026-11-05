import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseHandlers, deferred, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

const suggestion = { unitPrice: 13_900_000, label: "Giá Phú Quý lúc 14:00 01/11/2026" };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const brandSelect = () => screen.getByLabelText(/^Thương hiệu/) as HTMLSelectElement;
const productSelect = () => screen.getByRole("combobox", { name: /^Sản phẩm/ }) as HTMLSelectElement;
const unitInput = () => screen.getByLabelText(/^Đơn giá/) as HTMLInputElement;

describe("trang thêm tài sản", () => {
  // SC: HOLD-UC01-SC1
  it("mặc định thương hiệu Phú Quý, danh sách là sản phẩm Phú Quý", async () => {
    mockApi(baseHandlers());
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    expect([...productSelect().options].map((o) => o.text)).toContain("Nhẫn tròn Phú Quý 999.9");
    // Mặc định nhẫn tròn, 0,5 chỉ (BR-1, BR-3)
    expect(productSelect().value).toBe("11");
    expect((screen.getByLabelText(/^Khối lượng/) as HTMLInputElement).value).toBe("0,5");
    expect((screen.getByLabelText(/^Đơn vị/) as HTMLSelectElement).value).toBe("chi");
  });

  // SC: HOLD-UC01-SC9
  it("đổi thương hiệu thì sản phẩm về mặc định của thương hiệu mới (không có thì trống)", async () => {
    mockApi({ ...baseHandlers(), "GET /prices/suggest": () => suggestion });
    const user = userEvent.setup();
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    await user.selectOptions(productSelect(), "11");
    await user.selectOptions(brandSelect(), "2");
    expect(productSelect().value).toBe("");
    expect([...productSelect().options].map((o) => o.text)).toContain("Kim Gia Bảo 24K");
  });

  // SC: HOLD-UC01-SC13
  it("giá đã sửa tay không bị gợi ý ghi đè khi đổi giờ mua", async () => {
    mockApi({ ...baseHandlers(), "GET /prices/suggest": () => suggestion });
    const user = userEvent.setup();
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    await user.selectOptions(productSelect(), "11");
    await waitFor(() => expect(unitInput().value).toBe("13.900.000"));
    expect(screen.getByText("Giá Phú Quý lúc 14:00 01/11/2026")).toBeTruthy();

    await user.clear(unitInput());
    await user.type(unitInput(), "13700000");
    await user.click(screen.getByRole("button", { name: "+ Thêm giờ mua" }));
    await user.type(screen.getByLabelText(/^Giờ mua/), "10:30");
    await waitFor(() => expect(unitInput().value).toBe("13.700.000"));
  });

  // Hồi quy: gõ giá trong lúc chờ gợi ý thì gợi ý về muộn từng ghi đè số vừa gõ (R-UI-02)
  it("gõ giá trong lúc chờ gợi ý: gợi ý về muộn không ghi đè", async () => {
    const late = deferred<typeof suggestion>();
    mockApi({ ...baseHandlers(), "GET /prices/suggest": () => late.promise });
    const user = userEvent.setup();
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    await user.selectOptions(productSelect(), "11");
    await user.type(unitInput(), "13700000");
    await act(async () => late.resolve(suggestion));
    expect(unitInput().value).toBe("13.700.000");
  });

  it("lưu xong quay về danh sách lần mua", async () => {
    const calls = mockApi({
      ...baseHandlers(),
      "GET /prices/suggest": () => suggestion,
      "POST /purchases/batch": () => ({ purchases: [{ id: 9 }] }),
    });
    const user = userEvent.setup();
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    await user.selectOptions(productSelect(), "11");
    await user.clear(screen.getByLabelText(/^Khối lượng/));
    await user.type(screen.getByLabelText(/^Khối lượng/), "2");
    await waitFor(() => expect(unitInput().value).toBe("13.900.000"));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Lần mua" })).toBeTruthy());
    const body = calls.find((c) => c.method === "POST")?.body as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ productId: 11, weight: "2", weightUnit: "chi", unitPrice: 13_900_000 });
  });

  it("lỗi từ server hiện dưới đúng ô", async () => {
    mockApi({
      ...baseHandlers(),
      "GET /prices/suggest": () => suggestion,
      "POST /purchases/batch": async () => {
        const { ApiError } = await vi.importActual<typeof import("../src/api")>("../src/api");
        throw new ApiError(400, "Khối lượng phải lớn hơn 0", { "items.0.weight": "Khối lượng phải lớn hơn 0" });
      },
    });
    const user = userEvent.setup();
    renderAt("/them");
    await waitFor(() => expect(brandSelect().value).toBe("1"));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Khối lượng phải lớn hơn 0")).toBeTruthy();
  });
});

describe("trang sửa lần mua", () => {
  const purchase = {
    id: 5,
    productId: 11,
    brandId: 1,
    weight: 3,
    weightUnit: "chi",
    weightMg: 11250,
    purchaseDate: "2026-11-01",
    purchaseTime: null,
    priceMode: "total",
    unitCost: 13_666_667,
    totalCost: 41_000_000,
    note: "",
  };

  // SC: HOLD-UC01-SC24, HOLD-UC01-SC20
  it("nạp lần mua, không gợi ý lại giá, đổi khối lượng thì giữ số đã nhập", async () => {
    const calls = mockApi({
      ...baseHandlers({ summary: { totalCost: 0, value: 0, pnl: 0, pct: 0, excludedCount: 0, priceTime: null }, groups: [], items: [item] }),
      "GET /purchases/5": () => ({ purchase }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    const weight = (await screen.findByDisplayValue("3")) as HTMLInputElement;
    expect((screen.getByLabelText(/^Tổng tiền/) as HTMLInputElement).value).toBe("41.000.000");
    await user.clear(weight);
    await user.type(weight, "4");
    expect((screen.getByLabelText(/^Tổng tiền/) as HTMLInputElement).value).toBe("41.000.000");
    expect(unitInput().value).toBe("10.250.000");
    expect(calls.some((c) => c.path.startsWith("/prices/suggest"))).toBe(false);
  });

  // SC: HOLD-UC01-SC21
  it("xoá phải xác nhận: Huỷ thì giữ, xác nhận thì gọi DELETE", async () => {
    const calls = mockApi({
      ...baseHandlers(),
      "GET /purchases/5": () => ({ purchase }),
      "DELETE /purchases/5": () => ({ ok: true }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    await screen.findByDisplayValue("3");
    await user.click(screen.getByRole("button", { name: "Xoá lần mua" }));
    expect(screen.getByText("Xoá lần mua này? Không thể hoàn tác.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.queryByText("Xoá lần mua này? Không thể hoàn tác.")).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Xoá lần mua" }));
    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/purchases/5")).toBe(true));
  });
});
