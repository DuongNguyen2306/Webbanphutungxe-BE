const express = require('express')
const jwt = require('jsonwebtoken')
const { User } = require('../models/User')

const router = express.Router()

function sign(u) {
  return jwt.sign(
    { sub: u._id.toString(), role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: '14d' },
  )
}

function getSafeDisplayName(user) {
  const explicit = String(user?.displayName || '').trim()
  if (explicit) return explicit
  const email = String(user?.email || '').trim().toLowerCase()
  if (email.includes('@')) return email.split('@')[0]
  return ''
}

router.post('/register', async (req, res) => {
  try {
    const { email, phone, password, name, displayName } = req.body
    if (!password || String(password).length < 6)
      return res.status(400).json({ message: 'Mật khẩu tối thiểu 6 ký tự.' })
    const em = email?.trim()?.toLowerCase() || ''
    const ph = phone?.trim() || ''
    const dn = String(name ?? displayName ?? '').trim()
    if (!em && !ph)
      return res.status(400).json({ message: 'Cần email hoặc số điện thoại.' })
    if (em) {
      const ex = await User.findOne({ email: em })
      if (ex) return res.status(409).json({ message: 'Email đã được dùng.' })
    }
    if (ph) {
      const ex = await User.findOne({ phone: ph })
      if (ex)
        return res.status(409).json({ message: 'Số điện thoại đã được dùng.' })
    }
    const passwordHash = await User.hashPassword(password)
    const user = await User.create({
      email: em || undefined,
      phone: ph || undefined,
      displayName: dn,
      passwordHash,
      role: 'user',
    })
    const token = sign(user)
    const safeName = getSafeDisplayName(user)
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: safeName,
        name: safeName,
      },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Lỗi đăng ký.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body
    if (!login || !password)
      return res.status(400).json({ message: 'Thiếu thông tin đăng nhập.' })
    const q = String(login).trim()
    const user = await User.findOne({
      $or: [{ email: q.toLowerCase() }, { phone: q }],
    })
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Sai email/SĐT hoặc mật khẩu.' })
    const token = sign(user)
    const safeName = getSafeDisplayName(user)
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        displayName: safeName,
        name: safeName,
      },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Lỗi đăng nhập.' })
  }
})

module.exports = router
