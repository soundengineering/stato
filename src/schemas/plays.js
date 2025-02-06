import { baseResponse } from './shared.js'

export const playSchemas = {
  query: {
    type: 'object',
    properties: {
      page: { type: 'integer', default: 1 },
      limit: { type: 'integer', default: 50, maximum: 100 }
    }
  },
  response: {
    200: {
      ...baseResponse,
      properties: {
        ...baseResponse.properties,
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              playedAt: { type: 'string', format: 'date-time' },
              playedBy: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  channelId: { type: 'string' }
                }
              },
              listeners: { type: 'integer' },
              track: {
                type: 'object',
                properties: {
                  ISRC: { type: 'string' },
                  title: { type: 'string' },
                  artists: { type: 'array', items: { type: 'string' } },
                  album: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      name: { type: 'string' },
                      imageUrl: { type: 'string', nullable: true }
                    }
                  }
                }
              },
              engagement: {
                type: 'object',
                properties: {
                  dopes: { type: 'array', items: { type: 'string' } },
                  nopes: { type: 'array', items: { type: 'string' } },
                  bookmarks: { type: 'array', items: { type: 'string' } },
                  boofs: { type: 'array', items: { type: 'string' } },
                  score: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    }
  }
} 