const mongoose = require('mongoose')
const { Product } = require('../models/Product')

const STOREFRONT_FILTER = { showOnStorefront: { $ne: false } }

/** Tối đa mỗi danh sách gợi ý (giới hạn carousel). */
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
 * @param {{ _id: mongoose.Types.ObjectId, category?: mongoose.Types.ObjectId, brand?: string, partCategory?: string }} productLean — product đã kiểm tra hiển thị trên storefront
 *
 * "relatedByCategory" = chỉ SP cùng `partCategory` (không lấp bằng bán chạy); có thể 0, 1 hoặc nhiều (tối đa RELATED_LIMIT).
 * "relatedByBrand"    = cùng HÃNG XE (brand) nhưng KHÁC loại phụ tùng; thiếu kết quả vẫn lấp bằng bán chạy toàn shop như cũ.
 *
 * Lý do dùng `partCategory` thay cho `category` (ObjectId): Category collection hiện đang lưu
 * theo hãng xe (Honda/Vespa...) chứ không phải loại phụ tùng, nên lọc theo `category` sẽ ra
 * lung tung loại. `partCategory` mới đúng "loại sản phẩm" mà người mua muốn xem gợi ý cùng loại.
 */
async function getRelatedProductLists(productLean) {
  const pid = productLean._id
  const brand = String(productLean.brand || '').trim()
  const partCategory = String(productLean.partCategory || '').trim()

  let relatedByCategory = []
  if (partCategory) {
    const rows = await Product.find({
      ...STOREFRONT_FILTER,
      partCategory,
      _id: { $ne: pid },
    })
      .populate('category', 'name')
      .sort(SORT_BEST_SELLER_FIRST)
      .limit(RELATED_LIMIT)
      .lean()
    relatedByCategory = rows.map(withPurchaseCount)
  }

  let relatedByBrand = []
  if (brand) {
    const brandFilter = {
      ...STOREFRONT_FILTER,
      brand,
      _id: { $ne: pid },
    }
    if (partCategory) {
      brandFilter.partCategory = { $ne: partCategory }
    }
    relatedByBrand = await buildList(
      Product.find(brandFilter)
        .populate('category', 'name')
        .sort(SORT_BEST_SELLER_FIRST)
        .limit(RELATED_LIMIT)
        .lean(),
      pid,
      RELATED_LIMIT,
    )
  } else {
    const exclude = [pid, ...relatedByCategory.map((r) => r._id)]
    const extra = await fetchBestSellerTopUp(exclude, RELATED_LIMIT)
    relatedByBrand = mergeWithTopUp([], pid, RELATED_LIMIT, extra)
  }

  return { relatedByCategory, relatedByBrand }
}

module.exports = {
  getRelatedProductLists,
  RELATED_LIMIT,
}
