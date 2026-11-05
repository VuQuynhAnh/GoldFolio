import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseHandlers, deferred, group, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const brandSelect = () => screen.getByLabelText(/^Thương hiệu/) as HTMLSelectElement;
const ready = () => waitFor(() => expect(brandSelect().value).toBe("1"));
const line = (n: number) => screen.getByRole("region", { name: `Sản phẩm ${n}` });

describe("ô khối lượng và ô tiền", () => {
  // SC: HOLD-UC01-SC38
  it("danh sách khối lượng theo đơn vị; chọn hoặc gõ đều được", async () => {
    mockApi(baseHandlers());
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    const weight = screen.getByLabelText(/^Khối lượng/) as HTMLInputElement;
    expect(weight.value).toBe("0,5");

    await user.click(screen.getByRole("button", { name: "Chọn khối lượng có sẵn" }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(20);
    expect(options[0]!.textContent).toBe("0,5");
    expect(options[19]!.textContent).toBe("10");
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "1,5" }));
    expect(weight.value).toBe("1,5");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Đơn vị/), "luong");
    await user.click(screen.getByRole("button", { name: "Chọn khối lượng có sẵn" }));
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["1", "2", "3", "5", "10"]);

    await user.clear(weight);
    await user.type(weight, "2,3");
    expect(weight.value).toBe("2,3");
  });

  // SC: HOLD-UC01-SC44
  it("đơn giá theo đơn vị đang chọn: gợi ý 13.900.000/chỉ thành 139.000.000/lượng", async () => {
    mockApi({ ...baseHandlers(), "GET /prices/suggest": () => ({ unitPrice: 13_900_000, label: "Giá Phú Quý lúc 14:00 01/11/2026" }) });
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    await waitFor(() => expect((screen.getByLabelText(/^Đơn giá \(VNĐ\/chỉ\)/) as HTMLInputElement).value).toBe("13.900.000"));
    await user.selectOptions(screen.getByLabelText(/^Đơn vị/), "luong");
    const unit = screen.getByLabelText(/^Đơn giá \(VNĐ\/lượng\)/) as HTMLInputElement;
    await waitFor(() => expect(unit.value).toBe("139.000.000"));
    // 0,5 lượng × 139.000.000
    expect((screen.getByLabelText(/^Tổng tiền/) as HTMLInputElement).value).toBe("69.500.000");
  });

  // SC: HOLD-UC01-SC43
  it("ô đơn giá hiện số tiền dạng VNĐ khi gõ", async () => {
    mockApi(baseHandlers());
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    const unit = screen.getByLabelText(/^Đơn giá/) as HTMLInputElement;
    await user.type(unit, "13850000");
    expect(unit.value).toBe("13.850.000");
    expect(screen.getAllByText("VNĐ").length).toBeGreaterThan(0);
    // Tổng tiền tự tính cũng hiện dạng VNĐ: 0,5 chỉ × 13.850.000
    expect((screen.getByLabelText(/^Tổng tiền/) as HTMLInputElement).value).toBe("6.925.000");
  });
});

describe("thêm tài sản nhiều sản phẩm (BR-18)", () => {
  // SC: HOLD-UC01-SC41
  it("vàng và bạc trong một lần thêm: gửi một yêu cầu, mỗi dòng một sản phẩm", async () => {
    const calls = mockApi({ ...baseHandlers(), "POST /purchases/batch": () => ({ purchases: [{ id: 1 }, { id: 2 }] }) });
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    await user.click(screen.getByRole("button", { name: "+ Thêm sản phẩm" }));

    const l1 = within(line(1));
    await user.clear(l1.getByLabelText(/^Khối lượng/));
    await user.type(l1.getByLabelText(/^Khối lượng/), "2");
    await user.type(l1.getByLabelText(/^Đơn giá/), "13850000");

    const l2 = within(line(2));
    await user.selectOptions(l2.getByRole("combobox", { name: /^Sản phẩm/ }), "13");
    await user.selectOptions(l2.getByLabelText(/^Đơn vị/), "luong");
    await user.clear(l2.getByLabelText(/^Khối lượng/));
    await user.type(l2.getByLabelText(/^Khối lượng/), "5");
    await user.type(l2.getByLabelText(/^Tổng tiền/), "8000000");

    await user.click(screen.getByRole("button", { name: "Lưu 2 sản phẩm" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const body = calls.find((c) => c.method === "POST")!.body as { purchaseDate: string; items: unknown[] };
    expect(calls.find((c) => c.method === "POST")!.path).toBe("/purchases/batch");
    expect(body.items).toEqual([
      expect.objectContaining({ productId: 11, weight: "2", weightUnit: "chi", priceMode: "unit", unitPrice: 13_850_000 }),
      expect.objectContaining({ productId: 13, weight: "5", weightUnit: "luong", priceMode: "total", totalPrice: 8_000_000 }),
    ]);
  });

  // SC: HOLD-UC01-SC42
  it("lỗi của dòng 2 hiện trong ô của dòng 2", async () => {
    mockApi({
      ...baseHandlers(),
      "POST /purchases/batch": async () => {
        const { ApiError } = await vi.importActual<typeof import("../src/api")>("../src/api");
        throw new ApiError(400, "Khối lượng phải lớn hơn 0", { "items.1.weight": "Khối lượng phải lớn hơn 0" });
      },
    });
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    await user.click(screen.getByRole("button", { name: "+ Thêm sản phẩm" }));
    await user.click(screen.getByRole("button", { name: "Lưu 2 sản phẩm" }));
    expect(await within(line(2)).findByText("Khối lượng phải lớn hơn 0")).toBeTruthy();
    expect(within(line(1)).queryByText("Khối lượng phải lớn hơn 0")).toBeNull();
  });

  it("xoá được sản phẩm khi có từ 2 sản phẩm", async () => {
    mockApi(baseHandlers());
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    expect(screen.queryByRole("button", { name: "Xoá sản phẩm 1" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "+ Thêm sản phẩm" }));
    await user.click(screen.getByRole("button", { name: "Xoá sản phẩm 2" }));
    expect(screen.queryByRole("region", { name: "Sản phẩm 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeTruthy();
  });
});

describe("lọc Vàng | Bạc | Tất cả (BR-17)", () => {
  const silverItem = { ...item, id: 7, productId: 13, productName: "Bạc thỏi Phú Quý 999 10 lượng, 5 lượng", metal: "silver" as const };
  const portfolio = {
    summary: { totalCost: 40_000_000, value: 41_000_000, pnl: 1_000_000, pct: 2.5, excludedCount: 0, priceTime: null },
    groups: [
      group("gold", { totalCost: 30_000_000, value: 31_500_000, pnl: 1_500_000, pct: 5 }),
      group("silver", { totalCost: 10_000_000, value: 9_500_000, pnl: -500_000, pct: -5 }),
    ],
    items: [item, silverItem],
  };

  // SC: HOLD-UC01-SC40
  it("mặc định Vàng; chọn Bạc giữ nguyên khi chuyển tab; Tất cả thấy cả hai", async () => {
    mockApi(baseHandlers(portfolio));
    const user = userEvent.setup();
    renderAt("/");
    expect(await screen.findByText("Giá trị vàng")).toBeTruthy();
    expect(screen.getByText("31.500.000")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Bạc" }));
    expect(screen.getByText("Giá trị bạc")).toBeTruthy();
    expect(screen.getByText("9.500.000")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Lần mua" }));
    expect(await screen.findByRole("heading", { name: "Lần mua" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bạc" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Bạc thỏi Phú Quý 999 10 lượng, 5 lượng")).toBeTruthy();
    expect(screen.queryByText("Nhẫn tròn Phú Quý 999.9")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(screen.getByText("Nhẫn tròn Phú Quý 999.9")).toBeTruthy();
    expect(screen.getByText("Bạc thỏi Phú Quý 999 10 lượng, 5 lượng")).toBeTruthy();
  });

  it("kim loại chưa có lần mua thì báo chưa có tài sản", async () => {
    mockApi(baseHandlers({ ...portfolio, groups: [portfolio.groups[0]!], items: [item] }));
    const user = userEvent.setup();
    renderAt("/");
    await screen.findByText("Giá trị vàng");
    await user.click(screen.getByRole("button", { name: "Bạc" }));
    expect(screen.getByText("Chưa có tài sản bạc")).toBeTruthy();
  });
});

describe("form gọn và giá hiện tại", () => {
  // SC: HOLD-UC01-SC47
  it("giờ mua ẩn sau nút: ngày mua đứng một hàng, bấm mới hiện ô giờ, bỏ thì gửi null", async () => {
    const calls = mockApi({ ...baseHandlers(), "POST /purchases/batch": () => ({ purchases: [{ id: 1 }] }) });
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    expect(screen.queryByLabelText(/^Giờ mua/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "+ Thêm giờ mua" }));
    await user.type(screen.getByLabelText(/^Giờ mua/), "10:30");
    await user.click(screen.getByRole("button", { name: "Bỏ giờ mua" }));
    expect(screen.queryByLabelText(/^Giờ mua/)).toBeNull();

    await user.type(screen.getByLabelText(/^Đơn giá/), "13850000");
    await user.click(screen.getByRole("button", { name: /^Lưu/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect((calls.find((c) => c.method === "POST")!.body as { purchaseTime: unknown }).purchaseTime).toBeNull();
  });

  it("sửa lần mua đã có giờ thì ô giờ hiện sẵn", async () => {
    mockApi({
      ...baseHandlers(),
      "GET /purchases/5": () => ({
        purchase: { id: 5, productId: 11, brandId: 1, weight: 1, weightUnit: "chi", weightMg: 3750, purchaseDate: "2026-11-01", purchaseTime: "09:15", priceMode: "unit", unitCost: 13_850_000, totalCost: 13_850_000, note: "", priceSource: "manual", priceNote: "" },
      }),
    });
    renderAt("/sua/5");
    await waitFor(() => expect((screen.getByLabelText(/^Giờ mua/) as HTMLInputElement).value).toBe("09:15"));
  });

  // SC: HOLD-UC01-SC48
  it("đang chờ giá gợi ý thì báo Đang lấy giá…; đổi đơn vị quy đổi ngay, không gọi lại", async () => {
    const late = deferred<{ unitPrice: number; label: string }>();
    const calls = mockApi({ ...baseHandlers(), "GET /prices/suggest": () => late.promise });
    const user = userEvent.setup();
    renderAt("/them");
    await ready();
    expect(await screen.findByText("Đang lấy giá…")).toBeTruthy();
    await act(async () => late.resolve({ unitPrice: 13_900_000, label: "Giá Phú Quý lúc 14:00 01/11/2026" }));
    expect(screen.queryByText("Đang lấy giá…")).toBeNull();
    expect((screen.getByLabelText(/^Đơn giá \(VNĐ\/chỉ\)/) as HTMLInputElement).value).toBe("13.900.000");

    const suggestCalls = calls.filter((c) => c.path.startsWith("/prices/suggest")).length;
    await user.selectOptions(screen.getByLabelText(/^Đơn vị/), "luong");
    expect((screen.getByLabelText(/^Đơn giá \(VNĐ\/lượng\)/) as HTMLInputElement).value).toBe("139.000.000");
    expect(calls.filter((c) => c.path.startsWith("/prices/suggest")).length).toBe(suggestCalls);
  });

  // SC: HOLD-UC01-SC46
  it("tổng quan: mỗi sản phẩm hiện giá mua vào, bán ra hiện tại", async () => {
    const product = { productId: 11, productName: "Nhẫn tròn Phú Quý 999.9", brandName: "Phú Quý", count: 1, weightText: "1 chỉ" };
    const gold = group("gold", { totalCost: 13_000_000, value: 13_550_000, pnl: 550_000, pct: 4.23 });
    gold.products = [
      { ...gold, ...product, price: { buy: 13_550_000, sell: 13_850_000, unit: "chi", time: "2026-11-02T02:00:00.000Z" } },
      { ...gold, ...product, productId: 12, productName: "Vàng miếng SJC", excludedCount: 1, price: null },
    ];
    mockApi(baseHandlers({ summary: gold, groups: [gold], items: [item] }));
    renderAt("/");
    const row = (await screen.findByText("Nhẫn tròn Phú Quý 999.9")).closest("li")!;
    expect(row.textContent).toContain("Mua vào 13.550.000 · Bán ra 13.850.000 /chỉ");
    expect(screen.getByText("Vàng miếng SJC").closest("li")!.textContent).not.toContain("Mua vào");
  });
});

describe("bỏ ghi chú", () => {
  // SC: HOLD-UC01-SC49
  it("form không có ô ghi chú; sửa lần mua cũ thì giữ nguyên ghi chú đã có", async () => {
    const calls = mockApi({
      ...baseHandlers(),
      "GET /purchases/5": () => ({
        purchase: { id: 5, productId: 11, brandId: 1, weight: 1, weightUnit: "chi", weightMg: 3750, purchaseDate: "2026-11-01", purchaseTime: null, priceMode: "unit", unitCost: 13_850_000, totalCost: 13_850_000, note: "Mua ở Phú Quý", priceSource: "manual", priceNote: "" },
      }),
      "PUT /purchases/5": () => ({ purchase: { id: 5 } }),
    });
    const user = userEvent.setup();
    renderAt("/sua/5");
    await waitFor(() => expect((screen.getByLabelText(/^Đơn giá/) as HTMLInputElement).value).toBe("13.850.000"));
    expect(screen.queryByLabelText(/^Ghi chú/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Lưu/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")!.body as { note: string }).note).toBe("Mua ở Phú Quý");
  });

  it("danh sách lần mua không hiện ghi chú", async () => {
    mockApi(baseHandlers({ summary: group("gold"), groups: [group("gold")], items: [{ ...item, note: "Mua ở Phú Quý" }] }));
    renderAt("/lan-mua");
    await screen.findByText("Nhẫn tròn Phú Quý 999.9");
    expect(screen.queryByText("Mua ở Phú Quý")).toBeNull();
  });
});
