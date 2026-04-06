require('dotenv').config()
const mongoose = require('mongoose')
const { connectDb } = require('./lib/db')
const { Product } = require('./models/Product')
const { resolveCategory } = require('./lib/categories')

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Thiếu MONGODB_URI')
  process.exit(1)
}

async function run() {
  await connectDb(uri)

  const existing = await Product.countDocuments()
  if (existing === 0) {
    const catVespa = await resolveCategory('Vespa')
    const catHonda = await resolveCategory('Honda')
    await Product.create({
      name: 'Gương gù CRG — Winner / Sonic',
      category: catHonda,
      images: [
        'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&h=600&fit=crop',
      ],
      brand: 'honda',
      vehicleType: 'underbone',
      partCategory: 'accessories',
      homeFeature: null,
      rating: 4.7,
      reviewCount: 120,
      soldCount: 500,
      variants: [
        {
          typeName: 'Kiểu U',
          color: 'Đen carbon',
          size: '',
          price: 320000,
          originalPrice: 450000,
          isAvailable: true,
          images: [
            'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&h=600&fit=crop',
            'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&h=600&fit=crop',
          ],
        },
        {
          typeName: 'Kiểu Gài',
          color: 'Titan',
          size: '',
          price: 340000,
          originalPrice: 470000,
          isAvailable: false,
          images: [
            'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=600&h=600&fit=crop',
          ],
        },
      ],
    })
    await Product.create({
      name: 'Đội đèn bi cầu Vespa Sprint',
      category: catVespa,
      images: [
        'https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=600&h=600&fit=crop',
      ],
      brand: 'vespa',
      vehicleType: 'scooter',
      partCategory: 'lighting',
      homeFeature: null,
      rating: 4.9,
      reviewCount: 80,
      soldCount: 200,
      variants: [
        {
          typeName: 'LED trắng',
          color: '',
          size: '',
          price: 2790000,
          originalPrice: 3200000,
          isAvailable: true,
          images: [
            'https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=600&h=600&fit=crop',
            'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop',
          ],
        },
      ],
    })
    console.log('Đã seed sản phẩm mẫu.')
  } else {
    console.log('Đã có sản phẩm, bỏ qua seed SP.')
  }

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
