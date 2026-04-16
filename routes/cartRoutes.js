const express = require('express')
const mongoose = require('mongoose')
const { authRequired } = require('../middleware/auth')
const { Product } = require('../models/Product')
const { Cart } = require('../models/Cart')

const router = express.Router()
router.use(authRequired)

function normalizeQuantity(input) {
  const qty = Number.parseInt(String(input), 10)
  return Number.isInteger(qty) && qty > 0 ? qty : null
}

function normalizeSelectedVariant(input) {
  return String(input ?? '').trim()
}

function normalizeCartItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const productId = raw.productId
  const quantity = normalizeQuantity(raw.quantity)
  const selectedVariant = normalizeSelectedVariant(
    raw.selectedVariant ?? raw.variantId,
  )
  if (!mongoose.isValidObjectId(productId) || quantity === null) return null
  return {
    productId: String(productId),
    quantity,
    selectedVariant,
  }
}

function getCartItemKey(item) {
  return `${String(item.productId)}::${String(item.selectedVariant || '')}`
}

function createHttpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function buildVariantLabel(variant) {
  const dk = String(variant?.displayKey || variant?.key || '').trim()
  if (dk) return dk
  return [variant?.typeName, variant?.color, variant?.size]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' · ')
}

function resolveVariant(product, selectedVariant) {
  const variants = Array.isArray(product?.variants) ? product.variants : []
  if (!variants.length) return null
  const key = normalizeSelectedVariant(selectedVariant)
  if (!key) {
    return variants.length === 1 ? variants[0] : null
  }
  return (
    variants.find((v) => String(v._id) === key) ||
    variants.find((v) => String(v.key || '').trim() === key) ||
    variants.find((v) => String(v.displayKey || '').trim() === key) ||
    variants.find((v) => buildVariantLabel(v) === key) ||
    variants.find((v) => String(v.typeName || '').trim() === key) ||
    null
  )
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ userId })
  if (!cart) {
    cart = await Cart.create({ userId, products: [] })
  }
  return cart
}

async function assertProductVariantIsValid(item) {
  const product = await Product.findById(item.productId)
    .select(
      'name variants._id variants.key variants.displayKey variants.typeName variants.color variants.size variants.price',
    )
    .lean()
  if (!product) {
    throw createHttpError(404, 'Không tìm thấy sản phẩm.')
  }
  const variant = resolveVariant(product, item.selectedVariant)
  if (!variant) {
    throw createHttpError(
      400,
      'Biến thể không hợp lệ hoặc không còn tồn tại trong sản phẩm.',
    )
  }
  const salePrice = Number(variant.price)
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw createHttpError(400, 'Giá biến thể không hợp lệ.')
  }
}

async function buildCartResponse(userId) {
  const cart = await Cart.findOne({ userId }).lean()
  if (!cart || !Array.isArray(cart.products) || !cart.products.length) {
    return { items: [] }
  }

  const productIds = [...new Set(cart.products.map((i) => String(i.productId)))]
  const products = await Product.find({ _id: { $in: productIds } })
    .select(
      'name images variants._id variants.key variants.displayKey variants.typeName variants.color variants.size variants.price variants.images',
    )
    .lean()
  const productMap = new Map(products.map((p) => [String(p._id), p]))

  const items = cart.products.map((item) => {
    const product = productMap.get(String(item.productId))
    if (!product) {
      throw createHttpError(400, 'Sản phẩm trong giỏ hàng không còn tồn tại.')
    }
    const variant = resolveVariant(product, item.selectedVariant)
    if (!variant) {
      throw createHttpError(
        400,
        'Biến thể trong giỏ hàng không còn hợp lệ. Vui lòng chọn lại biến thể.',
      )
    }
    const salePrice = Number(variant.price)
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      throw createHttpError(400, 'Giá sản phẩm trong giỏ hàng không hợp lệ.')
    }
    return {
      productId: String(item.productId),
      selectedVariant: normalizeSelectedVariant(item.selectedVariant),
      quantity: Number(item.quantity || 0),
      name: String(product.name || ''),
      variantLabel:
        buildVariantLabel(variant) ||
        normalizeSelectedVariant(item.selectedVariant) ||
        '',
      salePrice,
      image:
        (Array.isArray(variant.images) ? variant.images[0] : '') ||
        (Array.isArray(product.images) ? product.images[0] : '') ||
        '',
    }
  })

  return { items }
}

router.get('/', async (req, res) => {
  try {
    const cart = await buildCartResponse(req.userId)
    res.json(cart)
  } catch (e) {
    console.error(e)
    if (e?.status) return res.status(e.status).json({ message: e.message })
    res.status(500).json({ message: 'Không tải được giỏ hàng.' })
  }
})

router.post('/merge', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.products) ? req.body.products : []
    const normalized = incoming.map(normalizeCartItem).filter(Boolean)

    const invalid = incoming.length && normalized.length !== incoming.length
    if (invalid) {
      return res.status(400).json({ message: 'Dữ liệu giỏ hàng không hợp lệ.' })
    }

    for (const item of normalized) {
      // eslint-disable-next-line no-await-in-loop
      await assertProductVariantIsValid(item)
    }

    const cart = await getOrCreateCart(req.userId)
    const indexByKey = new Map(
      (cart.products || []).map((item, idx) => [getCartItemKey(item), idx]),
    )

    for (const item of normalized) {
      const key = getCartItemKey(item)
      const hit = indexByKey.get(key)
      if (hit !== undefined) {
        cart.products[hit].quantity += item.quantity
      } else {
        cart.products.push(item)
        indexByKey.set(key, cart.products.length - 1)
      }
    }

    await cart.save()
    const out = await buildCartResponse(req.userId)
    res.json(out)
  } catch (e) {
    console.error(e)
    if (e?.status) return res.status(e.status).json({ message: e.message })
    res.status(500).json({ message: 'Không gộp được giỏ hàng.' })
  }
})

router.post('/add', async (req, res) => {
  try {
    const item = normalizeCartItem(req.body)
    if (!item) {
      return res.status(400).json({ message: 'Dữ liệu sản phẩm không hợp lệ.' })
    }
    await assertProductVariantIsValid(item)

    const cart = await getOrCreateCart(req.userId)
    const key = getCartItemKey(item)
    const idx = (cart.products || []).findIndex((x) => getCartItemKey(x) === key)
    if (idx >= 0) {
      cart.products[idx].quantity += item.quantity
    } else {
      cart.products.push(item)
    }

    await cart.save()
    const out = await buildCartResponse(req.userId)
    res.json(out)
  } catch (e) {
    console.error(e)
    if (e?.status) return res.status(e.status).json({ message: e.message })
    res.status(500).json({ message: 'Không thêm được vào giỏ hàng.' })
  }
})

router.put('/update', async (req, res) => {
  try {
    const item = normalizeCartItem(req.body)
    if (!item) {
      return res.status(400).json({ message: 'Dữ liệu cập nhật không hợp lệ.' })
    }
    await assertProductVariantIsValid(item)

    const cart = await getOrCreateCart(req.userId)
    const key = getCartItemKey(item)
    const idx = (cart.products || []).findIndex((x) => getCartItemKey(x) === key)
    if (idx < 0) {
      return res.status(404).json({ message: 'Sản phẩm chưa có trong giỏ hàng.' })
    }
    cart.products[idx].quantity = item.quantity

    await cart.save()
    const out = await buildCartResponse(req.userId)
    res.json(out)
  } catch (e) {
    console.error(e)
    if (e?.status) return res.status(e.status).json({ message: e.message })
    res.status(500).json({ message: 'Không cập nhật được giỏ hàng.' })
  }
})

router.delete('/remove', async (req, res) => {
  try {
    const productId = req.body?.productId ?? req.query?.productId
    const selectedVariant = normalizeSelectedVariant(
      req.body?.selectedVariant ?? req.query?.selectedVariant ?? '',
    )
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }

    const cart = await getOrCreateCart(req.userId)
    const before = cart.products.length
    cart.products = cart.products.filter(
      (x) =>
        !(
          String(x.productId) === String(productId) &&
          normalizeSelectedVariant(x.selectedVariant) === selectedVariant
        ),
    )
    if (before === cart.products.length) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ.' })
    }

    await cart.save()
    const out = await buildCartResponse(req.userId)
    res.json(out)
  } catch (e) {
    console.error(e)
    if (e?.status) return res.status(e.status).json({ message: e.message })
    res.status(500).json({ message: 'Không xóa được sản phẩm khỏi giỏ hàng.' })
  }
})

module.exports = router
