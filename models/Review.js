const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    /** Đánh giá do cửa hàng tự nhập (không gắn user khách). */
    isStoreReview: { type: Boolean, default: false, index: true },
    /** Tên hiển thị khi isStoreReview (vd. "Khách A", "Shop test"). */
    reviewerDisplayName: { type: String, default: '', trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Snapshot hiển thị: "Phân loại: ..." */
    variantLabel: { type: String, default: '' },
    comment: { type: String, default: '' },
    productQuality: { type: String, default: '' },
    isCorrectDescription: { type: String, default: '' },
    images: [{ type: String }],
    video: { type: String, default: '' },
    likes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

/** Chỉ ràng buộc 1 user / 1 SP khi có user (đánh giá khách); đánh giá cửa hàng có user: null. */
reviewSchema.index(
  { product: 1, user: 1 },
  {
    unique: true,
    name: 'product_user_customer_unique',
    partialFilterExpression: {
      user: { $exists: true, $type: 'objectId' },
    },
  },
)
reviewSchema.index({ product: 1, createdAt: -1 })

const Review = mongoose.model('Review', reviewSchema)
module.exports = { Review }
