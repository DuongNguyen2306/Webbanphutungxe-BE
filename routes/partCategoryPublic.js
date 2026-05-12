const express = require('express')
const { PART_CATEGORIES } = require('../lib/partCategories')

const router = express.Router()

/** GET /api/part-categories — danh sách loại phụ tùng cố định cho dropdown admin/FE */
router.get('/', (_req, res) => {
  res.json(PART_CATEGORIES)
})

module.exports = router
