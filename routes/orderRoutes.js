const express = require('express')
const mongoose = require('mongoose')
const { authOptional, authRequired } = require('../middleware/auth')
const { Order } = require('../models/Order')
const { Product } = require('../models/Product')
const { normalizeOrderStatus } = require('../lib/orders')

const router = express.Router()

router.post('/', authOptional, async (req, res) => {
  try {
    if (req.userRole === 'admin') {
      return res
        .status(403)
        .json({ message: 'Admin cannot purchase or review products.' })
    }
    const { contact, items, totalAmount } = req.body
    if (!contact || !items?.length)
      return res.status(400).json({ message: 'Thiếu thông tin đơn hàng.' })
    const { name = '', email = '', phone = '' } = contact
    if (!String(email).trim() && !String(phone).trim())
      return res.status(400).json({ message: 'Cần email hoặc SĐT liên hệ.' })

    const normalized = items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantLabel: i.variantLabel ?? '',
      quantity: Number(i.quantity),
      price: Number(i.price),
    }))

    for (const i of normalized) {
      if (
        !mongoose.isValidObjectId(i.productId) ||
        !mongoose.isValidObjectId(i.variantId)
      )
        return res.status(400).json({ message: 'Sản phẩm không hợp lệ.' })
      if (!String(i.name ?? '').trim())
        return res.status(400).json({ message: 'Thiếu tên sản phẩm trong giỏ.' })
      if (
        !i.quantity ||
        i.quantity < 1 ||
        Number.isNaN(i.price) ||
        i.price < 0
      )
        return res.status(400).json({ message: 'Dòng hàng không hợp lệ.' })
    }

    for (const i of normalized) {
      const prod = await Product.findById(i.productId).select('variants')
      if (!prod)
        return res.status(400).json({ message: 'Sản phẩm không tồn tại.' })
      const v = prod.variants.id(i.variantId)
      if (!v)
        return res.status(400).json({ message: 'Biến thể không hợp lệ.' })
      if (!v.isAvailable || Number(v.stockQuantity || 0) <= 0)
        return res.status(400).json({ message: 'Sản phẩm đã hết hàng.' })
    }

    const sum = normalized.reduce((s, x) => s + x.price * x.quantity, 0)
    if (Math.abs(sum - Number(totalAmount)) > 1)
      return res.status(400).json({ message: 'Tổng tiền không khớp.' })

    const order = await Order.create({
      user: req.userId || null,
      contact: {
        name,
        email: String(email).trim(),
        phone: String(phone).trim(),
      },
      items: normalized,
      totalAmount: sum,
      status: 'PENDING',
    })
    res.status(201).json({ orderId: order._id, message: 'OK' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tạo được đơn hàng.' })
  }
})

router.get('/my', authRequired, async (req, res) => {
  const list = await Order.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .lean()
  res.json(list || [])
})

router.get('/my-orders', authRequired, async (req, res) => {
  try {
    const statusQ = req.query.status
    const filter = { user: req.userId }
    if (statusQ !== undefined && statusQ !== '') {
      const normalized = normalizeOrderStatus(statusQ)
      if (!normalized) {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ.' })
      }
      filter.status = normalized
    }

    const list = await Order.find(filter).sort({ createdAt: -1 }).lean()

    // Bảo vệ dữ liệu: chỉ đơn thuộc user hiện tại.
    const ownedOrders = list.filter(
      (o) => String(o.user || '') === String(req.user?.id || req.userId),
    )

    const productIds = [
      ...new Set(
        ownedOrders.flatMap((o) =>
          (o.items || [])
            .map((i) => i.productId && String(i.productId))
            .filter(Boolean),
        ),
      ),
    ]
    const products = await Product.find({ _id: { $in: productIds } })
      .select('name images')
      .lean()
    const productMap = new Map(products.map((p) => [String(p._id), p]))

    const enriched = ownedOrders.map((o) => ({
      ...o,
      items: (o.items || []).map((i) => {
        const p = productMap.get(String(i.productId))
        return {
          ...i,
          // Lịch sử đơn hàng cần tên + thumbnail.
          name: i.name || p?.name || '',
          thumbnail: p?.images?.[0] || '',
        }
      }),
    }))

    res.json(enriched || [])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được lịch sử đơn hàng.' })
  }
})

module.exports = router
