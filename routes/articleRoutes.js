const express = require('express')
const mongoose = require('mongoose')
const { Article } = require('../models/Article')
const { authRequired, adminRequired } = require('../middleware/auth')

const router = express.Router()
const ARTICLE_TYPES = new Set(['intro', 'guide'])

function normalizeType(input) {
  const t = String(input || '')
    .trim()
    .toLowerCase()
  return ARTICLE_TYPES.has(t) ? t : ''
}

function parsePayload(body) {
  return {
    title: String(body?.title || '').trim(),
    content: String(body?.content || '').trim(),
    type: normalizeType(body?.type),
    author: String(body?.author || '').trim(),
  }
}

router.get('/', async (req, res) => {
  try {
    const type = normalizeType(req.query.type)
    if (!type) {
      const list = await Article.find().sort({ createdAt: -1 }).lean()
      return res.json(list)
    }
    if (type === 'intro') {
      const intro = await Article.findOne({ type: 'intro' })
        .sort({ createdAt: -1 })
        .lean()
      return res.json(intro || null)
    }
    const guides = await Article.find({ type: 'guide' })
      .sort({ createdAt: -1 })
      .lean()
    return res.json(guides)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không tải được bài viết.' })
  }
})

router.post('/', authRequired, adminRequired, async (req, res) => {
  try {
    const payload = parsePayload(req.body)
    if (!payload.title || !payload.content || !payload.type) {
      return res.status(400).json({
        message: 'Thiếu title/content/type hoặc type không hợp lệ (intro|guide).',
      })
    }
    const created = await Article.create({
      ...payload,
      author: payload.author || String(req.userId || ''),
    })
    return res.status(201).json(created)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không tạo được bài viết.' })
  }
})

router.put('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID bài viết không hợp lệ.' })
    }
    const article = await Article.findById(req.params.id)
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết.' })

    if (req.body.title !== undefined) article.title = String(req.body.title || '').trim()
    if (req.body.content !== undefined)
      article.content = String(req.body.content || '').trim()
    if (req.body.type !== undefined) {
      const nextType = normalizeType(req.body.type)
      if (!nextType) {
        return res
          .status(400)
          .json({ message: 'type không hợp lệ. Chỉ nhận intro|guide.' })
      }
      article.type = nextType
    }
    if (req.body.author !== undefined) {
      article.author = String(req.body.author || '').trim()
    }

    if (!String(article.title || '').trim() || !String(article.content || '').trim()) {
      return res.status(400).json({ message: 'title và content không được để trống.' })
    }

    await article.save()
    return res.json(article)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không cập nhật được bài viết.' })
  }
})

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'ID bài viết không hợp lệ.' })
    }
    const deleted = await Article.findByIdAndDelete(req.params.id).lean()
    if (!deleted) return res.status(404).json({ message: 'Không tìm thấy bài viết.' })
    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Không xóa được bài viết.' })
  }
})

module.exports = router
