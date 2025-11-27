// Below we will use the Express Router to define a series of API endpoints.
// Express will listen for API requests and respond accordingly
import express from 'express'
const router = express.Router()

// Set this to match the model name in your Prisma schema
const model = 'cats'

// Prisma lets NodeJS communicate with MongoDB
// Let's import and initialize the Prisma client
// See also: https://www.prisma.io/docs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()


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


// Import del function from Vercel Blob for image cleanup
import { del } from '@vercel/blob'

// Connect to the database
prisma.$connect().then(() => {
    console.log('Prisma connected to MongoDB')
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err)
})

// ----- USER (GET) -----
// Publish user data and auth state to the frontend
router.get('/api/user', async (req, res) => {
    try {
        if (req.oidc?.isAuthenticated()) {
            const user = await ensureUser(req.oidc.user)
            res.send({
                ...req.oidc.user,
                id: user.id,
                isAuthenticated: true
            })
        } else {
            res.send({
                name: 'Guest',
                isAuthenticated: false
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
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    try {
        // Ensure we have a User record for this Auth0 user
        const user = await ensureUser(req.oidc.user)

        // Remove the id field from request body if it exists
        // MongoDB will auto-generate an ID for new records
        const { id, ownerId, owner, ...createData } = req.body

        const created = await prisma[model].create({
            data: {
                ...createData,
                ownerId: user.id
            }
        })
        res.status(201).send(created)
    } catch (err) {
        console.error('POST /data error:', err)
        res.status(500).send({ error: 'Failed to create record', details: err.message || err })
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
// Listen for PUT requests
// respond by updating a particular record in the database
// This is the 'U' of CRUD
// After updating the database we send the updated record back to the frontend.


router.put('/data/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    const { id, _id, ownerId, owner, ...requestBody } = req.body || {}

    try {
        // Fetch the existing record including owner relation
        const existing = await prisma[model].findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        })

        if (!existing) {
            return res.status(404).send({ error: 'Record not found' })
        }

        if (!existing.owner || existing.owner.sub !== req.oidc.user.sub) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const updated = await prisma[model].update({
            where: { id: req.params.id },
            data: requestBody
        })

        return res.send(updated)
    } catch (err) {
        console.error('PUT /data/:id error:', err)
        return res.status(500).send({ error: 'Failed to update record', details: err.message || err })
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
        // Get the cat record first (including owner) to check permissions and image URL
        const cat = await prisma[model].findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        })

        if (!cat) {
            return res.status(404).send({ error: 'Record not found' })
        }

        if (!cat.owner || cat.owner.sub !== req.oidc.user.sub) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        // Delete from database
        const result = await prisma[model].delete({
            where: { id: req.params.id }
        })

        // Delete associated image from Vercel Blob (if exists)
        if (cat.imageUrl) {
            try {
                await del(cat.imageUrl)
                console.log('Deleted image:', cat.imageUrl)
            } catch (blobError) {
                console.error('Failed to delete image:', blobError)
                // Don't fail the whole operation if image delete fails
            }
        }

        res.send(result)
    } catch (err) {
        console.error('DELETE /data/:id error:', err)
        res.status(500).send({ error: 'Failed to delete record', details: err.message || err })
    }
})


// ----- PRODUCT ENDPOINTS -----
// These endpoints support the ReVamp storefront functionality

// GET all products
router.get('/api/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: 'desc' },
            include: { owner: true }
        });
        res.json(products);
    } catch (err) {
        console.error('GET /api/products error:', err);
        res.status(500).json({ error: 'Failed to fetch products', details: err.message || err });
    }
});

// GET single product by ID
router.get('/api/products/:id', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        });
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json(product);
    } catch (err) {
        console.error('GET /api/products/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch product', details: err.message || err });
    }
});

// POST create product
router.post('/api/products', async (req, res) => {
    try {
        // Extract product data from request body
        const { title, description, price, currency, shipping, shippingType, status, categories, variations } = req.body;
        
        // Handle images if uploaded
        let images = [];
        if (req.files && Array.isArray(req.files)) {
            images = req.files.map(f => f.path || f.url);
        }
        
        // Parse variations if provided as string
        let parsedVariations = [];
        if (variations) {
            try {
                parsedVariations = typeof variations === 'string' ? JSON.parse(variations) : variations;
            } catch (e) {
                console.warn('Failed to parse variations:', e);
            }
        }
        
        // Get authenticated user if available
        let ownerId = null;
        if (req.oidc?.isAuthenticated()) {
            const user = await ensureUser(req.oidc.user);
            ownerId = user.id;
        }
        
        // Create product in database
        const product = await prisma.product.create({
            data: {
                title: title || 'Untitled Product',
                description: description || '',
                price: parseFloat(price) || 0,
                images: images,
                status: status || 'active',
                ownerId: ownerId
            }
        });
        
        res.status(201).json(product);
    } catch (err) {
        console.error('POST /api/products error:', err);
        res.status(500).json({ error: 'Failed to create product', details: err.message || err });
    }
});

// PUT update product
router.put('/api/products/:id', async (req, res) => {
    try {
        const { title, description, price, status, images } = req.body;
        
        // Check if product exists
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        });
        
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Check ownership if authenticated
        if (req.oidc?.isAuthenticated() && existing.owner && existing.owner.sub !== req.oidc.user.sub) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        // Update product
        const updated = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                title,
                description,
                price: parseFloat(price),
                status,
                images
            }
        });
        
        res.json(updated);
    } catch (err) {
        console.error('PUT /api/products/:id error:', err);
        res.status(500).json({ error: 'Failed to update product', details: err.message || err });
    }
});

// DELETE product
router.delete('/api/products/:id', async (req, res) => {
    try {
        // Check if product exists
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        });
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Check ownership if authenticated
        if (req.oidc?.isAuthenticated() && product.owner && product.owner.sub !== req.oidc.user.sub) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        // Delete images from Vercel Blob if they exist
        if (product.images && Array.isArray(product.images)) {
            for (const imageUrl of product.images) {
                try {
                    await del(imageUrl);
                    console.log('Deleted image:', imageUrl);
                } catch (blobError) {
                    console.error('Failed to delete image:', blobError);
                }
            }
        }
        
        // Delete product
        await prisma.product.delete({
            where: { id: req.params.id }
        });
        
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/products/:id error:', err);
        res.status(500).json({ error: 'Failed to delete product', details: err.message || err });
    }
});

// export the api routes for use elsewhere in our app 
// (e.g. in index.js )
export default router;

