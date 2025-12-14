// Auth middleware for admin authorization
// Restricts admin access to @sheridancollege.ca email addresses

/**
 * Check if user has admin role via Auth0 RBAC
 * Requires Auth0 to be configured with roles and the "roles" claim in the ID token
 */
function hasAdminRole(user) {
    // Auth0 RBAC: roles are typically in a custom namespace claim
    // e.g., "https://myapp.com/roles" or just "roles" depending on Auth0 config
    const roles = user?.['https://revamp.app/roles'] 
                || user?.roles 
                || user?.['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
                || [];
    return Array.isArray(roles) && roles.includes('admin');
}

/**
 * Check if user email is from Sheridan College domain
 */
function isSheridanEmail(user) {
    const userEmail = user?.email?.toLowerCase();
    return userEmail && userEmail.endsWith('@sheridancollege.ca');
}

/**
 * Middleware to check if user is authenticated and is an admin
 */
export function isAdmin(user) {
    if (!user || !user.email) return false;
    
    const userEmail = user.email.toLowerCase();
    
    // Check if email ends with @sheridancollege.ca
    if (userEmail.endsWith('@sheridancollege.ca')) {
        return true;
    }
    
    // Also check specific admin emails from environment variable (as fallback)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    return adminEmails.includes(userEmail);
}

// Helper to check auth and admin status - DRY principle
function checkAuth(req) {
    if (!process.env.SECRET || !process.env.CLIENT_ID) {
        return { error: 'Authentication not configured', status: 503 };
    }
    
    if (!req.oidc?.isAuthenticated()) {
        return { error: 'Not authenticated', status: 401 };
    }
    
    if (!isAdmin(req.oidc.user)) {
        return { error: 'Unauthorized - Admin only', status: 403 };
    }
    
    return { ok: true };
}

/**
 * Middleware: Requires the user to be authenticated
 */
export function requireAuth(req, res, next) {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

/**
 * Middleware for HTML pages: Redirects to login if not authenticated,
 * then shows 403 page if not admin
 */
export function requireAdminPage(req, res, next) {
    // If Auth0 is not configured, deny access
    if (!process.env.SECRET || !process.env.CLIENT_ID) {
        return res.status(503).send('Authentication not configured');
    }
    
    // If not authenticated, redirect to login with return URL
    if (!req.oidc?.isAuthenticated()) {
        return res.oidc.login({
            returnTo: '/admin',
            authorizationParams: {
                redirect_uri: `${process.env.BASE_URL}/callback`
            }
        });
    }
    
    // Check if user is admin
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).send('Access denied - Admin only. Your email must end with @sheridancollege.ca');
    }
    
    next();
}

/**
 * Middleware for API: Requires the user to be an authenticated admin
 */
export function requireAdminAPI(req, res, next) {
    const check = checkAuth(req);
    
    if (check.error) {
        return res.status(check.status).json({ error: check.error });
    }
    
    next();
}

// Alias for backwards compatibility
export const requireAdmin = requireAdminAPI;

export default {
    isAdmin,
    requireAuth,
    requireAdmin,
    requireAdminPage
};