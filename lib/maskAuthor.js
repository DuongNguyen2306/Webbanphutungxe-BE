/** Ẩn email/SĐT kiểu Shopee: n*****5 */
function maskAuthor(user) {
  if (!user) return { mask: '***' }
  const email = user.email && String(user.email).trim()
  if (email && email.includes('@')) {
    const [local] = email.split('@')
    if (local.length <= 2) return { mask: `${local[0]}***` }
    return {
      mask: `${local[0]}${'*'.repeat(5)}${local[local.length - 1]}`,
    }
  }
  const phone = user.phone && String(user.phone).trim()
  if (phone && phone.length >= 4) {
    const start = phone.slice(0, 2)
    const end = phone.slice(-2)
    return { mask: `${start}${'*'.repeat(Math.min(6, phone.length - 4))}${end}` }
  }
  return { mask: '***' }
}

module.exports = { maskAuthor }
