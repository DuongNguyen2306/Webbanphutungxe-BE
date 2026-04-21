function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseBoolean(input, fallback = true) {
  if (typeof input === 'boolean') return input
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase()
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function normalizeAsciiUpper(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function alnumTokens(input) {
  return normalizeAsciiUpper(input)
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function productInitials(productName) {
  const tokens = alnumTokens(productName)
  return tokens.map((x) => x[0]).join('') || 'SP'
}

function colorPart(colorValue) {
  const compact = alnumTokens(colorValue).join('')
  return compact.slice(0, 3) || 'GEN'
}

function sizePart(sizeValue) {
  const tokens = alnumTokens(sizeValue)
  if (!tokens.length) return 'STD'
  if (/^\d+$/.test(tokens[0])) {
    return `${tokens[0]}${tokens[1] ? tokens[1][0] : ''}`
  }
  return tokens.join('').slice(0, 4)
}

function pickVariantAttrValue(variant, matcher) {
  const entries = Object.entries(variant?.attributeValues || {})
  const hit = entries.find(([name]) => matcher(name))
  return hit?.[1] || ''
}

/** Một đoạn SKU từ giá trị thuộc tính bất kỳ (không cố định Màu/Size). */
function skuSegmentFromValue(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  const tokens = alnumTokens(s)
  if (!tokens.length) return 'X'
  const compact = tokens.join('')
  if (/^\d+$/.test(compact)) {
    return compact.length <= 6 ? compact : compact.slice(0, 6)
  }
  return compact.slice(0, 4) || 'GEN'
}

/**
 * SKU tự động: chữ cái đầu tên SP + các đoạn từ mọi giá trị attributeValues (theo thứ tự tên thuộc tính).
 */
function generateSku(productName, variant) {
  const map = variant?.attributeValues
  const entries =
    map instanceof Map
      ? [...map.entries()]
      : Object.entries(map && typeof map === 'object' ? map : {})
  const ordered = entries
    .filter(([k]) => String(k || '').trim())
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'vi'))
  const parts = [productInitials(productName)]
  for (const [, val] of ordered) {
    const seg = skuSegmentFromValue(val)
    if (seg) parts.push(seg)
  }
  if (parts.length > 1) {
    return parts.join('-')
  }
  const colorValue =
    pickVariantAttrValue(variant, (name) => /mau|color/i.test(name)) ||
    variant?.color ||
    variant?.typeName ||
    ''
  const sizeValue =
    pickVariantAttrValue(variant, (name) => /size|li|chan|ren/i.test(name)) ||
    variant?.size ||
    ''
  return [productInitials(productName), colorPart(colorValue), sizePart(sizeValue)]
    .filter(Boolean)
    .join('-')
}

function createValidationError(message) {
  const err = new Error(message)
  err.status = 400
  return err
}

function normalizeAttributes(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((attr) => {
      const name = String(attr?.name || '').trim()
      const values = Array.isArray(attr?.values)
        ? [...new Set(attr.values.map((x) => String(x || '').trim()).filter(Boolean))]
        : []
      if (!name || !values.length) return null
      return {
        name,
        values,
        slug: toSlug(attr?.key || name),
      }
    })
    .filter(Boolean)
}

/** Ghép giá trị để hiển thị: 1 thuộc tính → một chuỗi; nhiều → "A - B - C". */
function buildDisplayKeyFromAttributeValues(attributeValues, attributeOrder) {
  const order =
    Array.isArray(attributeOrder) && attributeOrder.length
      ? attributeOrder
      : Object.keys(attributeValues || {}).sort((a, b) => a.localeCompare(b, 'vi'))
  const parts = order
    .map((k) => String(attributeValues?.[k] || '').trim())
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(' - ')
}

function buildKeyFromAttributeValues(attributeValues, attributeOrder) {
  return buildDisplayKeyFromAttributeValues(attributeValues, attributeOrder)
}

/** Khi không gửi `attributes`, suy ra từ các dòng biến thể. */
function inferAttributesFromVariants(variantsInput) {
  const valueMap = new Map()
  for (const raw of variantsInput || []) {
    const sourceValues =
      raw?.attributeValues && typeof raw.attributeValues === 'object'
        ? raw.attributeValues instanceof Map
          ? Object.fromEntries(raw.attributeValues.entries())
          : raw.attributeValues
        : {}
    for (const [k, v] of Object.entries(sourceValues)) {
      const name = String(k || '').trim()
      const val = String(v || '').trim()
      if (!name || !val) continue
      if (!valueMap.has(name)) valueMap.set(name, new Set())
      valueMap.get(name).add(val)
    }
  }
  return [...valueMap.entries()].map(([name, set]) => ({
    name,
    values: [...set],
    slug: toSlug(name),
  }))
}

const STOCK_UNTRACKED = 999999999

function parseVariantStock(raw, line) {
  const stockRaw = raw?.stock ?? raw?.stockQuantity
  const omitted =
    stockRaw === undefined ||
    stockRaw === null ||
    (typeof stockRaw === 'string' && String(stockRaw).trim() === '')
  if (omitted) {
    return {
      stock: STOCK_UNTRACKED,
      stockQuantity: STOCK_UNTRACKED,
      isAvailable: raw?.isAvailable !== false,
    }
  }
  const stock = Number(stockRaw)
  if (!Number.isFinite(stock) || stock < 0) {
    throw createValidationError(
      line > 0
        ? `Biến thể dòng #${line} có Tồn kho không hợp lệ.`
        : 'Tồn kho sản phẩm đơn không hợp lệ.',
    )
  }
  const n = Math.max(0, stock)
  return {
    stock: n,
    stockQuantity: n,
    isAvailable:
      raw?.isAvailable !== undefined ? raw?.isAvailable !== false : n > 0,
  }
}

function normalizeVariantRow(raw, attrs, idx) {
  const line = idx + 1
  const attributeValues = {}
  const sourceValues =
    raw?.attributeValues && typeof raw.attributeValues === 'object'
      ? raw.attributeValues instanceof Map
        ? Object.fromEntries(raw.attributeValues.entries())
        : raw.attributeValues
      : {}
  if (attrs.length) {
    for (const attr of attrs) {
      const value = String(
        sourceValues[attr.name] ??
          sourceValues[attr.slug] ??
          sourceValues[toSlug(attr.name)] ??
          '',
      ).trim()
      if (!value) {
        throw createValidationError(
          `Biến thể dòng #${line} thiếu giá trị thuộc tính "${attr.name}".`,
        )
      }
      if (!attr.values.includes(value)) {
        throw createValidationError(
          `Biến thể dòng #${line} có giá trị "${value}" không hợp lệ cho thuộc tính "${attr.name}".`,
        )
      }
      attributeValues[attr.name] = value
    }
  } else if (sourceValues && Object.keys(sourceValues).length) {
    for (const [k, v] of Object.entries(sourceValues)) {
      const key = String(k || '').trim()
      const value = String(v || '').trim()
      if (key && value) attributeValues[key] = value
    }
  }

  const displayKey = String(
    buildDisplayKeyFromAttributeValues(attributeValues, attrs.map((a) => a.name)) ||
      [raw?.typeName, raw?.color, raw?.size]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' - ') ||
      `Biến thể ${line}`,
  ).trim()
  const key = displayKey

  if (raw?.price === undefined || raw?.price === null || raw?.price === '') {
    throw createValidationError(`Biến thể dòng #${line} thiếu Giá.`)
  }
  const price = Number(raw?.price)
  if (!Number.isFinite(price) || price < 0) {
    throw createValidationError(`Biến thể dòng #${line} có Giá không hợp lệ.`)
  }
  const originalPrice =
    raw?.originalPrice !== undefined && raw?.originalPrice !== null && raw?.originalPrice !== ''
      ? Number(raw.originalPrice)
      : undefined
  if (originalPrice !== undefined && (!Number.isFinite(originalPrice) || originalPrice < 0)) {
    throw createValidationError(`Biến thể dòng #${line} có Giá gốc không hợp lệ.`)
  }

  const image = String(raw?.image || raw?.images?.[0] || '').trim()
  const images = Array.isArray(raw?.images)
    ? raw.images.map((x) => String(x || '').trim()).filter(Boolean)
    : image
      ? [image]
      : []
  const stockInfo = parseVariantStock(raw, line)

  const row = {
    key,
    displayKey,
    attributeValues,
    price,
    originalPrice,
    stock: stockInfo.stock,
    stockQuantity: stockInfo.stockQuantity,
    sku: String(raw?.sku || '').trim(),
    image,
    images,
    isAvailable: stockInfo.isAvailable,
    typeName: String(raw?.typeName || displayKey || key).trim(),
    color: String(raw?.color || '').trim(),
    size: String(raw?.size || '').trim(),
  }

  if (raw?._id) row._id = raw._id
  return row
}

function ensureUniqueVariantKeys(variants) {
  const seen = new Set()
  for (const v of variants) {
    const key = String(v?.key || '').trim()
    if (!key) throw createValidationError('Mỗi biến thể phải có key.')
    if (seen.has(key)) {
      throw createValidationError(`Key biến thể bị trùng: ${key}`)
    }
    seen.add(key)
  }
}

/**
 * Với sản phẩm nhiều phân loại, ảnh nên bám theo phân loại 1 (ví dụ Màu).
 * Nếu cùng giá trị phân loại 1 thì dùng cùng bộ ảnh để tránh ảnh "nhảy" theo phân loại 2.
 */
function alignImagesByPrimaryAttribute(variants, attrs) {
  if (!Array.isArray(variants) || variants.length < 2) return variants
  if (!Array.isArray(attrs) || attrs.length < 2) return variants
  const primaryAttrName = String(attrs[0]?.name || '').trim()
  if (!primaryAttrName) return variants

  const galleryByPrimaryValue = new Map()
  for (const variant of variants) {
    const primaryValue = String(variant?.attributeValues?.[primaryAttrName] || '').trim()
    if (!primaryValue || galleryByPrimaryValue.has(primaryValue)) continue
    const gallery = Array.isArray(variant?.images)
      ? variant.images.map((x) => String(x || '').trim()).filter(Boolean)
      : []
    const fallbackImage = String(variant?.image || '').trim()
    const normalizedGallery = gallery.length
      ? [...new Set(gallery)]
      : fallbackImage
        ? [fallbackImage]
        : []
    if (normalizedGallery.length) {
      galleryByPrimaryValue.set(primaryValue, normalizedGallery)
    }
  }

  for (const variant of variants) {
    const primaryValue = String(variant?.attributeValues?.[primaryAttrName] || '').trim()
    const gallery = galleryByPrimaryValue.get(primaryValue)
    if (!gallery?.length) continue
    variant.images = [...gallery]
    variant.image = gallery[0]
  }
  return variants
}

function normalizeProductVariantData(input) {
  const hasVariants = parseBoolean(input?.hasVariants, true)
  let attributes = normalizeAttributes(input?.attributes)
  if (hasVariants && !attributes.length && Array.isArray(input?.variants)) {
    attributes = inferAttributesFromVariants(input.variants)
  }

  if (!hasVariants) {
    if (input?.price === undefined || input?.price === null || input?.price === '') {
      throw createValidationError('Sản phẩm đơn thiếu Giá.')
    }
    const price = Number(input.price)
    if (!Number.isFinite(price) || price < 0) {
      throw createValidationError('Giá sản phẩm đơn không hợp lệ.')
    }
    const singleStock = parseVariantStock(input, 0)
    const sku = String(input?.sku || '').trim()
    if (!sku) {
      throw createValidationError('Sản phẩm đơn thiếu SKU.')
    }
    const image = String(input?.image || input?.images?.[0] || '').trim()
    const originalPrice =
      input?.originalPrice !== undefined &&
      input?.originalPrice !== null &&
      input?.originalPrice !== ''
        ? Number(input.originalPrice)
        : undefined
    if (
      originalPrice !== undefined &&
      (!Number.isFinite(originalPrice) || originalPrice < 0)
    ) {
      throw createValidationError('Giá gốc sản phẩm đơn không hợp lệ.')
    }
    const variants = [
      {
        key: 'Mặc định',
        displayKey: 'Mặc định',
        attributeValues: {},
        typeName: 'Mặc định',
        color: '',
        size: '',
        price,
        originalPrice,
        stock: singleStock.stock,
        stockQuantity: singleStock.stockQuantity,
        sku,
        image,
        images: image ? [image] : [],
        isAvailable: singleStock.isAvailable,
      },
    ]
    return {
      hasVariants: false,
      attributes: [],
      variants,
      price,
      stock: singleStock.stock,
      sku,
      image,
      originalPrice,
    }
  }

  const variantsInput = Array.isArray(input?.variants)
    ? input.variants.map((v, idx) => normalizeVariantRow(v, attributes, idx))
    : []
  const variants = variantsInput

  if (!variants.length) {
    throw createValidationError('Sản phẩm có biến thể cần ít nhất một dòng biến thể.')
  }
  alignImagesByPrimaryAttribute(variants, attributes)
  ensureUniqueVariantKeys(variants)
  const first = variants[0] || {}
  return {
    hasVariants: true,
    attributes: attributes.map((a) => ({ name: a.name, values: a.values })),
    variants,
    price: Number(first.price || 0),
    stock: Number(first.stock ?? first.stockQuantity ?? 0),
    sku: String(first.sku || ''),
    image: String(first.image || first.images?.[0] || ''),
    originalPrice:
      first.originalPrice !== undefined && first.originalPrice !== null
        ? Number(first.originalPrice)
        : undefined,
  }
}

module.exports = {
  normalizeProductVariantData,
  buildKeyFromAttributeValues,
  buildDisplayKeyFromAttributeValues,
  generateSku,
  createValidationError,
}

