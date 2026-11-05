import { ApiError, GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { CHAT_SYSTEM_PROMPT, type ChatInput, type ChatModel } from "./chat";
import { TREND_JSON_SCHEMA, TREND_SYSTEM_PROMPT, TrendModelError, buildTrendPrompt, parseTrendAnalysis, type TrendInput, type TrendModel } from "./trend";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
// Model dự phòng khi model chính quá tải/hết lượt: bản nhẹ, hạn mức miễn phí riêng (SmartClocking đang dùng ổn)
export const DEFAULT_GEMINI_FALLBACK = "gemini-3.5-flash-lite";

/** Gọi API sinh nội dung; tách ra để test thay bằng bản giả, không gọi mạng */
type Generate = (params: GenerateContentParameters) => Promise<{ text?: string }>;

/**
 * Nhận định xu hướng và chat bằng Gemini qua gói miễn phí của Google AI Studio (user chốt 2026-11-05).
 * Gói miễn phí giới hạn số lượt theo phút/ngày và Google có thể dùng dữ liệu gửi lên để cải thiện
 * sản phẩm, nên chỉ gửi giá và giá vốn, không gửi thông tin tài khoản.
 * Model chính quá tải (503 "high demand", 500) hoặc hết lượt (429) thì thử model dự phòng (PRICE-UC02/BR-9).
 */
export class GeminiTrendModel implements TrendModel, ChatModel {
  private generate: Generate;
  private models: string[];

  constructor(
    apiKey: string,
    public name = DEFAULT_GEMINI_MODEL,
    fallback = DEFAULT_GEMINI_FALLBACK,
    generate?: Generate,
  ) {
    this.models = [...new Set([name, fallback].filter(Boolean))];
    if (generate) this.generate = generate;
    else {
      const ai = new GoogleGenAI({ apiKey });
      this.generate = (params) => ai.models.generateContent(params);
    }
  }

  /** Gọi lần lượt model chính rồi model dự phòng; chỉ chuyển model khi lỗi tạm thời hoặc hết lượt */
  private async call(params: Omit<GenerateContentParameters, "model">): Promise<string | undefined> {
    let busy = false;
    let lastMessage = "";
    for (const model of this.models) {
      try {
        return (await this.generate({ ...params, model })).text;
      } catch (err) {
        if (!(err instanceof ApiError)) throw new TrendModelError("failed", err instanceof Error ? err.message : String(err));
        lastMessage = `${model}: ${err.message}`;
        if (err.status === 503 || err.status === 500) busy = true;
        else if (err.status !== 429) throw new TrendModelError("failed", lastMessage);
        console.warn(`[AI ${model}] ${err.status}, thử model tiếp theo`);
      }
    }
    // Hết model để thử: quá tải là lỗi tạm thời, khác với hết lượt miễn phí
    throw new TrendModelError(busy ? "busy" : "quota", lastMessage);
  }

  async analyze(input: TrendInput) {
    const text = await this.call({
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
    const text = await this.call({
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      config: {
        systemInstruction: `${CHAT_SYSTEM_PROMPT}\n\nSố liệu của người dùng:\n${context}`,
        maxOutputTokens: 1024,
        httpOptions: { timeout: 45_000 },
      },
    });
    return text ?? "";
  }
}
