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
            hasVariants: {
              type: 'boolean',
              description:
                'false = sản phẩm đơn (dùng price/stock/sku top-level), true = dùng mảng variants.',
            },
            price: { type: 'number', minimum: 0 },
            originalPrice: { type: 'number', minimum: 0 },
            stock: {
              type: 'number',
              minimum: 0,
              description:
                'hasVariants=false: bỏ trống = không quản lý kho / còn hàng.',
            },
            stockQuantity: { type: 'number', minimum: 0 },
            sku: { type: 'string' },
            image: { type: 'string' },
            basePrice: {
              type: 'number',
              description: 'Dùng khi variants rỗng → variant Mặc định',
            },
            attributes: {
              type: 'array',
              description:
                'Thuộc tính do admin đặt tên (bất kỳ). Có thể bỏ trống nếu chỉ gửi variants — BE suy ra từ attributeValues.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  values: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            variants: {
              type: 'array',
              description:
                'Mỗi dòng: attributeValues (key-value động), giá/SKU/ảnh riêng. BE sinh key/displayKey từ các giá trị (vd. một thuộc tính → "Mẫu A"; nhiều → "Chanh - 100ml"). stock bỏ trống = không quản lý kho, coi như còn hàng.',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  key: {
                    type: 'string',
                    description: 'Khớp displayKey (BE gán khi lưu).',
                  },
                  displayKey: {
                    type: 'string',
                    description: 'Nhãn ghép để hiển thị (BE tự sinh nếu không gửi).',
                  },
                  attributeValues: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                  typeName: { type: 'string' },
                  color: { type: 'string' },
                  size: { type: 'string' },
                  price: { type: 'number', minimum: 0 },
                  originalPrice: { type: 'number' },
                  stock: {
                    type: 'number',
                    minimum: 0,
                    description: 'Bỏ trống = không theo dõi tồn (luôn coi là còn hàng).',
                  },
                  stockQuantity: { type: 'number', minimum: 0 },
                  image: { type: 'string' },
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
        AdminProductCreateMultipart: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            category: { type: 'string', description: 'ObjectId hoặc tên danh mục' },
            description: { type: 'string' },
            tags: { type: 'string', description: 'JSON array string, ví dụ ["tag1"]' },
            compatibleVehicles: {
              type: 'string',
              description: 'JSON array string',
            },
            brand: { type: 'string' },
            vehicleType: { type: 'string' },
            partCategory: { type: 'string' },
            homeFeature: { type: 'string', nullable: true },
            rating: { type: 'number' },
            reviewCount: { type: 'integer' },
            soldCount: { type: 'integer' },
            hasVariants: { type: 'string', enum: ['true', 'false'] },
            price: { type: 'number' },
            originalPrice: { type: 'number' },
            stock: { type: 'number' },
            stockQuantity: { type: 'number' },
            sku: { type: 'string' },
            image: { type: 'string' },
            basePrice: { type: 'number' },
            variants: {
              type: 'string',
              description: 'JSON string theo schema variants của AdminProductBody',
            },
            showOnStorefront: { type: 'string', enum: ['true', 'false'] },
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'Ảnh sản phẩm (upload file)',
            },
          },
        },
        PatchVariantAvailability: {
          type: 'object',
          required: ['isAvailable'],
          properties: { isAvailable: { type: 'boolean' } },
        },
        PatchVariantPrices: {
          type: 'object',
          required: ['variantPrices'],
          properties: {
            variantPrices: {
              type: 'array',
              items: {
                type: 'object',
                required: ['price'],
                properties: {
                  variantId: { type: 'string', description: 'ObjectId biến thể' },
                  key: { type: 'string', description: 'Fallback theo key/displayKey' },
                  price: { type: 'number', minimum: 0 },
                  originalPrice: {
                    type: 'number',
                    minimum: 0,
                    nullable: true,
                    description: 'Bỏ trống/null để xóa giá gốc.',
                  },
                },
              },
            },
          },
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
        PatchOrderDelivery: {
          type: 'object',
          description:
            'Gửi ít nhất một trường. Chỉ áp dụng khi đơn CONFIRMED / SHIPPING / COMPLETED.',
          properties: {
            carrierName: {
              type: 'string',
              maxLength: 200,
              description: 'Tên đơn vị vận chuyển (GHN, GHTK, Viettel Post...).',
            },
            trackingNumber: {
              type: 'string',
              maxLength: 200,
              description: 'Mã vận đơn / mã giao hàng để khách tra cứu.',
            },
          },
        },
        ArticleBody: {
          type: 'object',
          required: ['title', 'content', 'type'],
          properties: {
            title: { type: 'string' },
            content: {
              type: 'string',
              description: 'Nội dung HTML hoặc Markdown.',
            },
            type: { type: 'string', enum: ['intro', 'guide', 'news'] },
            author: { type: 'string' },
          },
        },
        BannerBody: {
          type: 'object',
          required: ['imageUrl'],
          properties: {
            imageUrl: { type: 'string' },
            linkTo: { type: 'string' },
            order: { type: 'number' },
            isActive: { type: 'boolean' },
            textLayers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  level: { type: 'string', enum: ['h1', 'h2', 'h3', 'body', 'cta'] },
                  text: { type: 'string' },
                  order: { type: 'number' },
                  isActive: { type: 'boolean' },
                  style: {
                    type: 'object',
                    properties: {
                      color: { type: 'string' },
                      fontSize: { type: 'string' },
                      fontWeight: { type: 'string' },
                      align: { type: 'string' },
                      x: { type: 'string' },
                      y: { type: 'string' },
                      maxWidth: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        BannerCreateMultipart: {
          type: 'object',
          properties: {
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'Cho phép upload nhiều ảnh cùng lúc.',
            },
            imageUrl: {
              type: 'string',
              description: 'Fallback khi gửi link trực tiếp.',
            },
            linkTo: { type: 'string' },
            order: { type: 'number' },
            isActive: { type: 'string', enum: ['true', 'false'] },
            textLayers: {
              type: 'string',
              description: 'JSON string của mảng textLayers.',
            },
            textH1: { type: 'string' },
            textH2: { type: 'string' },
            textH3: { type: 'string' },
            textBody: { type: 'string' },
            textCta: { type: 'string' },
          },
        },
        BannerUpdateMultipart: {
          type: 'object',
          properties: {
            image: { type: 'string', format: 'binary' },
            imageUrl: { type: 'string' },
            linkTo: { type: 'string' },
            order: { type: 'number' },
            isActive: { type: 'string', enum: ['true', 'false'] },
            textLayers: {
              type: 'string',
              description: 'JSON string của mảng textLayers.',
            },
            textH1: { type: 'string' },
            textH2: { type: 'string' },
            textH3: { type: 'string' },
            textBody: { type: 'string' },
            textCta: { type: 'string' },
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
          description:
            'Trả danh sách danh mục công khai cho menu FE, gồm `_id`, `name`, `slug`.',
          responses: {
            200: { description: 'Mảng Category: [{ _id, name, slug }]' },
          },
        },
      },
      '/api/articles': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách bài viết công khai',
          description:
            'type=intro trả về 1 bài mới nhất hoặc null; type=guide/news trả về mảng; không truyền type thì trả toàn bộ.',
          parameters: [
            {
              name: 'type',
              in: 'query',
              schema: { type: 'string', enum: ['intro', 'guide', 'news'] },
            },
          ],
          responses: { 200: { description: 'Article hoặc Article[]' } },
        },
        post: {
          tags: ['Admin'],
          summary: 'Admin: tạo bài viết',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArticleBody' },
              },
            },
          },
          responses: {
            201: { description: 'Article' },
            400: {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
          },
        },
      },
      '/api/articles/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Admin: sửa bài viết',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArticleBody' },
              },
            },
          },
          responses: { 200: { description: 'Article' } },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Admin: xóa bài viết',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: { description: '{ ok: true }' } },
        },
      },
      '/api/banners': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách banner active',
          responses: { 200: { description: 'Banner[] (isActive=true)' } },
        },
        post: {
          tags: ['Admin'],
          summary: 'Admin: tạo banner (upload nhiều ảnh)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/BannerCreateMultipart' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/BannerBody' },
              },
            },
          },
          responses: { 201: { description: 'Banner[] hoặc Banner' } },
        },
      },
      '/api/banners/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Admin: cập nhật banner',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/BannerUpdateMultipart' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/BannerBody' },
              },
            },
          },
          responses: { 200: { description: 'Banner' } },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Admin: xóa banner',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 200: { description: '{ ok: true }' } },
        },
      },
      '/api/products': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách sản phẩm',
          description:
            'Trả `{ items, absoluteMaxPrice }`; `absoluteMaxPrice` là giá biến thể cao nhất để FE làm filter.',
          parameters: [
            {
              name: 'category',
              in: 'query',
              schema: { type: 'string' },
              description:
                'Lọc theo danh mục: chấp nhận ObjectId, tên danh mục, hoặc slug (vd. `phu-tung-vespa`).',
            },
          ],
          responses: { 200: { description: '{ items: Product[], absoluteMaxPrice: number }' } },
        },
      },
      '/api/products/best-sellers': {
        get: {
          tags: ['Shop'],
          summary: 'Danh sách sản phẩm bán chạy (phân trang)',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
          ],
          responses: {
            200: {
              description:
                '{ items: [{ soldQuantity, product }], page, limit, total, totalPages }',
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
      '/api/products/upload': {
        post: {
          tags: ['Admin'],
          summary: 'Upload ảnh sản phẩm lên Cloudinary',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['image'],
                  properties: {
                    image: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: '{ secure_url, public_id }' },
            400: { description: 'Thiếu file upload' },
            403: { description: 'Không có quyền admin' },
          },
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
            "status rỗng hoặc 'Tất cả' => trả toàn bộ. Có thể truyền limit/skip để phân trang. Mỗi đơn có thể có delivery (carrierName, trackingNumber) do admin cập nhật.",
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
          summary:
            'User: chi tiết đơn của tôi (có delivery.carrierName, delivery.trackingNumber nếu admin đã nhập)',
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
              'multipart/form-data': {
                schema: { $ref: '#/components/schemas/AdminProductCreateMultipart' },
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
      '/api/admin/products/{id}/variant-prices': {
        patch: {
          tags: ['Admin'],
          summary: 'Admin: cập nhật giá từng biến thể',
          description:
            'Dùng cho màn hình chỉnh giá theo phân loại. Hỗ trợ cập nhật hàng loạt qua variantPrices.',
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
                schema: { $ref: '#/components/schemas/PatchVariantPrices' },
              },
            },
          },
          responses: {
            200: { description: '{ ok: true, updatedCount, product }' },
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
          description:
            "Hỗ trợ lọc theo trạng thái qua query `status`. Để lấy tất cả có thể bỏ trống hoặc truyền `Tất cả`/`all`.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string' },
              description:
                'PENDING, CONTACTING, CONFIRMED, SHIPPING, COMPLETED, CANCELLED hoặc alias tiếng Việt.',
            },
          ],
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
            200: {
              description:
                'Order chi tiết (product/variant, delivery.carrierName, delivery.trackingNumber)',
            },
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
      '/api/admin/orders/{id}/delivery': {
        patch: {
          tags: ['Admin'],
          summary: 'Admin: cập nhật đơn vị vận chuyển & mã giao hàng',
          description:
            'Cho phép khi đơn CONFIRMED, SHIPPING hoặc COMPLETED. Khách xem qua GET /api/orders/{id} hoặc lịch sử đơn.',
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
                schema: { $ref: '#/components/schemas/PatchOrderDelivery' },
              },
            },
          },
          responses: {
            200: { description: 'Order đã cập nhật delivery' },
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
