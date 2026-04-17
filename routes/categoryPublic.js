const express = require('express')
const { Category } = require('../models/Category')

const router = express.Router()

function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

router.get('/', async (_req, res) => {
  const list = await Category.find().sort({ name: 1 }).lean()
  const out = list.map((c) => ({
    _id: c._id,
    name: c.name,
    slug: toSlug(c.name),
  }))
  res.json(out)
})

module.exports = router
