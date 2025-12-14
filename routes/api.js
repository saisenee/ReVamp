// Below we will use the Express Router to define a series of API endpoints.
// Express will listen for API requests and respond accordingly
import express from 'express'
const router = express.Router()

// Set this to match the model name in your Prisma schema (lowercase first letter)
const model = 'product'

// Prisma lets NodeJS communicate with MongoDB
// Let's import and initialize the Prisma client
// See also: https://www.prisma.io/docs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Import admin middleware
import { isAdmin, requireAdmin } from '../middleware/auth.js'

// In-memory business settings (can be moved to DB later)
let businessSettings = {
    title: "YOUR BUSINESS",
    description: "Welcome to our store"
};


// User lifecycle helper
async function ensureUser(oidcUser) {
    if (!oidcUser || !oidcUser.sub) {
        throw new Error('Cannot ensure user without a valid Auth0 sub')
    }
    const { sub, email, name, picture } = oidcUser
    // an upsert will perform either an update or a create
    // - update the user if they already exist, or 
    // - create a new user record if they do not exist yet
    const user = await prisma.user.upsert({
        where: { sub },
        update: {
            email: email || null,
            name: name || null,
            picture: picture || null
        },
        create: {
            sub,
            email: email || null,
            name: name || null,
            picture: picture || null
        }
    })
    return user
}


// Import del and put functions from Vercel Blob for image management
import { del, put } from '@vercel/blob'
import busboy from 'busboy'

// Connect to the database
prisma.$connect().then(() => {
    console.log('Prisma connected to MongoDB')
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err)
})

// ----- USER (GET) -----
// Publish user data and auth state to the frontend
router.get('/user', async (req, res) => {
    try {
        if (req.oidc?.isAuthenticated()) {
            const user = await ensureUser(req.oidc.user)
            const userIsAdmin = isAdmin(req.oidc.user)
            res.send({
                ...req.oidc.user,
                id: user.id,
                isAuthenticated: true,
                isAdmin: userIsAdmin
            })
        } else {
            res.send({
                name: 'Guest',
                isAuthenticated: false,
                isAdmin: false
            })
        }
    } catch (err) {
        console.error('GET /api/user error:', err)
        res.status(500).send({ error: 'Failed to fetch user', details: err.message || err })
    }
})


// ----- CREATE (POST) -----
// Create a new record for the configured model
// This is the 'C' of CRUD
router.post('/data', async (req, res) => {
    try {
        // Check if this is multipart/form-data (with files)
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('multipart/form-data')) {
            // Handle FormData with file uploads
            const bb = busboy({ headers: req.headers });
            const fields = {};
            const imageBuffers = [];
            
            bb.on('file', (fieldname, file, info) => {
                const chunks = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    imageBuffers.push({
                        buffer: Buffer.concat(chunks),
                        filename: info.filename,
                        mimeType: info.mimeType
                    });
                });
            });
            
            bb.on('field', (name, value) => {
                if (name.endsWith('[]')) {
                    const key = name.slice(0, -2);
                    if (!fields[key]) fields[key] = [];
                    fields[key].push(value);
                } else {
                    fields[name] = value;
                }
            });
            
            bb.on('finish', async () => {
                try {
                    // Upload images to Vercel Blob if BLOB_READ_WRITE_TOKEN is configured
                    const imageUrls = [];
                    if (process.env.BLOB_READ_WRITE_TOKEN && imageBuffers.length > 0) {
                        for (const img of imageBuffers) {
                            const blob = await put(img.filename, img.buffer, {
                                access: 'public',
                                contentType: img.mimeType
                            });
                            imageUrls.push(blob.url);
                        }
                    }
                    
                    // Parse variations if it's a string
                    let variations = fields.variations;
                    if (typeof variations === 'string') {
                        try {
                            variations = JSON.parse(variations);
                        } catch (e) {
                            variations = null;
                        }
                    }
                    
                    // Build the data object
                    const createData = {
                        title: fields.title,
                        description: fields.description || '',
                        price: parseFloat(fields.price) || 0,
                        currency: fields.currency || 'USD',
                        shipping: fields.shipping ? parseFloat(fields.shipping) : null,
                        shippingType: fields.shippingType || 'domestic',
                        status: fields.status || 'active',
                        images: imageUrls,
                        categories: fields.categories || [],
                        variations: variations
                    };
                    
                    // If authenticated, link to user
                    if (req.oidc?.isAuthenticated()) {
                        const user = await ensureUser(req.oidc.user);
                        createData.ownerId = user.id;
                    }
                    
                    const created = await prisma[model].create({ data: createData });
                    res.status(201).send(created);
                } catch (err) {
                    console.error('POST /data (FormData) error:', err);
                    res.status(500).send({ error: 'Failed to create record', details: err.message || err });
                }
            });
            
            req.pipe(bb);
        } else {
            // Handle regular JSON request
            const { id, ownerId, owner, ...createData } = req.body;
            
            // If authenticated, link to user
            if (req.oidc?.isAuthenticated()) {
                const user = await ensureUser(req.oidc.user);
                createData.ownerId = user.id;
            }
            
            const created = await prisma[model].create({ data: createData });
            res.status(201).send(created);
        }
    } catch (err) {
        console.error('POST /data error:', err);
        res.status(500).send({ error: 'Failed to create record', details: err.message || err });
    }
})


// ----- READ (GET) list ----- 
router.get('/data', async (req, res) => {
    try {
        // Frontend is responsible for filtering owned vs all.
        const result = await prisma[model].findMany({
            take: 100,
            include: { owner: true }
        })
        res.send(result)
    } catch (err) {
        console.error('GET /data error:', err)
        res.status(500).send({ error: 'Failed to fetch records', details: err.message || err })
    }
})



// ----- findMany() with search ------- 
// Accepts optional search parameter to filter by name field
// See also: https://www.prisma.io/docs/orm/reference/prisma-client-reference#examples-7
router.get('/search', async (req, res) => {
    try {
        // get search terms from query string, default to empty string
        const searchTerms = req.query.terms || ''
        // fetch the records from the database
        const result = await prisma[model].findMany({
            where: {
                name: {
                    contains: searchTerms,
                    mode: 'insensitive'  // case-insensitive search
                }
            },
            include: { owner: true },
            orderBy: { name: 'asc' },
            take: 10
        })
        res.send(result)
    } catch (err) {
        console.error('GET /search error:', err)
        res.status(500).send({ error: 'Search failed', details: err.message || err })
    }
})


// ----- UPDATE (PUT) -----
router.put('/data/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    try {
        // Check if this is multipart/form-data (with files)
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('multipart/form-data')) {
            // Handle FormData with file uploads
            const bb = busboy({ headers: req.headers });
            const fields = {};
            const imageBuffers = [];
            
            bb.on('file', (fieldname, file, info) => {
                const chunks = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    imageBuffers.push({
                        buffer: Buffer.concat(chunks),
                        filename: info.filename,
                        mimeType: info.mimeType
                    });
                });
            });
            
            bb.on('field', (name, value) => {
                if (name.endsWith('[]')) {
                    const key = name.slice(0, -2);
                    if (!fields[key]) fields[key] = [];
                    fields[key].push(value);
                } else {
                    fields[name] = value;
                }
            });
            
            bb.on('finish', async () => {
                try {
                    // Get existing product
                    const existing = await prisma[model].findUnique({
                        where: { id: req.params.id },
                        include: { owner: true }
                    });

                    if (!existing) {
                        return res.status(404).send({ error: 'Record not found' });
                    }

                    // Check ownership
                    if (!existing.owner || existing.owner.sub !== req.oidc.user.sub) {
                        return res.status(403).send({ error: 'Forbidden' });
                    }

                    // Upload new images to Vercel Blob if provided
                    let imageUrls = existing.images || [];
                    if (process.env.BLOB_READ_WRITE_TOKEN && imageBuffers.length > 0) {
                        const newUrls = [];
                        for (const img of imageBuffers) {
                            const blob = await put(img.filename, img.buffer, {
                                access: 'public',
                                contentType: img.mimeType
                            });
                            newUrls.push(blob.url);
                        }
                        imageUrls = [...imageUrls, ...newUrls];
                    }
                    
                    // Parse variations if it's a string
                    let variations = fields.variations;
                    if (typeof variations === 'string') {
                        try {
                            variations = JSON.parse(variations);
                        } catch (e) {
                            variations = existing.variations;
                        }
                    }
                    
                    // Build update data
                    const updateData = {
                        title: fields.title || existing.title,
                        description: fields.description || existing.description,
                        price: fields.price ? parseFloat(fields.price) : existing.price,
                        currency: fields.currency || existing.currency,
                        shipping: fields.shipping ? parseFloat(fields.shipping) : existing.shipping,
                        shippingType: fields.shippingType || existing.shippingType,
                        status: fields.status || existing.status,
                        images: imageUrls,
                        categories: fields.categories || existing.categories,
                        variations: variations || existing.variations
                    };
                    
                    const updated = await prisma[model].update({
                        where: { id: req.params.id },
                        data: updateData
                    });
                    
                    res.send(updated);
                } catch (err) {
                    console.error('PUT /data/:id (FormData) error:', err);
                    res.status(500).send({ error: 'Failed to update record', details: err.message || err });
                }
            });
            
            req.pipe(bb);
        } else {
            // Handle regular JSON request
            const { id, _id, ownerId, owner, ...requestBody } = req.body || {};

            // Fetch the existing record including owner relation
            const existing = await prisma[model].findUnique({
                where: { id: req.params.id },
                include: { owner: true }
            });

            if (!existing) {
                return res.status(404).send({ error: 'Record not found' });
            }

            if (!existing.owner || existing.owner.sub !== req.oidc.user.sub) {
                return res.status(403).send({ error: 'Forbidden' });
            }

            const updated = await prisma[model].update({
                where: { id: req.params.id },
                data: requestBody
            });

            return res.send(updated);
        }
    } catch (err) {
        console.error('PUT /data/:id error:', err);
        return res.status(500).send({ error: 'Failed to update record', details: err.message || err });
    }
})

// ----- DELETE -----
// Listen for DELETE requests
// respond by deleting a particular record in the database
// This is the 'D' of CRUD
router.delete('/data/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    try {
        // Get the product record first (including owner) to check permissions and image URL
        const product = await prisma[model].findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        })

        if (!product) {
            return res.status(404).send({ error: 'Record not found' })
        }

        // Allow if user is owner OR if user is admin
        const userIsAdmin = isAdmin(req.oidc.user);
        const userIsOwner = product.owner && product.owner.sub === req.oidc.user.sub;
        
        if (!userIsOwner && !userIsAdmin) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        // Delete from database
        const result = await prisma[model].delete({
            where: { id: req.params.id }
        })

        // Delete associated images from Vercel Blob (if exists)
        if (product.images && product.images.length > 0) {
            for (const imageUrl of product.images) {
                try {
                    await del(imageUrl)
                    console.log('Deleted image:', imageUrl)
                } catch (blobError) {
                    console.error('Failed to delete image:', blobError)
                    // Don't fail the whole operation if image delete fails
                }
            }
        }

        res.send(result)
    } catch (err) {
        console.error('DELETE /data/:id error:', err)
        res.status(500).send({ error: 'Failed to delete record', details: err.message || err })
    }
})

// ----- BUSINESS SETTINGS -----
// GET /business - Public endpoint to get business info
router.get('/business', (req, res) => {
    res.json(businessSettings)
})

// PUT /business - Admin-only endpoint to update business info
router.put('/business', requireAdmin, (req, res) => {
    try {
        const { title, description } = req.body
        if (title !== undefined) businessSettings.title = title
        if (description !== undefined) businessSettings.description = description
        res.json(businessSettings)
    } catch (err) {
        console.error('PUT /api/business error:', err)
        res.status(500).json({ error: 'Failed to update business settings' })
    }
})

// ----- BUSINESS SETTINGS ENDPOINTS -----

// GET business info (public - anyone can read)
router.get('/business', async (req, res) => {
    try {
        const business = await prisma.business.findFirst();
        if (!business) {
            // Create default business if none exists
            const newBusiness = await prisma.business.create({
                data: {
                    id: 'default',
                    title: 'My Business',
                    description: ''
                }
            });
            return res.json(newBusiness);
        }
        res.json(business);
    } catch (err) {
        console.error('Error fetching business:', err);
        res.status(500).json({ error: 'Failed to fetch business settings' });
    }
});

// UPDATE business info (admin only)
router.put('/business', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { title, description } = req.body;
        
        // Find or create the business record
        let business = await prisma.business.findFirst();
        
        if (!business) {
            // Create if doesn't exist
            business = await prisma.business.create({
                data: {
                    id: 'default',
                    title: title || 'My Business',
                    description: description || ''
                }
            });
        } else {
            // Update existing
            business = await prisma.business.update({
                where: { id: business.id },
                data: {
                    title: title || business.title,
                    description: description !== undefined ? description : business.description
                }
            });
        }
        
        res.json(business);
    } catch (err) {
        console.error('Error updating business:', err);
        res.status(500).json({ error: 'Failed to update business settings' });
    }
});

// ----- ADMIN PRODUCT ROUTES -----
// These routes require admin authorization and allow editing of any product

// PUT /admin/products/:id - Admin can edit any product
router.put('/admin/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id, _id, ownerId, owner, ...updateData } = req.body || {}
        
        const existing = await prisma[model].findUnique({
            where: { id: req.params.id }
        })
        
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' })
        }
        
        const updated = await prisma[model].update({
            where: { id: req.params.id },
            data: updateData
        })
        
        res.json(updated)
    } catch (err) {
        console.error('PUT /api/admin/products/:id error:', err)
        res.status(500).json({ error: 'Failed to update product', details: err.message })
    }
})

// DELETE /admin/products/:id - Admin can delete any product
router.delete('/admin/products/:id', requireAdmin, async (req, res) => {
    try {
        const product = await prisma[model].findUnique({
            where: { id: req.params.id }
        })
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' })
        }
        
        // Delete from database
        const result = await prisma[model].delete({
            where: { id: req.params.id }
        })
        
        // Delete associated images from Vercel Blob
        if (product.images && product.images.length > 0) {
            for (const imageUrl of product.images) {
                try {
                    await del(imageUrl)
                } catch (blobError) {
                    console.error('Failed to delete image:', blobError)
                }
            }
        }
        
        res.json(result)
    } catch (err) {
        console.error('DELETE /api/admin/products/:id error:', err)
        res.status(500).json({ error: 'Failed to delete product', details: err.message })
    }
})

// Debug endpoint to see user info
router.get('/debug-user', (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.json({ authenticated: false });
    }
    
    const user = req.oidc.user;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    
    res.json({
        authenticated: true,
        email: user.email,
        name: user.name,
        adminEmails: adminEmails,
        isAdmin: adminEmails.includes(user.email?.toLowerCase())
    });
});

// Business settings endpoints
router.get('/business', async (req, res) => {
    try {
        const business = await prisma.business.findFirst();
        if (!business) {
            // Create default business if none exists
            const newBusiness = await prisma.business.create({
                data: {
                    id: 'default',
                    title: 'My Business',
                    description: ''
                }
            });
            return res.json(newBusiness);
        }
        res.json(business);
    } catch (err) {
        console.error('Error fetching business:', err);
        res.status(500).json({ error: 'Failed to fetch business settings' });
    }
});

router.put('/business', async (req, res) => {
    // Only admins can update business settings
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { title, description } = req.body;
        
        // Find or create the business record
        let business = await prisma.business.findFirst();
        
        if (!business) {
            // Create if doesn't exist
            business = await prisma.business.create({
                data: {
                    id: 'default',
                    title: title || 'My Business',
                    description: description || ''
                }
            });
        } else {
            // Update existing
            business = await prisma.business.update({
                where: { id: business.id },
                data: {
                    title: title || business.title,
                    description: description !== undefined ? description : business.description
                }
            });
        }
        
        res.json(business);
    } catch (err) {
        console.error('Error updating business:', err);
        res.status(500).json({ error: 'Failed to update business settings' });
    }
});

// ----- COLLECTIONS -----

// Collection endpoints
router.get('/collections', async (req, res) => {
    try {
        const collections = await prisma.collection.findMany({
            orderBy: { order: 'asc' }
        });
        res.json(collections);
    } catch (err) {
        console.error('Error fetching collections:', err);
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});

router.post('/collections', async (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { name, description, productIds } = req.body;
        
        // Get max order value
        const maxOrder = await prisma.collection.aggregate({
            _max: { order: true }
        });
        
        const collection = await prisma.collection.create({
            data: {
                name: name || 'New Collection',
                description: description || '',
                order: (maxOrder._max.order || 0) + 1,
                productIds: productIds || []
            }
        });
        
        res.json(collection);
    } catch (err) {
        console.error('Error creating collection:', err);
        res.status(500).json({ error: 'Failed to create collection' });
    }
});

router.put('/collections/:id', async (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { name, description, productIds, order } = req.body;
        const updateData = {};
        
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (productIds !== undefined) updateData.productIds = productIds;
        if (order !== undefined) updateData.order = order;
        
        const collection = await prisma.collection.update({
            where: { id: req.params.id },
            data: updateData
        });
        
        res.json(collection);
    } catch (err) {
        console.error('Error updating collection:', err);
        res.status(500).json({ error: 'Failed to update collection' });
    }
});

router.delete('/collections/:id', async (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        await prisma.collection.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting collection:', err);
        res.status(500).json({ error: 'Failed to delete collection' });
    }
});

// Reorder collections
router.post('/collections/reorder', async (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { collectionOrders } = req.body; // Array of {id, order}
        
        await Promise.all(
            collectionOrders.map(({ id, order }) =>
                prisma.collection.update({
                    where: { id },
                    data: { order }
                })
            )
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error reordering collections:', err);
        res.status(500).json({ error: 'Failed to reorder collections' });
    }
});

export default router

