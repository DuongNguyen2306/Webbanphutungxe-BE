/**
 * Chuyển `partCategory` của sản phẩm từ các giá trị cũ (tiếng Anh) sang
 * danh sách tiếng Việt mới.
 *
 * Chạy 1 lần sau khi đã đổi PART_CATEGORIES sang tiếng Việt:
 *   node scripts/migratePartCategoryToVietnamese.js
 *
 * Map bên dưới bao phủ các giá trị seed cũ + các biến thể có thể có do
 * admin gõ tay. Giá trị nào không nằm trong map sẽ được kiểm tra: nếu đã
 * thuộc danh sách tiếng Việt hợp lệ thì giữ nguyên, ngược lại sẽ fallback
 * về DEFAULT_PART_CATEGORY ("phụ kiện") và in cảnh báo để anh tự rà.
 */
require('dotenv').config()
const mongoose = require('mongoose')
const { connectDb } = require('../lib/db')
const { Product } = require('../models/Product')
const {
  DEFAULT_PART_CATEGORY,
  isValidPartCategory,
  normalizePartCategory,
} = require('../lib/partCategories')

const LEGACY_MAP = {
  accessories: 'phụ kiện',
  'phu kien': 'phụ kiện',
  mirror: 'gương',
  guong: 'gương',
  screw: 'ốc',
  oc: 'ốc',
  bolt: 'ốc',
  cover: 'bạt phủ',
  'bat phu': 'bạt phủ',
  lighting: 'đèn',
  light: 'đèn',
  den: 'đèn',
  tire: 'lốp',
  lop: 'lốp',
  rim: 'mâm',
  mam: 'mâm',
  suspension: 'phuộc',
  phuoc: 'phuộc',
  brake: 'phanh',
  exhaust: 'pô',
  po: 'pô',
  helmet: 'nón bảo hiểm',
  'non bao hiem': 'nón bảo hiểm',
  oil: 'nhớt',
  nhot: 'nhớt',
  battery: 'bình điện',
  'binh dien': 'bình điện',
  chain: 'sên nhông',
  'sen nhong': 'sên nhông',
  handle: 'tay phanh',
  'tay phanh tay ga': 'tay phanh',
  decal: 'tem decal',
  engine: 'phụ tùng máy',
  'phu tung may': 'phụ tùng máy',
  electric: 'điện',
  dien: 'điện',
  other: 'khác',
  khac: 'khác',
}

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong .env')
    process.exit(1)
  }
  await connectDb(uri)

  const products = await Product.find({}, { _id: 1, name: 1, partCategory: 1 }).lean()
  let updated = 0
  let unchanged = 0
  let fallback = 0
  const warnings = []

  for (const p of products) {
    const current = normalizePartCategory(p.partCategory)
    let next = LEGACY_MAP[current] || current

    if (!isValidPartCategory(next)) {
      warnings.push(`- ${p._id} "${p.name}" → giá trị cũ "${p.partCategory}" không khớp, đặt về "${DEFAULT_PART_CATEGORY}"`)
      next = DEFAULT_PART_CATEGORY
      fallback += 1
    }

    if (next === p.partCategory) {
      unchanged += 1
      continue
    }

    await Product.updateOne({ _id: p._id }, { $set: { partCategory: next } })
    updated += 1
  }

  console.log('=== Migrate partCategory → tiếng Việt ===')
  console.log('  Đã đổi      :', updated)
  console.log('  Đã đúng     :', unchanged)
  console.log('  Fallback    :', fallback, '(về "phụ kiện")')
  if (warnings.length) {
    console.log('Cảnh báo:')
    warnings.forEach((w) => console.log(w))
  }

  await mongoose.disconnect()
  process.exit(0)
}

run().catch(async (err) => {
  console.error(err)
  try {
    await mongoose.disconnect()
  } catch (_) {}
  process.exit(1)
})
