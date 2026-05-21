const crypto = require('crypto')
const { Order } = require('../models/Order')

const MIN_CODE = 100000
const MAX_CODE = 999999
const MAX_ATTEMPTS = 25

function randomSixDigitCode() {
  const n = crypto.randomInt(MIN_CODE, MAX_CODE + 1)
  return String(n)
}

/**
 * Sinh mã đơn 6 chữ số duy nhất (100000–999999).
 */
async function allocateUniqueOrderCode() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = randomSixDigitCode()
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({ orderCode: code })
    if (!exists) return code
  }
  throw new Error('Không tạo được mã đơn hàng duy nhất.')
}

module.exports = { allocateUniqueOrderCode, randomSixDigitCode }
