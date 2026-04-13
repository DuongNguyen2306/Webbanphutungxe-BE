function normalizeOrderStatus(input) {
  if (input === undefined || input === null || input === '') return undefined
  const s = String(input).trim().toUpperCase()
  if (
    ['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED'].includes(s)
  ) {
    return s
  }
  return null
}

function withUrgentFlag(order) {
  const createdAt = new Date(order.createdAt).getTime()
  const isUrgent =
    order.status === 'PENDING' && Number.isFinite(createdAt)
      ? Date.now() - createdAt > 30 * 60 * 1000
      : false
  return { ...order, isUrgent }
}

module.exports = { normalizeOrderStatus, withUrgentFlag }
