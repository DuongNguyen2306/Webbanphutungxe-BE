const mongoose = require('mongoose')
const { Product } = require('../models/Product')

const STOREFRONT_FILTER = { showOnStorefront: { $ne: false } }

/** Tối đa mỗi danh sách gợi ý (yêu cầu 8–10; chọn 10 để đủ ô hiển thị). */
const RELATED_LIMIT = 10

const SORT_BEST_SELLER_FIRST = {
  bestSellerEnabled: -1,
  soldCount: -1,
  name: 1,
}

const SORT_GLOBAL_BEST_SELLERS = {
  bestSellerOrder: 1,
  soldCount: -1,
  name: 1,
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

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id
  return new mongoose.Types.ObjectId(String(id))
}

/**
 * Lấy thêm sản phẩm bán chạy toàn shop để lấp đủ `limit` khi danh sách chính thiếu.
 */
async function fetchBestSellerTopUp(excludeIds, needCount) {
  if (needCount <= 0) return []
  const $nin = excludeIds.map(toObjectId)
  const buffer = Math.min(needCount + 24, 60)
  return Product.find({
    ...STOREFRONT_FILTER,
    bestSellerEnabled: true,
    _id: { $nin },
  })
    .populate('category', 'name')
    .sort(SORT_GLOBAL_BEST_SELLERS)
    .limit(buffer)
    .lean()
}

function mergeWithTopUp(seedRows, currentProductId, targetLen, extraRows) {
  const used = new Set([String(currentProductId)])
  const out = []

  for (const row of seedRows) {
    const id = String(row._id)
    if (used.has(id)) continue
    used.add(id)
    out.push(withPurchaseCount(row))
    if (out.length >= targetLen) return out
  }
  for (const row of extraRows) {
    const id = String(row._id)
    if (used.has(id)) continue
    used.add(id)
    out.push(withPurchaseCount(row))
    if (out.length >= targetLen) return out
  }
  return out
}

async function buildList(seedQueryPromise, currentProductId, targetLen) {
  const seed = await seedQueryPromise
  if (seed.length >= targetLen) {
    return seed.map(withPurchaseCount)
  }
  const exclude = [currentProductId, ...seed.map((r) => r._id)]
  const need = targetLen - seed.length
  const extra = await fetchBestSellerTopUp(exclude, need)
  return mergeWithTopUp(seed, currentProductId, targetLen, extra)
}

/**
 * @param {{ _id: mongoose.Types.ObjectId, category: mongoose.Types.ObjectId, brand?: string }} productLean — product đã kiểm tra hiển thị trên storefront
 */
async function getRelatedProductLists(productLean) {
  const pid = productLean._id
  const categoryId = productLean.category
  const brand = String(productLean.brand || '').trim()

  const relatedByCategory = await buildList(
    Product.find({
      ...STOREFRONT_FILTER,
      category: categoryId,
      _id: { $ne: pid },
    })
      .populate('category', 'name')
      .sort(SORT_BEST_SELLER_FIRST)
      .limit(RELATED_LIMIT)
      .lean(),
    pid,
    RELATED_LIMIT,
  )

  let relatedByBrand = []
  if (brand) {
    relatedByBrand = await buildList(
      Product.find({
        ...STOREFRONT_FILTER,
        brand,
        category: { $ne: categoryId },
        _id: { $ne: pid },
      })
        .populate('category', 'name')
        .sort(SORT_BEST_SELLER_FIRST)
        .limit(RELATED_LIMIT)
        .lean(),
      pid,
      RELATED_LIMIT,
    )
  } else {
    const extra = await fetchBestSellerTopUp([pid], RELATED_LIMIT)
    relatedByBrand = mergeWithTopUp([], pid, RELATED_LIMIT, extra)
  }

  return { relatedByCategory, relatedByBrand }
}

module.exports = {
  getRelatedProductLists,
  RELATED_LIMIT,
}
