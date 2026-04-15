const mongoose = require('mongoose')

const variantSchema = new mongoose.Schema(
  {
    /** Nhãn biến thể (vd. combo màu + hãng dài như Shopee) */
    typeName: { type: String, default: '' },
    color: { type: String, default: '' },
    /** Thuộc tính phụ: ren, size, v.v. */
    size: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, min: 0, default: 0 },
    originalPrice: { type: Number, min: 0 },
    isAvailable: { type: Boolean, default: true },
    sku: { type: String, trim: true },
    /** Ảnh riêng từng biến thể (mỗi màu / SKU có gallery khác nhau) */
    images: [{ type: String }],
  },
  { _id: true },
)

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, index: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    description: { type: String, default: '' },
    tags: [{ type: String, trim: true, lowercase: true }],
    compatibleVehicles: [{ type: String, trim: true }],
    images: [{ type: String }],
    brand: { type: String, default: 'honda' },
    vehicleType: { type: String, default: 'scooter' },
    partCategory: { type: String, default: 'accessories' },
    homeFeature: { type: String, default: null },
    /** false = ẩn khỏi danh sách /api/products (cửa hàng); admin vẫn xem được */
    showOnStorefront: { type: Boolean, default: true },
    rating: { type: Number, default: 4.5 },
    reviewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0, min: 0 },
    minPrice: { type: Number, min: 0, default: 0 },
    variants: [variantSchema],
  },
  { timestamps: true },
)

productSchema.pre('save', function onSave() {
  const prices = (this.variants || [])
    .map((v) => Number(v.price))
    .filter((x) => Number.isFinite(x) && x >= 0)
  this.minPrice = prices.length ? Math.min(...prices) : 0
})

productSchema.index({ name: 'text', tags: 'text' })
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true })

const Product = mongoose.model('Product', productSchema)
module.exports = { Product }
