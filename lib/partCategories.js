/**
 * Danh sách "loại phụ tùng" cố định (dropdown ở admin).
 *
 * Mỗi sản phẩm phải thuộc ĐÚNG 1 loại trong danh sách này. API gợi ý
 * "cùng loại" (relatedByCategory) dựa hoàn toàn vào trường `partCategory`
 * của Product để trả về đúng "gương ↔ gương, ốc ↔ ốc, bạt phủ ↔ bạt phủ"...
 *
 * Khi cần thêm loại mới: thêm 1 entry vào PART_CATEGORIES bên dưới rồi
 * deploy lại BE. Không cần migrate dữ liệu — sản phẩm cũ chỉ cần update
 * trường partCategory qua admin.
 */

const PART_CATEGORIES = [
  { value: 'phụ kiện', label: 'Phụ kiện chung' },
  { value: 'gương', label: 'Gương chiếu hậu' },
  { value: 'ốc', label: 'Ốc / Bu-lông' },
  { value: 'bạt phủ', label: 'Bạt phủ / Áo trùm xe' },
  { value: 'đèn', label: 'Đèn / Bóng đèn' },
  { value: 'lốp', label: 'Lốp / Vỏ xe' },
  { value: 'mâm', label: 'Mâm / Vành xe' },
  { value: 'phuộc', label: 'Phuộc / Giảm xóc' },
  { value: 'phanh', label: 'Phanh / Thắng' },
  { value: 'pô', label: 'Pô / Ống xả' },
  { value: 'nón bảo hiểm', label: 'Nón bảo hiểm' },
  { value: 'nhớt', label: 'Nhớt / Dầu' },
  { value: 'bình điện', label: 'Bình điện / Ắc-quy' },
  { value: 'sên nhông', label: 'Sên / Nhông xích' },
  { value: 'tay phanh', label: 'Tay phanh / Tay ga' },
  { value: 'tem decal', label: 'Tem / Decal' },
  { value: 'phụ tùng máy', label: 'Phụ tùng máy' },
  { value: 'điện', label: 'Điện / IC / CDI' },
  { value: 'khác', label: 'Khác' },
]

const DEFAULT_PART_CATEGORY = 'phụ kiện'

const VALUE_SET = new Set(PART_CATEGORIES.map((c) => c.value))

function normalizePartCategory(input) {
  return String(input ?? '').trim().toLowerCase()
}

function isValidPartCategory(input) {
  const v = normalizePartCategory(input)
  if (!v) return false
  return VALUE_SET.has(v)
}

/**
 * Trả về giá trị hợp lệ (đã normalize) hoặc null nếu không hợp lệ.
 * Truyền null/undefined/'' → trả về null (để caller quyết định dùng default).
 */
function resolvePartCategory(input) {
  const v = normalizePartCategory(input)
  if (!v) return null
  return VALUE_SET.has(v) ? v : null
}

module.exports = {
  PART_CATEGORIES,
  DEFAULT_PART_CATEGORY,
  isValidPartCategory,
  normalizePartCategory,
  resolvePartCategory,
}
