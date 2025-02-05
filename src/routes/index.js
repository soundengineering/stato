import { Router } from 'express'
import { getTracks } from './tracks.js'

const router = Router()

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Recent tracks endpoint
router.get('/tracks', getTracks)

// Catch-all route
router.get('*', (req, res) => {
  res.json({
    message: 'Welcome to Stato API',
    documentation: 'Documentation coming soon',
    timestamp: new Date().toISOString()
  })
})

export default router
