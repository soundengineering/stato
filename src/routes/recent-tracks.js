import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getRecentTracks (req, res) {
  try {
    const recentTracks = await prisma.plays.findMany({
      take: 10,
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
      return res.json([])
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

    res.json(formattedTracks)
  } catch (error) {
    console.error('Error fetching recent tracks:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
