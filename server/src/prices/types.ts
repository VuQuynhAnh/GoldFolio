import type { PriceUnit } from "@goldfolio/shared";

/** Một dòng giá như nguồn công bố, chưa khớp với sản phẩm. */
export interface SourceRow {
  name: string;
  /** Đơn vị mà dòng này niêm yết giá */
  unit: PriceUnit;
  buy: number;
  /** null = nguồn chỉ công bố giá mua vào (PRICE-BR-006) */
  sell: number | null;
}

export interface SourceTable {
  /** Ngày VN mà bảng giá thuộc về, "YYYY-MM-DD" */
  sourceDate: string;
  /** Mốc giờ nguồn công bố (ISO); null với giá theo ngày */
  sourceTime: string | null;
  rows: SourceRow[];
}

export interface LiveSection {
  /** Tên phần bảng giá ("gold", "silver"), dùng để so trùng với lần lấy trước */
  section: string;
  /** Kim loại mà phần này định giá: sản phẩm cùng kim loại không còn trong bảng thì bị ẩn (HOLD-UC01/BR-15) */
  metal: "gold" | "silver";
  table: SourceTable;
}

/** Adapter của một thương hiệu (PRICE-BR-001). */
export interface PriceSource {
  brandCode: string;
  /** Bảng giá hiện tại. Phần nào lỗi thì bỏ phần đó (PRICE-BR-003), phần khác vẫn trả về. */
  fetchLive(): Promise<{ sections: LiveSection[]; errors: string[] }>;
  /** Giá theo ngày; null = nguồn không có dữ liệu ngày đó */
  fetchDaily(date: string): Promise<SourceTable | null>;
}

export class SourceParseError extends Error {}
