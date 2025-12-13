// Auth middleware for admin authorization
// Supports Auth0 RBAC roles OR email allowlist (via ADMIN_EMAILS env var)

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
 * Check if user email is in the admin allowlist (for development)
 */
function isEmailAllowlisted(user) {
    const adminEmails = process.env.ADMIN_EMAILS;
    if (!adminEmails) return false;
    
    const allowlist = adminEmails.split(',').map(e => e.trim().toLowerCase());
    const userEmail = user?.email?.toLowerCase();
    return userEmail && allowlist.includes(userEmail);
}

/**
 * Determine if the current user is an admin
 * @param {object} user - The Auth0 user object from req.oidc.user
 * @returns {boolean}
 */
export function isAdmin(user) {
    if (!user) return false;
    return hasAdminRole(user) || isEmailAllowlisted(user);
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
 * Middleware: Requires the user to be an authenticated admin
 */
export function requireAdmin(req, res, next) {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

/**
 * Middleware for HTML pages: Redirects to login if not authenticated,
 * then shows 403 page if not admin
 */
export function requireAdminPage(req, res, next) {
    if (!req.oidc?.isAuthenticated()) {
        return res.redirect('/login');
    }
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Access Denied</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 4rem;">
                <h1>403 - Access Denied</h1>
                <p>You do not have admin privileges.</p>
                <a href="/">Return Home</a>
            </body>
            </html>
        `);
    }
    next();
}

export default {
    isAdmin,
    requireAuth,
    requireAdmin,
    requireAdminPage
};
