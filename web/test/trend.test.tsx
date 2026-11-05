import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../src/api";
import { baseHandlers, deferred, group, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const portfolio = { summary: group("gold"), groups: [group("gold"), group("silver")], items: [item] };
const history = {
  products: [
    { productId: 11, productName: "Nhẫn tròn Phú Quý 999.9", brandName: "Phú Quý", metal: "gold", totalCost: 2 },
    { productId: 13, productName: "Bạc thỏi Phú Quý 999 10 lượng, 5 lượng", brandName: "Phú Quý", metal: "silver", totalCost: 1 },
  ],
  productId: 11,
  priceUnit: "chi",
  points: [{ date: "2026-11-01", unitPrice: 13_000_000, qty: 1, diff: null }],
  today: null,
  avgCost: 13_000_000,
};
const trend = (metal: "gold" | "silver", refreshesLeft = 3) => ({
  trend: {
    metal,
    date: "2026-11-02",
    productId: 11,
    productName: "Nhẫn tròn Phú Quý 999.9",
    priceUnit: "chi",
    stats: { days: 30, firstBuy: 13_400_000, lastBuy: 13_690_000, changePct: 2.16, minBuy: 13_400_000, maxBuy: 13_690_000 },
    analysis: { trend: "up", confidence: "medium", summary: "Giá tăng đều trong 30 ngày.", points: ["Tăng khoảng 2% so với đầu kỳ"], vsCost: "Cao hơn giá vốn bình quân." },
    model: "gemini-3.6-flash",
    createdAt: "2026-11-02T03:00:00.000Z",
    refreshesLeft,
  },
});

/** Mở khung chat từ Tổng quan; nhận định xu hướng nằm đầu khung chat */
async function openChat(user: ReturnType<typeof userEvent.setup>) {
  renderAt("/");
  await user.click(await screen.findByRole("button", { name: "Hỏi AI" }));
  return within(screen.getByRole("dialog", { name: "Hỏi AI" }));
}

describe("AI nhận định xu hướng trong khung chat (PRICE-UC02)", () => {
  // SC: PRICE-UC02-SC7
  it("đầu khung chat có nhận định: xu hướng, số liệu 30 ngày do server tính, lời nhắc tham khảo", async () => {
    mockApi({ ...baseHandlers(portfolio), "GET /trends": () => trend("gold") });
    const chat = await openChat(userEvent.setup());
    expect(await chat.findByText("Xu hướng tăng")).toBeTruthy();
    expect(chat.getByText("Giá tăng đều trong 30 ngày.")).toBeTruthy();
    expect(chat.getByText(/30 ngày: mua vào 13\.400\.000 → 13\.690\.000\/chỉ/)).toBeTruthy();
    expect(chat.getByText("+2,16%")).toBeTruthy();
    expect(chat.getByText("Cao hơn giá vốn bình quân.")).toBeTruthy();
    expect(chat.getAllByText(/Nhận định tham khảo, không phải lời khuyên đầu tư/).length).toBeGreaterThan(0);
  });

  it("tab Biểu đồ chỉ còn biểu đồ, không còn thẻ nhận định", async () => {
    mockApi({ ...baseHandlers(portfolio), "GET /portfolio/history": () => history, "GET /trends": () => trend("gold") });
    renderAt("/bieu-do");
    expect(await screen.findByLabelText("Sản phẩm")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Nhận định xu hướng" })).toBeNull();
  });

  // SC: PRICE-UC02-SC8
  it("Phân tích lại: báo đang phân tích, cập nhật số lượt còn lại", async () => {
    const late = deferred<ReturnType<typeof trend>>();
    const calls = mockApi({ ...baseHandlers(portfolio), "GET /trends": () => trend("gold"), "POST /trends/refresh": () => late.promise });
    const user = userEvent.setup();
    const chat = await openChat(user);
    await user.click(await chat.findByRole("button", { name: "Phân tích lại (còn 3 lần)" }));
    expect(chat.getByText("Đang phân tích…")).toBeTruthy();
    expect(calls.find((c) => c.path === "/trends/refresh")?.body).toEqual({ metal: "gold" });
    late.resolve(trend("gold", 2));
    expect(await chat.findByRole("button", { name: "Phân tích lại (còn 2 lần)" })).toBeTruthy();
  });

  // SC: PRICE-UC02-SC9
  it("đang tải giá 30 ngày: báo đang tải (không phải lỗi) và tự thử lại", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let loading = true;
    mockApi({
      ...baseHandlers(portfolio),
      "GET /trends": () => {
        if (loading) throw new ApiError(409, "Đang tải giá 30 ngày gần nhất, đợi khoảng 1 phút", { trend: "loading" });
        return trend("gold");
      },
    });
    const chat = await openChat(userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
    expect(await chat.findByText("Đang tải giá 30 ngày gần nhất, đợi khoảng 1 phút")).toBeTruthy();
    expect(chat.queryByRole("alert")).toBeNull();
    loading = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await chat.findByText("Xu hướng tăng")).toBeTruthy();
    vi.useRealTimers();
  });

  it("chuyển Vàng | Bạc ngay trong khung chat; lỗi thì báo kèm Thử lại, chat vẫn dùng được", async () => {
    let fail = true;
    const calls = mockApi({
      ...baseHandlers(portfolio),
      "GET /trends": () => {
        if (fail) throw new ApiError(409, "Nguồn giá chưa có đủ số liệu để nhận định (cần ít nhất 5 ngày)");
        return trend("silver");
      },
    });
    const user = userEvent.setup();
    const chat = await openChat(user);
    expect(await chat.findByText("Nguồn giá chưa có đủ số liệu để nhận định (cần ít nhất 5 ngày)")).toBeTruthy();
    expect(chat.getByRole("textbox", { name: "Câu hỏi" })).toBeTruthy();
    fail = false;
    await user.click(chat.getByRole("button", { name: "Bạc" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/trends?metal=silver")).toBe(true));
    expect(await chat.findByText("Xu hướng tăng")).toBeTruthy();
  });
});
