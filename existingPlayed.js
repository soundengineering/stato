const { EventEmitter } = require('events')
const { db } = require('@root/database')
const { achievements, logger, reduceUsers, getDj, metrics } = require('@root/utils')
const { firstPlays, generateScore } = require('@root/utils/stats')
const { transactions, coinageFor } = require('@root/utils/coinage')

const constants = require('@root/utils/constants.js')

const { statisticsHelpers } = require('@root/database/statistics/')
const {
  refreshRvrbToken,
  refreshToken,
  removeTracks,
  insertTracks,
  getPlaylistSimple,
  removeTrackByPosition,
  getTracks
} = require('@root/libs/spotify.js')

const channelState = {}

const lastfm = require('@root/lastfm.js')

class Channel extends EventEmitter {
  constructor (channel) {
    super()
    this.channel = channel
    // current track object playing in this channel
    this.nowPlaying = null
    this.lastPlayedId = null
    // timestamp in the future when the next song should start playing
    this.nextSong = 0
    this.djs = []
    this.users = []
    // internal timeout for when the current song is done
    // fires and triggers the next track in the dj queue
    this.nextSongTimeout = null
    // timeout waiting for response from the DJ when
    // asking for the nextTrack to play
    this.nextTrackResponseTimeout = null
    this.nextChannelTrackResponseHandler = null
    this.nojoin = true
    this.channelLastfmInstance = null
    this.usersInRegion = {}
    this.setupChannelLastfm(channel.lastfm)

    db.Channels.updateOne({ _id: channel._id }, { $set: { users: [], djs: [] } })
      .then(() => {
        this.nojoin = false
      })
  }

  setupChannelLastfm (lastfmConfig) {
    lastfm.createLastfmInstance(lastfmConfig)
      .then(channelLastfmInstance => {
        if (channelLastfmInstance) this.channelLastfmInstance = channelLastfmInstance
      })
  }

  updateChannel (channel) {
    this.channel = channel
  }

  userJoined (id) {
    for (const k of this.users) {
      if (k._id === id) {
        return true
      }
    }
    return false
  }

  checkSong () {
    if (!this.nowPlaying) {
      return this.nextChannelTrack({})
    } else if (this.nextSong < Date.now()) {
      return this.nextChannelTrack({})
    } else {
      this.sendUpdateDjs()
      return Promise.resolve()
    }
  }

  updateMeter () {
    metrics.count('song_reaction', { channel: this.channel.id })
    this.emit('broadcast', {
      channelId: this.channel.id,
      message: {
        jsonrpc: '2.0',
        method: 'updateChannelMeter',
        params: { voting: this.nowPlaying.voting }
      }
    })
  }

  updateChannelUsersPayload (type) {
    const userIds = this.users.map((u) => u._id)

    return db.Users.find({ _id: { $in: userIds } }).lean().then((result) => {
      const users = result.map(user => {
        const foundUser = this.users.find(u => u._id === String(user._id))
        if (foundUser) {
          user.mobile = foundUser.mobile
        }
        return user
      })
      const reducedUsers = reduceUsers({
        users
      })

      const update = {
        channelId: this.channel.id,
        message: {
          jsonrpc: '2.0',
          method: 'updateChannelUsers',
          params: {
            type,
            syncTime: Date.now(),
            users: reducedUsers,
            usersInRegion: this.usersInRegion
          }
        }
      }
      return update
    })
  }

  updateChannelDjsPayload () {
    return {
      channelId: this.channel.id,
      message: {
        jsonrpc: '2.0',
        method: 'updateChannelDjs',
        params: {
          type: 'updateDjs',
          djs: this.djs.map((d) => d._id),
          syncTime: Date.now()
        }
      }
    }
  }

  playTrackPayload (msg) {
    if (!this.nowPlaying) {
      return false
    }
    return {
      jsonrpc: '2.0',
      method: 'playTrack',
      params: {
        uri: this.nowPlaying.track.uri,
        startAt: this.nowPlaying.track.duration_ms - (this.nowPlaying.nextSong - Date.now()),
        syncTime: Date.now()
      }
    }
  }

  playChannelTrackPayload (playTrack = true) {
    // ask the connect client to play this track
    if (!this.nowPlaying) {
      return false
    }
    return {
      jsonrpc: '2.0',
      method: 'playChannelTrack',
      params: {
        playTrack, // can be set to false to prevent the app from responding with a playTrack. Just update state.
        track: this.nowPlaying.track,
        voting: this.nowPlaying.voting,
        endsAt: this.nextSong,
        syncTime: Date.now(),
        startAt:
          this.nowPlaying.track.duration_ms -
          (this.nextSong - Date.now())
      }
    }
  }

  playProgress () {
    return Date.now() - this.nowPlaying.timestamp
  }

  async playChannelTrack ({ message }) {
    // set nextSongTimeout
    clearTimeout(this.nextTrackResponseTimeout)

    if (!this.djs[0] || !message.result?.track) {
      return Promise.resolve()
    }

    // set nextSong
    this.nextSong = Date.now() + message.result.track.duration_ms

    // set nowPlaying
    let lastPlayed = null
    if (this.nowPlaying) {
      lastPlayed = JSON.parse(JSON.stringify(this.nowPlaying))
    }

    // reset nowPlaying
    this.nowPlaying = {
      track: message.result.track,
      album: message.result.track.album.name,
      albumArt: message.result.track.album?.images[0]?.url,
      nextSong: this.nextSong,
      timestamp: Date.now(),
      voting: {},
      userId: this.djs[0]._id
    }

    // sets a timeout for the current track, so that when it ends, we can
    // ask for the next one.
    this.nextSongTimeout = setTimeout(() => {
      logger.info(`nextSongTimeout ${this.channel.id}`)
      const result = this.nextChannelTrack({})
      if (result) {
        result.catch((error) => {
          logger.error(error)
        })
      }
    }, message.result.track.duration_ms)

    // update channel with now playing
    return db.Channels.updateOne(
      { _id: this.channel._id },
      {
        $set: {
          lastPlayed,
          nowPlaying: this.nowPlaying
        }
      }
    ).then(async (result) => {
      this.users.forEach((user) => {
        if (user.mobile && user.spotify) {
          user.handleMessage(this.playTrackPayload())
          user.send(this.playChannelTrackPayload(false))
        } else {
          user.send(this.playChannelTrackPayload())
        }
      })

      // //or just act like the clients all responded
      // this.users.forEach((user) => {
      //   user.emit('message', this.playTrackPayload())
      // })

      const mainArtist = this.nowPlaying.track.artists[0].name
      const artists = this.nowPlaying.track.artists.map((a) => a.name)
      const artistsString = artists.join(',')
      const title = this.nowPlaying.track.name
      const album = this.nowPlaying.album

      if (lastfm.defaultLastfmInstance) {
        lastfm.scrobbleNowPlaying(lastfm.defaultLastfmInstance, mainArtist, title, album)
      }
      if (this.channelLastfmInstance) {
        lastfm.scrobbleNowPlaying(this.channelLastfmInstance, mainArtist, title, album)
      }

      // emit a play message to chat
      this.emit('handleEvent', {
        message: {
          jsonrpc: '2.0',
          method: 'pushMessage',
          params: {
            payload: `${artistsString}::${title}`,
            type: 'play'
          }
        },
        websocketRef: {
          auth: 'server',
          _id: 'server',
          joined: this.channel.id
        }
      })

      // emit message for first play
      const hasBeenPlayed = await firstPlays.get([this.nowPlaying.track.external_ids.isrc])
      if (!hasBeenPlayed.length > 0) {
        metrics.count('first_play', { channel: this.channel.id })
        achievements.log({
          userId: this.djs[0]._id,
          name: 'playedFirst'
        })
        // emit a first play message to chat
        this.emit('handleEvent', {
          message: {
            jsonrpc: '2.0',
            method: 'pushMessage',
            params: {
              payload: `${title} by ${artistsString} is being played for the first time!`,
              type: 'alert'
            }
          },
          websocketRef: {
            auth: 'server',
            _id: 'server',
            joined: this.channel.id
          }
        })
      } else if (this.bot.autoAnnounceFirsts) {
        const play = hasBeenPlayed[0]
        const [channelProfile, userProfile] = await Promise.all([
          db.Channels.findOne({ _id: play.channelId }),
          db.Users.findOne({ _id: play.userId })
        ])
        const playedAt = new Date(play.createdAt).toLocaleDateString('en-gb', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
        this.emit('handleEvent', {
          message: {
            jsonrpc: '2.0',
            method: 'pushMessage',
            params: {
              payload: `${title} by ${artistsString} was first played by @${userProfile.displayName || userProfile.userName} in ${channelProfile.title} on ${playedAt}. It was played to a crowd of ${play.listeners} and got a score of ${play.score}`,
              type: 'alert'
            }
          },
          websocketRef: {
            auth: 'server',
            _id: 'server',
            joined: this.channel.id
          }
        })
      }

      // Check for achievements
      if (message.result.track.external_ids.isrc === constants.ACHIEVEMENTS.DELETED_TRACK_ISRC) {
        this.emit('handleEvent', {
          message: {
            jsonrpc: '2.0',
            method: 'pushMessage',
            params: {
              payload: 'It looks like Spotify have removed the track you had queued in your stack. Please enjoy this brief interlude in it\'s place. https://cdn.discordapp.com/attachments/1009483422693081089/1092886845538443334/GettyImages-1172329457.png',
              type: 'chat'
            }
          },
          websocketRef: {
            auth: 'server',
            _id: 'server',
            joined: this.channel.id
          }
        })
        achievements.log({
          userId: this.djs[0]._id,
          name: 'deletedTrack'
        })
      }
      if (this.bot.enabled && this.bot.nowPlayingResponses) {
        let userProfile = { displayName: this.bot.displayName }
        if (this.nowPlaying.userId !== 'bot') userProfile = await db.Users.findOne({ _id: this.nowPlaying.userId }, { userName: 1, displayName: 1 })
        this.bot.emitServerEvent({
          type: 'songPlaying',
          context: {
            channelId: this.channel.id,
            nowPlaying: {
              title,
              artists,
              firstPlay: hasBeenPlayed,
              album: this.nowPlaying.album
            },
            sender: {
              userId: this.nowPlaying.userId,
              displayName: userProfile.displayName || userProfile.userName
            }
          }
        })
      }
    })
  }

  pauseChannelTrack () {
    // for each user in this channel, pause the track
    const update = {
      $set: {
        nowPlaying: null
      }
    }

    if (this.nowPlaying) {
      update.$set.lastPlayed = JSON.parse(JSON.stringify(this.nowPlaying))
    }

    this.users.forEach((user) => {
      if (user.mobile && user.spotify) {
        user.handleMessage({
          jsonrpc: '2.0',
          method: 'pauseTrack'
        })
      } else {
        user.send({
          jsonrpc: '2.0',
          method: 'pauseChannelTrack'
        })
      }
    })
    this.nowPlaying = null
    this.nextSong = 0
    return Promise.resolve()
  }

  skipChannelTrack () {
    logger.info(`skipChannelTrack ${this.channel.id}`)
    return this.nextChannelTrack({ skipped: true })
  }

  // Request the next track from the next DJ
  nextChannelTrack ({ skipped = false, noCycle = false }) {
    logger.info(`nextChannelTrack ${this.channel.id}, skipped: ${skipped}, noCycle: ${noCycle}`)
    // update channel history
    this.updateChannelHistory(skipped)

    // // check if there are any DJs
    // if (!this.djs.length) {
    //   return this.pauseChannelTrack()
    // }

    if (!noCycle && this.djs.length) {
      // move DJ at position 0 to the end
      const lastDj = this.djs.shift()
      this.djs.push(lastDj)
      if (lastDj.stepDownAfterPlay) {
        // leaveDjs ends up calling sendUpdateDjs
        lastDj.stepDownAfterPlay = false
        this.leaveDjs(lastDj)
      } else {
        // call updateChannelDjs
        this.sendUpdateDjs()
      }
    }

    // check again if there are any DJs
    if (!this.djs.length) {
      return this.pauseChannelTrack()
    }

    // if the current DJ is not in the users list
    // it's a ghost, kick them

    // clear the timeout to auto-advance the track
    // for skips
    if (this.nextSongTimeout) {
      clearTimeout(this.nextSongTimeout)
    }

    const dj = this.djs[0]
    let djUser
    let userQueue
    if (dj._id === 'bot') {
      if (this.users.length === 0 && this.djs.length === 1) {
        this.djs = []
        this.bot.isDj = false
        return db.Channels.updateOne(
          { _id: this.channel._id },
          { $pullAll: { djs: ['bot'] } }
        )
          .then(() => {
            logger.debug('Bot DJ Stepped down and channel updated to zero DJs')
          })
      }
      if (this.bot?.playlist?.tracks?.length) {
        const trackToPlay = this.bot.playlist.tracks[0]
        this.bot.playlist.tracks.splice(0, 1)
        return this.playChannelTrack({
          message: {
            jsonrpc: '2.0',
            result: {
              track: trackToPlay
            },
            id: Math.round(Math.random() * 1000)
          }
        })
      } else {
        return Promise.reject(new Error('Empty Playlist'))
      }
    } else if (dj.mobile && dj.sleeping) {
      let nextTrack = 0
      return getDj(dj._id).then((result) => {
        djUser = result
        return db.Stacks.findOne({
          userId: dj._id,
          deleted: false,
          activeQueue: true
        })
      }).then((stack) => {
        if (!stack) {
          throw new Error('No Playlist')
        }
        userQueue = stack
        return getTracks({
          user: dj.auth,
          trackIds: userQueue.tracks.slice(0, 10)
        })
      }).then((tracks) => {
        if (userQueue && tracks.length) {
          while (tracks[nextTrack] === null) {
            nextTrack++
            if (nextTrack === tracks.length) {
              throw new Error('Empty Playlist')
            }
          }
          return this.playChannelTrack({
            message: {
              jsonrpc: '2.0',
              result: {
                track: tracks[nextTrack]
              },
              id: Math.round(Math.random() * 1000)
            }
          })
        } else {
          throw new Error('Empty Playlist')
        }
      }).then(() => {
        // remove / rotate queue
        if (djUser.queueSettings?.keepPlayedTracks) {
          return dj.handleMessage({
            jsonrpc: '2.0',
            method: 'reorderStack',
            params: {
              stackId: userQueue._id,
              position: nextTrack,
              targetPosition: userQueue.tracks.length
            }
          })
        } else {
          return dj.handleMessage({
            jsonrpc: '2.0',
            method: 'removeFromStack',
            params: {
              stackId: userQueue._id,
              position: nextTrack
            }
          })
        }
      }).then((result) => {
        // tell the current DJ to refresh the DJ Stack
        dj.send({
          jsonrpc: '2.0',
          method: 'refreshDjStack'
        })
      }).catch((error) => {
        logger.error(error)
        this.leaveDjs(dj)
      })
    } else {
      return new Promise((resolve, reject) => {
        // handle the response from nextChannelTrack
        this.nextChannelTrackResponseHandler = ({ message, error }) => {
          // if we have a track, play it
          if (message && message.result) {
            this.playChannelTrack({ message })
          // otherwise if we have an error, tell the current DJ to leave
          // ask for the nextTrack again
          } else if (error) {
            this.leaveDjs(this.djs[0])
          }
          resolve()
        }

        // listen for the response to nextChannelTrack
        const id = Math.round(Math.random() * 1000)
        dj.once(`response:${id}`, this.nextChannelTrackResponseHandler)

        // ask the next DJ for the next track
        dj.send({
          jsonrpc: '2.0',
          method: 'nextChannelTrack',
          params: {
            userId: dj._id, // add these so that the client can verify the command
            channelId: dj.joined // add these so that the client can verify the command
          },
          id
        })

        // set timeout for the client to respond to nextChannelTrack
        this.nextTrackResponseTimeout = setTimeout(() => {
          // if it timed out, remove the listener
          if (this.djs[0]) {
            this.djs[0].removeListener(`response:${id}`, this.nextChannelTrackResponseHandler)
          } else {
            logger.debug('nextTrackResponseTimeout and no DJ')
          }
          // can the response handler with a timeout error
          this.nextChannelTrackResponseHandler({ error: 'timed out' })
          reject(new Error('timed out'))
        }, 2500)
      })
    }
  }

  joinChannel (websocketRef) {
    if (websocketRef.auth?.data?.country) {
      if (!(websocketRef.auth.data.country in this.usersInRegion)) {
        this.usersInRegion[websocketRef.auth.data.country] = 0
      }
      this.usersInRegion[websocketRef.auth.data.country]++
    }

    if (this.users.indexOf(websocketRef) === -1) {
      this.users.push(websocketRef)
    }

    return db.Channels.updateOne(
      { _id: this.channel.id },
      {
        $addToSet: { users: websocketRef._id },
        lastTouched: Date.now()
      }
    ).then((result) => {
      // user count updated
      websocketRef.joining = null
    })
  }

  leaveChannel (websocketRef) {
    if (websocketRef.joined) {
      this.leaveDjs(websocketRef)

      if (websocketRef.auth?.data?.country) {
        if (websocketRef.auth.data.country in this.usersInRegion) {
          this.usersInRegion[websocketRef.auth.data.country]--
          if (this.usersInRegion[websocketRef.auth.data.country] === 0) {
            delete this.usersInRegion[websocketRef.auth.data.country]
          }
        }
      }

      const index = this.users.indexOf(websocketRef)
      if (index !== -1) {
        this.users.splice(index, 1)
      }
    } else {
      return Promise.resolve()
    }

    return db.Channels.updateOne(
      { _id: this.channel.id },
      { $pullAll: { users: [websocketRef._id] } }
    ).then((result) => {
      // user count updated
    })
  }

  joinDjs (websocketRef) {
    if (!(websocketRef in this.djs)) {
      this.djs.push(websocketRef)
    }
    this.checkSong().catch((error) => {
      logger.error(error)
    })
    return db.Channels.updateOne(
      { _id: this.channel.id },
      { $addToSet: { djs: websocketRef._id } }
    ).then((result) => {
      // user count updated
    })
  }

  leaveDjs (websocketRef) {
    if (!websocketRef) {
      return Promise.resolve()
    }
    logger.info(`leaveDjs ${this.channel.id}, _id: ${websocketRef._id}`)
    let index = null
    // check for duplicates
    let skip = false
    while (index !== -1) {
      index = this.djs.indexOf(websocketRef)
      if (index === 0) {
        skip = true
      }
      if (index !== -1) {
        this.djs.splice(index, 1)
      }
    }
    return db.Channels.updateOne(
      { _id: this.channel.id },
      { $pullAll: { djs: [websocketRef._id] } }
    ).then((result) => {
      // user count updated
      this.sendUpdateDjs()
      if (skip) {
        const result = this.nextChannelTrack({ noCycle: true })
        if (result) {
          result.catch((error) => {
            logger.error(error)
          })
        }
      }
    })
  }

  // this method is used to modify the dj queue in place
  // - used to reorder, shuffle or cycle the djs
  updateDjs ({ message }) {
    // sort array of websocket refs by the dj array order
    this.djs.sort((a, b) => {
      return message.djs.indexOf(a._id) - message.djs.indexOf(b._id)
    })

    this.sendUpdateDjs()
    return Promise.resolve()
  }

  // calling this method will broadcast an event to all the users in the channel
  sendUpdateDjs () {
    this.emit('broadcast', this.updateChannelDjsPayload())
  }

  sendUpdateUsers (type) {
    return this.updateChannelUsersPayload(type).then((update) => {
      this.emit('broadcast', update)
    })
  }

  async updateChannelHistory (skipped) {
    if (!this.nowPlaying) {
      return
    }
    const played = JSON.parse(JSON.stringify(this.nowPlaying))
    const userVotes = played.voting
    this.nowPlaying = null
    played.skipped = skipped === true
    played.voteSummary = {
      dope: 0,
      nope: 0,
      star: 0,
      votedCount: 0,
      boofStar: 0,
      users: this.users.length,
      chat: 0
    }

    for (const userId in played.voting) {
      // Don't track votes you give yourself
      if (userId !== played.userId) {
        const votes = { ...played.voting[userId] }
        played.voteSummary.dope = played.voteSummary.dope + played.voting[userId].dope
        played.voteSummary.star = played.voteSummary.star + played.voting[userId].star
        played.voteSummary.nope = played.voteSummary.nope + played.voting[userId].nope
        played.voteSummary.votedCount = played.voteSummary.votedCount + played.voting[userId].votedCount
        if (played.voting[userId].star && played.voting[userId].nope) {
          played.voteSummary.boofStar++
          votes.star = 0
          votes.nope = 0
          votes.boofStar = 1
        }
        played.voteSummary.chat = played.voteSummary.chat + played.voting[userId].chat
        if (this.users.length > 1) {
          achievements.logVotesGiven({
            userId,
            votes
          })
          transactions.create(userId, coinageFor.votingOnATrack, 'votesGiven')
        }
      }
    }
    if (this.users.length > 1) {
      achievements.logVotesReceived({
        userId: played.userId,
        votes: played.voteSummary
      })
    }
    delete played.voting
    delete played.nextSong

    // get channelHistory
    // calc top tracks
    // find this track in top tracks
    // update history
    try {
      const promises = [
        db.ChannelHistory.updateOne(
          { channelId: this.channel.id, version: 0 },
          {
            $push: {
              history: {
                $each: [played],
                $position: 0, // puts the new track at the beginning of the array instead of the end
                $sort: { timestamp: -1 },
                $slice: 100
              }
            }
          },
          { upsert: true }
        )
      ]
      if (played.userId === 'bot') {
        promises.push(db.Bot.findOne({ channelId: this.channel.id }))
      } else {
        promises.push(db.Users.findOne({ _id: played.userId }, { userName: 1, displayName: 1 }))
      }
      const [, user] = await Promise.all(promises)
      played.user = user
      this.emit('broadcast', {
        channelId: this.channel.id,
        message: {
          jsonrpc: '2.0',
          method: 'updateChannelHistory',
          params: {
            track: played.track,
            voteSummary: played.voteSummary,
            timestamp: played.timestamp,
            skipped: played.skipped,
            playedBy: user || { userName: 'unknown' },
            syncTime: Date.now()
          }
        }
      })
      this.updateTrackHistory(played, userVotes)
    } catch (error) {
      logger.error(error)
    }
  }

  async updateTrackHistory (played, userVotes) {
    const mainArtist = played.track.artists[0].name
    const artists = played.track.artists.map((a) => a.name)
    const title = played.track.name
    const album = played.album
    // Prevent double scrobble
    if (this.lastPlayedId !== played.track.id) {
      if (lastfm.defaultLastfmInstance) {
        lastfm.scrobbleTrack(lastfm.defaultLastfmInstance, mainArtist, title, album)
      }
      if (this.channelLastfmInstance) {
        lastfm.scrobbleTrack(this.channelLastfmInstance, mainArtist, title, album)
      }
    }

    const score = generateScore(played.voteSummary.dope, played.voteSummary.nope, played.voteSummary.star, played.voteSummary.boofStar)
    
    // Publish track play event
    messageBroker.publish('track-finished', {
      channelId: this.channel.id,
      track: {
        title,
        artists,
        album,
        ISRC: played.track.external_ids.isrc,
        votes: {
          dope: userVotes?.dope || [],
          nopes: userVotes?.nope || [],
          boofs: userVotes?.boofStar ? Object.keys(userVotes).filter(id => userVotes[id].star && userVotes[id].nope) : [],
          bookmarks: userVotes?.star ? Object.keys(userVotes).filter(id => userVotes[id].star && !userVotes[id].nope) : []
        }
      },
      sender: {
        userId: played.userId,
        displayName: played.user.displayName || played.user.userName
      },
      playedAt: new Date(played.timestamp)
    })

    const updatePayload = {
      songId: played.track.id,
      userId: played.userId,
      channelId: this.channel.id,
      dope: played.voteSummary.dope,
      nope: played.voteSummary.nope,
      bookmark: played.voteSummary.star,
      boof: played.voteSummary.boofStar,
      score,
      listeners: played.voteSummary.users,
      votes: played.voteSummary.votedCount,
      spotifyPopularity: played.track.popularity,
      artists,
      title,
      album,
      albumArt: played.albumArt,
      length: played.track.duration_ms,
      spotifyIdentifier: played.track.id,
      ISRC: played.track.external_ids.isrc,
      userVotes
    }
    metrics.count('track_played', { channel: this.channel.id })
    statisticsHelpers.logPlay(updatePayload)
    if (this.users.length > 1) {
      transactions.create(played.userId, coinageFor.playingTrackPerUser * (played.voteSummary.users - 1), 'plays')
      transactions.create(played.userId, score, 'votesReceived')
    }
    achievements.log({
      userId: played.userId,
      name: 'plays'
    })
    if (this.bot.enabled) {
      this.bot.emitServerEvent({
        type: 'songPlayed',
        context: {
          channelId: this.channel.id,
          nowPlaying: {
            title,
            artists,
            score,
            popularity: played.track.popularity,
            album: played.album
          },
          sender: {
            userId: played.userId,
            displayName: played.user.displayName || played.user.userName
          }
        }
      })
    }
    const addToBookmarkPlaylist = this.channel.writeBookmarkedToPlaylist && this.channel.bookmarkedPlaylist && played.voteSummary.star > 0 && played.voteSummary.boofStar === 0
    const addToBoofmarkPlaylist = this.channel.writeBoofMarkToPlaylist && this.channel.boofMarkPlaylist && played.voteSummary.boofStar > 0
    if (addToBookmarkPlaylist || addToBoofmarkPlaylist) {
      const promises = []
      const refreshedToken = await refreshRvrbToken()
      if (!refreshedToken) {
        return
      }
      refreshedToken.token.data.spotifyUri = process.env.SPOTIFY_URI
      if (addToBookmarkPlaylist) {
        promises.push(removeTracks({
          user: refreshedToken.token,
          uris: [played.track.uri],
          playlistUri: this.channel.bookmarkedPlaylist
        }))
        promises.push(updateChannelPlaylist({
          playlist: this.channel.bookmarkedPlaylist,
          refreshToken,
          trackUri: played.track.uri
        }))
        // promises.push(insertTracks({
        //   user: refreshedToken.token,
        //   uris: [played.track.uri],
        //   playlistUri: this.channel.bookmarkedPlaylist,
        //   position: 0
        // }))
      }
      if (addToBoofmarkPlaylist) {
        promises.push(removeTracks({
          user: refreshedToken.token,
          uris: [played.track.uri],
          playlistUri: this.channel.boofMarkPlaylist
        }))
        promises.push(updateChannelPlaylist({
          playlist: this.channel.boofMarkPlaylist,
          refreshToken,
          trackUri: played.track.uri
        }))
        // promises.push(insertTracks({
        //   user: refreshedToken.token,
        //   uris: [played.track.uri],
        //   playlistUri: this.channel.boofMarkPlaylist,
        //   position: 0
        // }))
      }
      try {
        await Promise.all(promises)
      } catch (error) {
        logger.error(error)
      }
    }
    if (this.bot.enabled) {
      this.bot.updatePlaylist(played.track.id)
    }
    this.lastPlayedId = played.track.id
  }

  statusUpdateTimeoutStart () {
    if (!this.statusUpdateTimeout) {
      const send = Math.round((Math.random() * 2 + 1) * 1000)
      this.statusUpdateTimeout = setTimeout(() => {
        const update = {
          jsonrpc: '2.0',
          method: 'updateChannelUserStatus',
          params: this.statusUpdate
        }
        delete this.statusUpdate
        delete this.statusUpdateTimeout
        this.emit('broadcast', {
          channelId: this.channel.id,
          message: update
        })
      }, send)
    }
  }
}

// ads a track to a channel playlist
const updateChannelPlaylist = async ({ playlistUri, refreshedToken, trackUri }) => {
  // get the playlist by uri
  removeTracks({
    user: refreshedToken.token,
    uris: trackUri,
    playlistUri
  }).then(() => {
    return getPlaylistSimple({ user: refreshedToken.token, uri: playlistUri })
  }).then(({ playlist }) => {
    if (playlist.tracks.total > 5050) {
      const positions = []
      let i = playlist.tracks.total
      while (i > 5000 || positions.length < 50) {
        positions.push(i)
        i--
      }
      return removeTrackByPosition({
        user: refreshedToken.token,
        playlistUri,
        positions,
        snapshot_id: playlist.snapshot_id
      })
    } else {
      return Promise.resolve()
    }
  }).then(() => {
    return insertTracks({
      user: refreshedToken.token,
      uris: [trackUri],
      playlistUri,
      position: 0
    })
  }).then(() => {
    // done
  }).catch((error) => {
    logger.error(error)
  })
}

module.exports = {
  channelState,
  Channel
}