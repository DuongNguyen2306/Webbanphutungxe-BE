const express = require('express')
const mongoose = require('mongoose')
const { authOptional, authRequired } = require('../middleware/auth')
const { Order } = require('../models/Order')
const { Product } = require('../models/Product')

const router = express.Router()

router.post('/', authOptional, async (req, res) => {
  try {
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
      if (!v.isAvailable)
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
      status: 'pending',
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
  res.json(list)
})

module.exports = router
