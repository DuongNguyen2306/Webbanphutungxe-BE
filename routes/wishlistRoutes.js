const express = require('express')
const mongoose = require('mongoose')
const { Product } = require('../models/Product')
const { Wishlist } = require('../models/Wishlist')
const { authRequired } = require('../middleware/auth')

const router = express.Router()

router.post('/toggle', authRequired, async (req, res) => {
  try {
    const { productId } = req.body || {}
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }

    const product = await Product.findById(productId).select('_id wishlistCount')
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    const removed = await Wishlist.findOneAndDelete({
      userId: req.userId,
      productId: product._id,
    })

    let isLiked = false

    if (removed) {
      await Product.updateOne(
        { _id: product._id, wishlistCount: { $gt: 0 } },
        { $inc: { wishlistCount: -1 } },
      )
      isLiked = false
    } else {
      try {
        await Wishlist.create({ userId: req.userId, productId: product._id })
        await Product.updateOne({ _id: product._id }, { $inc: { wishlistCount: 1 } })
        isLiked = true
      } catch (err) {
        if (err?.code === 11000) {
          isLiked = true
        } else {
          throw err
        }
      }
    }

    const updated = await Product.findById(product._id).select('wishlistCount').lean()
    res.json({
      wishlistCount: updated?.wishlistCount ?? 0,
      isLiked,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không thể cập nhật wishlist.' })
  }
})

router.get('/status/:productId', authRequired, async (req, res) => {
  try {
    const { productId } = req.params
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' })
    }

    const productExists = await Product.exists({ _id: productId })
    if (!productExists) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' })
    }

    const liked = await Wishlist.exists({
      userId: req.userId,
      productId,
    })

    res.json({ isLiked: Boolean(liked) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Không thể kiểm tra wishlist.' })
  }
})

module.exports = router
