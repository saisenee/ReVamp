import express from 'express';
import { PrismaClient } from '@prisma/client';
import { isAdmin } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET all orders (admin only)
router.get('/', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const orders = await prisma.order.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(orders);
    } catch (err) {
        console.error('GET /orders error:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// GET single order (admin only)
router.get('/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id }
        });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json(order);
    } catch (err) {
        console.error('GET /orders/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// UPDATE order status (admin only)
router.patch('/:id/status', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    try {
        const order = await prisma.order.update({
            where: { id: req.params.id },
            data: { status }
        });
        
        res.json(order);
    } catch (err) {
        console.error('PATCH /orders/:id/status error:', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// CREATE demo orders (for testing - remove in production)
router.post('/demo', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isAdmin(req.oidc.user)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const demoOrders = [
            {
                orderNumber: 'ORD-' + Date.now(),
                customerEmail: 'customer1@example.com',
                customerName: 'John Doe',
                items: [
                    { productId: '1', title: 'Vintage T-Shirt', quantity: 2, price: 19.99 }
                ],
                total: 39.98,
                status: 'pending',
                shippingAddress: {
                    street: '123 Main St',
                    city: 'Toronto',
                    province: 'ON',
                    postal: 'M5V 1A1',
                    country: 'Canada'
                }
            },
            {
                orderNumber: 'ORD-' + (Date.now() + 1),
                customerEmail: 'customer2@example.com',
                customerName: 'Jane Smith',
                items: [
                    { productId: '2', title: 'Retro Jacket', quantity: 1, price: 49.99 }
                ],
                total: 49.99,
                status: 'processing'
            }
        ];
        
        const created = await Promise.all(
            demoOrders.map(order => prisma.order.create({ data: order }))
        );
        
        res.json({ message: 'Demo orders created', orders: created });
    } catch (err) {
        console.error('POST /orders/demo error:', err);
        res.status(500).json({ error: 'Failed to create demo orders' });
    }
});

// CREATE new order (public - anyone can create)
router.post('/', async (req, res) => {
    try {
        const { customerEmail, customerName, items, total, status } = req.body;
        
        // Validate required fields
        if (!customerEmail || !items || items.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Get count of existing orders to generate order number
        const orderCount = await prisma.order.count();
        const orderNumber = `ORD-${String(orderCount + 1).padStart(5, '0')}`;
        
        // Create order
        const order = await prisma.order.create({
            data: {
                orderNumber,
                customerEmail,
                customerName: customerName || 'Guest',
                items: items,
                total: parseFloat(total) || 0,
                status: status || 'pending'
            }
        });
        
        res.json(order);
    } catch (err) {
        console.error('POST /orders error:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

export default router;
