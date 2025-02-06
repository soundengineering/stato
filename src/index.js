import { PrismaClient } from '@prisma/client'
import { messageBroker } from '@soundengineering/hermes'
import { startServer } from './server.js'
import { normalizeVotes, calculateScore } from './votesAndScoring.js'

const prisma = new PrismaClient()
const CHANNEL = 'track-finished'

async function handleSongPlayed (message) {
  const { channelId, track, sender, playedAt, listeners } = message
  const { title, artists, album, albumArt, votes, ISRC } = track
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
            name_artistId: {
              name: album,
              artistId: artistRecords[0].id
            }
          },
          create: {
            name: album,
            artistId: artistRecords[0].id,
            imageUrl: albumArt
          },
          update: {}
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

      const normalizedVotes = normalizeVotes(votes)

      await tx.plays.upsert({
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
          listeners,
          dopes: normalizedVotes.dopes,
          nopes: normalizedVotes.nopes,
          boofs: normalizedVotes.boofs,
          bookmarks: normalizedVotes.bookmarks,
          score: calculateScore(normalizedVotes)
        },
        update: {}
      })

      console.log(`Recorded play for "${title}" by ${artists.join(', ')}, played by ${displayName}`)
    })
  } catch (error) {
    console.error('Error processing song play:', error)
  }
}

async function main () {
  try {
    // Start Express server
    const server = await startServer()

    // Register message broker handler
    messageBroker.registerHandler(CHANNEL, handleSongPlayed)
    await messageBroker.subscribe(CHANNEL)
    console.log(`Ready and listening for updates on channel: ${CHANNEL}`)

    // Add server to shutdown cleanup
    process.on('SIGINT', () => shutdown(server))
    process.on('SIGTERM', () => shutdown(server))
  } catch (error) {
    console.error('Failed to initialize:', error)
    process.exit(1)
  }
}

async function shutdown (server) {
  console.log('Shutting down...')
  try {
    server?.close()
    await messageBroker.quit()
    await prisma.$disconnect()
    console.log('Cleanup completed')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

await messageBroker.connect()

main().catch((error) => {
  console.error('Unhandled error:', error)
  shutdown()
})
