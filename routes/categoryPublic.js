const express = require('express')
const mongoose = require('mongoose')
const { Category } = require('../models/Category')
const { Product } = require('../models/Product')

const router = express.Router()

const STOREFRONT_FILTER = { showOnStorefront: { $ne: false } }

function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

router.get('/', async (req, res) => {
  try {
    const allRaw = String(req.query.all ?? '').trim()
    const all = allRaw === '1' || allRaw.toLowerCase() === 'true'

    let filter = {}
    if (!all) {
      const rawIds = await Product.distinct('category', {
        ...STOREFRONT_FILTER,
        category: { $exists: true, $ne: null },
      })
      const ids = rawIds
        .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null))
        .filter(Boolean)
      if (!ids.length) {
        return res.json([])
      }
      filter = { _id: { $in: ids } }
    }

    const list = await Category.find(filter).sort({ name: 1 }).lean()
    const out = list.map((c) => ({
      _id: c._id,
      name: c.name,
      slug: toSlug(c.name),
    }))
    res.json(out)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không tải được danh mục.' })
  }
})

module.exports = router
