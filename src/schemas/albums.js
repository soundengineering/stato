import { baseResponse } from './shared.js'

export const albumSchemas = {
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
              name: { type: 'string' },
              imageUrl: { type: 'string', nullable: true },
              artist: { type: 'string' },
              trackCount: { type: 'integer' }
            }
          }
        }
      }
    }
  }
} 