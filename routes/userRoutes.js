const express = require('express')
const { authRequired } = require('../middleware/auth')
const { User } = require('../models/User')

const router = express.Router()

function getSafeDisplayName(user) {
  const explicit = String(user?.displayName || '').trim()
  if (explicit) return explicit
  const email = String(user?.email || '').trim().toLowerCase()
  if (email.includes('@')) return email.split('@')[0]
  return ''
}

router.get('/me', authRequired, async (req, res) => {
  const u = await User.findById(req.userId).select('-passwordHash')
  if (!u) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })
  res.json(u)
})

router.get('/users/profile', authRequired, async (req, res) => {
  const u = await User.findById(req.userId).select(
    'email phone role displayName createdAt updatedAt',
  )
  if (!u) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })
  res.json({
    id: u._id,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    displayName: getSafeDisplayName(u),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  })
})

router.put('/users/profile', authRequired, async (req, res) => {
  try {
    const u = await User.findById(req.userId)
    if (!u)
      return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })

    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone || '').trim()
      if (phone) {
        const ex = await User.findOne({
          phone,
          _id: { $ne: u._id },
        }).select('_id')
        if (ex) {
          return res.status(409).json({ message: 'Số điện thoại đã được dùng.' })
        }
      }
      u.phone = phone || undefined
    }

    if (req.body.displayName !== undefined) {
      u.displayName = String(req.body.displayName || '').trim()
    }

    await u.save()

    res.json({
      id: u._id,
      email: u.email || '',
      phone: u.phone || '',
      role: u.role,
      displayName: getSafeDisplayName(u),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Cập nhật profile thất bại.' })
  }
})

module.exports = router
