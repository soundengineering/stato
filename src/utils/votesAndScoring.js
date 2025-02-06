export function normalizeVotes (votes = {}) {
    return {
        dopes: votes?.dopes || [],
        nopes: votes?.nopes || [],
        boofs: votes?.boofs || [],
        bookmarks: votes?.bookmarks || []
    }
}

export function calculateScore (normalizedVotes) {
    const votingPoints = {
      dopes: 1,
      nopes: -1,
      bookmarks: 3,
      boofs: 4
    }
  
    return (votingPoints.dopes * normalizedVotes.dopes.length) +
           (votingPoints.bookmarks * (normalizedVotes.bookmarks.length - normalizedVotes.boofs.length)) +
           (votingPoints.boofs * normalizedVotes.boofs.length) +
           (votingPoints.nopes * (normalizedVotes.nopes.length - normalizedVotes.boofs.length))
  }
