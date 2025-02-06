import { baseResponse } from './shared.js'

export const artistSchemas = {
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
              trackCount: { type: 'integer' },
              albumCount: { type: 'integer' }
            }
          }
        }
      }
    }
  }
} 