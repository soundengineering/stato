import knex from 'knex'
import { PrismaClient } from '@prisma/client'
import knexfile from '../../../../rvrb-core/knexfile.js'
import { normalizeVotes, calculateScore } from '../utils/votesAndScoring.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const oldDb = knex(knexfile)
const prisma = new PrismaClient({
  log: ['warn', 'error'], // Reduce logging overhead
  transactionOptions: {
    maxWait: 300000, // 5 minutes
    timeout: 300000 // 5 minutes
  }
})
const BATCH_SIZE = 5000

// Track processed records
const stats = {
  artists: { new: 0, existing: 0 },
  albums: { new: 0, existing: 0 },
  tracks: { new: 0, existing: 0 },
  plays: { new: 0, existing: 0 },
  votes: {
    total: 0,
    dopes: 0,
    nopes: 0,
    boofs: 0,
    bookmarks: 0
  },
  skipped: 0
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CHECKPOINT_FILE = path.join(__dirname, '../migration-checkpoint.json')
const ERROR_LOG_FILE = path.join(__dirname, '../migration-errors.json')

async function saveCheckpoint (lastId) {
  try {
    const data = JSON.stringify({ lastId }, null, 2)
    await fs.writeFile(CHECKPOINT_FILE, data)

    // Verify the file was written
  } catch (error) {
    console.error('Error saving checkpoint:', {
      error: error.message,
      code: error.code,
      stack: error.stack
    })
    // Try writing to a different location as fallback
    const fallbackPath = './migration-checkpoint.json'
    console.log('Attempting to write to fallback location:', fallbackPath)
    try {
      await fs.writeFile(fallbackPath, JSON.stringify({ lastId }))
      console.log('Successfully wrote to fallback location')
    } catch (fallbackError) {
      console.error('Fallback write also failed:', fallbackError)
    }
  }
}

async function loadCheckpoint () {
  try {
    const data = await fs.readFile(CHECKPOINT_FILE, 'utf8')
    return JSON.parse(data).lastId
  } catch (error) {
    return 0 // Start from beginning if no checkpoint exists
  }
}

const logError = async (item, reason) => {
  const errorLine = JSON.stringify({
    playId: item.id,
    title: item.title,
    reason,
    timestamp: new Date().toISOString()
  }) + '\n'

  try {
    await fs.appendFile(ERROR_LOG_FILE, errorLine)
  } catch (error) {
    console.error('Failed to log error:', error)
  }
}

async function migrateData () {
  const startTime = Date.now()
  let lastId = await loadCheckpoint()
  let processedCount = 0
  console.log(`Starting migration from ID: ${lastId}`)

  try {
    const totalPlays = await oldDb('plays').count('id as count').first()

    while (true) {
      const batchStartTime = Date.now()

      // Get all data for this batch
      const plays = await oldDb('plays')
        .select(
          'plays.*',
          'tracks.title',
          'tracks.ISRC',
          'tracks.length',
          'albums.name as albumName',
          'albums.imageUrl',
          'tracks.id as trackId'
        )
        .join('tracks', 'plays.trackId', 'tracks.id')
        .leftJoin('albums', 'tracks.albumId', 'albums.id')
        .where('plays.id', '>', lastId)
        .orderBy('plays.id')
        .limit(BATCH_SIZE)

      if (plays.length === 0) break

      // Get track-artist relationships for this batch
      const trackIds = plays.map(p => p.trackId)
      const trackArtists = await oldDb('trackArtists')
        .select('trackArtists.*', 'artists.name as artistName', 'tracks.ISRC')
        .join('tracks', 'trackArtists.trackId', 'tracks.id')
        .join('artists', 'trackArtists.artistId', 'artists.id')
        .whereIn('trackArtists.trackId', trackIds)

      // Create a data structure to hold all relationships
      const records = new Map()

      // Filter and create records, skipping invalid ones immediately
      for (const play of plays) {
        if (!play.ISRC) {
          await logError({
            id: play.id,
            title: play.title
          }, 'Missing ISRC')
          stats.skipped++
          continue
        }

        records.set(play.id, {
          play: {
            ...play,
            artist: play.artist?.trim() || trackArtists.find(ta => ta.ISRC === play.ISRC)?.artistName || 'Unknown'
          },
          artistId: null,
          albumId: null,
          trackISRC: play.ISRC,
          createdPlayId: null
        })
      }

      await prisma.$transaction(async (tx) => {
        // Get existing artists first
        const uniqueArtists = new Set(Array.from(records.values()).map(r => r.play.artist))
        const existingArtists = await tx.artists.findMany({
          where: { name: { in: Array.from(uniqueArtists) } },
          select: { id: true, name: true }
        })

        // Process Artists
        const artistsToCreate = Array.from(uniqueArtists)
          .filter(name => !existingArtists.find(a => a.name === name))
          .map(name => ({
            name,
            createdAt: new Date(),
            updatedAt: new Date()
          }))

        if (artistsToCreate.length > 0) {
          await tx.artists.createMany({ data: artistsToCreate, skipDuplicates: true })
        }

        // Get all artists AFTER creating new ones
        const allArtists = await tx.artists.findMany({
          where: { name: { in: Array.from(uniqueArtists) } },
          select: { id: true, name: true }
        })
        const artistsByName = Object.fromEntries(allArtists.map(a => [a.name, a]))

        // Process Albums with artist IDs
        const albumsToCreate = Array.from(records.values())
          .filter(r => r.play.albumName && r.play.artist && artistsByName[r.play.artist])
          .map(r => ({
            name: r.play.albumName.trim(),
            artistId: artistsByName[r.play.artist].id,
            imageUrl: r.play.imageUrl || null,
            createdAt: new Date(),
            updatedAt: new Date()
          }))
          .filter((album, index, self) =>
            index === self.findIndex(a =>
              a.name === album.name && a.artistId === album.artistId
            )
          )

        if (albumsToCreate.length > 0) {
          await tx.albums.createMany({ data: albumsToCreate, skipDuplicates: true })
        }

        // Get all albums AFTER creating new ones and update records
        const allAlbums = await tx.albums.findMany({
          where: {
            OR: Array.from(records.values())
              .filter(r => r.play.albumName)
              .map(r => ({
                AND: [
                  { name: r.play.albumName.trim() },
                  { artistId: artistsByName[r.play.artist]?.id }
                ]
              }))
          },
          select: { id: true, name: true, artistId: true }
        })

        // Update records with album IDs
        for (const record of records.values()) {
          if (record.play.albumName) {
            const matchingAlbum = allAlbums.find(a =>
              a.name === record.play.albumName.trim() &&
              a.artistId === (artistsByName[record.play.artist]?.id)
            )
            if (matchingAlbum) {
              record.albumId = matchingAlbum.id
            }
          }
        }

        // Bulk create tracks
        const uniqueTracks = Array.from(records.values())
          .filter(r => {
            if (!r.trackISRC) {
              // Log error and skip here
              logError({
                id: r.play.id,
                title: r.play.title
              }, 'Missing ISRC')
              stats.skipped++
              return false
            }
            return true
          })
          .map(r => ({
            ISRC: r.trackISRC,
            title: r.play.title,
            length: r.play.length,
            albumId: r.albumId
          }))
          .filter((track, index, self) =>
            index === self.findIndex(t => t.ISRC === track.ISRC)
          )

        // Bulk create tracks with error handling
        try {
          await tx.tracks.createMany({
            data: uniqueTracks,
            skipDuplicates: true
          })
        } catch (error) {
          // Log any tracks that failed to create
          for (const track of uniqueTracks) {
            await logError({
              id: null,
              title: track.title,
              ISRC: track.ISRC
            }, `Failed in bulk track creation: ${error.message}`)
          }
          stats.skipped += uniqueTracks.length
        }

        // Create track-artist relationships in bulk
        const trackArtistRelations = Array.from(records.values())
          .filter(r => r.trackISRC && r.play.artist)
          .map(r => ({
            trackISRC: r.trackISRC,
            artistId: artistsByName[r.play.artist]?.id
          }))
          .filter((rel, index, self) =>
            index === self.findIndex(r =>
              r.trackISRC === rel.trackISRC &&
              r.artistId === rel.artistId
            )
          )

        if (trackArtistRelations.length > 0) {
          try {
            await tx.trackArtist.createMany({
              data: trackArtistRelations,
              skipDuplicates: true
            })
          } catch (error) {
            console.error('Failed to create track-artist relationships:', error)
            for (const rel of trackArtistRelations) {
              await logError({
                id: null,
                title: `Track ISRC: ${rel.trackISRC}`
              }, `Failed to create track-artist relationship: ${error.message}`)
            }
          }
        }

        // Bulk create plays
        const playsToCreate = Array.from(records.values())
          .filter(r => {
            if (!r.trackISRC) {
              stats.skipped++
              logError({
                id: r.play.id,
                title: r.play.title
              }, 'Play skipped - Missing ISRC')
              return false
            }
            return true
          })
          .map(record => {
            const normalizedVotes = normalizeVotes({
              dopes: record.play.dope ? [record.play.userId] : [],
              nopes: record.play.nope ? [record.play.userId] : [],
              boofs: record.play.boof ? [record.play.userId] : [],
              bookmarks: record.play.bookmark ? [record.play.userId] : []
            })

            return {
              trackISRC: record.trackISRC,
              userId: record.play.userId,
              channelId: record.play.channelId,
              playedAt: record.play.createdAt,
              listeners: record.play.listeners || 1,
              dopes: normalizedVotes.dopes,
              nopes: normalizedVotes.nopes,
              boofs: normalizedVotes.boofs,
              bookmarks: normalizedVotes.bookmarks,
              score: calculateScore(normalizedVotes),
              createdAt: record.play.createdAt,
              updatedAt: record.play.createdAt
            }
          })

        if (playsToCreate.length > 0) {
          await tx.plays.createMany({
            data: playsToCreate,
            skipDuplicates: true
          })
        }

        // Update stats
        stats.artists.new += artistsToCreate.length
        stats.artists.existing += existingArtists.length
        stats.albums.new += albumsToCreate.length
        stats.albums.existing += allAlbums.length
        stats.tracks.new += uniqueTracks.length
        stats.tracks.existing += allArtists.length
        stats.plays.new += playsToCreate.length
        stats.plays.existing += plays.length - playsToCreate.length
        stats.votes.total += playsToCreate.length
        stats.votes.dopes += playsToCreate.reduce((sum, play) => sum + (play.dopes.length > 0 ? 1 : 0), 0)
        stats.votes.nopes += playsToCreate.reduce((sum, play) => sum + (play.nopes.length > 0 ? 1 : 0), 0)
        stats.votes.boofs += playsToCreate.reduce((sum, play) => sum + (play.boofs.length > 0 ? 1 : 0), 0)
        stats.votes.bookmarks += playsToCreate.reduce((sum, play) => sum + (play.bookmarks.length > 0 ? 1 : 0), 0)
      }, {
        maxWait: 300000, // 5 minutes
        timeout: 300000 // 5 minutes
      })

      // Only save checkpoint AFTER successful transaction
      lastId = plays[plays.length - 1].id
      await saveCheckpoint(lastId)

      processedCount += plays.length
      const batchEndTime = Date.now()
      const batchDuration = (batchEndTime - batchStartTime) / 1000
      const totalDuration = (batchEndTime - startTime) / 1000
      const avgTimePerRecord = batchDuration / plays.length

      // Calculate estimated time remaining
      const remainingRecords = totalPlays.count - processedCount
      const estimatedSecondsRemaining = remainingRecords * avgTimePerRecord
      const estimatedCompletion = new Date(Date.now() + (estimatedSecondsRemaining * 1000))

      // Format time remaining
      let timeRemainingText
      if (estimatedSecondsRemaining > 3600) {
        timeRemainingText = `${Math.round(estimatedSecondsRemaining / 3600)} hours`
      } else {
        timeRemainingText = `${Math.round(estimatedSecondsRemaining / 60)} minutes`
      }

      console.log('\nBatch Statistics:')
      console.log(`Last processed ID: ${lastId}`)
      console.log(`Time taken: ${batchDuration.toFixed(1)}s (${avgTimePerRecord.toFixed(2)}s per record)`)
      console.log('Records processed:')
      console.log('Artists:', stats.artists)
      console.log('Albums:', stats.albums)
      console.log('Tracks:', stats.tracks)
      console.log('Plays:', stats.plays)
      console.log('Votes:', {
        total: stats.votes.total,
        dopes: `${stats.votes.dopes} (${((stats.votes.dopes / stats.votes.total) * 100).toFixed(1)}%)`,
        nopes: `${stats.votes.nopes} (${((stats.votes.nopes / stats.votes.total) * 100).toFixed(1)}%)`,
        boofs: `${stats.votes.boofs} (${((stats.votes.boofs / stats.votes.total) * 100).toFixed(1)}%)`,
        bookmarks: `${stats.votes.bookmarks} (${((stats.votes.bookmarks / stats.votes.total) * 100).toFixed(1)}%)`
      })
      console.log('Skipped:', stats.skipped)
      console.log(`\nProcessed ${processedCount} of ${totalPlays.count} plays (${Math.round(processedCount / totalPlays.count * 100)}%)`)
      console.log(`Total time elapsed: ${totalDuration.toFixed(1)}s`)
      console.log(`Estimated time remaining: ${timeRemainingText}`)
      console.log(`Estimated completion: ${estimatedCompletion.toLocaleString()}`)

      // Break after first batch if in test mode
      if (process.env.TEST_MODE) {
        console.log('\nTest mode: stopping after first batch')
        break
      }
    }

    console.log('Migration completed')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
    await oldDb.destroy()
  }
}

// Change the main execution to properly handle promises
migrateData()
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
