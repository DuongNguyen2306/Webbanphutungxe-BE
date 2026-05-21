const { ORDER_STATUS_OPTIONS } = require('./orders')

function statusLabel(code) {
  const row = ORDER_STATUS_OPTIONS.find((s) => s.code === code)
  return row?.label || String(code || '')
}

function buildStatusHistoryEntry({
  fromStatus,
  toStatus,
  processedBy = null,
  note = '',
  at = new Date(),
}) {
  return {
    fromStatus: fromStatus || null,
    toStatus,
    processedBy: processedBy ? String(processedBy).trim().slice(0, 120) : null,
    note: String(note || '').trim().slice(0, 500),
    at: at instanceof Date ? at : new Date(at),
  }
}

function mapOneHistoryEntry(row) {
  if (!row || typeof row !== 'object') return null
  const fromStatus = row.fromStatus || null
  const toStatus = row.toStatus || row.status || null
  if (!toStatus) return null
  const at = row.at ? new Date(row.at) : null
  return {
    _id: row._id,
    fromStatus,
    toStatus,
    fromStatusLabel: fromStatus ? statusLabel(fromStatus) : '—',
    toStatusLabel: statusLabel(toStatus),
    processedBy: row.processedBy || null,
    note: row.note || '',
    at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    isLegacy: Boolean(row.isLegacy),
  }
}

/** Lịch sử đầy đủ cho API; đơn cũ chỉ có processedBy → 1 mục legacy. */
function mapStatusHistoryForResponse(rawHistory, orderLean) {
  const list = Array.isArray(rawHistory) ? rawHistory : []
  if (list.length > 0) {
    return list.map(mapOneHistoryEntry).filter(Boolean)
  }
  if (orderLean?.processedBy && orderLean?.status) {
    const at = orderLean.updatedAt || orderLean.createdAt
    const fromStatus = 'PENDING'
    const toStatus = orderLean.status
    const atIso =
      at && !Number.isNaN(new Date(at).getTime())
        ? new Date(at).toISOString()
        : null
    return [
      {
        fromStatus,
        toStatus,
        fromStatusLabel: statusLabel(fromStatus),
        toStatusLabel: statusLabel(toStatus),
        processedBy: String(orderLean.processedBy).trim(),
        note: 'Dữ liệu cũ — chỉ lưu nhân viên cuối cùng trước khi có lịch sử từng bước.',
        at: atIso,
        isLegacy: true,
      },
    ]
  }
  return []
}

function getLastProcessedBy(orderLean) {
  const list = Array.isArray(orderLean?.statusHistory)
    ? orderLean.statusHistory
    : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const name = String(list[i]?.processedBy || '').trim()
    if (name) return name
  }
  return orderLean?.processedBy
    ? String(orderLean.processedBy).trim()
    : null
}

function formatStatusHistoryForExport(entries) {
  const rows = Array.isArray(entries) ? entries : []
  if (!rows.length) return ''
  return rows
    .map((e) => {
      const time = e.at
        ? new Date(e.at).toLocaleString('vi-VN')
        : ''
      const from = e.fromStatusLabel || statusLabel(e.fromStatus) || '—'
      const to = e.toStatusLabel || statusLabel(e.toStatus) || '—'
      const who = e.processedBy || '—'
      const note = e.note ? ` | Ghi chú: ${e.note}` : ''
      return `${time}: ${from} → ${to} (${who})${note}`
    })
    .join('\n')
}

module.exports = {
  buildStatusHistoryEntry,
  mapStatusHistoryForResponse,
  getLastProcessedBy,
  formatStatusHistoryForExport,
}
