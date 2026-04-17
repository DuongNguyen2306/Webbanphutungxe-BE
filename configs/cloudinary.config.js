const { v2: cloudinary } = require('cloudinary')
const multer = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const isCloudinaryReady = Boolean(cloudName && apiKey && apiSecret)

if (isCloudinaryReady) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const ext = String(file?.mimetype || '').split('/')[1] || 'jpg'
    return {
      folder: 'ThaiVu_Products',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`,
    }
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
})

module.exports = {
  cloudinary,
  isCloudinaryReady,
  productUpload: upload.single('image'),
  bannerUploadSingle: upload.single('image'),
  bannerUploadMany: upload.array('images', 20),
  bannerUploadFlexible: upload.fields([
    { name: 'images', maxCount: 20 },
    { name: 'image', maxCount: 1 },
  ]),
  bannerUploadAny: upload.any(),
}
