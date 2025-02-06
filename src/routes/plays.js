import { PrismaClient } from '@prisma/client'
import { playSchemas } from '../schemas/plays.js'

const prisma = new PrismaClient()

export default async function (fastify, opts) {
  fastify.get('/plays', {
    schema: {
      querystring: playSchemas.query,
      response: playSchemas.response
    },
    handler: async (request, reply) => {
      const page = request.query.page
      const limit = request.query.limit
      const offset = (page - 1) * limit

      const totalCount = await prisma.plays.count()

      const recentPlays = await prisma.plays.findMany({
        take: limit,
        skip: offset,
        orderBy: {
          playedAt: 'desc'
        },
        include: {
          track: {
            include: {
              album: true,
              artists: {
                include: {
                  artist: true
                }
              }
            }
          }
        }
      })

      const formattedPlays = recentPlays.map(play => ({
        id: play.id,
        playedAt: play.playedAt,
        playedBy: {
          userId: play.userId,
          channelId: play.channelId,
        },
        listeners: play.listeners,
        track: {
          ISRC: play.track.ISRC,
          title: play.track.title,
          artists: play.track.artists.map(ta => ta.artist.name),
          album: play.track.album
            ? {
                name: play.track.album.name,
                imageUrl: play.track.album.imageUrl
              }
            : null
        },
        engagement: {
          dopes: play.dopes,
          nopes: play.nopes,
          bookmarks: play.bookmarks,
          boofs: play.boofs,
          score: play.score
        }
      }))

      return {
        status: 'success',
        count: formattedPlays.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalRecords: totalCount,
          recordsPerPage: limit
        },
        data: formattedPlays
      }
    }
  })
} 