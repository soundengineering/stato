import { messageBroker } from '../lib/messageBroker.js'

const CHANNEL = 'track-finished'

async function publishTest () {
  try {
    await messageBroker.connect()

    await messageBroker.publish(CHANNEL, {
      type: 'songPlayed',
      channelId: 'test-channel-123',
      track: {
        title: 'Bohemian Rhapsody',
        ISRC: 'GBUM71029604',
        artists: ['Queen', 'Freddie Mercury'],
        votes: {
          dope: ['test-user-123'],
          nopes: [],
          boofs: [],
          bookmarks: []
        },
        album: {
          name: 'A Night at the Opera',
          imageUrl: 'https://example.com/album.jpg'
        }
      },
      sender: {
        userId: 'test-user-123',
        displayName: 'Test User'

      }
    })

    console.log('Test message published')
    await messageBroker.quit()
  } catch (error) {
    console.error('Error publishing test message:', error)
  }
}

publishTest()
