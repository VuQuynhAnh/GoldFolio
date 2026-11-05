import { describe, expect, it } from "vitest";
import { ApiError } from "@google/genai";
import { GeminiTrendModel } from "../src/ai/gemini";
import { TrendModelError, type TrendInput } from "../src/ai/trend";

const input: TrendInput = {
  metal: "gold",
  productName: "Nhẫn tròn Phú Quý 999.9",
  priceUnit: "chi",
  series: [{ date: "2026-11-01", buy: 13_550_000, sell: 13_850_000 }],
  stats: { days: 1, firstBuy: 13_550_000, lastBuy: 13_550_000, changePct: 0, minBuy: 13_550_000, maxBuy: 13_550_000 },
  holding: null,
};
const ok = { text: JSON.stringify({ trend: "sideways", confidence: "low", summary: "Đi ngang.", points: [] }) };

/** Gọi API giả: model nào lỗi gì do test đặt, ghi lại model đã gọi */
function fakeGenerate(errors: Record<string, number>) {
  const calls: string[] = [];
  const generate = async ({ model }: { model: string }) => {
    calls.push(model);
    const status = errors[model];
    if (status) throw new ApiError({ status, message: `lỗi ${status}` });
    return ok;
  };
  return { calls, generate };
}

describe("Gemini: model dự phòng khi quá tải (PRICE-UC02/BR-9)", () => {
  // SC: PRICE-UC02-SC10
  it("model chính quá tải (503) thì dùng model dự phòng", async () => {
    const { calls, generate } = fakeGenerate({ "gemini-3.6-flash": 503 });
    const model = new GeminiTrendModel("key", "gemini-3.6-flash", "gemini-3.5-flash-lite", generate);
    expect((await model.analyze(input)).summary).toBe("Đi ngang.");
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(await model.chat({ messages: [{ role: "user", content: "hỏi" }], context: "" })).toContain("sideways");
  });

  it("model chính hết lượt (429) cũng thử model dự phòng", async () => {
    const { calls, generate } = fakeGenerate({ "gemini-3.6-flash": 429 });
    await new GeminiTrendModel("key", "gemini-3.6-flash", "gemini-3.5-flash-lite", generate).analyze(input);
    expect(calls).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  });

  it("cả hai đều quá tải thì báo busy; đều hết lượt thì báo quota; lỗi khác không thử tiếp", async () => {
    const busy = new GeminiTrendModel("k", "a", "b", fakeGenerate({ a: 503, b: 500 }).generate);
    await expect(busy.analyze(input)).rejects.toMatchObject({ kind: "busy" });
    const quota = new GeminiTrendModel("k", "a", "b", fakeGenerate({ a: 429, b: 429 }).generate);
    await expect(quota.analyze(input)).rejects.toMatchObject({ kind: "quota" });
    const bad = fakeGenerate({ a: 400 });
    await expect(new GeminiTrendModel("k", "a", "b", bad.generate).analyze(input)).rejects.toBeInstanceOf(TrendModelError);
    expect(bad.calls).toEqual(["a"]);
  });

  it("model dự phòng trùng model chính thì chỉ gọi một lần", async () => {
    const { calls, generate } = fakeGenerate({ a: 503 });
    await expect(new GeminiTrendModel("k", "a", "a", generate).analyze(input)).rejects.toMatchObject({ kind: "busy" });
    expect(calls).toEqual(["a"]);
  });
});
