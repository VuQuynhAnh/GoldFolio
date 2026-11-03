# GoldFolio

Sổ tài sản vàng bạc cá nhân. Ghi từng lần mua (thương hiệu, sản phẩm, khối lượng, ngày giờ mua, giá mua) và so với giá **mua vào** hiện tại của cửa hàng để thấy lãi/lỗ. Thương hiệu mặc định là Phú Quý, giá lấy tự động từ trang của Phú Quý.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `shared/` | Quy đổi khối lượng, tính tiền và lãi/lỗ, định dạng số và ngày giờ VN (dùng chung server + web) |
| `server/` | Express + SQLite (`node:sqlite`), API `/api/*`, adapter giá Phú Quý, lịch lấy giá |
| `web/` | Vite + React + Tailwind 4 + Recharts |

## Chạy

Cần Node 22 (`.nvmrc`).

```bash
npm install
cp server/.env.example server/.env   # tuỳ chỉnh nếu cần
npm run dev                           # server :4000 + web :5173 (proxy /api)
```

| Việc | Lệnh |
|---|---|
| Test (shared + server) | `npm test` |
| Test một file | `cd server && npx vitest run test/api.test.ts` |
| Kiểm tra kiểu | `npm run lint` |
| Build web | `npm run build` |
| Đồng bộ danh mục sản phẩm | `npm run seed` (chỉ thêm/cập nhật, không xoá) |
| Xoá sạch dữ liệu | Dừng server rồi xoá `server/data/` (**mất mọi tài khoản và lần mua**) |

### Biến môi trường (`server/.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 4000 | Cổng API |
| `DB_PATH` | `data/goldfolio.sqlite` | File SQLite |
| `PRICE_INTERVAL_MIN` | 15 | Chu kỳ lấy giá hiện tại (phút) |
| `PRICE_FETCH_ENABLED` | 1 | Đặt 0 để tắt lấy giá |

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
| `GET /api/purchases/:id`, `POST /api/purchases`, `PUT/DELETE /api/purchases/:id` | Lần mua của mình |
| `GET /api/portfolio` | Tổng quan, nhóm kim loại/sản phẩm, danh sách lần mua kèm lãi/lỗ |
| `GET /api/portfolio/history?productId` | Biểu đồ giá theo các mốc mua |

## Nguồn giá

Phú Quý không có API. Adapter đọc HTML của `phuquygroup.vn` (vàng, VNĐ/chỉ), `giabac.phuquygroup.vn` (bạc, VNĐ/lượng hoặc VNĐ/kg) và `phuquygroup.vn/XemLai?date=` (giá theo ngày). Trang đổi cấu trúc thì adapter bỏ cả bảng và giữ giá cũ; test với HTML thật ở `server/test/fixtures/phuquy/`.

Danh mục thương hiệu và sản phẩm nằm ở `server/src/catalog.ts`.

## Giao diện

Dự kiến dùng component trang trí của [React Bits](https://reactbits.dev) (`npx shadcn@latest add @react-bits/<Tên>-TS-TW` trong `web/`, đã có `components.json`). Số tiền và lãi/lỗ luôn hiện thẳng, không hiệu ứng.
