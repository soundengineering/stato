import Fastify from 'fastify'
import autoload from '@fastify/autoload'
import cors from '@fastify/cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildServer() {
  const fastify = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: true,
        allErrors: true
      }
    }
  })

  // Register plugins
  fastify.register(cors)
  
  // Autoload all routes from the routes directory
  fastify.register(autoload, {
    dir: join(__dirname, 'routes'),
    dirNameRoutePrefix: true
  })

  return fastify
}

export async function startServer() {
  const fastify = buildServer()
  const port = process.env.PORT || 3000

  try {
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`Server listening on port ${port}`)
    return fastify
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
