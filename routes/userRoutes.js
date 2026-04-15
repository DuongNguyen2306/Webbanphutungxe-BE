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

function toProfileResponse(user) {
  const displayName = getSafeDisplayName(user)
  return {
    id: user._id,
    email: user.email || '',
    phone: user.phone || '',
    role: user.role,
    displayName,
    // Hỗ trợ FE đang dùng key `name`.
    name: displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

router.get('/me', authRequired, async (req, res) => {
  const u = await User.findById(req.userId).select('-passwordHash')
  if (!u) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })
  res.json({
    ...u.toObject(),
    name: getSafeDisplayName(u),
  })
})

router.get('/users/profile', authRequired, async (req, res) => {
  const u = await User.findById(req.userId).select(
    'email phone role displayName createdAt updatedAt',
  )
  if (!u) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' })
  res.json(toProfileResponse(u))
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

    const nextName =
      req.body.name !== undefined ? req.body.name : req.body.displayName
    if (nextName !== undefined) {
      u.displayName = String(nextName || '').trim()
    }

    await u.save()

    res.json(toProfileResponse(u))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Cập nhật profile thất bại.' })
  }
})

module.exports = router
