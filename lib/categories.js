const mongoose = require('mongoose')
const { Category } = require('../models/Category')

async function resolveCategory(input) {
  if (input === undefined || input === null || input === '') {
    let cat = await Category.findOne({ nameNormalized: 'khac' })
    if (!cat)
      cat = await Category.create({ name: 'Khác', nameNormalized: 'khac' })
    return cat._id
  }
  const s = String(input).trim()
  if (mongoose.isValidObjectId(s)) {
    const byId = await Category.findById(s)
    if (byId) return byId._id
  }
  const norm = s.toLowerCase()
  let doc = await Category.findOne({ nameNormalized: norm })
  if (!doc) doc = await Category.create({ name: s, nameNormalized: norm })
  return doc._id
}

module.exports = { resolveCategory }
