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

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

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
    clientSecret: process.env.CLIENT_SECRET,
    issuerBaseURL: process.env.ISSUER_BASE_URL,
    authorizationParams: {
      response_type: 'code',
      scope: 'openid profile email'
    },
    session: {
      cookie: {
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    routes: {
      login: false,  // We'll handle this manually
      logout: '/logout',
      callback: '/callback'
    }
  };
  app.use(auth(config));
  
  // Custom login route that preserves returnTo
  app.get('/login', (req, res) => {
    const returnTo = req.query.returnTo || '/';
    res.oidc.login({
      returnTo: returnTo,
      authorizationParams: {
        redirect_uri: `${process.env.BASE_URL}/callback`
      }
    });
  });
  
  console.log('Auth0 authentication enabled');
} else {
  console.log('Auth0 not configured - authentication disabled');
  
  // Provide fallback routes when Auth0 is not configured
  app.get('/login', (req, res) => {
    res.status(503).send('Authentication not configured. Please set up Auth0 environment variables.');
  });
  
  app.get('/logout', (req, res) => {
    res.redirect('/');
  });
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

// Error handling for Auth0 callback errors
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Handle Auth0 authorization errors (user declined)
  if (err.message && err.message.includes('access_denied')) {
    return res.redirect('/?error=access_denied&message=Authorization declined');
  }
  
  // Handle other Auth0 errors
  if (err.name === 'IdentityProviderError') {
    return res.redirect('/?error=auth_failed&message=' + encodeURIComponent(err.message));
  }
  
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
