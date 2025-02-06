// Reset script - you can save this as reset-db.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    // Delete all records from all tables in the correct order
    console.log('Deleting all records...')
    await prisma.$transaction([
      prisma.plays.deleteMany({}),
      prisma.trackArtist.deleteMany({}),
      prisma.tracks.deleteMany({}),
      prisma.albums.deleteMany({}),
      prisma.artists.deleteMany({})
    ])

    // Reset sequences
    console.log('Resetting sequences...')
    await prisma.$executeRaw`ALTER SEQUENCE "Plays_id_seq" RESTART WITH 1;`
    await prisma.$executeRaw`ALTER SEQUENCE "Artists_id_seq" RESTART WITH 1;`
    await prisma.$executeRaw`ALTER SEQUENCE "Albums_id_seq" RESTART WITH 1;`

    console.log('Database reset complete!')
  } catch (error) {
    console.error('Error resetting database:', error)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()
  .catch(console.error)