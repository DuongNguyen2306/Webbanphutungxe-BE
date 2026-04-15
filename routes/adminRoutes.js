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
const { normalizeOrderStatus, withUrgentFlag } = require('../lib/orders')

const router = express.Router()

function normalizeVariants(body) {
  let variants = body.variants
  if (!Array.isArray(variants)) variants = []
  variants = variants
    .filter((v) => v != null && v !== '' && Number(v.price) >= 0)
    .map((v) => {
      const row = {
        typeName: v.typeName != null ? String(v.typeName) : '',
        color: v.color != null ? String(v.color) : '',
        size: v.size != null ? String(v.size) : '',
        price: Number(v.price),
        stockQuantity: Math.max(0, Number(v.stockQuantity) || 0),
        originalPrice:
          v.originalPrice != null && v.originalPrice !== ''
            ? Number(v.originalPrice)
            : undefined,
        isAvailable: v.isAvailable !== false,
        sku: v.sku != null && String(v.sku).trim() ? String(v.sku).trim() : undefined,
        images: Array.isArray(v.images)
          ? v.images.map((u) => String(u).trim()).filter(Boolean)
          : [],
      }
      if (v._id && mongoose.Types.ObjectId.isValid(String(v._id))) {
        row._id = v._id
      }
      return row
    })
  if (!variants.length) {
    const bp = Number(body.basePrice)
    variants = [
      {
        typeName: 'Mặc định',
        color: '',
        size: '',
        price: Number.isFinite(bp) ? bp : 0,
        stockQuantity: 0,
        isAvailable: true,
        sku: undefined,
        images: [],
      },
    ]
  }
  return variants
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
    const variants = normalizeVariants(req.body)
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
      variants,
    })
    const populated = await doc.populate('category', 'name')
    res.status(201).json(populated)
  } catch (e) {
    console.error(e)
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
    if (Array.isArray(req.body.variants)) {
      p.variants = normalizeVariants({
        ...req.body,
        variants: req.body.variants,
      })
    }
    await p.save()
    const out = await Product.findById(p._id).populate('category', 'name')
    res.json(out)
  } catch (e) {
    console.error(e)
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

router.patch('/orders/:id/status', async (req, res) => {
  const status = normalizeOrderStatus(req.body.status)
  if (!status)
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' })
  const note = req.body.note !== undefined ? String(req.body.note || '') : undefined
  const o = await Order.findByIdAndUpdate(
    req.params.id,
    { status, ...(note !== undefined ? { note } : {}) },
    { new: true },
  ).lean()
  if (!o) return res.status(404).json({ message: 'Không tìm thấy đơn.' })
  res.json(o)
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
