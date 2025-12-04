// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('.'));

// On Vercel, point the root url (/) to index.html explicitly
if (process.env.VERCEL) {
    app.get('/', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'index.html'))
    })
}

// API Routes for Products
app.get('/api/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      currency = 'USD',
      shipping,
      shippingType = 'domestic',
      status = 'active',
      categories = [],
      variations
    } = req.body;

    // Parse variations if it's a string
    let parsedVariations = variations;
    if (typeof variations === 'string') {
      try {
        parsedVariations = JSON.parse(variations);
      } catch (e) {
        parsedVariations = null;
      }
    }

    const product = await prisma.product.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        currency,
        shipping: shipping ? parseFloat(shipping) : null,
        shippingType,
        status,
        images: [], // Will be updated separately if images are uploaded
        categories: Array.isArray(categories) ? categories : [],
        variations: parsedVariations
      }
    });

    res.json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      currency,
      shipping,
      shippingType,
      status,
      categories,
      variations
    } = req.body;

    // Parse variations if it's a string
    let parsedVariations = variations;
    if (typeof variations === 'string') {
      try {
        parsedVariations = JSON.parse(variations);
      } catch (e) {
        parsedVariations = null;
      }
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        price: price ? parseFloat(price) : undefined,
        currency,
        shipping: shipping ? parseFloat(shipping) : null,
        shippingType,
        status,
        categories: Array.isArray(categories) ? categories : undefined,
        variations: parsedVariations
      }
    });

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await prisma.product.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Basic upload endpoint (placeholder - you can integrate with Vercel Blob later)
app.post('/api/upload', (req, res) => {
  // For now, return a placeholder response
  // You can integrate with Vercel Blob or other storage later
  res.json({ 
    success: true, 
    message: 'Upload endpoint ready - integrate with your preferred storage solution',
    urls: []
  });
});

// Serve admin and public pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/public', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html'));
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(port, () => {
  console.log(`ReVamp server running at http://localhost:${port}`);
  console.log(`Admin panel: http://localhost:${port}/admin.html`);
  console.log(`Public store: http://localhost:${port}/public.html`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
