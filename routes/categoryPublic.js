const express = require('express')
const { Category } = require('../models/Category')

const router = express.Router()

router.get('/', async (_req, res) => {
  const list = await Category.find().sort({ name: 1 }).lean()
  res.json(list)
})

module.exports = router
