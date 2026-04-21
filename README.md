# Thai Vũ Motoshop — Backend API

REST API (Node.js + Express + MongoDB + Mongoose + JWT), tương thích với frontend gọi `/api/...` và proxy Vite tới `http://localhost:5000`.

## Cài đặt

1. Copy `.env.example` thành `.env` và điền giá trị.
2. `npm install`
3. Chạy MongoDB cục bộ hoặc dùng Atlas, đặt `MONGODB_URI`.
4. `npm run seed` — chỉ seed sản phẩm mẫu nếu DB chưa có sản phẩm. **Tài khoản admin:** thêm thủ công vào MongoDB (xem mục dưới).
5. `npm run dev` hoặc `npm start`

## Tạo admin trong MongoDB (thủ công)

Collection Mongoose mặc định: **`users`**. Chèn **một** document (JSON mẫu trong `docs/admin-user.sample.json`).

- **Email đăng nhập:** `admin@thaivu.local`
- **Mật khẩu tạm thời (plaintext):** `ThaiVuAdmin2026!` — trùng với `passwordHash` bcrypt trong file mẫu. **Nên đổi** sau khi vào được hệ thống (cập nhật lại `passwordHash` trong DB hoặc xóa user và tạo qua API register rồi nâng `role` lên `admin`).

**Atlas / Compass:** vào database → collection `users` → Insert document → dán nội dung `docs/admin-user.sample.json`.

**mongosh:**

```javascript
db.users.insertOne({
  email: 'admin@thaivu.local',
  passwordHash: '$2b$10$h859YQvRUGqpLQb12Gzb3eH3hcle437GESn16X5whvQFYH98d4rgO',
  role: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
})
```

Để tạo hash mật khẩu khác (Node, trong thư mục `BE`):

```bash
node -e "require('bcryptjs').hash('MAT_KHAU_CUA_BAN',10).then(console.log)"
```

Thay `passwordHash` trong document bằng chuỗi in ra.

## Swagger (OpenAPI)

Sau khi server chạy:

- **Giao diện thử API:** [http://localhost:5000/api-docs](http://localhost:5000/api-docs) (đổi cổng nếu `PORT` khác).
- **File JSON spec:** `GET /api-docs.json` — import vào Postman/Insomnia hoặc host Swagger khác.

Đăng nhập bằng **Authorize** → dán JWT (hoặc chỉ chuỗi token, tuỳ phiên bản Swagger UI). Với `POST /api/orders`, JWT là **tuỳ chọn** (có thể bỏ trống nếu thử khách).

Khi deploy production, đặt `PUBLIC_API_URL` trong `.env` trỏ tới URL công khai của API để nút **Try it out** gọi đúng host.

## Biến môi trường

| Biến | Mô tả |
|------|--------|
| `PORT` | Cổng HTTP (mặc định 5000) |
| `MONGODB_URI` | Chuỗi kết nối MongoDB |
| `JWT_SECRET` | Bí mật ký JWT (chuỗi dài, ngẫu nhiên) |
| `CORS_ORIGIN` | Tuỳ chọn: để trống hoặc `*` = phản chiếu origin; hoặc URL FE (có thể nhiều URL cách nhau bởi dấu phẩy) |
| `PUBLIC_API_URL` | Tuỳ chọn: URL gốc API cho Swagger (mặc định `http://localhost:${PORT}`) |

## API (tóm tắt)

Chuẩn lỗi: `{ "message": "..." }`. Header auth: `Authorization: Bearer <token>`.

### Chung

| Method | Path | Auth | Ghi chú |
|--------|------|------|---------|
| GET | `/api/health` | — | `{ ok: true }` |

### Auth

| Method | Path | Body mẫu |
|--------|------|----------|
| POST | `/api/auth/register` | `{ "email"?: "...", "phone"?: "...", "password": "..." }` — cần email hoặc phone |
| POST | `/api/auth/login` | `{ "login": "email hoặc SĐT", "password": "..." }` |

Trả về: `{ token, user: { id, email, phone, role } }`.

### Profile

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/me` | Bearer (bắt buộc) |

### Cửa hàng (public)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/categories` | — |
| GET | `/api/products` | — — populate `category.name`, mỗi `variants[]` có `_id` và có thể có `images[]` (ảnh riêng từng biến thể) |
| GET | `/api/products/:id` | — |
| GET | `/api/products/:id/reviews/summary` | — |
| GET | `/api/products/:id/reviews` | — |
| POST | `/api/products/:id/reviews` | Bearer |

Chi tiết đánh giá: `GET .../reviews/summary` trả `average`, `total`, `byRating` (1–5), `withComment`, `withMedia`. `GET .../reviews` hỗ trợ query `page`, `limit`, `rating`, `hasComment`, `hasMedia`; mỗi phần tử có `author.mask`. `POST` một user chỉ một đánh giá / sản phẩm; body: `rating`, `variantId?`, `variantLabel?`, `comment`, `qualityNote`, `matchDescriptionNote`, `images[]`, `videos[{url,durationSec}]`.

### Đơn hàng

| Method | Path | Auth | Body mẫu |
|--------|------|------|----------|
| POST | `/api/orders` | Tuỳ chọn (có token thì gắn `user`) | `{ "contact": { "name", "email", "phone" }, "items": [{ "productId", "variantId", "name", "variantLabel", "quantity", "price" }], "totalAmount" }` — tổng tiền khớp Σ(price×quantity) sai số ≤ 1; kiểm tra variant tồn tại và `isAvailable` |
| GET | `/api/orders/my` | Bearer | Đơn của user, `createdAt` giảm dần |
| PATCH | `/api/orders/:id/cancel` | Bearer | `{ "reason": "..." }` — chỉ hủy được khi đơn đang `pending` hoặc `contacting` |

### Admin (prefix `/api/admin`)

Tất cả cần JWT + `role: admin`.

| Method | Path | Body / ghi chú |
|--------|------|----------------|
| GET | `/api/admin/products` | — |
| POST | `/api/admin/products` | Tạo SP; `variants` rỗng → variant mặc định, `basePrice` hoặc 0 |
| PUT | `/api/admin/products/:id` | Cập nhật; `category` có thể ObjectId hoặc tên mới |
| PATCH | `/api/admin/products/:productId/variants/:variantId/availability` | `{ "isAvailable": true/false }` |
| PATCH | `/api/admin/products/:id/variant-prices` | `{ "variantPrices": [{ "variantId" \| "key", "price", "originalPrice"?: number }] }` — cập nhật giá từng biến thể |
| DELETE | `/api/admin/reviews/:reviewId` | Xóa đánh giá; cập nhật lại `rating` / `reviewCount` trên Product |
| GET | `/api/admin/orders` | Populate user (email, phone); hỗ trợ `?status=` (`pending`, `contacting`, `confirmed`, `shipping`, `completed`, `cancelled`, hoặc `Tất cả`) |
| GET | `/api/admin/orders/status-options` | Trả danh sách trạng thái chuẩn để FE render dropdown |
| PATCH | `/api/admin/orders/:id/status` | `{ "status": "pending" \| "contacting" \| "confirmed" \| "shipping" \| "completed" \| "cancelled", "note"?: "..." }` — nếu `cancelled` thì `note` là bắt buộc; chỉ hủy được khi đơn chưa xác nhận |
| GET | `/api/admin/users` | Không trả `passwordHash` |
| GET | `/api/admin/categories` | — |

## Bảo mật tối thiểu

- JSON body giới hạn 2MB.
- `helmet` bật mặc định.
- Rate limit cho `/api/auth/*` (60 request / 15 phút / IP).
- Không log mật khẩu.

## Cấu trúc thư mục

```
models/       Mongoose schemas
routes/       Express routers
middleware/   JWT (authRequired, authOptional, adminRequired)
lib/          DB, resolve category
index.js      Entry server
seed.js       Seed admin + sản phẩm mẫu
```
