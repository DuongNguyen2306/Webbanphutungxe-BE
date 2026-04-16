const mongoose = require('mongoose')

const attributeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    values: [{ type: String, trim: true }],
  },
  { _id: false },
)

const variantSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    /** Nhãn ghép từ các giá trị thuộc tính (vd. "Mẫu A", "Chanh - 100ml") */
    displayKey: { type: String, default: '', trim: true },
    attributeValues: {
      type: Map,
      of: String,
      default: {},
    },
    /** Nhãn biến thể (vd. combo màu + hãng dài như Shopee) */
    typeName: { type: String, default: '' },
    color: { type: String, default: '' },
    /** Thuộc tính phụ: ren, size, v.v. */
    size: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, min: 0, default: 0 },
    stockQuantity: { type: Number, min: 0, default: 0 },
    originalPrice: { type: Number, min: 0 },
    isAvailable: { type: Boolean, default: true },
    sku: { type: String, trim: true },
    image: { type: String, default: '' },
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
    hasVariants: { type: Boolean, default: true },
    price: { type: Number, min: 0, default: 0 },
    originalPrice: { type: Number, min: 0 },
    stock: { type: Number, min: 0, default: 0 },
    stockQuantity: { type: Number, min: 0, default: 0 },
    sku: { type: String, trim: true, default: '' },
    image: { type: String, default: '' },
    attributes: [attributeSchema],
    variants: [variantSchema],
  },
  { timestamps: true },
)

productSchema.pre('save', function onSave() {
  this.hasVariants = Boolean(this.hasVariants)
  for (const v of this.variants || []) {
    if (!v.displayKey && v.key) {
      v.displayKey = String(v.key)
    }
    const stock = Math.max(0, Number(v.stock ?? v.stockQuantity) || 0)
    v.stock = stock
    v.stockQuantity = stock
    if (!v.image && Array.isArray(v.images) && v.images.length) {
      v.image = v.images[0]
    }
    if ((!v.images || !v.images.length) && v.image) {
      v.images = [v.image]
    }
  }
  const first = (this.variants || [])[0]
  if (first) {
    this.price = Number(first.price || 0)
    this.originalPrice =
      first.originalPrice !== undefined ? Number(first.originalPrice) : undefined
    const productStock = Math.max(
      0,
      Number(first.stock ?? first.stockQuantity) || 0,
    )
    this.stock = productStock
    this.stockQuantity = productStock
    this.sku = String(first.sku || '')
    this.image = String(first.image || first.images?.[0] || '')
  }
  const prices = (this.variants || [])
    .map((v) => Number(v.price))
    .filter((x) => Number.isFinite(x) && x >= 0)
  this.minPrice = prices.length ? Math.min(...prices) : 0
})

productSchema.index({ name: 'text', tags: 'text' })
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true })

const Product = mongoose.model('Product', productSchema)
module.exports = { Product }
