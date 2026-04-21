const { cloudinary, isCloudinaryReady } = require('../configs/cloudinary.config')

function extractGoogleDriveFileId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  const host = url.hostname.toLowerCase()
  if (!host.includes('drive.google.com')) return ''

  const byQuery = url.searchParams.get('id')
  if (byQuery) return String(byQuery).trim()

  const match = url.pathname.match(/\/file\/d\/([^/]+)/i)
  if (match?.[1]) return String(match[1]).trim()

  return ''
}

function toGoogleDriveDirectUrl(input) {
  const fileId = extractGoogleDriveFileId(input)
  if (!fileId) return String(input || '').trim()
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

function isGoogleDriveUrl(input) {
  return Boolean(extractGoogleDriveFileId(input))
}

async function uploadRemoteImageToCloudinary(imageUrl, folder = 'ThaiVu_Products') {
  if (!isCloudinaryReady) {
    const err = new Error('Cloudinary chưa được cấu hình.')
    err.status = 500
    throw err
  }
  const safeUrl = String(imageUrl || '').trim()
  if (!safeUrl) {
    const err = new Error('URL ảnh không hợp lệ.')
    err.status = 400
    throw err
  }
  const out = await cloudinary.uploader.upload(safeUrl, {
    folder,
    resource_type: 'image',
  })
  return {
    secure_url: String(out?.secure_url || '').trim(),
    public_id: String(out?.public_id || '').trim(),
  }
}

/**
 * Chuẩn hóa URL ảnh ngoài; nếu là Google Drive sẽ đổi sang direct URL.
 * Có thể upload lên Cloudinary để trả về URL ổn định.
 */
async function resolveExternalImageUrl(input, options = {}) {
  const raw = String(input || '').trim()
  if (!raw) return { url: '', public_id: '' }
  const normalized = isGoogleDriveUrl(raw) ? toGoogleDriveDirectUrl(raw) : raw
  if (!options.uploadToCloudinary) {
    return { url: normalized, public_id: '' }
  }
  const uploaded = await uploadRemoteImageToCloudinary(
    normalized,
    options.folder || 'ThaiVu_Products',
  )
  return { url: uploaded.secure_url, public_id: uploaded.public_id }
}

module.exports = {
  isGoogleDriveUrl,
  toGoogleDriveDirectUrl,
  resolveExternalImageUrl,
}
