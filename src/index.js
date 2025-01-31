import { PrismaClient } from '@prisma/client'
import { messageBroker } from './lib/messageBroker.js'

const prisma = new PrismaClient()
const CHANNEL = 'track-finished'

async function handleSongPlayed (message) {
  const { channelId, track, sender, playedAt } = message
  const { title, artists, album, votes, ISRC } = track
  const { userId, displayName } = sender

  try {
    await prisma.$transaction(async (tx) => {
      const artistRecords = await Promise.all(
        artists.map(artistName =>
          tx.artists.upsert({
            where: { name: artistName },
            create: { name: artistName },
            update: {}
          })
        )
      )

      let albumRecord = null
      if (album) {
        albumRecord = await tx.albums.upsert({
          where: {
            name_artistName: {
              name: album.name,
              artistName: artists[0]
            }
          },
          create: {
            name: album.name,
            artistName: artists[0],
            imageUrl: album.imageUrl
          },
          update: {
            imageUrl: album.imageUrl
          }
        })
      }

      const track = await tx.tracks.upsert({
        where: {
          ISRC
        },
        create: {
          title,
          ISRC,
          album: albumRecord
            ? {
                connect: {
                  id: albumRecord.id
                }
              }
            : undefined,
          artists: {
            createMany: {
              data: artistRecords.map(artist => ({
                artistId: artist.id
              }))
            }
          }
        },
        update: {
          title,
          album: albumRecord
            ? {
                connect: {
                  id: albumRecord.id
                }
              }
            : undefined,
          artists: {
            deleteMany: {},
            createMany: {
              data: artistRecords.map(artist => ({
                artistId: artist.id
              }))
            }
          }
        }
      })

      const play = await tx.plays.upsert({
        where: {
          unique_play: {
            trackISRC: track.ISRC,
            userId,
            channelId,
            playedAt
          }
        },
        create: {
          trackISRC: track.ISRC,
          userId,
          channelId,
          playedAt,
          listeners: 1
        },
        update: {}
      })

      const normalizedVotes = normalizeVotes(votes)
      await tx.votes.create({
        data: {
          playId: play.id,
          userId,
          channelId,
          ...normalizedVotes,
          score: calculateScore(normalizedVotes)
        }
      })

      console.log(`Recorded play for "${title}" by ${artists.join(', ')}, played by ${displayName}`)
    })
  } catch (error) {
    console.error('Error processing song play:', error)
  }
}

async function main () {
  try {
    messageBroker.registerHandler('songPlayed', handleSongPlayed)
    await messageBroker.subscribe(CHANNEL)
    console.log(`Listening for updates on channel: ${CHANNEL}`)
  } catch (error) {
    console.error('Failed to initialize:', error)
    process.exit(1)
  }
}

async function shutdown () {
  console.log('Shutting down...')
  try {
    await messageBroker.quit()
    await prisma.$disconnect()
    console.log('Cleanup completed')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await messageBroker.connect()

main().catch((error) => {
  console.error('Unhandled error:', error)
  shutdown()
})

function normalizeVotes (votes = {}) {
  return {
    dope: votes?.dope || [],
    nopes: votes?.nopes || [],
    boofs: votes?.boofs || [],
    bookmarks: votes?.bookmarks || []
  }
}

function calculateScore (normalizedVotes) {
  const votingPoints = {
    dope: 1,
    nope: -1,
    bookmark: 3,
    boof: 4
  }

  return (votingPoints.dope * normalizedVotes.dope.length) +
         (votingPoints.bookmark * (normalizedVotes.bookmarks.length - normalizedVotes.boofs.length)) +
         (votingPoints.boof * normalizedVotes.boofs.length) +
         (votingPoints.nope * (normalizedVotes.nopes.length - normalizedVotes.boofs.length))
}
