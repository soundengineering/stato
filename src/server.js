import express from 'express'

const app = express()
const port = process.env.PORT || 3000

// Middleware to parse JSON bodies
app.use(express.json())

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Catch-all route
app.get('*', (req, res) => {
  res.json({
    message: 'Welcome to Stato API',
    documentation: 'Documentation coming soon',
    timestamp: new Date().toISOString()
  })
})

export function startServer () {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`)
      resolve(server)
    })
  })
}
