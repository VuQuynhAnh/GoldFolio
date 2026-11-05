import { ApiError, GoogleGenAI } from "@google/genai";
import { CHAT_SYSTEM_PROMPT, type ChatInput, type ChatModel } from "./chat";
import { TREND_JSON_SCHEMA, TREND_SYSTEM_PROMPT, TrendModelError, buildTrendPrompt, parseTrendAnalysis, type TrendInput, type TrendModel } from "./trend";

/**
 * Nhận định xu hướng bằng Gemini qua gói miễn phí của Google AI Studio (user chốt 2026-11-05).
 * Gói miễn phí giới hạn số lượt theo phút/ngày và Google có thể dùng dữ liệu gửi lên để cải thiện
 * sản phẩm, nên chỉ gửi giá và giá vốn, không gửi thông tin tài khoản.
 */
export class GeminiTrendModel implements TrendModel, ChatModel {
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    public name = "gemini-3.6-flash",
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyze(input: TrendInput) {
    let text: string | undefined;
    try {
      const res = await this.ai.models.generateContent({
        model: this.name,
        contents: buildTrendPrompt(input),
        config: {
          systemInstruction: TREND_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: TREND_JSON_SCHEMA,
          maxOutputTokens: 2048,
          // Người dùng đang chờ trên màn hình: quá 45 giây thì báo lỗi, không treo
          httpOptions: { timeout: 45_000 },
        },
      });
      text = res.text;
    } catch (err) {
      // 429 = hết hạn mức của gói miễn phí
      if (err instanceof ApiError && err.status === 429) throw new TrendModelError("quota", err.message);
      throw new TrendModelError("failed", err instanceof Error ? err.message : String(err));
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text ?? "");
    } catch {
      throw new TrendModelError("failed", "Kết quả không phải JSON");
    }
    return parseTrendAnalysis(raw, input.holding !== null);
  }

  /** Chat hỏi AI (PRICE-UC03): số liệu của người dùng nằm trong system prompt, lịch sử là các lượt user/model */
  async chat({ messages, context }: ChatInput): Promise<string> {
    try {
      const res = await this.ai.models.generateContent({
        model: this.name,
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        config: {
          systemInstruction: `${CHAT_SYSTEM_PROMPT}\n\nSố liệu của người dùng:\n${context}`,
          maxOutputTokens: 1024,
          httpOptions: { timeout: 45_000 },
        },
      });
      return res.text ?? "";
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) throw new TrendModelError("quota", err.message);
      throw new TrendModelError("failed", err instanceof Error ? err.message : String(err));
    }
  }
}
