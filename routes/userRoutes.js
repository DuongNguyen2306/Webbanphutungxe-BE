const express = require('express')
const { authRequired } = require('../middleware/auth')
const { User } = require('../models/User')

const router = express.Router()

router.get('/me', authRequired, async (req, res) => {
  const u = await User.findById(req.userId).select('-passwordHash')
  if (!u) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })
  res.json(u)
})

module.exports = router
