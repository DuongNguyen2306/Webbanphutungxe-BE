const ExcelJS = require('exceljs')
const { Order } = require('../models/Order')
const {
  enrichOrder,
  formatItemsForExport,
  statusLabel,
  buildShippingAddressText,
} = require('./orderEnrich')
const { formatStatusHistoryForExport } = require('./orderStatusHistory')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseExportDateRange(startDate, endDate) {
  const start = String(startDate || '').trim()
  const end = String(endDate || '').trim()
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: 'startDate và endDate phải dạng YYYY-MM-DD.' }
  }
  const startAt = new Date(`${start}T00:00:00.000`)
  const endAt = new Date(`${end}T23:59:59.999`)
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: 'Ngày không hợp lệ.' }
  }
  if (startAt > endAt) {
    return { error: 'startDate không được sau endDate.' }
  }
  return { start: startAt, end: endAt, startLabel: start, endLabel: end }
}

async function buildOrdersExcelBuffer(startAt, endAt) {
  const orders = await Order.find({
    createdAt: { $gte: startAt, $lte: endAt },
  })
    .sort({ createdAt: -1 })
    .lean()

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Thai Vu Motoshop'
  const sheet = workbook.addWorksheet('Don hang')

  sheet.columns = [
    { header: 'Mã đơn hàng', key: 'orderCode', width: 14 },
    { header: 'Ngày đặt', key: 'createdAt', width: 20 },
    { header: 'Tên khách hàng', key: 'customerName', width: 24 },
    { header: 'Số điện thoại', key: 'phone', width: 16 },
    { header: 'Địa chỉ', key: 'address', width: 40 },
    { header: 'Sản phẩm', key: 'items', width: 50 },
    { header: 'Tổng tiền', key: 'total', width: 14 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Nhân viên cuối', key: 'processedBy', width: 16 },
    { header: 'Lịch sử xử lý đơn', key: 'statusHistory', width: 55 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }

  for (const raw of orders) {
    // eslint-disable-next-line no-await-in-loop
    const order = await enrichOrder(raw)
    const created = order.createdAt
      ? new Date(order.createdAt).toLocaleString('vi-VN')
      : ''
    sheet.addRow({
      orderCode: order.orderCode || '—',
      createdAt: created,
      customerName: order.contact?.name || '',
      phone: order.contact?.phone || '',
      address: buildShippingAddressText(order) || order.shippingAddressText || '',
      items: formatItemsForExport(order.items),
      total: Number(order.totalAmount || 0),
      status: statusLabel(order.status),
      processedBy: order.processedBy || '',
      statusHistory: formatStatusHistoryForExport(order.statusHistory),
    })
  }

  sheet.getColumn('total').numFmt = '#,##0'
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

module.exports = { parseExportDateRange, buildOrdersExcelBuffer }
