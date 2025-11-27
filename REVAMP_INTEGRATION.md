# ReVamp Storefront Integration

This document explains the ReVamp storefront integration that has been added to your existing codebase.

## What's New

The ReVamp storefront system has been integrated while preserving your existing MongoDB, Prisma, Vercel, and Auth0 setup. Here's what was added:

### New Files

1. **admin.html** - Admin dashboard for managing products
   - Product grid view with add/edit functionality
   - Single-page application (SPA) style product editor
   - Image upload with drag-and-drop
   - Product variations and pricing management

2. **public.html** - Customer-facing storefront
   - Product grid with search
   - Product detail pages
   - Shopping cart with localStorage persistence
   - Responsive design

3. **revamp-style.css** - Complete ReVamp styling
   - Modern, clean design system
   - Responsive layouts
   - Admin and public page styles
   - Cart modal and product detail styling

4. **revamp-script.js** - JavaScript functionality
   - Product CRUD operations
   - Cart management
   - Image upload handling
   - Navigation between admin and public views

5. **img/** directory - ReVamp brand assets
   - Logo files (SVG and PNG placeholders)
   - Placeholder images

### Modified Files

1. **routes/api.js** - Added product endpoints
   - `GET /api/products` - List all products
   - `GET /api/products/:id` - Get single product
   - `POST /api/products` - Create product
   - `PUT /api/products/:id` - Update product
   - `DELETE /api/products/:id` - Delete product

## How It Works

### Database Integration

The ReVamp system uses your existing Prisma setup with MongoDB. Products are stored using the `Product` model defined in your `prisma/schema.prisma`:

```prisma
model Product {
  id          String   @id @map("_id") @default(auto()) @db.ObjectId
  title       String
  description String?
  price       Float
  ownerId     String?  @db.ObjectId
  owner       User?    @relation(fields: [ownerId], references: [id])
  images      String[]
  status      String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### Authentication

- **Auth0 integration preserved**: The existing Auth0 setup continues to work
- **Product ownership**: Products can be linked to authenticated users via `ownerId`
- **Public access**: Products are publicly viewable on `public.html`
- **Admin access**: Currently open (you can add Auth0 protection to `admin.html`)

### Image Uploads

Images are handled through:
1. **Vercel Blob** - Your existing blob storage setup
2. **Upload routes** - Using your existing `/routes/upload.js`
3. **Drag-and-drop UI** - In the admin interface

### API Structure

The product APIs follow RESTful conventions:

```javascript
// Get all products
GET /api/products

// Get single product
GET /api/products/:id

// Create product (with optional Auth0 check)
POST /api/products
Body: { title, description, price, images, status }

// Update product
PUT /api/products/:id
Body: { title, description, price, images, status }

// Delete product
DELETE /api/products/:id
```

## Usage

### For Developers

1. **Start the development server:**
   ```bash
   npm start
   ```

2. **Access the interfaces:**
   - Admin: `http://localhost:3000/admin.html`
   - Public: `http://localhost:3000/public.html`
   - Original app: `http://localhost:3000/` (unchanged)

3. **Add products:**
   - Open admin.html
   - Click "+ Add Product"
   - Fill in product details
   - Upload images
   - Save

4. **View storefront:**
   - Open public.html
   - Browse products
   - View product details
   - Add to cart

### For Production (Vercel)

The integration works seamlessly with your existing Vercel deployment:

1. **Environment Variables** (already configured):
   - `DATABASE_URL` - MongoDB connection
   - `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage
   - Auth0 variables (if using authentication)

2. **Deploy:**
   ```bash
   git push
   ```
   Vercel will automatically deploy the updates.

3. **Access:**
   - `https://your-domain.vercel.app/admin.html`
   - `https://your-domain.vercel.app/public.html`

## Customization

### Branding

Replace placeholder images in `/img/`:
- `revamp.png` - Main logo (used in admin sidebar)
- `revamplogo.png` - Favicon
- `revamp.svg` - SVG logo version

### Styling

Edit `revamp-style.css` to customize:
- Colors (see `:root` CSS variables)
- Fonts
- Layout spacing
- Component styling

### Business Name

Update in `public.html`:
```html
<h1 class="marketplace-title">[YOUR BUSINESS]'S MARKETPLACE</h1>
```

### Adding Auth Protection

To protect the admin interface, add Auth0 middleware in `server.js`:

```javascript
app.get('/admin.html', requiresAuth(), (req, res) => {
    res.sendFile(path.join(process.cwd(), 'admin.html'))
})
```

## Features

### Admin Dashboard
- ✅ Product grid view
- ✅ Add/edit products
- ✅ Image upload (drag-and-drop)
- ✅ Product variations (size, color, etc.)
- ✅ Price and currency selection
- ✅ Shipping options
- ✅ Product status (active, hidden, sold out, preorder)
- ✅ Quick edit mode
- ✅ Search functionality

### Public Storefront
- ✅ Product grid with images
- ✅ Product detail pages
- ✅ Shopping cart (localStorage)
- ✅ Add to cart functionality
- ✅ Quantity management
- ✅ Cart modal
- ✅ Responsive design
- ✅ Search functionality

### Technical Features
- ✅ MongoDB + Prisma integration
- ✅ Vercel Blob storage for images
- ✅ RESTful API
- ✅ Auth0 compatible
- ✅ SPA-style navigation
- ✅ Error handling
- ✅ Responsive design

## File Structure

```
/
├── admin.html              # Admin dashboard
├── public.html             # Public storefront
├── revamp-style.css        # ReVamp styling
├── revamp-script.js        # ReVamp JavaScript
├── img/                    # Brand assets
│   ├── revamp.svg
│   ├── revamp.png
│   ├── revamplogo.png
│   └── placeholder.png
├── routes/
│   ├── api.js             # API endpoints (updated)
│   └── upload.js          # Image upload (existing)
├── prisma/
│   └── schema.prisma      # Database schema (existing)
├── server.js              # Express server (existing)
└── public/                # Original app (unchanged)
    ├── index.html
    ├── style.css
    └── script.js
```

## Next Steps

1. **Replace placeholder images** in `/img/` with your actual brand assets
2. **Customize colors and fonts** in `revamp-style.css`
3. **Update business name** in `public.html`
4. **Add Auth0 protection** to admin.html (optional)
5. **Test product creation** and image uploads
6. **Deploy to Vercel** when ready

## Troubleshooting

### Products not showing
- Check MongoDB connection in `.env`
- Verify Prisma schema is generated: `npm run prisma:generate`
- Check browser console for API errors

### Images not uploading
- Verify `BLOB_READ_WRITE_TOKEN` in environment variables
- Check file size limits (10MB default)
- Ensure accepted file types: jpg, png, webp, svg

### Cart not persisting
- Check browser localStorage is enabled
- Cart data is stored locally (not in database)

## Support

For issues or questions:
1. Check browser console for errors
2. Review server logs
3. Verify environment variables
4. Check Prisma connection: `npm run check`

## Compatibility

The ReVamp integration:
- ✅ Preserves existing Auth0 setup
- ✅ Works with existing Prisma/MongoDB
- ✅ Compatible with Vercel deployment
- ✅ Doesn't interfere with original app in `/public/`
- ✅ Uses existing image upload system

Your original application at `/public/index.html` remains completely unchanged and functional.
