const mongoose = require('mongoose')

const cartProductSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    selectedVariant: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    products: [cartProductSchema],
  },
  { timestamps: true },
)

const Cart = mongoose.model('Cart', cartSchema)

module.exports = { Cart }
