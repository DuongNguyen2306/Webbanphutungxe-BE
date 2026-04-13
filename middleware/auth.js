const jwt = require('jsonwebtoken')

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is required')
  return s
}

function authRequired(req, res, next) {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Cần đăng nhập.' })
  try {
    const payload = jwt.verify(token, getSecret())
    req.userId = payload.sub
    req.userRole = payload.role
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' })
  }
}

function authOptional(req, res, next) {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return next()
  try {
    const payload = jwt.verify(token, getSecret())
    req.userId = payload.sub
    req.userRole = payload.role
    req.user = { id: payload.sub, role: payload.role }
  } catch {
    /* token lỗi — coi như khách */
  }
  next()
}

function adminRequired(req, res, next) {
  if (req.userRole !== 'admin')
    return res.status(403).json({ message: 'Cần quyền quản trị.' })
  next()
}

module.exports = { authRequired, authOptional, adminRequired }
