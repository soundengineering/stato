import express from 'express'
import routes from './routes/index.js'

const app = express()
const port = process.env.PORT || 3000

// Middleware to parse JSON bodies
app.use(express.json())

// Use routes
app.use(routes)

export function startServer () {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`)
      resolve(server)
    })
  })
}
