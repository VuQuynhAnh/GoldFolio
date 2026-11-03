-- Schema GoldFolio (PostgreSQL). Tạo bảng nếu chưa có; cột thêm sau khai báo cả trong
-- migrate() của db.ts (R-DB-01).
-- Tiền và khối lượng (miligram) là BIGINT (HOLD-BR-002, R-MONEY-01).
-- Ngày "YYYY-MM-DD", giờ "HH:mm" và mốc ISO để dạng TEXT: kiểu DATE/TIMESTAMP bị pg đổi sang
-- Date theo múi giờ máy chạy, dễ lệch ngày (R-TIME-01).

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Lưu băm SHA-256 của token, không lưu token gốc: lộ DB không dùng lại được phiên.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  -- 1 = có adapter lấy giá; 0 = chỉ có danh sách sản phẩm nhập sẵn
  has_source INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id     BIGINT NOT NULL REFERENCES brands(id),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  metal        TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  price_unit   TEXT NOT NULL CHECK (price_unit IN ('chi', 'luong', 'kg')),
  source       TEXT NOT NULL CHECK (source IN ('live', 'seed')),
  -- Các tên khác mà nguồn dùng cho sản phẩm này (JSON array), để khớp dòng giá
  aliases_json TEXT NOT NULL DEFAULT '[]',
  -- 0 = đã biến mất khỏi bảng giá mới nhất: không chọn được cho lần mua mới
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (brand_id, code)
);

-- Ảnh chụp giá: kind 'live' = bảng giá hiện tại lấy định kỳ, có giờ nguồn công bố;
-- kind 'daily' = giá theo ngày do nguồn công bố, không có giờ.
CREATE TABLE IF NOT EXISTS price_snapshots (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id     BIGINT NOT NULL REFERENCES brands(id),
  kind         TEXT NOT NULL CHECK (kind IN ('live', 'daily')),
  section      TEXT NOT NULL,
  source_date  TEXT NOT NULL,
  source_time  TEXT,
  fetched_at   TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_brand ON price_snapshots (brand_id, kind, source_date);

CREATE TABLE IF NOT EXISTS price_points (
  snapshot_id BIGINT NOT NULL REFERENCES price_snapshots(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  buy_price   BIGINT NOT NULL,
  -- NULL = nguồn chỉ công bố giá mua vào (PRICE-BR-006)
  sell_price  BIGINT,
  PRIMARY KEY (snapshot_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_points_product ON price_points (product_id);

-- Ngày nguồn đã báo không có giá theo ngày: không hỏi lại (PRICE-BR-007)
CREATE TABLE IF NOT EXISTS daily_misses (
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  date     TEXT NOT NULL,
  PRIMARY KEY (brand_id, date)
);

CREATE TABLE IF NOT EXISTS purchases (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  weight_mg     BIGINT NOT NULL CHECK (weight_mg > 0),
  input_unit    TEXT NOT NULL CHECK (input_unit IN ('chi', 'luong', 'gram', 'kg')),
  purchase_date TEXT NOT NULL,
  purchase_time TEXT,
  -- Cách người dùng nhập giá; số đã nhập được giữ khi đổi khối lượng (HOLD-UC01/BR-5)
  price_mode    TEXT NOT NULL CHECK (price_mode IN ('unit', 'total')),
  unit_cost     BIGINT NOT NULL CHECK (unit_cost > 0),
  total_cost    BIGINT NOT NULL CHECK (total_cost > 0),
  note          TEXT NOT NULL DEFAULT '',
  -- manual = người dùng nhập; auto = hệ thống tự lấy giá bán ra khi để trống (HOLD-UC01/BR-16)
  price_source  TEXT NOT NULL DEFAULT 'manual' CHECK (price_source IN ('manual', 'auto')),
  -- Nhãn nguồn của giá tự lấy, vd "Giá Phú Quý ngày 15/01/2025"; rỗng khi nhập tay
  price_note    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases (user_id);
