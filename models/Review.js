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
      required: true,
    },
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

reviewSchema.index({ product: 1, user: 1 }, { unique: true })
reviewSchema.index({ product: 1, createdAt: -1 })

const Review = mongoose.model('Review', reviewSchema)
module.exports = { Review }
