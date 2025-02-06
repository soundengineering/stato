import { PERIODS, SORT_OPTIONS } from '../utils/dateRanges.js'

export const periodEnum = {
  type: 'string',
  enum: Object.values(PERIODS),
  default: PERIODS.ALL
}

export const sortEnum = {
  type: 'string',
  enum: Object.values(SORT_OPTIONS),
  default: SORT_OPTIONS.PLAYS
}

export const paginationQuery = {
  type: 'object',
  properties: {
    page: { type: 'integer', default: 1 },
    limit: { type: 'integer', default: 50, maximum: 100 },
    period: periodEnum,
    sort: sortEnum
  }
}

export const paginationResponse = {
  type: 'object',
  properties: {
    currentPage: { type: 'integer' },
    totalPages: { type: 'integer' },
    totalRecords: { type: 'integer' },
    recordsPerPage: { type: 'integer' }
  }
}

export const baseResponse = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    count: { type: 'integer' },
    pagination: paginationResponse
  }
} 