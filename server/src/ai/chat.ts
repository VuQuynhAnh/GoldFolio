/** Tin nhắn trong khung chat; "assistant" = câu trả lời trước đó của AI */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Một lượt hỏi AI (PRICE-UC03): lịch sử gần nhất + số liệu của người dùng do server ghép */
export interface ChatInput {
  messages: ChatMessage[];
  /** Danh mục, giá 30 ngày, nhận định hôm nay. Không có email/thông tin tài khoản (R-AI-02) */
  context: string;
}

/** Nhà cung cấp AI cho chat. Lỗi ném `TrendModelError` (quota / failed) như nhận định xu hướng. */
export interface ChatModel {
  name: string;
  chat(input: ChatInput): Promise<string>;
}

export const CHAT_SYSTEM_PROMPT = `Bạn là trợ lý trong GoldFolio, ứng dụng sổ tài sản vàng bạc cá nhân ở Việt Nam.
Trả lời bằng tiếng Việt, ngắn gọn (tối đa khoảng 150 chữ), dễ hiểu với người không chuyên.
Chỉ trả lời về giá vàng bạc, danh mục và lãi/lỗ của người dùng trong ứng dụng; câu hỏi ngoài phạm vi thì lịch sự từ chối.
Dựa trên số liệu bên dưới; không bịa giá, tin tức hay sự kiện. Thiếu số liệu thì nói rõ là không có.
Không khuyên chắc chắn mua hay bán; khi nói về xu hướng thì nhắc đây chỉ là tham khảo, không phải lời khuyên đầu tư.
Giá "mua vào" là giá cửa hàng mua lại của khách (dùng tính giá trị tài sản và lãi/lỗ), "bán ra" là giá cửa hàng bán cho khách.`;
