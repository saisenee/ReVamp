// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express'
// Initialize Express app
const app = express()

// import path module to help with file paths
import path from 'path';

// Serve static files from the 'public' folder
app.use(express.static('public'))

// On Vercel, point the root url (/) to index.html explicitly
if (process.env.VERCEL) {
    app.get('/', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'index.html'))
    })
}

// Enable express to parse JSON data
app.use(express.json())

// Auth0 / OpenID Connect integration
import auth0 from 'express-openid-connect'
const { auth } = auth0

const auth0Config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: process.env.BASE_URL,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_BASE_URL
}

const missingAuth0 = ['secret', 'baseURL', 'clientID', 'issuerBaseURL'].filter(key => !auth0Config[key])
if (missingAuth0.length) {
    console.warn('Auth0 disabled. Missing env vars:', missingAuth0.join(', '))
    console.warn('Create a .env file with SECRET, BASE_URL, CLIENT_ID, ISSUER_BASE_URL to enable Auth0.')
} else {
    app.use(auth(auth0Config))
}

// Our API is defined in a separate module to keep things tidy.
// Let's import our API endpoints and activate them.
import apiRoutes from './routes/api.js'
app.use('/', apiRoutes)

// Import and mount upload routes
import uploadRoutes from './routes/upload.js'
app.use('/api', uploadRoutes)

// Import and mount product routes
import productRoutes from './routes/products.js'
app.use('/api/products', productRoutes)

const port = 3000
app.listen(port, () => {
    console.log(`Express is live at http://localhost:${port}`)
})
