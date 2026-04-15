const ORDER_STATUS_OPTIONS = [
  { code: 'PENDING', label: 'Chờ xử lý' },
  { code: 'CONTACTING', label: 'Đang liên hệ' },
  { code: 'CONFIRMED', label: 'Đã xác nhận' },
  { code: 'SHIPPING', label: 'Đang giao' },
  { code: 'COMPLETED', label: 'Hoàn thành' },
  { code: 'CANCELLED', label: 'Đã hủy' },
]

const STATUS_ALIASES = {
  PENDING: 'PENDING',
  CHO_XU_LY: 'PENDING',
  CHO_XU_LI: 'PENDING',
  WAITING: 'PENDING',
  PROCESSING: 'PENDING',
  IN_PROGRESS: 'PENDING',
  CONTACTING: 'CONTACTING',
  DANG_LIEN_HE: 'CONTACTING',
  LIEN_HE: 'CONTACTING',
  CONFIRMED: 'CONFIRMED',
  DA_XAC_NHAN: 'CONFIRMED',
  SHIPPING: 'SHIPPING',
  DANG_GIAO: 'SHIPPING',
  DELIVERING: 'SHIPPING',
  COMPLETED: 'COMPLETED',
  HOAN_THANH: 'COMPLETED',
  DELIVERED: 'COMPLETED',
  DONE: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  DA_HUY: 'CANCELLED',
}

function normalizeOrderStatus(input) {
  if (input === undefined || input === null || input === '') return undefined
  const key = String(input)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]+/g, '_')
  return STATUS_ALIASES[key] || null
}

function withUrgentFlag(order) {
  const createdAt = new Date(order.createdAt).getTime()
  const isUrgent =
    order.status === 'PENDING' && Number.isFinite(createdAt)
      ? Date.now() - createdAt > 30 * 60 * 1000
      : false
  return { ...order, isUrgent }
}

module.exports = { normalizeOrderStatus, withUrgentFlag, ORDER_STATUS_OPTIONS }
