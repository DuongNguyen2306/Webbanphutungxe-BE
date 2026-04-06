const mongoose = require('mongoose')

const videoItemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    durationSec: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
)

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
    rating: { type: Number, required: true, min: 1, max: 5 },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Snapshot hiển thị: "Phân loại: ..." */
    variantLabel: { type: String, default: '' },
    comment: { type: String, default: '' },
    qualityNote: { type: String, default: '' },
    matchDescriptionNote: { type: String, default: '' },
    images: [{ type: String }],
    videos: [videoItemSchema],
    likes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

reviewSchema.index({ product: 1, user: 1 }, { unique: true })
reviewSchema.index({ product: 1, createdAt: -1 })

const Review = mongoose.model('Review', reviewSchema)
module.exports = { Review }
