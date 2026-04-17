const mongoose = require('mongoose')

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    content: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['intro', 'guide'],
      required: true,
      index: true,
    },
    author: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { timestamps: true },
)

const Article = mongoose.model('Article', articleSchema)
module.exports = { Article }
