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

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    contact: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    shippingAddress: {
      province: { type: String, default: '', trim: true },
      district: { type: String, default: '', trim: true },
      ward: { type: String, default: '', trim: true },
      detail: { type: String, default: '', trim: true },
      note: { type: String, default: '', trim: true },
    },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
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
  },
  { timestamps: true },
)

const Order = mongoose.model('Order', orderSchema)
module.exports = { Order }
