export const PERIODS = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  LAST_MONTH: 'lastMonth',
  YEAR: 'year',
  ALL: 'all'
}

export const SORT_OPTIONS = {
  PLAYS: 'plays',
  SCORE: 'score',
  LATEST: 'latest'
}

/**
 * Get the start date for a given time period
 * @param {string} period - The time period from PERIODS enum
 * @returns {Date} The start date for the period
 */
export const getPeriodDate = (period) => {
  const now = new Date()
  
  switch (period) {
    case PERIODS.DAY:
      return new Date(now.setDate(now.getDate() - 1))
    
    case PERIODS.WEEK:
      return new Date(now.setDate(now.getDate() - 7))
    
    case PERIODS.MONTH:
      return new Date(now.setMonth(now.getMonth() - 1))
    
    case PERIODS.LAST_MONTH: {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return lastMonth
    }
    
    case PERIODS.YEAR:
      return new Date(now.setFullYear(now.getFullYear() - 1))
    
    default: // PERIODS.ALL
      return new Date(0)
  }
}

/**
 * Get both start and end dates for a period
 * @param {string} period - The time period from PERIODS enum
 * @returns {{ startDate: Date, endDate: Date }} Object containing start and end dates
 */
export const getDateRange = (period) => {
  const now = new Date()
  
  if (period === PERIODS.LAST_MONTH) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0)
    return { startDate, endDate }
  }
  
  return {
    startDate: getPeriodDate(period),
    endDate: now
  }
} 