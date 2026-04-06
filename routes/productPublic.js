const express = require('express')
const mongoose = require('mongoose')
const { Product } = require('../models/Product')
const { Review } = require('../models/Review')
const { authRequired } = require('../middleware/auth')
const { recalculateProductRating } = require('../lib/productRating')
const { maskAuthor } = require('../lib/maskAuthor')

const router = express.Router()

async function assertProductVisibleForPublic(id) {
  const p = await Product.findById(id).select('showOnStorefront').lean()
  if (!p) return null
  if (p.showOnStorefront === false) return null
  return p
}

function stripUser(reviewDoc) {
  const { user, ...rest } = reviewDoc
  return {
    ...rest,
    author: maskAuthor(user),
  }
}

/** GET /api/products — danh sách SP */
router.get('/', async (_req, res) => {
  const list = await Product.find({ showOnStorefront: { $ne: false } })
    .populate('category', 'name')
    .lean()
  res.json(list)
})

/** Thống kê đánh giá (filter như Shopee) — đặt trước /:id */
router.get('/:id/reviews/summary', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }
    const visible = await assertProductVisibleForPublic(id)
    if (!visible) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    const pid = new mongoose.Types.ObjectId(id)
    const byRatingAgg = await Review.aggregate([
      { $match: { product: pid } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ])
    const byRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let total = 0
    for (const row of byRatingAgg) {
      byRating[row._id] = row.count
      total += row.count
    }
    const avgRow = await Review.aggregate([
      { $match: { product: pid } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ])
    const average = avgRow.length
      ? Math.round(avgRow[0].avg * 10) / 10
      : 0

    const withComment = await Review.countDocuments({
      product: pid,
      comment: { $regex: /\S/ },
    })
    const withMedia = await Review.countDocuments({
      product: pid,
      $or: [
        { 'images.0': { $exists: true } },
        { 'videos.0': { $exists: true } },
      ],
    })

    res.json({
      average,
      total,
      byRating,
      withComment,
      withMedia,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Lỗi tải thống kê đánh giá.' })
  }
})

/** GET /api/products/:id/reviews — danh sách có phân trang & lọc */
router.get('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }
    const visible = await assertProductVisibleForPublic(id)
    if (!visible) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
    const skip = (page - 1) * limit

    const pid = new mongoose.Types.ObjectId(id)
    const parts = [{ product: pid }]

    const rQ = req.query.rating
    if (rQ !== undefined && rQ !== '') {
      const r = Number(rQ)
      if (r >= 1 && r <= 5) parts.push({ rating: r })
    }
    if (req.query.hasComment === 'true') {
      parts.push({ comment: { $regex: /\S/ } })
    }
    if (req.query.hasMedia === 'true') {
      parts.push({
        $or: [
          { 'images.0': { $exists: true } },
          { 'videos.0': { $exists: true } },
        ],
      })
    }

    const filter = parts.length === 1 ? parts[0] : { $and: parts }

    const [items, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'email phone')
        .lean(),
      Review.countDocuments(filter),
    ])

    res.json({
      items: items.map(stripUser),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Lỗi tải đánh giá.' })
  }
})

/** POST /api/products/:id/reviews — cần đăng nhập; 1 user / 1 SP */
router.post('/:id/reviews', authRequired, async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }

    const {
      rating,
      variantId,
      variantLabel = '',
      comment = '',
      qualityNote = '',
      matchDescriptionNote = '',
      images,
      videos,
    } = req.body

    if (!Number.isFinite(Number(rating))) {
      return res.status(400).json({ message: 'Thiếu hoặc sai rating (1–5).' })
    }
    const r = Math.round(Number(rating))
    if (r < 1 || r > 5) {
      return res.status(400).json({ message: 'rating phải từ 1 đến 5.' })
    }

    const product = await Product.findById(id)
    if (!product || product.showOnStorefront === false) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    if (variantId) {
      if (!mongoose.isValidObjectId(String(variantId))) {
        return res.status(400).json({ message: 'variantId không hợp lệ.' })
      }
      if (!product.variants.id(variantId)) {
        return res
          .status(400)
          .json({ message: 'Biến thể không thuộc sản phẩm này.' })
      }
    }

    const imageList = Array.isArray(images)
      ? images.map((u) => String(u).trim()).filter(Boolean).slice(0, 20)
      : []
    const videoList = Array.isArray(videos)
      ? videos
          .filter((v) => v && v.url)
          .map((v) => ({
            url: String(v.url).trim(),
            durationSec: Math.max(0, Number(v.durationSec) || 0),
          }))
          .slice(0, 10)
      : []

    let created
    try {
      created = await Review.create({
        product: id,
        user: req.userId,
        rating: r,
        variantId: variantId || undefined,
        variantLabel: String(variantLabel).trim(),
        comment: String(comment).trim(),
        qualityNote: String(qualityNote).trim(),
        matchDescriptionNote: String(matchDescriptionNote).trim(),
        images: imageList,
        videos: videoList,
      })
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(409)
          .json({ message: 'Bạn đã đánh giá sản phẩm này rồi.' })
      }
      throw err
    }

    await recalculateProductRating(id)

    const out = await Review.findById(created._id)
      .populate('user', 'email phone')
      .lean()
    res.status(201).json(stripUser(out))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không gửi được đánh giá.' })
  }
})

/** GET /api/products/:id — chi tiết */
router.get('/:id', async (req, res) => {
  const p = await Product.findById(req.params.id)
    .populate('category', 'name')
    .lean()
  if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
  if (p.showOnStorefront === false) {
    return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
  }
  res.json(p)
})

module.exports = router
