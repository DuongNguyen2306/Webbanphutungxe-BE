const mongoose = require('mongoose')

const bannerTextLayerSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['h1', 'h2', 'h3', 'body', 'cta'],
      default: 'body',
      trim: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    style: {
      color: { type: String, default: '' },
      fontSize: { type: String, default: '' },
      fontWeight: { type: String, default: '' },
      align: { type: String, default: '' },
      x: { type: String, default: '' },
      y: { type: String, default: '' },
      maxWidth: { type: String, default: '' },
    },
  },
  { _id: false },
)

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    linkTo: { type: String, default: '', trim: true },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    textLayers: { type: [bannerTextLayerSchema], default: [] },
  },
  { timestamps: true },
)

const Banner = mongoose.model('Banner', bannerSchema)
module.exports = { Banner }
