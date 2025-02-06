import { baseResponse, paginationQuery } from './shared.js'

export const trackSchemas = {
  query: paginationQuery,
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
              ISRC: { type: 'string' },
              title: { type: 'string' },
              length: { type: 'integer', nullable: true },
              artists: { 
                type: 'array',
                items: { type: 'string' }
              },
              album: {
                type: 'object',
                nullable: true,
                properties: {
                  name: { type: 'string' },
                  imageUrl: { type: 'string', nullable: true }
                }
              },
              stats: {
                type: 'object',
                properties: {
                  playCount: { type: 'integer' },
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