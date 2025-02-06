import { PrismaClient } from '@prisma/client'
import { albumSchemas } from '../schemas/albums.js'

const prisma = new PrismaClient()

export default async function (fastify, opts) {
  fastify.get('/albums', {
    schema: {
      querystring: albumSchemas.query,
      response: albumSchemas.response
    },
    handler: async (request, reply) => {
      const page = request.query.page
      const limit = request.query.limit
      const offset = (page - 1) * limit

      const totalCount = await prisma.albums.count()

      const albums = await prisma.albums.findMany({
        take: limit,
        skip: offset,
        include: {
          album: true,
          artists: {
            include: {
              artist: true
            }
          },
          _count: {
            select: {
              plays: true
            }
          },
          plays: {
            select: {
              score: true,
              playedAt: true,
              channelId: true
            }
          }
        },
        orderBy: {
          plays: {
            _count: "desc"
          }
        }
      })

      const formattedAlbums = albums.map(album => ({
        id: album.id,
        name: album.name,
        imageUrl: album.imageUrl,
        artist: album.artist.name,
        trackCount: album._count.tracks
      }))

      return {
        status: 'success',
        count: formattedAlbums.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalRecords: totalCount,
          recordsPerPage: limit
        },
        data: formattedAlbums
      }
    }
  })
} 