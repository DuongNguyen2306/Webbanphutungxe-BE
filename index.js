require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { connectDb } = require('./lib/db')
const { authRequired, adminRequired } = require('./middleware/auth')
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const productPublic = require('./routes/productPublic')
const categoryPublic = require('./routes/categoryPublic')
const wishlistRoutes = require('./routes/wishlistRoutes')
const orderRoutes = require('./routes/orderRoutes')
const cartRoutes = require('./routes/cartRoutes')
const articleRoutes = require('./routes/articleRoutes')
const bannerRoutes = require('./routes/bannerRoutes')
const adminRoutes = require('./routes/adminRoutes')
const swaggerUi = require('swagger-ui-express')
const { getOpenApiSpec } = require('./lib/openapi')

const app = express()

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  }),
)

const corsOrigin = process.env.CORS_ORIGIN
app.use(
  cors({
    origin:
      !corsOrigin || corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  }),
)

app.use(express.json({ limit: '2mb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/auth', authLimiter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const openApiSpec = getOpenApiSpec()
app.get('/api-docs.json', (_req, res) => res.json(openApiSpec))
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Thai Vũ Motoshop API',
    customCss: '.swagger-ui .topbar { display: none }',
  }),
)

app.use('/api/auth', authRoutes)
app.use('/api', userRoutes)
app.use('/api/products', productPublic)
app.use('/api/categories', categoryPublic)
app.use('/api/articles', articleRoutes)
app.use('/api/article', articleRoutes)
app.use('/api/content/articles', articleRoutes)
app.use('/api/content/article', articleRoutes)
app.use('/api/banners', bannerRoutes)
// Alias cho FE admin đang dùng /api/admin/*
app.use('/api/admin/articles', authRequired, adminRequired, articleRoutes)
app.use('/api/admin/article', authRequired, adminRequired, articleRoutes)
app.use('/api/admin/content/articles', authRequired, adminRequired, articleRoutes)
app.use('/api/admin/content/article', authRequired, adminRequired, articleRoutes)
app.use('/api/admin/banners', authRequired, adminRequired, bannerRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/admin', authRequired, adminRequired, adminRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'Lỗi máy chủ.' })
})

const PORT = Number(process.env.PORT) || 5000
const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Thiếu biến môi trường MONGODB_URI')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.error('Thiếu JWT_SECRET')
  process.exit(1)
}

connectDb(uri)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Thai Vũ API http://localhost:${PORT}`)
    })
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
