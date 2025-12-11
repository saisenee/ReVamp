// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { auth } from 'express-openid-connect';
import apiRouter from './routes/api.js';
import uploadRouter from './routes/upload.js';
import productsRouter from './routes/products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(path.join(__dirname, 'img')));

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

// Import and use API routes
app.use('/api', apiRouter);
app.use('/api', uploadRouter);
app.use('/api/products', productsRouter);

// Explicit route for root - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
