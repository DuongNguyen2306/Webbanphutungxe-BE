const { maskAuthor } = require('./maskAuthor')

/** Chuẩn hóa review cho API công khai (ẩn user / hiển thị tên đánh giá cửa hàng). */
function toPublicReviewShape(reviewDoc) {
  const { user, ...rest } = reviewDoc
  if (rest.isStoreReview) {
    const name = String(rest.reviewerDisplayName || '').trim() || 'Cửa hàng'
    return {
      ...rest,
      author: { mask: name, isStoreReview: true },
    }
  }
  return {
    ...rest,
    author: maskAuthor(user),
  }
}

module.exports = { toPublicReviewShape }
