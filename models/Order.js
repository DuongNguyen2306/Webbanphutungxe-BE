const mongoose = require('mongoose')

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    variantLabel: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: null },
    toStatus: {
      type: String,
      required: true,
      enum: [
        'PENDING',
        'CONTACTING',
        'CONFIRMED',
        'SHIPPING',
        'COMPLETED',
        'CANCELLED',
      ],
    },
    processedBy: { type: String, default: null, trim: true, maxlength: 120 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
)

const orderSchema = new mongoose.Schema(
  {
    /** Mã đơn 6 chữ số hiển thị cho khách (duy nhất). */
    orderCode: {
      type: String,
      trim: true,
      maxlength: 6,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    contact: {
      name: { type: String, default: '', trim: true, required: false },
      email: { type: String, default: '', trim: true, required: false },
      phone: { type: String, default: '', trim: true, required: false },
    },
    shippingAddress: {
      province: { type: String, default: '', trim: true, required: false },
      district: { type: String, default: '', trim: true, required: false },
      ward: { type: String, default: '', trim: true, required: false },
      /** Địa chỉ cụ thể (số nhà, đường…). Không bắt buộc — khách có thể đặt chỉ qua SĐT. */
      detail: { type: String, default: '', trim: true, required: false },
      note: { type: String, default: '', trim: true },
    },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    /** Phí vận chuyển — luôn 0; shop liên hệ tư vấn, không tính phí qua API. */
    shippingFee: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONTACTING',
        'CONFIRMED',
        'SHIPPING',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'PENDING',
    },
    /** Đơn vị vận chuyển + mã vận đơn (admin nhập; khách xem khi đang giao / sau giao). */
    delivery: {
      carrierName: { type: String, default: '', trim: true, maxlength: 200 },
      trackingNumber: { type: String, default: '', trim: true, maxlength: 200 },
    },
    note: { type: String, default: '' },
    /** Nhân viên xử lý gần nhất (denormalized — lấy từ statusHistory). */
    processedBy: { type: String, default: null, trim: true, maxlength: 120 },
    /** Lịch sử từng lần đổi trạng thái + nhân viên phụ trách. */
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true },
)

orderSchema.index({ orderCode: 1 }, { unique: true, sparse: true })
orderSchema.index({ createdAt: -1 })

const Order = mongoose.model('Order', orderSchema)
module.exports = { Order }
