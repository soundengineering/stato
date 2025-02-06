import knex from 'knex'
import { PrismaClient } from '@prisma/client'
import knexfile from '../../../rvrb-core/knexfile.js'
import { normalizeVotes } from '../utils/votesAndScoring.js'

const oldDb = knex(knexfile)
const prisma = new PrismaClient()

async function validateMigration() {
  const summary = {
    total: 0,
    skipped: 0,
    tracks: { matches: 0, errors: 0 },
    artists: { matches: 0, errors: 0 },
    albums: { matches: 0, errors: 0, skipped: 0 },
    plays: { matches: 0, errors: 0 },
    votes: { matches: 0, errors: 0, skipped: 0 }
  }

  try {
    // Get first 10 plays from old DB with all related data
    const plays = await oldDb('plays')
      .select(
        'plays.*',
        'tracks.title',
        'tracks.ISRC',
        'tracks.length',
        'albums.name as albumName',
        'tracks.id as trackId'
      )
      .join('tracks', 'plays.trackId', 'tracks.id')
      .leftJoin('albums', 'tracks.albumId', 'albums.id')
      .orderBy('plays.id')
      .limit(10)

    const trackIds = plays.map(p => p.trackId)
    const trackArtists = await oldDb('trackArtists')
      .select('trackArtists.*', 'artists.name as artistName', 'tracks.ISRC')
      .join('tracks', 'trackArtists.trackId', 'tracks.id')
      .join('artists', 'trackArtists.artistId', 'artists.id')
      .whereIn('trackArtists.trackId', trackIds)

    console.log(`\nValidating ${plays.length} plays from original database...`)
    
    for (const originalPlay of plays) {
      summary.total++
      
      console.log(`\n${'-'.repeat(50)}`)
      console.log(`Validating Play ID ${originalPlay.id}:`)

      if (!originalPlay.ISRC) {
        summary.skipped++
        // This play should not exist in new DB
        const newPlay = await prisma.plays.findFirst({
          where: {
            trackISRC: originalPlay.ISRC,
            userId: originalPlay.userId,
            channelId: originalPlay.channelId,
            playedAt: originalPlay.createdAt
          }
        })
        
        if (!newPlay) {
          console.log('✓ Correctly skipped play with missing ISRC')
        } else {
          console.error('❌ Play with missing ISRC was migrated when it should have been skipped')
        }
        continue
      }

      // Check Track
      const track = await prisma.tracks.findUnique({
        where: { ISRC: originalPlay.ISRC },
        include: {
          album: true,
          artists: {
            include: { artist: true }
          }
        }
      })
      
      if (!track) {
        console.error(`❌ Track not found (ISRC: ${originalPlay.ISRC})`)
        summary.tracks.errors++
        continue
      }

      // Track validation
      const trackMatches = track.title === originalPlay.title && track.length === originalPlay.length
      console.log('\nTrack Validation:')
      console.log(`Title: ${trackMatches ? '✓' : '❌'} ${track.title}`)
      console.log(`Length: ${trackMatches ? '✓' : '❌'} ${track.length}`)
      if (trackMatches) summary.tracks.matches++
      else summary.tracks.errors++

      // Check Artists
      const originalArtists = trackArtists
        .filter(ta => ta.ISRC === originalPlay.ISRC)
        .map(ta => ta.artistName)
        .sort()
      
      const migratedArtists = track.artists
        .map(ta => ta.artist.name)
        .sort()

      console.log('\nArtist Validation:')
      const artistsMatch = JSON.stringify(originalArtists) === JSON.stringify(migratedArtists)
      if (artistsMatch) {
        console.log('✓ Artists match:', migratedArtists.join(', '))
        summary.artists.matches++
      } else {
        console.log('❌ Artist mismatch:')
        console.log('  Original:', originalArtists.join(', '))
        console.log('  Migrated:', migratedArtists.join(', '))
        summary.artists.errors++
      }

      // Check Album
      if (originalPlay.albumName) {
        console.log('\nAlbum Validation:')
        if (track.album) {
          const albumMatches = track.album.name === originalPlay.albumName
          console.log(`Name: ${albumMatches ? '✓' : '❌'} ${track.album.name}`)
          if (albumMatches) summary.albums.matches++
          else summary.albums.errors++
        } else {
          console.error('❌ Album missing')
          summary.albums.errors++
        }
      } else {
        summary.albums.skipped++
      }

      // Check Play
      const play = await prisma.plays.findFirst({
        where: {
          trackISRC: originalPlay.ISRC,
          userId: originalPlay.userId,
          channelId: originalPlay.channelId,
          playedAt: originalPlay.createdAt
        },
        include: {
          votes: true
        }
      })

      if (!play) {
        console.error('❌ Play not found in new database')
        summary.plays.errors++
        continue
      }

      console.log('\nPlay Validation:')
      const playMatches = 
        play.userId === originalPlay.userId &&
        play.channelId === originalPlay.channelId &&
        play.playedAt.getTime() === originalPlay.createdAt.getTime() &&
        play.listeners === (originalPlay.listeners || 1)

      console.log(`User ID: ${play.userId === originalPlay.userId ? '✓' : '❌'} ${play.userId}`)
      console.log(`Channel ID: ${play.channelId === originalPlay.channelId ? '✓' : '❌'} ${play.channelId}`)
      console.log(`Played At: ${play.playedAt.getTime() === originalPlay.createdAt.getTime() ? '✓' : '❌'} ${play.playedAt}`)
      console.log(`Listeners: ${play.listeners === (originalPlay.listeners || 1) ? '✓' : '❌'} ${play.listeners}`)

      if (playMatches) summary.plays.matches++
      else summary.plays.errors++

      // Check Votes
      console.log('\nVote Validation:')
      if (play.votes.length === 0) {
        if (originalPlay.dope || originalPlay.nope || originalPlay.boof || originalPlay.bookmark) {
          console.error('❌ Missing votes')
          summary.votes.errors++
        } else {
          console.log('✓ No votes (as expected)')
          summary.votes.skipped++
        }
      } else {
        const vote = play.votes[0]
        const originalVotes = normalizeVotes({
          dope: originalPlay.dope ? [originalPlay.userId] : [],
          nopes: originalPlay.nope ? [originalPlay.userId] : [],
          boofs: originalPlay.boof ? [originalPlay.userId] : [],
          bookmarks: originalPlay.bookmark ? [originalPlay.userId] : []
        })
        
        const votesMatch = 
          JSON.stringify(vote.dope) === JSON.stringify(originalVotes.dope) &&
          JSON.stringify(vote.nopes) === JSON.stringify(originalVotes.nopes) &&
          JSON.stringify(vote.boofs) === JSON.stringify(originalVotes.boofs) &&
          JSON.stringify(vote.bookmarks) === JSON.stringify(originalVotes.bookmarks)

        console.log(`Dope: ${JSON.stringify(vote.dope) === JSON.stringify(originalVotes.dope) ? '✓' : '❌'}`)
        console.log(`Nopes: ${JSON.stringify(vote.nopes) === JSON.stringify(originalVotes.nopes) ? '✓' : '❌'}`)
        console.log(`Boofs: ${JSON.stringify(vote.boofs) === JSON.stringify(originalVotes.boofs) ? '✓' : '❌'}`)
        console.log(`Bookmarks: ${JSON.stringify(vote.bookmarks) === JSON.stringify(originalVotes.bookmarks) ? '✓' : '❌'}`)

        if (votesMatch) summary.votes.matches++
        else summary.votes.errors++
      }
    }

    // Print Summary
    console.log('\n' + '='.repeat(50))
    console.log('VALIDATION SUMMARY')
    console.log('='.repeat(50))
    console.log(`Total Records Checked: ${summary.total}`)
    console.log(`Skipped (Missing ISRC): ${summary.skipped}`)
    console.log('\nMatches/Errors by Entity:')
    console.log(`Tracks: ${summary.tracks.matches} matches, ${summary.tracks.errors} errors`)
    console.log(`Artists: ${summary.artists.matches} matches, ${summary.artists.errors} errors`)
    console.log(`Albums: ${summary.albums.matches} matches, ${summary.albums.errors} errors (${summary.albums.skipped} skipped)`)
    console.log(`Plays: ${summary.plays.matches} matches, ${summary.plays.errors} errors`)
    console.log(`Votes: ${summary.votes.matches} matches, ${summary.votes.errors} errors (${summary.votes.skipped} skipped)`)
    
    const hasErrors = Object.values(summary).some(s => 
      typeof s === 'object' && s.errors > 0
    )
    
    console.log('\nValidation ' + (hasErrors ? '❌ FAILED' : '✓ PASSED'))

  } catch (error) {
    console.error('Validation failed:', error)
  } finally {
    await prisma.$disconnect()
    await oldDb.destroy()
  }
}

validateMigration().catch(console.error) 