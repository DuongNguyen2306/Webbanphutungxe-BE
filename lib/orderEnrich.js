const { Product } = require('../models/Product')
const { ORDER_STATUS_OPTIONS } = require('./orders')
const {
  mapStatusHistoryForResponse,
  getLastProcessedBy,
} = require('./orderStatusHistory')

function buildShippingAddressText(order) {
  const a = order?.shippingAddress
  if (!a || typeof a !== 'object') return ''
  return [a.detail, a.ward, a.district, a.province]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

function formatVariantLabel(v) {
  const dk = String(v?.displayKey || v?.key || '').trim()
  if (dk) return dk
  return [v?.typeName, v?.color, v?.size].filter(Boolean).join(' - ')
}

function statusLabel(code) {
  const row = ORDER_STATUS_OPTIONS.find((s) => s.code === code)
  return row?.label || String(code || '')
}

/**
 * Bổ sung items (product/variant), shippingAddressText, orderCode hiển thị.
 */
async function enrichOrder(orderLean) {
  if (!orderLean) return null

  const productIds = [
    ...new Set(
      (orderLean.items || [])
        .map((i) => i.productId && String(i.productId))
        .filter(Boolean),
    ),
  ]
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select(
          'name images variants._id variants.key variants.displayKey variants.typeName variants.color variants.size variants.price variants.originalPrice variants.stockQuantity variants.isAvailable variants.sku variants.images',
        )
        .lean()
    : []
  const productMap = new Map(products.map((p) => [String(p._id), p]))

  const statusHistory = mapStatusHistoryForResponse(
    orderLean.statusHistory,
    orderLean,
  )

  return {
    ...orderLean,
    orderCode: orderLean.orderCode || null,
    orderId: orderLean._id,
    shippingAddressText: buildShippingAddressText(orderLean),
    statusLabel: statusLabel(orderLean.status),
    statusHistory,
    /** Alias cho FE — cùng dữ liệu với statusHistory. */
    processingHistory: statusHistory,
    processedBy: getLastProcessedBy(orderLean),
    items: (orderLean.items || []).map((i) => {
      const p = productMap.get(String(i.productId))
      const v = p?.variants?.find(
        (variant) => String(variant._id) === String(i.variantId),
      )
      return {
        ...i,
        name: i.name || p?.name || '',
        variantLabel: i.variantLabel || formatVariantLabel(v) || '',
        thumbnail: v?.images?.[0] || p?.images?.[0] || '',
        lineTotal: Number(i.price || 0) * Number(i.quantity || 0),
        product: p
          ? { _id: p._id, name: p.name || '', images: p.images || [] }
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
}

function formatItemsForExport(items) {
  return (items || [])
    .map((i) => {
      const name = String(i.name || '').trim()
      const qty = Number(i.quantity) || 0
      const label = String(i.variantLabel || '').trim()
      const base = label ? `${name} (${label})` : name
      return `${base} x${qty}`
    })
    .filter(Boolean)
    .join('; ')
}

module.exports = {
  buildShippingAddressText,
  formatVariantLabel,
  enrichOrder,
  formatItemsForExport,
  statusLabel,
}
