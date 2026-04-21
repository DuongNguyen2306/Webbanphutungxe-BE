const express = require('express')
const mongoose = require('mongoose')
const { Banner } = require('../models/Banner')
const { authRequired, adminRequired } = require('../middleware/auth')
const {
  isCloudinaryReady,
  bannerUploadAny,
} = require('../configs/cloudinary.config')
const { resolveExternalImageUrl } = require('../lib/externalImages')

const router = express.Router()

function parseBoolean(input, fallback = true) {
  if (typeof input === 'boolean') return input
  if (typeof input === 'string') {
    const x = input.trim().toLowerCase()
    if (x === 'true') return true
    if (x === 'false') return false
  }
  return fallback
}

function parseOrder(input, fallback = 0) {
  if (input === undefined || input === null || input === '') return fallback
  const n = Number(input)
  return Number.isFinite(n) ? n : null
}

function parseJsonMaybe(input) {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'string') return input
  const raw = input.trim()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function parseStringArrayMaybe(input) {
  if (Array.isArray(input)) return input
  const parsed = parseJsonMaybe(input)
  return Array.isArray(parsed) ? parsed : []
}

function normalizeTextLevel(input) {
  const level = String(input || '')
    .trim()
    .toLowerCase()
  return ['h1', 'h2', 'h3', 'body', 'cta'].includes(level) ? level : 'body'
}

function normalizeTextLayers(input) {
  const raw = parseJsonMaybe(input)
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, idx) => {
      const text = String(item?.text || '').trim()
      if (!text) return null
      return {
        level: normalizeTextLevel(item?.level),
        text,
        order: parseOrder(item?.order, idx) ?? idx,
        isActive: parseBoolean(item?.isActive, true),
        style: {
          color: String(item?.style?.color || item?.color || '').trim(),
          fontSize: String(item?.style?.fontSize || item?.fontSize || '').trim(),
          fontWeight: String(
            item?.style?.fontWeight || item?.fontWeight || '',
          ).trim(),
          align: String(item?.style?.align || item?.align || '').trim(),
          x: String(item?.style?.x || item?.x || '').trim(),
          y: String(item?.style?.y || item?.y || '').trim(),
          maxWidth: String(item?.style?.maxWidth || item?.maxWidth || '').trim(),
        },
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
}

function extractTextLayersFromBody(body) {
  const fromArray = normalizeTextLayers(body?.textLayers)
  if (fromArray.length) return fromArray

  const quick = [
    { level: 'h1', text: body?.textH1 ?? body?.h1 },
    { level: 'h2', text: body?.textH2 ?? body?.h2 },
    { level: 'h3', text: body?.textH3 ?? body?.h3 },
    { level: 'body', text: body?.textBody ?? body?.bodyText },
    { level: 'cta', text: body?.textCta ?? body?.ctaText },
  ]
    .map((x, idx) => {
      const text = String(x.text || '').trim()
      if (!text) return null
      return { level: x.level, text, order: idx, isActive: true, style: {} }
    })
    .filter(Boolean)
  return quick
}

function isMultipartRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  return contentType.includes('multipart/form-data')
}

function getUploadedFiles(req) {
  if (Array.isArray(req.files)) return req.files
  if (req.files && typeof req.files === 'object') {
    const images = Array.isArray(req.files.images) ? req.files.images : []
    const image = Array.isArray(req.files.image) ? req.files.image : []
    return [...images, ...image]
  }
  if (req.file) return [req.file]
  return []
}

async function normalizeExternalImageList(urls) {
  const out = []
  for (const raw of urls) {
    const input = String(raw || '').trim()
    if (!input) continue
    // Nếu có Cloudinary thì upload URL ngoài (đặc biệt Google Drive) lên Cloudinary.
    // Nếu chưa cấu hình Cloudinary thì vẫn lưu URL đã chuẩn hóa để không chặn luồng hiện tại.
    // eslint-disable-next-line no-await-in-loop
    const resolved = await resolveExternalImageUrl(input, {
      uploadToCloudinary: isCloudinaryReady,
      folder: 'ThaiVu_Banners',
    })
    if (resolved.url) out.push(resolved.url)
  }
  return out
}

router.get('/', async (_req, res) => {
  try {
    const isAdminScope = String(_req.baseUrl || '').includes('/api/admin/')
    const filter = isAdminScope ? {} : { isActive: true }
    const list = await Banner.find(filter).sort({ order: 1, createdAt: -1 }).lean()
    return res.json(list)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không tải được banner.' })
  }
})

router.post(
  '/',
  authRequired,
  adminRequired,
  (req, res, next) => {
    if (isMultipartRequest(req) && !isCloudinaryReady) {
      return res.status(500).json({
        message:
          'Cloudinary chưa được cấu hình. Cần CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.',
      })
    }
    next()
  },
  bannerUploadAny,
  async (req, res) => {
    try {
      const uploaded = getUploadedFiles(req)
      const bodyImages = [
        ...parseStringArrayMaybe(req.body?.imageUrls),
        ...(req.body?.imageUrl ? [req.body.imageUrl] : []),
        ...parseStringArrayMaybe(req.body?.googleDriveUrls),
        ...(req.body?.googleDriveUrl ? [req.body.googleDriveUrl] : []),
      ]
      const normalizedBodyImages = await normalizeExternalImageList(bodyImages)
      const imageUrls = [
        ...uploaded.map((f) => String(f.path || '').trim()),
        ...normalizedBodyImages,
      ].filter(Boolean)

      if (!imageUrls.length) {
        return res.status(400).json({
          message: 'Cần upload ít nhất 1 ảnh banner (field images hoặc imageUrl).',
        })
      }

      const baseOrder = parseOrder(req.body?.order, 0)
      if (baseOrder === null) {
        return res.status(400).json({ message: 'order không hợp lệ.' })
      }
      const linkTo = String(req.body?.linkTo || '').trim()
      const isActive = parseBoolean(req.body?.isActive, true)
      const textLayers = extractTextLayersFromBody(req.body)

      const docs = imageUrls.map((url, idx) => ({
        imageUrl: url,
        linkTo,
        order: baseOrder + idx,
        isActive,
        textLayers,
      }))
      const created = await Banner.insertMany(docs)
      return res.status(201).json(created)
    } catch (e) {
      console.error(e)
      return res.status(500).json({ message: 'Không tạo được banner.' })
    }
  },
)

router.put(
  '/:id',
  authRequired,
  adminRequired,
  (req, res, next) => {
    if (isMultipartRequest(req)) {
      if (!isCloudinaryReady) {
        return res.status(500).json({
          message:
            'Cloudinary chưa được cấu hình. Cần CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.',
        })
      }
      return bannerUploadAny(req, res, next)
    }
    return next()
  },
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: 'ID banner không hợp lệ.' })
      }
      const banner = await Banner.findById(req.params.id)
      if (!banner) return res.status(404).json({ message: 'Không tìm thấy banner.' })

      if (req.file?.path) {
        banner.imageUrl = String(req.file.path).trim()
      } else if (
        req.body.imageUrl !== undefined ||
        req.body.googleDriveUrl !== undefined
      ) {
        const rawExternalUrl = String(
          req.body.googleDriveUrl ?? req.body.imageUrl ?? '',
        ).trim()
        const resolved = await resolveExternalImageUrl(rawExternalUrl, {
          uploadToCloudinary: isCloudinaryReady,
          folder: 'ThaiVu_Banners',
        })
        const imageUrl = resolved.url
        if (!imageUrl) {
          return res.status(400).json({ message: 'imageUrl không được để trống.' })
        }
        banner.imageUrl = imageUrl
      }
      if (req.body.linkTo !== undefined) {
        banner.linkTo = String(req.body.linkTo || '').trim()
      }
      if (req.body.order !== undefined) {
        const order = parseOrder(req.body.order, banner.order)
        if (order === null) {
          return res.status(400).json({ message: 'order không hợp lệ.' })
        }
        banner.order = order
      }
      if (req.body.isActive !== undefined) {
        banner.isActive = parseBoolean(req.body.isActive, banner.isActive)
      }
      if (
        req.body.textLayers !== undefined ||
        req.body.textH1 !== undefined ||
        req.body.textH2 !== undefined ||
        req.body.textH3 !== undefined ||
        req.body.textBody !== undefined ||
        req.body.textCta !== undefined ||
        req.body.h1 !== undefined ||
        req.body.h2 !== undefined ||
        req.body.h3 !== undefined ||
        req.body.bodyText !== undefined ||
        req.body.ctaText !== undefined
      ) {
        banner.textLayers = extractTextLayersFromBody(req.body)
      }

      await banner.save()
      return res.json(banner)
    } catch (e) {
      console.error(e)
      return res.status(500).json({ message: 'Không cập nhật được banner.' })
    }
  },
)

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID banner không hợp lệ.' })
    }
    const deleted = await Banner.findByIdAndDelete(req.params.id).lean()
    if (!deleted) return res.status(404).json({ message: 'Không tìm thấy banner.' })
    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không xóa được banner.' })
  }
})

module.exports = router
