import express from 'express'
import { PrismaClient } from '@prisma/client'
import { del } from '@vercel/blob'

const router = express.Router()
const prisma = new PrismaClient()

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    res.json(products)
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    
    res.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// Create product
router.post('/', async (req, res) => {
  try {
    const { title, description, price, images, status } = req.body
    
    // Get user from Auth0 session if available
    const ownerId = req.oidc?.user?.sub
    
    const productData = {
      title,
      description,
      price: parseFloat(price),
      images: images || [],
      status: status || 'active'
    }
    
    // Only add ownerId if user is authenticated
    if (ownerId) {
      // Check if user exists, create if not
      let user = await prisma.user.findUnique({
        where: { id: ownerId }
      })
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: ownerId,
            email: req.oidc.user.email,
            name: req.oidc.user.name
          }
        })
      }
      
      productData.ownerId = ownerId
    }
    
    const product = await prisma.product.create({
      data: productData,
      include: {
        owner: ownerId ? {
          select: {
            id: true,
            email: true,
            name: true
          }
        } : false
      }
    })
    
    res.status(201).json(product)
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { title, description, price, images, status } = req.body
    
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        price: parseFloat(price),
        images,
        status
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })
    
    res.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    // Get product to access images
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    })
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }
    
    // Delete images from Vercel Blob
    if (product.images && product.images.length > 0) {
      for (const imageUrl of product.images) {
        try {
          await del(imageUrl)
        } catch (error) {
          console.error('Error deleting image:', error)
        }
      }
    }
    
    // Delete product
    await prisma.product.delete({
      where: { id: req.params.id }
    })
    
    res.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Error deleting product:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

export default router
