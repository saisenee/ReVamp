// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { auth } from 'express-openid-connect';
import apiRouter from './routes/api.js';
import uploadRouter from './routes/upload.js';
import productsRouter from './routes/products.js';
import { isAdmin, requireAdminPage } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' folder with absolute path
app.use(express.static(path.join(__dirname, 'public')));

// Auth0 middleware (only if configured)
if (process.env.SECRET && process.env.CLIENT_ID && process.env.ISSUER_BASE_URL) {
  const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: process.env.BASE_URL || `http://localhost:${port}`,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_BASE_URL,
    // Fix for Vercel serverless - use code flow instead of form_post
    authorizationParams: {
      response_type: 'code',
      scope: 'openid profile email'
    },
    // Session cookie settings for production
    session: {
      cookie: {
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  };
  app.use(auth(config));
  console.log('Auth0 authentication enabled');
} else {
  console.log('Auth0 not configured - authentication disabled');
}

// Explicit route for root - serve landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin page - requires admin authorization
app.get('/admin', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Also protect admin.html direct access
app.get('/admin.html', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Mount API routes (pass isAdmin helper)
app.use((req, res, next) => {
    // Attach isAdmin helper to request for use in routes
    req.isAdmin = req.oidc?.isAuthenticated() ? isAdmin(req.oidc.user) : false;
    next();
});

// Import and use API routes
app.use('/api', apiRouter);
app.use('/api', uploadRouter);
app.use('/api/products', productsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server (only for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`ReVamp server running at http://localhost:${port}`);
    console.log(`Admin panel: http://localhost:${port}/admin`);
    console.log(`Public store: http://localhost:${port}/public.html`);
  });
}

// Export for Vercel serverless
export default app;
