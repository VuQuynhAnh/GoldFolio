import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Portfolio } from "../src/api";
import { baseHandlers, deferred, group, item, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const ringProduct = {
  productId: 11,
  productName: "Nhẫn tròn Phú Quý 999.9",
  brandName: "Phú Quý",
  count: 3,
  weightText: "1,5 chỉ",
  price: { buy: 13_900_000, sell: 14_200_000, unit: "chi" as const, time: "2026-11-05T09:59:00.000Z" },
};
const silverProduct = {
  productId: 13,
  productName: "Bạc miếng Phú Quý 999 1 lượng",
  brandName: "Phú Quý",
  count: 1,
  weightText: "2 lượng",
  price: { buy: 1_598_000, sell: 1_647_000, unit: "luong" as const, time: "2026-11-05T09:59:00.000Z" },
};
const gold = group("gold", { totalCost: 21_215_000, value: 20_850_000, pnl: -365_000, pct: -1.72 });
gold.products = [{ ...gold, ...ringProduct }];
const silver = group("silver", { totalCost: 2_872_000, value: 3_196_000, pnl: 324_000, pct: 11.28 });
silver.products = [{ ...silver, ...silverProduct }];
const silverItem = { ...item, id: 7, productId: 13, productName: silverProduct.productName, metal: "silver" as const, priceUnit: "luong" as const };
const portfolio: Portfolio = { summary: gold, groups: [gold, silver], items: [item, silverItem] };

const trend = {
  trend: {
    metal: "gold",
    date: "2026-11-05",
    productId: 11,
    productName: "Nhẫn tròn Phú Quý 999.9",
    priceUnit: "chi",
    stats: { days: 30, firstBuy: 13_400_000, lastBuy: 13_900_000, changePct: 3.73, minBuy: 13_400_000, maxBuy: 13_900_000 },
    analysis: { trend: "up", confidence: "medium", summary: "Giá vàng tăng đều trong 30 ngày.", points: [], vsCost: null },
    model: "gemini",
    createdAt: "2026-11-05T03:00:00.000Z",
    refreshesLeft: 3,
  },
};

describe("chat hỏi AI (PRICE-UC03)", () => {
  // SC: PRICE-UC03-SC4
  it("nút chat nổi mở khung chat; hỏi thì gửi lịch sử, hiện câu trả lời và số câu còn lại", async () => {
    const reply = deferred<{ reply: string; questionsLeft: number }>();
    const calls = mockApi({ ...baseHandlers(portfolio), "POST /chat": () => reply.promise });
    const user = userEvent.setup();
    renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Hỏi AI" }));
    const sheet = screen.getByRole("dialog", { name: "Hỏi AI" });
    expect(within(sheet).getByText("Còn 20 câu hôm nay")).toBeTruthy();
    expect(within(sheet).getByText(/không phải lời khuyên đầu tư/)).toBeTruthy();

    await user.type(within(sheet).getByRole("textbox", { name: "Câu hỏi" }), "Vàng của tôi đang lỗ vì sao?");
    await user.click(within(sheet).getByRole("button", { name: "Gửi" }));
    expect(within(sheet).getByText("Vàng của tôi đang lỗ vì sao?")).toBeTruthy();
    expect(within(sheet).getByText("AI đang trả lời…")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ messages: [{ role: "user", content: "Vàng của tôi đang lỗ vì sao?" }] });

    reply.resolve({ reply: "Giá mua vào thấp hơn giá vốn bình quân của bạn.", questionsLeft: 19 });
    expect(await within(sheet).findByText("Giá mua vào thấp hơn giá vốn bình quân của bạn.")).toBeTruthy();
    expect(within(sheet).getByText("Còn 19 câu hôm nay")).toBeTruthy();
    expect((within(sheet).getByRole("textbox", { name: "Câu hỏi" }) as HTMLTextAreaElement).value).toBe("");
  });

  // SC: PRICE-UC03-SC5
  it("chạm % lãi/lỗ của sản phẩm: bong bóng nhận định; Hỏi thêm mở chat có sẵn nhận định", async () => {
    const calls = mockApi({ ...baseHandlers(portfolio), "GET /trends": () => trend, "POST /chat": () => ({ reply: "Vì giá giảm.", questionsLeft: 19 }) });
    const user = userEvent.setup();
    renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Nhận định AI: Nhẫn tròn Phú Quý 999.9" }));
    const pop = await screen.findByRole("dialog", { name: "Nhận định vàng" });
    expect(await within(pop).findByText("Xu hướng tăng")).toBeTruthy();
    expect(within(pop).getByText("Giá vàng tăng đều trong 30 ngày.")).toBeTruthy();
    expect(calls.some((c) => c.path === "/trends?metal=gold")).toBe(true);

    await user.click(within(pop).getByRole("button", { name: "Hỏi thêm" }));
    const sheet = screen.getByRole("dialog", { name: "Hỏi AI" });
    expect(within(sheet).getByText("Nhận định vàng hôm nay: Giá vàng tăng đều trong 30 ngày.")).toBeTruthy();
    await user.type(within(sheet).getByRole("textbox", { name: "Câu hỏi" }), "Có nên chờ thêm?");
    await user.click(within(sheet).getByRole("button", { name: "Gửi" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        messages: [
          { role: "assistant", content: "Nhận định vàng hôm nay: Giá vàng tăng đều trong 30 ngày." },
          { role: "user", content: "Có nên chờ thêm?" },
        ],
      }),
    );
  });
});

describe("Tổng quan → Chi tiết", () => {
  // SC: HOLD-UC01-SC57
  it("chạm thẻ Bạc thì sang Chi tiết lọc Bạc", async () => {
    mockApi(baseHandlers(portfolio));
    const user = userEvent.setup();
    renderAt("/");
    await user.click(await screen.findByRole("link", { name: /Xem chi tiết bạc/ }));
    expect(await screen.findByRole("heading", { name: "Chi tiết" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bạc" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Bạc miếng Phú Quý 999 1 lượng", { selector: "li *" })).toBeTruthy();
  });

  // SC: HOLD-UC01-SC58
  it("Chi tiết có giá hiện tại của sản phẩm trong bộ lọc để tham chiếu", async () => {
    mockApi(baseHandlers(portfolio));
    const user = userEvent.setup();
    renderAt("/chi-tiet");
    const ref = await screen.findByRole("region", { name: "Giá hiện tại" });
    expect(ref.textContent).toContain("Nhẫn tròn Phú Quý 999.9");
    expect(ref.textContent).toContain("Mua vào 13.900.000 · Bán ra 14.200.000/chỉ");
    expect(ref.textContent).toContain("Mua vào 1.598.000 · Bán ra 1.647.000/lượng");
    await user.click(screen.getByRole("button", { name: "Vàng" }));
    expect(screen.getByRole("region", { name: "Giá hiện tại" }).textContent).not.toContain("Bạc miếng");
  });
});
