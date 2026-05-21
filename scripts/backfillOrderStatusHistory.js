/**
 * Thêm mục "Khách đặt đơn" (PENDING) cho đơn chưa có statusHistory.
 * Chạy một lần: node scripts/backfillOrderStatusHistory.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const { Order } = require('../models/Order')
const { buildStatusHistoryEntry } = require('../lib/orderStatusHistory')

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Thiếu MONGODB_URI trong .env')
    process.exit(1)
  }
  await mongoose.connect(uri)

  const orders = await Order.find({
    $or: [
      { statusHistory: { $exists: false } },
      { statusHistory: { $size: 0 } },
    ],
  }).select('_id createdAt status')

  let updated = 0
  for (const order of orders) {
    const entry = buildStatusHistoryEntry({
      fromStatus: null,
      toStatus: 'PENDING',
      processedBy: null,
      note: 'Khách đặt đơn (backfill)',
      at: order.createdAt || new Date(),
    })
    // eslint-disable-next-line no-await-in-loop
    await Order.updateOne({ _id: order._id }, { $set: { statusHistory: [entry] } })
    updated += 1
  }

  console.log(`Đã backfill statusHistory cho ${updated} đơn.`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
