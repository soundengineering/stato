export function normalizeVotes (votes = {}) {
    return {
        dopes: votes?.dope || [],
        nopes: votes?.nopes || [],
        boofs: votes?.boofs || [],
        bookmarks: votes?.bookmarks || []
    }
}

export function calculateScore (normalizedVotes) {
    const votingPoints = {
      dope: 1,
      nope: -1,
      bookmark: 3,
      boof: 4
    }
  
    return (votingPoints.dope * normalizedVotes.dopes.length) +
           (votingPoints.bookmark * (normalizedVotes.bookmarks.length - normalizedVotes.boofs.length)) +
           (votingPoints.boof * normalizedVotes.boofs.length) +
           (votingPoints.nope * (normalizedVotes.nopes.length - normalizedVotes.boofs.length))
  }