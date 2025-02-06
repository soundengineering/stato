import { PrismaClient } from '@prisma/client'
import { artistSchemas } from '../schemas/artists.js'

const prisma = new PrismaClient()

export default async function (fastify, opts) {
  fastify.get('/artists', {
    schema: {
      querystring: artistSchemas.query,
      response: artistSchemas.response
    },
    handler: async (request, reply) => {
      const page = request.query.page
      const limit = request.query.limit
      const offset = (page - 1) * limit

      const totalCount = await prisma.artists.count()

      const artists = await prisma.artists.findMany({
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              tracks: true,
              albums: true
            }
          }
        }
      })

      const formattedArtists = artists.map(artist => ({
        id: artist.id,
        name: artist.name,
        trackCount: artist._count.tracks,
        albumCount: artist._count.albums
      }))

      return {
        status: 'success',
        count: formattedArtists.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalRecords: totalCount,
          recordsPerPage: limit
        },
        data: formattedArtists
      }
    }
  })
} 