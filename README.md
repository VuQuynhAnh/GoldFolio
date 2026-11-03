# GoldFolio

Sổ tài sản vàng bạc cá nhân. Ghi từng lần mua (thương hiệu, sản phẩm, khối lượng, ngày giờ mua, giá mua) và so với giá **mua vào** hiện tại của cửa hàng để thấy lãi/lỗ. Thương hiệu mặc định là Phú Quý, giá lấy tự động từ trang của Phú Quý.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `shared/` | Quy đổi khối lượng, tính tiền và lãi/lỗ, định dạng số và ngày giờ VN (dùng chung server + web) |
| `server/` | Express + PostgreSQL (`pg`), API `/api/*`, adapter giá Phú Quý, lịch lấy giá |
| `web/` | Vite + React + Tailwind 4 + Recharts, giao diện tối mobile-first (màu theo token trong `web/src/index.css`, font Be Vietnam Pro đóng gói sẵn): 3 tab dưới (Tổng quan / Lịch sử / Lần mua), nút + để thêm, form toàn màn hình |

## Chạy

Cần Node 22 (`.nvmrc`).

```bash
npm install
cp server/.env.example server/.env   # tuỳ chỉnh nếu cần
npm run dev                           # server :4000 + web :5173 (proxy /api)
```

| Việc | Lệnh |
|---|---|
| Test (shared + server + web; server chạy trên PGlite, không cần Postgres thật) | `npm test` |
| Test một file | `cd server && npx vitest run test/api.test.ts` · `cd web && npx vitest run test/shell.test.tsx` |
| Kiểm tra kiểu | `npm run lint` |
| Build web | `npm run build` |
| Đồng bộ danh mục sản phẩm | `npm run seed` (chỉ thêm/cập nhật, không xoá) |
| Xoá sạch dữ liệu (**mất mọi tài khoản và lần mua**) | Trong SQL Editor của Supabase: `TRUNCATE users, purchases, sessions RESTART IDENTITY CASCADE;` |

### Biến môi trường (`server/.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 4000 | Cổng API |
| `DATABASE_URL` | (trống) | Chuỗi kết nối PostgreSQL. Trống thì `pg` đọc `PGHOST`/`PGUSER`/… |
| `DB_SSL_CA` | (trống) | Tuỳ chọn. Đường dẫn file CA của Supabase để bật SSL có kiểm chứng chỉ; trống = không SSL |
| `PRICE_INTERVAL_MIN` | 15 | Chu kỳ lấy giá hiện tại (phút) |
| `PRICE_FETCH_ENABLED` | 1 | Đặt 0 để tắt lấy giá |

### Cơ sở dữ liệu (Supabase free)

Dữ liệu nằm trên PostgreSQL ở Supabase, nên chạy server ở máy nào cũng dùng chung một DB.

1. Tạo tài khoản và project tại supabase.com (gói Free). Ghi lại mật khẩu database khi tạo.
2. Nút **Connect** của project → **Connection string** → chọn **Session pooler** (chạy được cả mạng chỉ có IPv4). Copy chuỗi, thay mật khẩu, dán vào `DATABASE_URL` trong `server/.env`.
3. *(Tuỳ chọn)* Mã hoá đường truyền tới Supabase: **Project Settings → Database → SSL Configuration → Download certificate**, lưu file và điền đường dẫn vào `DB_SSL_CA`. Để trống thì kết nối không SSL (giống SmartClocking) — vẫn chạy, nhưng dữ liệu đi trên mạng không mã hoá.
4. `npm run dev`: server tự tạo bảng và danh mục sản phẩm lần đầu chạy.

Gói Free tạm dừng project sau 7 ngày không có truy cập; vào dashboard bấm **Restore** là chạy lại, dữ liệu còn nguyên. Không kết nối được thì server in "Không kết nối được PostgreSQL" và thoát.

### Mạng công ty có chứng chỉ riêng

Nếu log in `self-signed certificate in certificate chain` thì Node chưa tin CA của mạng. Xuất CA gốc của công ty ra file PEM, rồi đặt biến môi trường **hệ thống** trước khi chạy (biến này không đọc từ `.env`):

```powershell
setx NODE_EXTRA_CA_CERTS "C:\duong-dan\ca-cong-ty.pem"
```

Đừng tắt kiểm tra TLS (`NODE_TLS_REJECT_UNAUTHORIZED=0`).

## API

Mọi API trừ `/api/auth/*` cần đăng nhập (cookie `sid`). Lỗi trả `{ error, fields? }`, thông báo tiếng Việt.

| Method · path | Việc |
|---|---|
| `POST /api/auth/register` · `login` · `logout`, `GET /api/auth/me` | Tài khoản |
| `GET /api/brands` | Thương hiệu + sản phẩm chọn được |
| `GET /api/prices/suggest?productId&date&time` | Gợi ý đơn giá mua (giá bán ra tại thời điểm mua) |
| `GET /api/purchases/:id`, `POST /api/purchases`, `PUT/DELETE /api/purchases/:id` | Lần mua của mình. Để trống `unitPrice` và `totalPrice` thì server tự lấy giá bán ra tại thời điểm mua (`priceSource: "auto"`, `priceNote` ghi nguồn); không tìm được giá thì 400 |
| `GET /api/portfolio` | Tổng quan, nhóm kim loại/sản phẩm, danh sách lần mua kèm lãi/lỗ |
| `GET /api/portfolio/history?productId` | Biểu đồ giá theo các mốc mua |

## Nguồn giá

Phú Quý không có API. Adapter đọc HTML của `phuquygroup.vn` (vàng, VNĐ/chỉ), `giabac.phuquygroup.vn` (bạc, VNĐ/lượng hoặc VNĐ/kg) và `phuquygroup.vn/XemLai?date=` (giá theo ngày). Trang đổi cấu trúc thì adapter bỏ cả bảng và giữ giá cũ; test với HTML thật ở `server/test/fixtures/phuquy/`.

Danh mục thương hiệu và sản phẩm nằm ở `server/src/catalog.ts`.

## Giao diện

Dự kiến dùng component trang trí của [React Bits](https://reactbits.dev) (`npx shadcn@latest add @react-bits/<Tên>-TS-TW` trong `web/`, đã có `components.json`). Số tiền và lãi/lỗ luôn hiện thẳng, không hiệu ứng.
