import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseHandlers, mockApi, renderAt } from "./helpers";

vi.mock("../src/api", async (orig) => ({ ...(await orig<typeof import("../src/api")>()), api: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const none = { hasToken: false, createdAt: null, lastUsedAt: null };
const created = { hasToken: true, createdAt: "2026-11-02T03:00:00.000Z", lastUsedAt: null };

describe("trang widget (HOLD-UC02)", () => {
  // SC: HOLD-UC02-SC5
  it("mở từ header; tạo mã thì hiện mã kết nối một lần kèm nút chép", async () => {
    const calls = mockApi({
      ...baseHandlers(),
      "GET /widget/token": () => none,
      "POST /widget/token": () => ({ ...created, token: "gfw_abc" }),
    });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderAt("/");
    await user.click(await screen.findByRole("link", { name: "Widget" }));
    expect(await screen.findByText("Chưa có mã. Tạo mã rồi dán vào app widget.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tạo mã widget" }));
    const box = (await screen.findByLabelText("Mã kết nối")) as HTMLTextAreaElement;
    expect(box.value).toBe(`${window.location.origin}#gfw_abc`);
    expect(screen.getByText(/Đã tạo lúc 10:00 02\/11\/2026 · widget chưa dùng mã này/)).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Chép mã kết nối" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}#gfw_abc`);
    expect(await screen.findByRole("button", { name: "Đã chép" })).toBeTruthy();
  });

  // SC: HOLD-UC02-SC6
  it("đã có mã: tạo mã mới và thu hồi đều hỏi xác nhận", async () => {
    const calls = mockApi({
      ...baseHandlers(),
      "GET /widget/token": () => ({ ...created, lastUsedAt: "2026-11-02T04:30:00.000Z" }),
      "POST /widget/token": () => ({ ...created, token: "gfw_moi" }),
      "DELETE /widget/token": () => undefined,
    });
    const user = userEvent.setup();
    renderAt("/widget");
    expect(await screen.findByText(/widget cập nhật lần cuối 11:30 02\/11\/2026/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tạo mã mới" }));
    expect(screen.getByText(/Widget đang dùng mã cũ sẽ ngừng cập nhật/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Thu hồi mã" }));
    await user.click(screen.getByRole("button", { name: "Thu hồi" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/widget/token")).toBe(true));
    expect(await screen.findByRole("button", { name: "Tạo mã widget" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thu hồi mã" })).toBeNull();
  });
});
