import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getTracks (req, res) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 50, 100) // default 50, max 100
    const offset = (page - 1) * limit

    // Get total count for pagination metadata
    const totalCount = await prisma.plays.count()

    const recentTracks = await prisma.plays.findMany({
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
        },
        votes: true
      }
    })

    if (!recentTracks || recentTracks.length === 0) {
      return res.status(204).end()
    }

    const formattedTracks = recentTracks.map(play => ({
      playedAt: play.playedAt,
      channelId: play.channelId,
      userId: play.userId,
      listeners: play.listeners,
      track: {
        title: play.track.title,
        ISRC: play.track.ISRC,
        artists: play.track.artists.map(ta => ta.artist.name),
        album: play.track.album
          ? {
              name: play.track.album.name,
              imageUrl: play.track.album.imageUrl
            }
          : null
      },
      votes: play.votes.map(vote => ({
        dopes: vote.dopes,
        nopes: vote.nopes,
        bookmarks: vote.bookmarks,
        boofs: vote.boofs,
        score: vote.score
      }))
    }))

    res.status(200).json({
      status: 'success',
      count: formattedTracks.length,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalRecords: totalCount,
        recordsPerPage: limit
      },
      data: formattedTracks
    })
  } catch (error) {
    console.error('Error fetching recent tracks:', error)
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch recent tracks',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}
