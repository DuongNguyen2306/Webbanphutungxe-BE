const express = require('express')
const mongoose = require('mongoose')
const { Product } = require('../models/Product')
const { Review } = require('../models/Review')
const { Category } = require('../models/Category')
const { authRequired } = require('../middleware/auth')
const { recalculateProductRating } = require('../lib/productRating')
const { toPublicReviewShape } = require('../lib/reviewPublicShape')
const {
  isCloudinaryReady,
  productUpload,
} = require('../configs/cloudinary.config')
const { resolveExternalImageUrl } = require('../lib/externalImages')
const { getRelatedProductLists } = require('../lib/productRelated')

const router = express.Router()
const STOREFRONT_FILTER = { showOnStorefront: { $ne: false } }

/**
 * Tab "N sao" trên storefront: N=5 chỉ gồm đúng 5★; N<5 gồm [N, N+1) để 2.5 thuộc tab 2 sao, 4.5 thuộc tab 4 sao.
 */
function reviewRatingBucketFilter(starBucket) {
  const n = Number(starBucket)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  if (n === 5) return { rating: 5 }
  return { rating: { $gte: n, $lt: n + 1 } }
}

async function countReviewsByStarBuckets(pid) {
  const base = { product: pid }
  const [c5, c4, c3, c2, c1] = await Promise.all([
    Review.countDocuments({ ...base, rating: 5 }),
    Review.countDocuments({ ...base, rating: { $gte: 4, $lt: 5 } }),
    Review.countDocuments({ ...base, rating: { $gte: 3, $lt: 4 } }),
    Review.countDocuments({ ...base, rating: { $gte: 2, $lt: 3 } }),
    Review.countDocuments({ ...base, rating: { $gte: 1, $lt: 2 } }),
  ])
  return { 1: c1, 2: c2, 3: c3, 4: c4, 5: c5 }
}

function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function resolveCategoryIdsByQuery(input) {
  const q = String(input || '').trim()
  if (!q) return []
  if (mongoose.isValidObjectId(q)) return [new mongoose.Types.ObjectId(q)]

  const qSlug = toSlug(q)
  const categories = await Category.find()
    .select('_id name nameNormalized')
    .lean()
  return categories
    .filter((c) => {
      const name = String(c.name || '').trim()
      const normalized = String(c.nameNormalized || '').trim()
      return (
        name.localeCompare(q, 'vi', { sensitivity: 'base' }) === 0 ||
        normalized === q.toLowerCase() ||
        toSlug(name) === qSlug
      )
    })
    .map((c) => c._id)
}

async function getAbsoluteMaxPrice() {
  const rows = await Product.aggregate([
    { $match: STOREFRONT_FILTER },
    { $unwind: '$variants' },
    { $group: { _id: null, maxPrice: { $max: '$variants.price' } } },
  ])
  const value = Number(rows?.[0]?.maxPrice)
  return Number.isFinite(value) ? value : 0
}

function parsePagination(req) {
  const page = Number.parseInt(String(req.query.page ?? '1'), 10)
  const limit = Number.parseInt(String(req.query.limit ?? '10'), 10)
  if (!Number.isInteger(page) || page < 1) return null
  if (!Number.isInteger(limit) || limit < 1) return null
  const safeLimit = Math.min(limit, 50)
  return {
    page,
    limit: safeLimit,
    skip: (page - 1) * safeLimit,
  }
}

async function assertProductVisibleForPublic(id) {
  const p = await Product.findById(id).select('showOnStorefront').lean()
  if (!p) return null
  if (p.showOnStorefront === false) return null
  return p
}

function withPurchaseCount(productDoc) {
  const sold = Number(productDoc?.soldCount ?? productDoc?.purchaseCount ?? 0)
  const soldCount = Number.isFinite(sold) && sold >= 0 ? Math.floor(sold) : 0
  return {
    ...productDoc,
    soldCount,
    purchaseCount: soldCount,
  }
}

/** POST /api/products/upload — upload ảnh sản phẩm lên Cloudinary */
router.post('/upload', authRequired, (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Cần quyền quản trị.' })
  }
  if (!isCloudinaryReady) {
    return res.status(500).json({
      message:
        'Cloudinary chưa được cấu hình. Cần CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.',
    })
  }
  next()
}, productUpload, (req, res) => {
  if (req.file) {
    return res.status(201).json({
      secure_url: req.file.path,
      public_id: req.file.filename,
    })
  }
  const rawExternalUrl = String(
    req.body?.googleDriveUrl || req.body?.imageUrl || '',
  ).trim()
  if (!rawExternalUrl) {
    return res.status(400).json({
      message: 'Vui lòng chọn file ảnh hoặc gửi googleDriveUrl/imageUrl.',
    })
  }
  resolveExternalImageUrl(rawExternalUrl, {
    uploadToCloudinary: true,
    folder: 'ThaiVu_Products',
  })
    .then((out) =>
      res.status(201).json({
        secure_url: out.url,
        public_id: out.public_id,
      }),
    )
    .catch((e) => {
      console.error(e)
      res.status(e?.status || 500).json({
        message: 'Không upload được ảnh từ URL bên ngoài.',
      })
    })
})

/** GET /api/products?category=... — danh sách SP */
router.get('/', async (req, res) => {
  try {
    const categoryQuery = String(req.query.category || '').trim()
    const filter = { ...STOREFRONT_FILTER }

    if (categoryQuery) {
      const categoryIds = await resolveCategoryIdsByQuery(categoryQuery)
      if (!categoryIds.length) {
        return res.json({ items: [], absoluteMaxPrice: 0 })
      }
      filter.category = { $in: categoryIds }
    }

    const [list, absoluteMaxPrice] = await Promise.all([
      Product.find(filter).populate('category', 'name').lean(),
      getAbsoluteMaxPrice(),
    ])
    res.json({ items: list.map(withPurchaseCount), absoluteMaxPrice })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được danh sách sản phẩm.' })
  }
})

/** GET /api/products/search?q=... — smart search theo name/category/tags/compatibleVehicles */
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) {
      const absoluteMaxPrice = await getAbsoluteMaxPrice()
      return res.json({ items: [], absoluteMaxPrice })
    }
    const regex = new RegExp(q, 'i')
    const catIds = await Category.find({ name: regex })
      .select('_id')
      .lean()
      .then((rows) => rows.map((r) => r._id))

    const [list, absoluteMaxPrice] = await Promise.all([
      Product.find({
        ...STOREFRONT_FILTER,
        $or: [
          { $text: { $search: q } },
          { name: regex },
          { tags: regex },
          { compatibleVehicles: regex },
          { category: { $in: catIds } },
        ],
      })
        .populate('category', 'name')
        .lean(),
      getAbsoluteMaxPrice(),
    ])
    res.json({ items: list.map(withPurchaseCount), absoluteMaxPrice })
  } catch (e) {
    // Fallback an toàn khi text index chưa được build.
    const q = String(req.query.q || '').trim()
    const regex = new RegExp(q, 'i')
    const catIds = await Category.find({ name: regex })
      .select('_id')
      .lean()
      .then((rows) => rows.map((r) => r._id))
    const [list, absoluteMaxPrice] = await Promise.all([
      Product.find({
        ...STOREFRONT_FILTER,
        $or: [
          { name: regex },
          { tags: regex },
          { compatibleVehicles: regex },
          { category: { $in: catIds } },
        ],
      })
        .populate('category', 'name')
        .lean(),
      getAbsoluteMaxPrice(),
    ])
    res.json({ items: list.map(withPurchaseCount), absoluteMaxPrice })
  }
})

/** GET /api/products/best-sellers?page=1&limit=10 */
router.get('/best-sellers', async (req, res) => {
  try {
    const paging = parsePagination(req)
    if (!paging) {
      return res.status(400).json({ message: 'page/limit không hợp lệ.' })
    }

    const filter = {
      ...STOREFRONT_FILTER,
      bestSellerEnabled: true,
    }
    const [total, rows] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .populate('category', 'name')
        .sort({ bestSellerOrder: 1, soldCount: -1, name: 1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .lean(),
    ])
    const items = rows.map((row) => {
      const product = withPurchaseCount(row)
      return {
        soldQuantity: Number(product.soldCount || 0),
        product,
      }
    })

    res.json({
      items,
      page: paging.page,
      limit: paging.limit,
      total,
      totalPages: Math.ceil(total / paging.limit) || 0,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được sản phẩm bán chạy.' })
  }
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
    const [byRating, total] = await Promise.all([
      countReviewsByStarBuckets(pid),
      Review.countDocuments({ product: pid }),
    ])
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
        { video: { $regex: /\S/ } },
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
      const r = Number.parseInt(String(rQ), 10)
      const bucket = reviewRatingBucketFilter(r)
      if (bucket) parts.push(bucket)
    }
    if (req.query.hasComment === 'true') {
      parts.push({ comment: { $regex: /\S/ } })
    }
    if (req.query.hasMedia === 'true') {
      parts.push({
        $or: [
          { 'images.0': { $exists: true } },
          { video: { $regex: /\S/ } },
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
      items: items.map(toPublicReviewShape),
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
      productQuality = '',
      isCorrectDescription = '',
      images,
      video = '',
    } = req.body

    if (!Number.isFinite(Number(rating))) {
      return res.status(400).json({ message: 'Thiếu hoặc sai rating (1–5).' })
    }
    const r = Number(rating)
    if (r < 0 || r > 5) {
      return res.status(400).json({ message: 'rating phải từ 0 đến 5.' })
    }
    if (Math.round(r * 2) / 2 !== r) {
      return res
        .status(400)
        .json({ message: 'rating phải theo bước 0.5 (vd: 3, 3.5, 4).' })
    }

    if (req.user?.role === 'admin') {
      return res
        .status(403)
        .json({ message: 'Admin cannot purchase or review products.' })
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
    const videoUrl = String(video || '').trim()

    let created
    try {
      created = await Review.create({
        product: id,
        user: req.userId,
        isStoreReview: false,
        rating: r,
        variantId: variantId || undefined,
        variantLabel: String(variantLabel).trim(),
        comment: String(comment).trim(),
        productQuality: String(productQuality).trim(),
        isCorrectDescription: String(isCorrectDescription).trim(),
        images: imageList,
        video: videoUrl,
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
    res.status(201).json(toPublicReviewShape(out))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không gửi được đánh giá.' })
  }
})

/**
 * GET /api/products/:id/related
 * relatedByCategory: chỉ SP cùng partCategory (không lấp thêm). relatedByBrand: cùng brand khác loại; thiếu có thể lấp bán chạy.
 */
router.get('/:id/related', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }

    const product = await Product.findById(id)
      .select('category brand partCategory showOnStorefront')
      .lean()
    if (!product || product.showOnStorefront === false) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    const payload = await getRelatedProductLists(product)
    res.json(payload)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được gợi ý sản phẩm.' })
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
  const out = withPurchaseCount(p)
  if (!Number.isFinite(out.wishlistCount)) out.wishlistCount = 0
  res.json(out)
})

module.exports = router
