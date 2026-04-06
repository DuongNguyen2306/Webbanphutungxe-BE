const mongoose = require('mongoose')
const { Review } = require('../models/Review')
const { Product } = require('../models/Product')

/**
 * Cập nhật rating (trung bình 1 chữ số thập phân) và reviewCount trên Product.
 */
async function recalculateProductRating(productId) {
  const pid = new mongoose.Types.ObjectId(productId)
  const stats = await Review.aggregate([
    { $match: { product: pid } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ])

  if (!stats.length) {
    await Product.findByIdAndUpdate(productId, {
      rating: 0,
      reviewCount: 0,
    })
    return
  }

  const { avgRating, count } = stats[0]
  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(avgRating * 10) / 10,
    reviewCount: count,
  })
}

module.exports = { recalculateProductRating }
