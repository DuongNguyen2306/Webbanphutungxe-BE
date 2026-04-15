/**
 * OpenAPI 3 spec cho Swagger UI — cập nhật khi thêm/sửa route.
 */
function getOpenApiSpec() {
  const port = Number(process.env.PORT) || 5000
  const baseUrl = (process.env.PUBLIC_API_URL || `http://localhost:${port}`).replace(
    /\/$/,
    '',
  )

  return {
    openapi: '3.0.3',
    info: {
      title: 'Thai Vũ Motoshop API',
      description:
        'REST API cửa hàng phụ tùng. Đăng nhập → copy `token` → nút **Authorize** → nhập `Bearer` hoặc chỉ token (Swagger tự thêm Bearer).',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl, description: 'API gốc' }],
    tags: [
      { name: 'Health', description: 'Kiểm tra sống' },
      { name: 'Auth', description: 'Đăng ký / đăng nhập' },
      { name: 'Profile', description: 'Tài khoản' },
      { name: 'Shop', description: 'Cửa hàng (public)' },
      { name: 'Orders', description: 'Đặt hàng' },
      { name: 'Admin', description: 'Quản trị (JWT + role admin)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT từ POST /api/auth/login hoặc /api/auth/register',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string', nullable: true },
                phone: { type: 'string', nullable: true },
                role: { type: 'string', enum: ['user', 'admin'] },
                displayName: { type: 'string', nullable: true },
                name: { type: 'string', nullable: true },
              },
            },
          },
        },
        RegisterBody: {
          type: 'object',
          required: ['password'],
          properties: {
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            name: { type: 'string' },
            displayName: { type: 'string' },
            password: { type: 'string', minLength: 6 },
          },
          description: 'Cần ít nhất email hoặc phone.',
        },
        LoginBody: {
          type: 'object',
          required: ['login', 'password'],
          properties: {
            login: { type: 'string', description: 'Email hoặc SĐT' },
            password: { type: 'string' },
          },
        },
        CreateOrderBody: {
          type: 'object',
          required: ['contact', 'shippingAddress', 'items', 'totalAmount'],
          properties: {
            contact: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
              },
              description: 'Ít nhất email hoặc phone (sau trim) khác rỗng.',
            },
            shippingAddress: {
              type: 'object',
              required: ['province', 'district', 'ward', 'detail'],
              properties: {
                province: { type: 'string' },
                district: { type: 'string' },
                ward: { type: 'string' },
                detail: { type: 'string' },
                note: { type: 'string' },
              },
              description:
                'Địa chỉ giao hàng chi tiết. note là tùy chọn.',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'productId',
                  'variantId',
                  'name',
                  'quantity',
                  'price',
                ],
                properties: {
                  productId: { type: 'string', description: 'ObjectId' },
                  variantId: { type: 'string', description: 'ObjectId variant' },
                  name: { type: 'string' },
                  variantLabel: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                  price: { type: 'number', minimum: 0 },
                },
              },
            },
            totalAmount: {
              type: 'number',
              description: 'Phải khớp Σ(price×quantity), sai số ≤ 1',
            },
          },
        },
        CreateOrderResponse: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            message: { type: 'string', example: 'OK' },
          },
        },
        AdminProductBody: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            category: {
              description: 'ObjectId danh mục hoặc tên mới (string)',
            },
            description: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            brand: { type: 'string' },
            vehicleType: { type: 'string' },
            partCategory: { type: 'string' },
            homeFeature: { type: 'string', nullable: true },
            rating: { type: 'number' },
            reviewCount: { type: 'integer' },
            soldCount: { type: 'integer' },
            basePrice: {
              type: 'number',
              description: 'Dùng khi variants rỗng → variant Mặc định',
            },
            variants: {
              type: 'array',
              description:
                'Mỗi phần tử có _id (khi cập nhật). typeName/color/size: mô tả combo (vd. Màu + Chân ren). images: URL ảnh riêng biến thể.',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  typeName: { type: 'string' },
                  color: { type: 'string' },
                  size: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  originalPrice: { type: 'number' },
                  isAvailable: { type: 'boolean' },
                  images: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Gallery ảnh chỉ áp dụng cho biến thể này',
                  },
                },
              },
            },
          },
        },
        PatchVariantAvailability: {
          type: 'object',
          required: ['isAvailable'],
          properties: { isAvailable: { type: 'boolean' } },
        },
        PatchOrderStatus: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: [
                'pending',
                'contacting',
                'confirmed',
                'shipping',
                'completed',
                'cancelled',
              ],
            },
            note: {
              type: 'string',
              description: 'Bắt buộc khi hủy đơn (cancelled).',
            },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { ok: { type: 'boolean', example: true } },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Đăng ký',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterBody' },
              },
            },
          },
          responses: {
            201: {
              description: 'Tạo tài khoản',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            400: {
              description: 'Lỗi validate',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            409: {
              description: 'Email/SĐT đã dùng',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Đăng nhập',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginBody' },
              },
            },
          },
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            401: {
              description: 'Sai thông tin',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/me': {
        get: {
          tags: ['Profile'],
          summary: 'Thông tin user hiện tại',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'User (không có passwordHash)' },
            401: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/categories': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách danh mục',
          responses: { 200: { description: 'Mảng Category' } },
        },
      },
      '/api/products': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách sản phẩm',
          description:
            'Populate category; mỗi variant có `_id`, có thể có `images[]` riêng.',
          responses: { 200: { description: 'Mảng Product' } },
        },
      },
      '/api/products/{id}': {
        get: {
          tags: ['Shop'],
          summary: 'Chi tiết sản phẩm',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Product' },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/products/{id}/reviews/summary': {
        get: {
          tags: ['Shop'],
          summary: 'Thống kê đánh giá (số sao, có comment/hình)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: { 200: { description: 'average, total, byRating, withComment, withMedia' } },
        },
      },
      '/api/products/{id}/reviews': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách đánh giá (phân trang, lọc)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'rating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } },
            { name: 'hasComment', in: 'query', schema: { type: 'string', enum: ['true'] } },
            { name: 'hasMedia', in: 'query', schema: { type: 'string', enum: ['true'] } },
          ],
          responses: { 200: { description: 'items, page, limit, total, totalPages' } },
        },
        post: {
          tags: ['Shop'],
          summary: 'Gửi đánh giá (1 user / 1 SP)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rating'],
                  properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 5 },
                    variantId: { type: 'string' },
                    variantLabel: { type: 'string' },
                    comment: { type: 'string' },
                    qualityNote: { type: 'string' },
                    matchDescriptionNote: { type: 'string' },
                    images: { type: 'array', items: { type: 'string' } },
                    videos: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          durationSec: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Review + author.mask' },
            409: { description: 'Đã đánh giá' },
          },
        },
      },
      '/api/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Tạo đơn (khách hoặc user)',
          description:
            'Có JWT thì `user` được gắn. Variant phải tồn tại và `isAvailable: true`.',
          security: [{ bearerAuth: [] }, {}],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateOrderBody' },
              },
            },
          },
          responses: {
            201: {
              description: 'Đã tạo',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateOrderResponse' },
                },
              },
            },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/orders/my': {
        get: {
          tags: ['Orders'],
          summary: 'Đơn của tôi',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Mảng Order' },
            401: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/orders/my-orders': {
        get: {
          tags: ['Orders'],
          summary: 'Lịch sử đơn hàng theo trạng thái',
          description:
            "status rỗng hoặc 'Tất cả' => trả toàn bộ. Có thể truyền limit/skip để phân trang.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string' },
              description:
                "Mã trạng thái (PENDING, CANCELLED...) hoặc 'Tất cả'.",
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 0, maximum: 50 },
              description: 'Giới hạn số đơn trả về.',
            },
            {
              name: 'skip',
              in: 'query',
              schema: { type: 'integer', minimum: 0 },
              description: 'Số đơn bỏ qua (phân trang).',
            },
          ],
          responses: {
            200: { description: 'Mảng Order đã enrich product + variant' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            401: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'User: chi tiết đơn của tôi',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Order chi tiết (kèm product/variant)' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            401: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/orders/{id}/customer-info': {
        patch: {
          tags: ['Orders'],
          summary: 'User: cập nhật thông tin liên hệ và địa chỉ giao hàng của đơn',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    contact: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                      },
                    },
                    shippingAddress: {
                      type: 'object',
                      properties: {
                        province: { type: 'string' },
                        district: { type: 'string' },
                        ward: { type: 'string' },
                        detail: { type: 'string' },
                        note: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Order đã cập nhật thông tin' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            401: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/orders/{id}/cancel': {
        patch: {
          tags: ['Orders'],
          summary: 'User: hủy đơn chưa xác nhận (bắt buộc lý do)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Order đã chuyển CANCELLED' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/products': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: danh sách sản phẩm',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Mảng Product' },
            403: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Admin: tạo sản phẩm',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminProductBody' },
              },
            },
          },
          responses: {
            201: { description: 'Product đã populate category' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/products/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Admin: cập nhật sản phẩm',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminProductBody' },
              },
            },
          },
          responses: {
            200: { description: 'OK' },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/products/{productId}/variants/{variantId}/availability': {
        patch: {
          tags: ['Admin'],
          summary: 'Admin: bật/tắt còn hàng (variant)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'productId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'variantId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PatchVariantAvailability',
                },
              },
            },
          },
          responses: {
            200: { description: '{ ok, variant }' },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/reviews/{reviewId}': {
        delete: {
          tags: ['Admin'],
          summary: 'Admin: xóa đánh giá (cập nhật rating SP)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'reviewId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: '{ ok: true }' },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/orders': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: danh sách đơn',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Mảng Order (populate user)' } },
        },
      },
      '/api/admin/orders/{id}': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: chi tiết một đơn',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Order chi tiết (kèm product/variant)' },
            400: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/orders/status-options': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: danh sách trạng thái đơn chuẩn',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: '{ statuses: [{ code, label }] }' } },
        },
      },
      '/api/admin/orders/{id}/status': {
        patch: {
          tags: ['Admin'],
          summary: 'Admin: đổi trạng thái đơn',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PatchOrderStatus' },
              },
            },
          },
          responses: {
            200: { description: 'Order' },
            404: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/api/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: danh sách user',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Không có passwordHash' } },
        },
      },
      '/api/admin/categories': {
        get: {
          tags: ['Admin'],
          summary: 'Admin: danh sách danh mục',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Mảng Category' } },
        },
      },
    },
  }
}

module.exports = { getOpenApiSpec }
