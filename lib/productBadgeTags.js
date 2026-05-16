/** Nhãn hiển thị / sắp xếp danh sách cửa hàng (khác với `tags` = từ khóa tìm kiếm). */
const BADGE_TAG_VALUES = ['new', 'best-seller', 'featured']
const BADGE_TAG_SET = new Set(BADGE_TAG_VALUES)

/** Thứ tự ưu tiên khi sắp xếp: new > best-seller > featured > còn lại. */
function badgeTagSortRank(doc) {
  const arr = Array.isArray(doc?.badgeTags) ? doc.badgeTags : []
  if (arr.includes('new')) return 1
  if (arr.includes('best-seller')) return 2
  if (arr.includes('featured')) return 3
  return 4
}

function normalizeBadgeTags(input) {
  if (!Array.isArray(input)) return []
  const out = []
  const seen = new Set()
  for (const x of input) {
    const v = String(x || '').trim()
    if (!BADGE_TAG_SET.has(v) || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** Danh sách phẳng: nhóm 1→4, trong nhóm ổn định theo tên (vi). */
function sortProductsByBadgeTagsThenName(list) {
  return [...list].sort((a, b) => {
    const ra = badgeTagSortRank(a)
    const rb = badgeTagSortRank(b)
    if (ra !== rb) return ra - rb
    return String(a.name || '').localeCompare(String(b.name || ''), 'vi', {
      sensitivity: 'base',
    })
  })
}

module.exports = {
  BADGE_TAG_VALUES,
  BADGE_TAG_SET,
  normalizeBadgeTags,
  sortProductsByBadgeTagsThenName,
  badgeTagSortRank,
}
