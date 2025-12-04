// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { auth } from 'express-openid-connect';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth0 middleware (only if configured)
if (process.env.SECRET && process.env.CLIENT_ID && process.env.ISSUER_BASE_URL) {
  const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: process.env.BASE_URL || `http://localhost:${port}`,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_BASE_URL
  };
  app.use(auth(config));
  console.log('Auth0 authentication enabled');
} else {
  console.log('Auth0 not configured - authentication disabled');
}

// Explicit route for root - redirect to public storefront
app.get('/', (req, res) => {
    res.redirect('/public.html');
});

// Mount API routes from routes/api.js
app.use(apiRouter);

// Serve static files from root directory and public folder
app.use(express.static('.'));
app.use(express.static('public'));

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
