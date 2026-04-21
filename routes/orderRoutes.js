const express = require('express')
const mongoose = require('mongoose')
const { authOptional, authRequired } = require('../middleware/auth')
const { Order } = require('../models/Order')
const { Product } = require('../models/Product')
const { normalizeOrderStatus } = require('../lib/orders')

const router = express.Router()
const ALL_STATUS_KEYS = new Set(['ALL', 'TAT_CA'])

function normalizeFilterKey(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]+/g, '_')
}

function parseOptionalNonNegativeInt(input) {
  if (input === undefined || input === null || input === '') return undefined
  const value = Number.parseInt(String(input), 10)
  return Number.isInteger(value) && value >= 0 ? value : null
}

function buildShippingAddressText(order) {
  const a = order?.shippingAddress
  if (!a || typeof a !== 'object') return ''
  return [a.detail, a.ward, a.district, a.province]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

function pickText(input) {
  if (input === undefined || input === null) return ''
  if (typeof input === 'object') {
    return String(input.name ?? input.label ?? input.value ?? '').trim()
  }
  return String(input).trim()
}

function formatVariantLabel(v) {
  const dk = String(v?.displayKey || v?.key || '').trim()
  if (dk) return dk
  return [v?.typeName, v?.color, v?.size].filter(Boolean).join(' - ')
}

function normalizeShippingAddress(input) {
  return {
    province: pickText(
      input?.province ??
        input?.provinceName ??
        input?.city ??
        input?.tinh ??
        input?.cityName,
    ),
    district: pickText(
      input?.district ??
        input?.districtName ??
        input?.quanHuyen ??
        input?.huyen ??
        input?.districtLabel,
    ),
    ward: pickText(
      input?.ward ??
        input?.wardName ??
        input?.phuongXa ??
        input?.xa ??
        input?.wardLabel,
    ),
    detail: pickText(
      input?.detail ??
        input?.addressDetail ??
        input?.street ??
        input?.line1 ??
        input?.address,
    ),
    note: pickText(input?.note ?? input?.addressNote ?? input?.message),
  }
}

function extractShippingAddressFromBody(body) {
  if (!body || typeof body !== 'object') return normalizeShippingAddress({})
  const source =
    (body.shippingAddress && typeof body.shippingAddress === 'object'
      ? body.shippingAddress
      : null) ||
    (body.address && typeof body.address === 'object' ? body.address : null) ||
    body
  const normalized = normalizeShippingAddress(source)
  if (!normalized.note) {
    normalized.note = pickText(body.note ?? body.addressNote ?? body.message)
  }
  return normalized
}

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

    const shipping = extractShippingAddressFromBody(req.body)
    if (
      !shipping.province ||
      !shipping.district ||
      !shipping.ward ||
      !shipping.detail
    ) {
      return res.status(400).json({
        message:
          'Thiếu địa chỉ giao hàng (cần tỉnh/thành, quận/huyện, phường/xã, địa chỉ chi tiết).',
      })
    }

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
      shippingAddress: shipping,
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
    const statusKey = normalizeFilterKey(statusQ)
    if (statusKey && !ALL_STATUS_KEYS.has(statusKey)) {
      const normalized = normalizeOrderStatus(statusQ)
      if (!normalized) {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ.' })
      }
      filter.status = normalized
    }

    const limitParsed = parseOptionalNonNegativeInt(req.query.limit)
    const skipParsed = parseOptionalNonNegativeInt(req.query.skip)
    if (limitParsed === null || skipParsed === null) {
      return res.status(400).json({ message: 'limit/skip không hợp lệ.' })
    }

    let query = Order.find(filter).sort({ createdAt: -1 })
    if (skipParsed !== undefined) {
      query = query.skip(skipParsed)
    }
    if (limitParsed !== undefined) {
      // Giới hạn tối đa để bảo vệ endpoint khi dữ liệu quá lớn.
      query = query.limit(Math.min(limitParsed, 50))
    }
    const list = await query.lean()

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
      .select(
        'name images variants._id variants.key variants.displayKey variants.typeName variants.color variants.size variants.price variants.originalPrice variants.stockQuantity variants.isAvailable variants.sku variants.images',
      )
      .lean()
    const productMap = new Map(products.map((p) => [String(p._id), p]))

    const enriched = ownedOrders.map((o) => ({
      ...o,
      shippingAddressText: buildShippingAddressText(o),
      items: (o.items || []).map((i) => {
        const p = productMap.get(String(i.productId))
        const v = p?.variants?.find(
          (variant) => String(variant._id) === String(i.variantId),
        )
        return {
          ...i,
          // Lịch sử đơn hàng cần tên + thumbnail.
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
    }))

    res.json(enriched || [])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được lịch sử đơn hàng.' })
  }
})

router.get('/:id', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.userId,
    }).lean()
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' })
    }

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
    res.status(500).json({ message: 'Không tải được chi tiết đơn hàng.' })
  }
})

router.patch('/:id/customer-info', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.userId,
    })
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' })
    }
    if (!['PENDING', 'CONTACTING', 'CONFIRMED'].includes(order.status)) {
      return res.status(400).json({
        message: 'Không thể cập nhật thông tin khi đơn đã giao, hoàn thành hoặc hủy.',
      })
    }

    const currentContact = order.contact || {}
    const nextContactInput = req.body?.contact || {}
    const nextContact = {
      name:
        nextContactInput.name !== undefined
          ? String(nextContactInput.name || '').trim()
          : String(currentContact.name || '').trim(),
      email:
        nextContactInput.email !== undefined
          ? String(nextContactInput.email || '').trim()
          : String(currentContact.email || '').trim(),
      phone:
        nextContactInput.phone !== undefined
          ? String(nextContactInput.phone || '').trim()
          : String(currentContact.phone || '').trim(),
    }
    if (!nextContact.email && !nextContact.phone) {
      return res
        .status(400)
        .json({ message: 'Cần email hoặc SĐT liên hệ cho đơn hàng.' })
    }

    const currentShipping = normalizeShippingAddress(order.shippingAddress || {})
    const nextShippingInput =
      req.body?.shippingAddress ||
      req.body?.address ||
      (req.body && typeof req.body === 'object' ? req.body : {})
    const nextShipping = {
      province:
        nextShippingInput.province !== undefined
          ? String(nextShippingInput.province || '').trim()
          : currentShipping.province,
      district:
        nextShippingInput.district !== undefined
          ? String(nextShippingInput.district || '').trim()
          : currentShipping.district,
      ward:
        nextShippingInput.ward !== undefined
          ? String(nextShippingInput.ward || '').trim()
          : currentShipping.ward,
      detail:
        nextShippingInput.detail !== undefined
          ? String(nextShippingInput.detail || '').trim()
          : currentShipping.detail,
      note:
        nextShippingInput.note !== undefined
          ? String(nextShippingInput.note || '').trim()
          : pickText(
              req.body?.note ??
                req.body?.addressNote ??
                req.body?.message ??
                currentShipping.note,
            ),
    }
    if (
      !nextShipping.province ||
      !nextShipping.district ||
      !nextShipping.ward ||
      !nextShipping.detail
    ) {
      return res.status(400).json({
        message:
          'Thiếu địa chỉ giao hàng (cần tỉnh/thành, quận/huyện, phường/xã, địa chỉ chi tiết).',
      })
    }

    order.contact = nextContact
    order.shippingAddress = nextShipping
    await order.save()

    const refreshed = await Order.findOne({
      _id: req.params.id,
      user: req.userId,
    }).lean()

    res.json({
      ...refreshed,
      shippingAddressText: buildShippingAddressText(refreshed),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không cập nhật được thông tin đơn hàng.' })
  }
})

router.patch('/:id/cancel', authRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID đơn hàng không hợp lệ.' })
    }
    const reason = String(req.body?.reason ?? req.body?.note ?? '').trim()
    if (!reason) {
      return res.status(400).json({ message: 'Cần nhập lý do hủy đơn.' })
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.userId,
    }).select('status')
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' })
    }
    if (!['PENDING', 'CONTACTING'].includes(order.status)) {
      return res
        .status(400)
        .json({ message: 'Chỉ được hủy khi đơn chưa được xác nhận.' })
    }

    const updated = await Order.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { status: 'CANCELLED', note: reason },
      { returnDocument: 'after' },
    ).lean()

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' })
    }

    res.json(updated)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không hủy được đơn hàng.' })
  }
})

module.exports = router
