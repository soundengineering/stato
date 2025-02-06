import { PrismaClient } from '@prisma/client'
import { trackSchemas } from '../schemas/tracks.js'
import { getDateRange, PERIODS, SORT_OPTIONS } from '../utils/dateRanges.js'

const prisma = new PrismaClient()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const cache = new Map()

export default async function (fastify, opts) {
  fastify.get('/tracks', {
    schema: {
      querystring: trackSchemas.query,
      response: trackSchemas.response
    },
    handler: async (request, reply) => {
      const { 
        page, 
        limit, 
        sort = SORT_OPTIONS.PLAYS, 
        period = PERIODS.ALL 
      } = request.query

      const cacheKey = `tracks:${period}:${sort}:${page}:${limit}`
      const cached = cache.get(cacheKey)
      
      if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
        return cached.data
      }

      const offset = (page - 1) * limit
      const { startDate, endDate } = getDateRange(period)

      // Only apply date filter if not "all"
      const dateFilter = period === PERIODS.ALL 
        ? undefined 
        : {
            playedAt: {
              gte: startDate,
              ...(period === PERIODS.LAST_MONTH && { lte: endDate })
            }
          }

      const [tracks, totalCount] = await prisma.$transaction([
        prisma.tracks.findMany({
          where: dateFilter ? {
            plays: { some: dateFilter }
          } : undefined,
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
          orderBy: sort === SORT_OPTIONS.LATEST ? {
            plays: {
              _max: {
                playedAt: 'desc'
              }
            }
          } : {
            plays: {
              _count: 'desc'
            }
          }
        }),
        prisma.tracks.count({
          where: dateFilter ? {
            plays: { some: dateFilter }
          } : undefined
        })
      ])

      const formattedTracks = tracks
        .map(track => ({
          ISRC: track.ISRC,
          title: track.title,
          length: track.length,
          artists: track.artists.map(ta => ta.artist.name),
          album: track.album
            ? {
                name: track.album.name,
                imageUrl: track.album.imageUrl
              }
            : null,
          stats: {
            playCount: track._count.plays,
            score: track.plays.length > 0 
              ? Math.round(track.plays.reduce((sum, play) => sum + (play.score || 0), 0) / track.plays.length * 100) / 100
              : 0,
            lastPlayed: Math.max(...track.plays.map(play => new Date(play.playedAt).getTime())),
            lastPlayedChannel: track.plays
              .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))[0]?.channel || 'Unknown'
          }
        }))
        .sort((a, b) => {
          switch (sort) {
            case SORT_OPTIONS.PLAYS:
              return b.stats.playCount - a.stats.playCount;
            case SORT_OPTIONS.SCORE:
              return b.stats.score - a.stats.score;
            case SORT_OPTIONS.LATEST:
              return b.stats.lastPlayed - a.stats.lastPlayed;
            default:
              return b.stats.playCount - a.stats.playCount;
          }
        })

      const response = {
        status: 'success',
        count: formattedTracks.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalRecords: totalCount,
          recordsPerPage: limit
        },
        data: formattedTracks
      }

      setImmediate(() => {
        cache.set(cacheKey, {
          timestamp: Date.now(),
          data: response
        })
      })

      return response
    }
  })
}
