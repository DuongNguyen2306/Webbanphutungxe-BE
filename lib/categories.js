const mongoose = require('mongoose')
const { Category } = require('../models/Category')

function normalizeCategoryInput(input) {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input.trim()
  if (typeof input === 'object') {
    const idCandidate = String(input._id ?? input.id ?? '').trim()
    if (idCandidate) return idCandidate
    const nameCandidate = String(input.name ?? input.label ?? input.value ?? '').trim()
    if (nameCandidate) return nameCandidate
    return ''
  }
  return String(input).trim()
}

async function resolveCategory(input) {
  const s = normalizeCategoryInput(input)
  if (!s) {
    let cat = await Category.findOne({ nameNormalized: 'khac' })
    if (!cat)
      cat = await Category.create({ name: 'Khác', nameNormalized: 'khac' })
    return cat._id
  }
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
