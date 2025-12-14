// upload.js
// This file defines API endpoints for managing image uploads
// it includes image resizing and it stores files using Vercel Blob
// On Vercel, enable Blob storage for your project
// Vercel will generate a BLOB_READ_WRITE_TOKEN
// You will need to add this to your .env file in order to work locally.


// Express framework
import express from 'express'
// Upload processor: https://www.npmjs.com/package/busboy
import busboy from 'busboy'
// Image resizer: https://sharp.pixelplumbing.com/
import sharp from 'sharp'
// Vercel Blob: https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js
import { put, del } from '@vercel/blob'

// Auth0 OpenID Connect for authentication checks
import auth0 from 'express-openid-connect'
const { requiresAuth } = auth0

const router = express.Router()

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_WIDTH = 800
const MAX_HEIGHT = 800
const JPEG_QUALITY = 85
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

// POST /api/upload - Upload image to Vercel Blob
router.post('/upload', async (req, res) => {
    try {
        // Check if BLOB token is configured
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return res.status(503).json({ 
                error: 'Vercel Blob storage not configured. Please set BLOB_READ_WRITE_TOKEN environment variable.' 
            });
        }

        const uploadProcessor = busboy({ headers: req.headers })
        let fileBuffer = null
        let filename = null
        let mimeType = null

        uploadProcessor.on('file', async (name, file, info) => {
            const chunks = []
            filename = info.filename
            mimeType = info.mimeType
            
            file.on('data', (chunk) => chunks.push(chunk))
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks)
            })
        })

        uploadProcessor.on('finish', async () => {
            try {
                if (!fileBuffer || !filename) {
                    return res.status(400).json({ error: 'No file provided' })
                }

                // Process image with Sharp (skip SVGs)
                let processedBuffer = fileBuffer
                let contentType = mimeType

                if (!mimeType.includes('svg')) {
                    try {
                        processedBuffer = await sharp(fileBuffer)
                            .withMetadata() // Preserve EXIF metadata including orientation
                            .resize(MAX_WIDTH, MAX_HEIGHT, {
                                fit: 'inside',
                                withoutEnlargement: true
                            })
                            .jpeg({ quality: JPEG_QUALITY })
                            .toBuffer()

                        contentType = 'image/jpeg'
                    } catch (sharpError) {
                        console.error('Sharp processing error:', sharpError)
                        return res.status(500).json({
                            error: 'Failed to process image',
                            details: sharpError.message
                        })
                    }
                }

                // Upload to Vercel Blob
                try {
                    // Get file extension from original filename
                    const ext = filename.split('.').pop()

                    // https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js#put
                    const blob = await put(
                        `item-images/${Date.now()}.${ext}`,
                        processedBuffer,
                        {
                            access: 'public',
                            contentType: contentType,
                            addRandomSuffix: true,
                            cacheControlMaxAge: 31536000  // 1 year
                        }
                    )

                    // Return blob details
                    res.json({
                        url: blob.url,
                        pathname: blob.pathname,
                        contentType: blob.contentType,
                        size: processedBuffer.length
                    })
                } catch (blobError) {
                    console.error('Vercel Blob upload error:', blobError)
                    res.status(500).json({
                        error: 'Failed to upload to storage',
                        details: blobError.message
                    })
                }
            } catch (error) {
                console.error('Upload error:', error)
                res.status(500).json({
                    error: 'Upload failed',
                    details: error.message
                })
            }
        })

        req.pipe(uploadProcessor)
    } catch (err) {
        console.error('Upload route error:', err)
        res.status(500).json({ error: 'Upload failed', details: err.message })
    }
})

// DELETE /api/image - Delete image from Vercel Blob
router.delete('/image', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' })
    }
    try {
        const { url } = req.body

        if (!url) {
            return res.status(400).json({ error: 'Image URL is required' })
        }
        // https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js#del
        await del(url)
        res.json({ deleted: url })
    } catch (error) {
        console.error('Delete error:', error)
        res.status(500).json({
            error: 'Delete failed',
            details: error.message
        })
    }
})

export default router
