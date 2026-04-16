function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
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

function generateSku(productName, variant) {
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

function buildKeyFromAttributeValues(attributeValues, attributeOrder) {
  const parts = attributeOrder
    .map((k) => String(attributeValues?.[k] || '').trim())
    .filter(Boolean)
  return parts.join(' / ')
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

  const autoKey = buildKeyFromAttributeValues(
    attributeValues,
    attrs.map((a) => a.name),
  )
  const fallbackKey = [raw?.typeName, raw?.color, raw?.size]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' / ')
  const key = String(autoKey || fallbackKey || `Biến thể ${line}`).trim()

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
  const stock = Number(raw?.stock ?? raw?.stockQuantity ?? 0)
  if (!Number.isFinite(stock) || stock < 0) {
    throw createValidationError(`Biến thể dòng #${line} có Tồn kho không hợp lệ.`)
  }

  const row = {
    key,
    attributeValues,
    price,
    originalPrice,
    stock: Math.max(0, Number(stock) || 0),
    stockQuantity: Math.max(0, Number(stock) || 0),
    sku: String(raw?.sku || '').trim(),
    image,
    images,
    isAvailable: raw?.isAvailable !== false,
    typeName: String(raw?.typeName || key).trim(),
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

function normalizeProductVariantData(input) {
  const attributes = normalizeAttributes(input?.attributes)

  const variantsInput = Array.isArray(input?.variants)
    ? input.variants.map((v, idx) => normalizeVariantRow(v, attributes, idx))
    : []
  let variants = variantsInput

  if (!variants.length) {
    throw createValidationError('Cần ít nhất một biến thể để lưu sản phẩm.')
  }

  ensureUniqueVariantKeys(variants)
  return {
    attributes: attributes.map((a) => ({ name: a.name, values: a.values })),
    variants,
  }
}

module.exports = {
  normalizeProductVariantData,
  buildKeyFromAttributeValues,
  generateSku,
  createValidationError,
}

