const mongoose = require('mongoose')

async function connectDb(uri) {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  return mongoose.connection
}

/** Thay index cũ product+user (unique mọi doc) bằng index partial cho đánh giá khách + đánh giá cửa hàng. */
async function ensureReviewIndexes() {
  const { Review } = require('../models/Review')
  try {
    await Review.collection.dropIndex('product_1_user_1')
  } catch (e) {
    const msg = String(e?.message || '')
    if (e?.code !== 27 && !msg.includes('index not found')) {
      console.warn('[db] Không xóa được index review cũ:', msg)
    }
  }
  await Review.syncIndexes()
}

module.exports = { connectDb, ensureReviewIndexes }
