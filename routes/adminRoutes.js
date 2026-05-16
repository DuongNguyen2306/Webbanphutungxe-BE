const express = require('express')
const mongoose = require('mongoose')
const { Category } = require('../models/Category')
const { Product } = require('../models/Product')
const { Review } = require('../models/Review')
const { Wishlist } = require('../models/Wishlist')
const { Order } = require('../models/Order')
const { User } = require('../models/User')
const { resolveCategory } = require('../lib/categories')
const { recalculateProductRating } = require('../lib/productRating')
const {
  normalizeProductVariantData,
  generateSku,
  createValidationError,
} = require('../lib/productVariants')
const {
  normalizeOrderStatus,
  withUrgentFlag,
  ORDER_STATUS_OPTIONS,
} = require('../lib/orders')
const { toPublicReviewShape } = require('../lib/reviewPublicShape')
const {
  DEFAULT_PART_CATEGORY,
  resolvePartCategory,
} = require('../lib/partCategories')
const { normalizeBadgeTags } = require('../lib/productBadgeTags')

const router = express.Router()
const ALL_STATUS_KEYS = new Set(['ALL', 'TAT_CA'])

function adminOnly(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Chỉ admin được phép thực hiện.' })
  }
  next()
}

function formatVariantLabel(v) {
  const dk = String(v?.displayKey || v?.key || '').trim()
  if (dk) return dk
  return [v?.typeName, v?.color, v?.size].filter(Boolean).join(' - ')
}

function normalizeProductInput(body) {
  return normalizeProductVariantData(body)
}

async function buildSkuAllocator(productId) {
  const reserved = new Set()
  return async (baseSku) => {
    const normalizedBase = String(baseSku || '').trim()
    if (!normalizedBase) {
      throw createValidationError('Không thể tạo SKU tự động.')
    }
    let candidate = normalizedBase
    let suffix = 0
    while (true) {
      const inRequest = reserved.has(candidate)
      // eslint-disable-next-line no-await-in-loop
      const inDb = await Product.exists({
        _id: productId ? { $ne: productId } : { $exists: true },
        'variants.sku': candidate,
      })
      if (!inRequest && !inDb) {
        reserved.add(candidate)
        return candidate
      }
      suffix += 1
      candidate = `${normalizedBase}-${suffix}`
    }
  }
}

async function ensureVariantSkus(productName, variants, productId) {
  const allocateSku = await buildSkuAllocator(productId)
  const out = []
  for (const variant of variants) {
    const row = { ...variant }
    const draftSku = String(row.sku || '').trim() || generateSku(productName, row)
    // eslint-disable-next-line no-await-in-loop
    row.sku = await allocateSku(draftSku)
    out.push(row)
  }
  return out
}

function getStatusFromBody(body) {
  if (typeof body === 'string') return body
  if (!body || typeof body !== 'object') return undefined
  return body.status ?? body.orderStatus ?? body.nextStatus ?? body.value
}

function getNoteFromBody(body) {
  if (!body || typeof body !== 'object') return undefined
  return body.note ?? body.reason ?? body.cancelReason
}

function normalizeFilterKey(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]+/g, '_')
}

function buildShippingAddressText(order) {
  const a = order?.shippingAddress
  if (!a || typeof a !== 'object') return ''
  return [a.detail, a.ward, a.district, a.province]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

function normalizeManualSoldCount(body, fallback = 0) {
  const raw = body?.soldCount ?? body?.purchaseCount
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function normalizeBestSellerEnabled(body, fallback = false) {
  const raw = body?.bestSellerEnabled ?? body?.isBestSeller ?? body?.showInBestSellers
  if (raw === undefined) return fallback
  return Boolean(raw)
}

function normalizeBestSellerOrder(body, fallback = 0) {
  const raw = body?.bestSellerOrder ?? body?.bestSellerRank ?? body?.bestSellerPosition
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function normalizeNewArrivalEnabled(body, fallback = false) {
  const raw =
    body?.newArrivalEnabled ??
    body?.showInNewArrivals ??
    body?.isNewArrival ??
    body?.hangMoiVe
  if (raw === undefined) return fallback
  return Boolean(raw)
}

function normalizeNewArrivalOrder(body, fallback = 0) {
  const raw =
    body?.newArrivalOrder ??
    body?.newArrivalRank ??
    body?.newArrivalPosition
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function parseNonNegativeNumber(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

function withManualPurchaseCount(productDoc) {
  const sold = Number(productDoc?.soldCount ?? 0)
  const soldCount = Number.isFinite(sold) && sold >= 0 ? Math.floor(sold) : 0
  return {
    ...productDoc,
    soldCount,
    purchaseCount: soldCount,
  }
}

function parseStoreReviewRating(raw) {
  if (!Number.isFinite(Number(raw))) {
    throw createValidationError('Thiếu hoặc sai số sao (0–5).')
  }
  const r = Number(raw)
  if (r < 0 || r > 5) {
    throw createValidationError('Số sao phải từ 0 đến 5.')
  }
  if (Math.round(r * 2) / 2 !== r) {
    throw createValidationError('Số sao phải theo bước 0.5 (vd: 3, 3.5, 4).')
  }
  return r
}

/** Thay toàn bộ đánh giá tự đánh giá (cửa hàng) của SP; không đụng đánh giá khách. */
async function replaceStoreReviewsForProduct(productId, items) {
  if (!Array.isArray(items)) {
    throw createValidationError('storeReviews phải là mảng.')
  }
  const normalized = []
  for (const raw of items) {
    const name = String(raw.reviewerDisplayName ?? raw.name ?? '').trim()
    const comment = String(raw.comment ?? raw.description ?? '').trim()
    const rating = parseStoreReviewRating(raw.rating ?? raw.stars)
    if (!name) {
      throw createValidationError(
        'Mỗi tự đánh giá cần tên (reviewerDisplayName hoặc name).',
      )
    }
    normalized.push({ reviewerDisplayName: name, comment, rating })
  }
  await Review.deleteMany({ product: productId, isStoreReview: true })
  for (const row of normalized) {
    await Review.create({
      product: productId,
      user: null,
      isStoreReview: true,
      reviewerDisplayName: row.reviewerDisplayName,
      comment: row.comment,
      rating: row.rating,
    })
  }
  await recalculateProductRating(productId)
}

router.get('/products', async (_req, res) => {
  const list = await Product.find().populate('category', 'name').lean()
  res.json(list.map(withManualPurchaseCount))
})

router.get('/products/:id', async (req, res) => {
  const p = await Product.findById(req.params.id)
    .populate('category', 'name')
    .lean()
  if (!p) return res.status(404).json({ message: 'Không tìm thấy.' })
  res.json(withManualPurchaseCount(p))
})

router.post('/products', async (req, res) => {
  let doc
  try {
    if (!req.body.name?.trim())
      return res.status(400).json({ message: 'Tên sản phẩm là bắt buộc.' })
    const manualSoldCount = normalizeManualSoldCount(req.body, 0)
    if (manualSoldCount === null) {
      return res.status(400).json({ message: 'Số lượng đã mua không hợp lệ.' })
    }
    const bestSellerEnabled = normalizeBestSellerEnabled(req.body, false)
    const bestSellerOrder = normalizeBestSellerOrder(req.body, 0)
    if (bestSellerOrder === null) {
      return res.status(400).json({ message: 'Thứ tự bán chạy không hợp lệ.' })
    }
    const newArrivalEnabled = normalizeNewArrivalEnabled(req.body, false)
    const newArrivalOrder = normalizeNewArrivalOrder(req.body, 0)
    if (newArrivalOrder === null) {
      return res.status(400).json({ message: 'Thứ tự hàng mới về không hợp lệ.' })
    }
    let partCategory = DEFAULT_PART_CATEGORY
    if (req.body.partCategory != null && req.body.partCategory !== '') {
      const resolved = resolvePartCategory(req.body.partCategory)
      if (!resolved) {
        return res.status(400).json({
          message:
            'Loại phụ tùng (partCategory) không hợp lệ. Xem GET /api/part-categories.',
        })
      }
      partCategory = resolved
    }
    const catId = await resolveCategory(req.body.category)
    const normalized = normalizeProductInput(req.body)
    const variantsWithSku = await ensureVariantSkus(
      req.body.name,
      normalized.variants,
    )
    doc = await Product.create({
      name: req.body.name.trim(),
      slug: req.body.slug,
      category: catId,
      description: req.body.description ?? '',
      tags: Array.isArray(req.body.tags)
        ? req.body.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
        : [],
      badgeTags: normalizeBadgeTags(req.body.badgeTags),
      compatibleVehicles: Array.isArray(req.body.compatibleVehicles)
        ? req.body.compatibleVehicles.map((x) => String(x).trim()).filter(Boolean)
        : [],
      images: Array.isArray(req.body.images) ? req.body.images : [],
      videoUrl: String(req.body.videoUrl ?? '').trim(),
      brand: req.body.brand ?? 'honda',
      vehicleType: req.body.vehicleType ?? 'scooter',
      partCategory,
      partCategoryNote:
        req.body.partCategoryNote !== undefined
          ? String(req.body.partCategoryNote)
          : '',
      showOnStorefront: req.body.showOnStorefront !== false,
      rating: req.body.rating ?? 4.5,
      reviewCount: req.body.reviewCount ?? 0,
      soldCount: manualSoldCount,
      bestSellerEnabled,
      bestSellerOrder,
      newArrivalEnabled,
      newArrivalOrder,
      hasVariants: normalized.hasVariants,
      price: normalized.price,
      stock: normalized.stock,
      sku: normalized.sku,
      image: normalized.image,
      originalPrice: normalized.originalPrice,
      attributes: normalized.attributes,
      variants: variantsWithSku,
    })
    if (req.body.storeReviews !== undefined) {
      await replaceStoreReviewsForProduct(doc._id, req.body.storeReviews)
    }
    const populated = await doc.populate('category', 'name')
    res.status(201).json(withManualPurchaseCount(populated.toObject()))
  } catch (e) {
    if (doc?._id) {
      try {
        await Product.findByIdAndDelete(doc._id)
      } catch (_) {}
    }
    console.error(e)
    if (e?.status) {
      return res.status(e.status).json({ message: e.message })
    }
    res.status(500).json({ message: 'Không tạo được sản phẩm.' })
  }
})

router.put('/products/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
    if (!p) return res.status(404).json({ message: 'Không tìm thấy.' })
    if (req.body.name) p.name = String(req.body.name).trim()
    if (req.body.category != null)
      p.category = await resolveCategory(req.body.category)
    if (req.body.description != null) p.description = req.body.description
    if (Array.isArray(req.body.tags))
      p.tags = req.body.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
    if (Array.isArray(req.body.badgeTags))
      p.badgeTags = normalizeBadgeTags(req.body.badgeTags)
    if (Array.isArray(req.body.compatibleVehicles))
      p.compatibleVehicles = req.body.compatibleVehicles
        .map((x) => String(x).trim())
        .filter(Boolean)
    if (Array.isArray(req.body.images)) p.images = req.body.images
    if (req.body.videoUrl !== undefined) p.videoUrl = String(req.body.videoUrl).trim()
    if (req.body.brand != null) p.brand = req.body.brand
    if (req.body.vehicleType != null) p.vehicleType = req.body.vehicleType
    if (req.body.partCategory != null && req.body.partCategory !== '') {
      const resolved = resolvePartCategory(req.body.partCategory)
      if (!resolved) {
        return res.status(400).json({
          message:
            'Loại phụ tùng (partCategory) không hợp lệ. Xem GET /api/part-categories.',
        })
      }
      p.partCategory = resolved
    }
    if (req.body.partCategoryNote !== undefined) {
      p.partCategoryNote = String(req.body.partCategoryNote)
    }
    if (req.body.showOnStorefront !== undefined)
      p.showOnStorefront = Boolean(req.body.showOnStorefront)
    if (req.body.soldCount !== undefined || req.body.purchaseCount !== undefined) {
      const manualSoldCount = normalizeManualSoldCount(req.body, p.soldCount || 0)
      if (manualSoldCount === null) {
        return res.status(400).json({ message: 'Số lượng đã mua không hợp lệ.' })
      }
      p.soldCount = manualSoldCount
    }
    if (
      req.body.bestSellerEnabled !== undefined ||
      req.body.isBestSeller !== undefined ||
      req.body.showInBestSellers !== undefined
    ) {
      p.bestSellerEnabled = normalizeBestSellerEnabled(
        req.body,
        Boolean(p.bestSellerEnabled),
      )
    }
    if (
      req.body.bestSellerOrder !== undefined ||
      req.body.bestSellerRank !== undefined ||
      req.body.bestSellerPosition !== undefined
    ) {
      const bestSellerOrder = normalizeBestSellerOrder(
        req.body,
        Number(p.bestSellerOrder || 0),
      )
      if (bestSellerOrder === null) {
        return res.status(400).json({ message: 'Thứ tự bán chạy không hợp lệ.' })
      }
      p.bestSellerOrder = bestSellerOrder
    }
    if (
      req.body.newArrivalEnabled !== undefined ||
      req.body.showInNewArrivals !== undefined ||
      req.body.isNewArrival !== undefined ||
      req.body.hangMoiVe !== undefined
    ) {
      p.newArrivalEnabled = normalizeNewArrivalEnabled(
        req.body,
        Boolean(p.newArrivalEnabled),
      )
    }
    if (
      req.body.newArrivalOrder !== undefined ||
      req.body.newArrivalRank !== undefined ||
      req.body.newArrivalPosition !== undefined
    ) {
      const newArrivalOrder = normalizeNewArrivalOrder(
        req.body,
        Number(p.newArrivalOrder || 0),
      )
      if (newArrivalOrder === null) {
        return res.status(400).json({ message: 'Thứ tự hàng mới về không hợp lệ.' })
      }
      p.newArrivalOrder = newArrivalOrder
    }
    if (
      req.body.hasVariants !== undefined ||
      req.body.price !== undefined ||
      req.body.stock !== undefined ||
      req.body.stockQuantity !== undefined ||
      req.body.sku !== undefined ||
      req.body.image !== undefined ||
      req.body.originalPrice !== undefined ||
      req.body.variants !== undefined ||
      req.body.attributes !== undefined ||
      req.body.basePrice !== undefined
    ) {
      const normalized = normalizeProductInput({
        ...req.body,
        hasVariants:
          req.body.hasVariants !== undefined ? req.body.hasVariants : p.hasVariants,
        price: req.body.price !== undefined ? req.body.price : p.price,
        stock:
          req.body.stock !== undefined
            ? req.body.stock
            : req.body.stockQuantity !== undefined
              ? req.body.stockQuantity
              : p.stock,
        sku: req.body.sku !== undefined ? req.body.sku : p.sku,
        image: req.body.image !== undefined ? req.body.image : p.image,
        originalPrice:
          req.body.originalPrice !== undefined
            ? req.body.originalPrice
            : p.originalPrice,
        attributes:
          req.body.attributes !== undefined ? req.body.attributes : p.attributes,
        variants: req.body.variants !== undefined ? req.body.variants : p.variants,
        basePrice:
          req.body.basePrice !== undefined ? req.body.basePrice : p.minPrice,
      })
      const variantsWithSku = await ensureVariantSkus(
        req.body.name ?? p.name,
        normalized.variants,
        p._id,
      )
      p.hasVariants = normalized.hasVariants
      p.price = normalized.price
      p.stock = normalized.stock
      p.sku = normalized.sku
      p.image = normalized.image
      p.originalPrice = normalized.originalPrice
      p.attributes = normalized.attributes
      p.variants = variantsWithSku
    }
    await p.save()
    if (req.body.storeReviews !== undefined) {
      await replaceStoreReviewsForProduct(p._id, req.body.storeReviews)
    }
    const out = await Product.findById(p._id).populate('category', 'name').lean()
    res.json(withManualPurchaseCount(out))
  } catch (e) {
    console.error(e)
    if (e?.status) {
      return res.status(e.status).json({ message: e.message })
    }
    res.status(500).json({ message: 'Cập nhật thất bại.' })
  }
})

router.post('/products/:productId/store-reviews', async (req, res) => {
  try {
    const { productId } = req.params
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }
    const product = await Product.findById(productId)
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    const name = String(req.body.reviewerDisplayName ?? req.body.name ?? '').trim()
    const comment = String(req.body.comment ?? req.body.description ?? '').trim()
    if (!name) {
      return res.status(400).json({ message: 'Tên hiển thị đánh giá là bắt buộc.' })
    }
    const rating = parseStoreReviewRating(req.body.rating ?? req.body.stars)
    const created = await Review.create({
      product: productId,
      user: null,
      isStoreReview: true,
      reviewerDisplayName: name,
      comment,
      rating,
    })
    await recalculateProductRating(productId)
    const out = await Review.findById(created._id).populate('user', 'email phone').lean()
    res.status(201).json(toPublicReviewShape(out))
  } catch (e) {
    console.error(e)
    if (e?.status) {
      return res.status(e.status).json({ message: e.message })
    }
    res.status(500).json({ message: 'Không tạo được đánh giá tự đánh giá.' })
  }
})

router.patch('/reviews/:reviewId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reviewId)) {
      return res.status(400).json({ message: 'ID đánh giá không hợp lệ.' })
    }
    const r = await Review.findById(req.params.reviewId)
    if (!r) return res.status(404).json({ message: 'Không tìm thấy đánh giá.' })
    if (!r.isStoreReview) {
      return res
        .status(400)
        .json({ message: 'Chỉ có thể sửa đánh giá tự đánh giá (cửa hàng).' })
    }
    if (req.body.reviewerDisplayName !== undefined || req.body.name !== undefined) {
      const name = String(req.body.reviewerDisplayName ?? req.body.name ?? '').trim()
      if (!name) {
        return res.status(400).json({ message: 'Tên hiển thị không được để trống.' })
      }
      r.reviewerDisplayName = name
    }
    if (req.body.comment !== undefined || req.body.description !== undefined) {
      r.comment = String(req.body.comment ?? req.body.description ?? '').trim()
    }
    if (req.body.rating !== undefined || req.body.stars !== undefined) {
      try {
        r.rating = parseStoreReviewRating(req.body.rating ?? req.body.stars)
      } catch (e) {
        if (e?.status) {
          return res.status(e.status).json({ message: e.message })
        }
        throw e
      }
    }
    await r.save()
    await recalculateProductRating(r.product)
    const out = await Review.findById(r._id).populate('user', 'email phone').lean()
    res.json(toPublicReviewShape(out))
  } catch (e) {
    console.error(e)
    if (e?.status) {
      return res.status(e.status).json({ message: e.message })
    }
    res.status(500).json({ message: 'Không cập nhật được đánh giá.' })
  }
})

router.patch('/products/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
    if (!p) return res.status(404).json({ message: 'Không tìm thấy.' })
    if (req.body.showOnStorefront !== undefined)
      p.showOnStorefront = Boolean(req.body.showOnStorefront)
    await p.save()
    const out = await Product.findById(p._id).populate('category', 'name').lean()
    res.json(withManualPurchaseCount(out))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Cập nhật thất bại.' })
  }
})

router.delete('/products/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
    if (!p) return res.status(404).json({ message: 'Không tìm thấy.' })
    await Review.deleteMany({ product: p._id })
    await Wishlist.deleteMany({ productId: p._id })
    await Product.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không xóa được.' })
  }
})

router.delete('/reviews/:reviewId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reviewId)) {
      return res.status(400).json({ message: 'ID đánh giá không hợp lệ.' })
    }
    const r = await Review.findByIdAndDelete(req.params.reviewId)
    if (!r) return res.status(404).json({ message: 'Không tìm thấy đánh giá.' })
    await recalculateProductRating(r.product)
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không xóa được đánh giá.' })
  }
})

router.patch(
  '/products/:productId/variants/:variantId/availability',
  async (req, res) => {
    if (typeof req.body.isAvailable !== 'boolean')
      return res.status(400).json({ message: 'Cần isAvailable: boolean.' })
    const p = await Product.findById(req.params.productId)
    if (!p) return res.status(404).json({ message: 'Không tìm thấy SP.' })
    const v = p.variants.id(req.params.variantId)
    if (!v) return res.status(404).json({ message: 'Không tìm thấy biến thể.' })
    v.isAvailable = req.body.isAvailable
    await p.save()
    res.json({ ok: true, variant: v })
  },
)

router.patch('/products/:id/variant-prices', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }
    const updates = Array.isArray(req.body?.variantPrices)
      ? req.body.variantPrices
      : Array.isArray(req.body?.items)
        ? req.body.items
        : []
    if (!updates.length) {
      return res.status(400).json({
        message: 'Cần mảng variantPrices/items để cập nhật giá biến thể.',
      })
    }

    const p = await Product.findById(req.params.id)
    if (!p) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })

    let updatedCount = 0
    for (let idx = 0; idx < updates.length; idx += 1) {
      const row = updates[idx] || {}
      const line = idx + 1
      const variantId = String(row.variantId ?? row._id ?? '').trim()
      const key = String(row.key ?? row.displayKey ?? '').trim()

      const variant =
        (variantId && mongoose.isValidObjectId(variantId) && p.variants.id(variantId)) ||
        (key &&
          p.variants.find(
            (v) =>
              String(v.key || '').trim() === key ||
              String(v.displayKey || '').trim() === key,
          ))
      if (!variant) {
        return res.status(400).json({
          message: `Không tìm thấy biến thể ở dòng #${line}.`,
        })
      }

      if (row.price === undefined || row.price === null || row.price === '') {
        return res.status(400).json({
          message: `Thiếu giá cho biến thể dòng #${line}.`,
        })
      }
      const nextPrice = parseNonNegativeNumber(row.price)
      if (nextPrice === null) {
        return res.status(400).json({
          message: `Giá không hợp lệ ở dòng #${line}.`,
        })
      }
      variant.price = nextPrice

      if (Object.prototype.hasOwnProperty.call(row, 'originalPrice')) {
        if (
          row.originalPrice === undefined ||
          row.originalPrice === null ||
          row.originalPrice === ''
        ) {
          variant.originalPrice = undefined
        } else {
          const nextOriginal = parseNonNegativeNumber(row.originalPrice)
          if (nextOriginal === null) {
            return res.status(400).json({
              message: `Giá gốc không hợp lệ ở dòng #${line}.`,
            })
          }
          variant.originalPrice = nextOriginal
        }
      }
      updatedCount += 1
    }

    await p.save()
    const out = await Product.findById(p._id).populate('category', 'name').lean()
    res.json({ ok: true, updatedCount, product: withManualPurchaseCount(out) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không cập nhật được giá biến thể.' })
  }
})

router.get('/orders', async (req, res) => {
  const statusQ = req.query?.status
  const filter = {}
  const statusKey = normalizeFilterKey(statusQ)
  if (statusKey && !ALL_STATUS_KEYS.has(statusKey)) {
    if (statusKey === 'CHO_XAC_NHAN') {
      // Tab "Chờ xác nhận": gồm cả đơn chờ xử lý + đang liên hệ.
      filter.status = { $in: ['PENDING', 'CONTACTING'] }
    } else if (statusKey === 'CHO_GIAO_HANG' || statusKey === 'CHO_LAY_HANG') {
      // Tab "Chờ giao hàng"/"Chờ lấy hàng": gom đơn đã xác nhận.
      filter.status = 'CONFIRMED'
    } else {
      const normalizedStatus = normalizeOrderStatus(statusQ)
      if (!normalizedStatus) {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ.' })
      }
      filter.status = normalizedStatus
    }
  }

  const list = await Order.find(filter)
    .populate('user', 'email phone')
    .sort({ createdAt: -1 })
    .lean()
  res.json(list.map(withUrgentFlag))
})

router.get('/orders/status-options', async (_req, res) => {
  res.json({ statuses: ORDER_STATUS_OPTIONS })
})

router.get('/orders/urgent', async (_req, res) => {
  const threshold = new Date(Date.now() - 30 * 60 * 1000)
  const list = await Order.find({
    status: { $in: ['PENDING', 'pending'] },
    createdAt: { $lte: threshold },
  })
    .populate('user', 'email phone')
    .sort({ createdAt: 1 })
    .lean()
  res.json(list.map(withUrgentFlag))
})

router.get('/orders/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
    }

    const order = await Order.findById(req.params.id)
      .populate('user', 'email phone displayName role')
      .lean()
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn.' })

    const productIds = [
      ...new Set(
        (order.items || [])
          .map((i) => i.productId && String(i.productId))
          .filter(Boolean),
      ),
    ]
    const products = await Product.find({ _id: { $in: productIds } })
      .select(
        'name images variants._id variants.key variants.displayKey variants.typeName variants.color variants.size variants.price variants.originalPrice variants.stockQuantity variants.isAvailable variants.sku variants.images',
      )
      .lean()
    const productMap = new Map(products.map((p) => [String(p._id), p]))

    const enriched = {
      ...order,
      shippingAddressText: buildShippingAddressText(order),
      items: (order.items || []).map((i) => {
        const p = productMap.get(String(i.productId))
        const v = p?.variants?.find(
          (variant) => String(variant._id) === String(i.variantId),
        )
        return {
          ...i,
          name: i.name || p?.name || '',
          variantLabel: i.variantLabel || formatVariantLabel(v) || '',
          thumbnail: v?.images?.[0] || p?.images?.[0] || '',
          product: p
            ? {
                _id: p._id,
                name: p.name || '',
                images: p.images || [],
              }
            : null,
          variant: v
            ? {
                _id: v._id,
                key: v.key || '',
                displayKey: v.displayKey || '',
                typeName: v.typeName || '',
                color: v.color || '',
                size: v.size || '',
                price: Number(v.price || 0),
                originalPrice: Number(v.originalPrice || 0),
                stockQuantity: Number(v.stockQuantity || 0),
                isAvailable: Boolean(v.isAvailable),
                sku: v.sku || '',
                images: v.images || [],
              }
            : null,
        }
      }),
    }

    res.json(enriched)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được chi tiết đơn.' })
  }
})

router.patch('/orders/:id/status', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
  }
  const status = normalizeOrderStatus(getStatusFromBody(req.body))
  if (!status) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' })
  }

  const current = await Order.findById(req.params.id).select('status')
  if (!current) return res.status(404).json({ message: 'Không tìm thấy đơn.' })

  const noteInput = getNoteFromBody(req.body)
  const note =
    noteInput !== undefined && noteInput !== null
      ? String(noteInput).trim()
      : undefined
  if (status === 'COMPLETED' && current.status !== 'SHIPPING') {
    return res.status(400).json({
      message: 'Chỉ được chuyển Hoàn thành khi đơn đang ở trạng thái Đang giao.',
    })
  }
  if (status === 'CANCELLED') {
    if (!note) {
      return res.status(400).json({ message: 'Cần nhập lý do hủy đơn.' })
    }
    if (!['PENDING', 'CONTACTING'].includes(current.status)) {
      return res
        .status(400)
        .json({ message: 'Chỉ được hủy khi đơn chưa được xác nhận.' })
    }
  }

  const update = { status }
  if (status === 'CANCELLED') {
    update.note = note
  } else if (note !== undefined) {
    update.note = note
  }

  const o = await Order.findByIdAndUpdate(req.params.id, update, {
    returnDocument: 'after',
  }).lean()
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn.' })
  res.json(o)
})

/** Cập nhật đơn vị vận chuyển & mã giao hàng (khách xem qua GET đơn). */
router.patch('/orders/:id/delivery', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
    }

    const current = await Order.findById(req.params.id).select('status')
    if (!current) return res.status(404).json({ message: 'Không tìm thấy đơn.' })

    if (current.status === 'CANCELLED') {
      return res
        .status(400)
        .json({ message: 'Không cập nhật vận chuyển cho đơn đã hủy.' })
    }
    if (!['CONFIRMED', 'SHIPPING', 'COMPLETED'].includes(current.status)) {
      return res.status(400).json({
        message:
          'Chỉ cập nhật khi đơn đã xác nhận, đang giao hoặc hoàn thành.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const hasCarrier = Object.prototype.hasOwnProperty.call(body, 'carrierName')
    const hasTracking = Object.prototype.hasOwnProperty.call(
      body,
      'trackingNumber',
    )
    if (!hasCarrier && !hasTracking) {
      return res.status(400).json({
        message: 'Cần gửi carrierName và/hoặc trackingNumber.',
      })
    }

    const $set = {}
    if (hasCarrier) {
      $set['delivery.carrierName'] = String(body.carrierName || '')
        .trim()
        .slice(0, 200)
    }
    if (hasTracking) {
      $set['delivery.trackingNumber'] = String(body.trackingNumber || '')
        .trim()
        .slice(0, 200)
    }

    const o = await Order.findByIdAndUpdate(req.params.id, { $set }, { new: true }).lean()
    if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn.' })
    res.json(o)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không cập nhật được thông tin vận chuyển.' })
  }
})

router.get('/users', adminOnly, async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean()
  res.json(users)
})

router.post('/users/staff', adminOnly, async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase()
    const phone = String(req.body?.phone || '').trim()
    const password = String(req.body?.password || '')
    const displayName = String(
      req.body?.displayName ?? req.body?.name ?? '',
    ).trim()
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu tối thiểu 6 ký tự.' })
    }
    if (!email && !phone) {
      return res.status(400).json({ message: 'Cần email hoặc số điện thoại.' })
    }
    if (email) {
      const existedEmail = await User.findOne({ email }).select('_id')
      if (existedEmail) {
        return res.status(409).json({ message: 'Email đã được dùng.' })
      }
    }
    if (phone) {
      const existedPhone = await User.findOne({ phone }).select('_id')
      if (existedPhone) {
        return res.status(409).json({ message: 'Số điện thoại đã được dùng.' })
      }
    }

    const passwordHash = await User.hashPassword(password)
    const created = await User.create({
      email: email || undefined,
      phone: phone || undefined,
      displayName,
      passwordHash,
      role: 'staff',
    })
    const safe = created.toObject()
    delete safe.passwordHash
    res.status(201).json(safe)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tạo được tài khoản staff.' })
  }
})

router.get('/categories', async (_req, res) => {
  const list = await Category.find().sort({ name: 1 }).lean()
  res.json(list)
})

module.exports = router
