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

const router = express.Router()

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

function buildShippingAddressText(order) {
  const a = order?.shippingAddress
  if (!a || typeof a !== 'object') return ''
  return [a.detail, a.ward, a.district, a.province]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

router.get('/products', async (_req, res) => {
  const list = await Product.find().populate('category', 'name').lean()
  res.json(list)
})

router.get('/products/:id', async (req, res) => {
  const p = await Product.findById(req.params.id)
    .populate('category', 'name')
    .lean()
  if (!p) return res.status(404).json({ message: 'Không tìm thấy.' })
  res.json(p)
})

router.post('/products', async (req, res) => {
  try {
    if (!req.body.name?.trim())
      return res.status(400).json({ message: 'Tên sản phẩm là bắt buộc.' })
    const catId = await resolveCategory(req.body.category)
    const normalized = normalizeProductInput(req.body)
    const variantsWithSku = await ensureVariantSkus(
      req.body.name,
      normalized.variants,
    )
    const doc = await Product.create({
      name: req.body.name.trim(),
      slug: req.body.slug,
      category: catId,
      description: req.body.description ?? '',
      tags: Array.isArray(req.body.tags)
        ? req.body.tags.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
        : [],
      compatibleVehicles: Array.isArray(req.body.compatibleVehicles)
        ? req.body.compatibleVehicles.map((x) => String(x).trim()).filter(Boolean)
        : [],
      images: Array.isArray(req.body.images) ? req.body.images : [],
      brand: req.body.brand ?? 'honda',
      vehicleType: req.body.vehicleType ?? 'scooter',
      partCategory: req.body.partCategory ?? 'accessories',
      homeFeature: req.body.homeFeature || null,
      showOnStorefront: req.body.showOnStorefront !== false,
      rating: req.body.rating ?? 4.5,
      reviewCount: req.body.reviewCount ?? 0,
      soldCount: req.body.soldCount ?? 0,
      hasVariants: normalized.hasVariants,
      price: normalized.price,
      stock: normalized.stock,
      sku: normalized.sku,
      image: normalized.image,
      originalPrice: normalized.originalPrice,
      attributes: normalized.attributes,
      variants: variantsWithSku,
    })
    const populated = await doc.populate('category', 'name')
    res.status(201).json(populated)
  } catch (e) {
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
    if (Array.isArray(req.body.compatibleVehicles))
      p.compatibleVehicles = req.body.compatibleVehicles
        .map((x) => String(x).trim())
        .filter(Boolean)
    if (Array.isArray(req.body.images)) p.images = req.body.images
    if (req.body.brand != null) p.brand = req.body.brand
    if (req.body.vehicleType != null) p.vehicleType = req.body.vehicleType
    if (req.body.partCategory != null) p.partCategory = req.body.partCategory
    if (req.body.homeFeature !== undefined) p.homeFeature = req.body.homeFeature
    if (req.body.showOnStorefront !== undefined)
      p.showOnStorefront = Boolean(req.body.showOnStorefront)
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
    const out = await Product.findById(p._id).populate('category', 'name')
    res.json(out)
  } catch (e) {
    console.error(e)
    if (e?.status) {
      return res.status(e.status).json({ message: e.message })
    }
    res.status(500).json({ message: 'Cập nhật thất bại.' })
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
    res.json(out)
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

router.get('/orders', async (_req, res) => {
  const list = await Order.find()
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

router.get('/users', async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean()
  res.json(users)
})

router.get('/categories', async (_req, res) => {
  const list = await Category.find().sort({ name: 1 }).lean()
  res.json(list)
})

module.exports = router
